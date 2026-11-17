from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier
from traceback import format_exception

import mongomock
import pytest
from pymongo.errors import PyMongoError

from savemoney.storage import MemoryStore, MongoStore, StorageConflict, StorageUnavailable


@pytest.fixture(params=['memory', 'mongo'])
def store(request):
    if request.param == 'memory':
        return MemoryStore()
    return MongoStore(mongomock.MongoClient().savemoney.budgets)


@pytest.fixture
def collection():
    return mongomock.MongoClient().savemoney.budgets


@pytest.fixture
def snapshot():
    return {
        'schema_version': 1,
        'metadata': {'created_at': '2026-11-17T10:00:00Z', 'settings': {'currency': 'RUB'}},
        'categories': [{'id': 'food', 'name': 'Продукты'}],
        'closures': [{'id': '2026-10:food', 'amount': 2500}],
    }


def test_new_store_is_empty_and_load_is_repeatable(store):
    assert store.load() == (0, None)
    assert store.load() == (0, None)


def test_mongo_read_does_not_create_state(collection):
    assert MongoStore(collection).load() == (0, None)
    assert collection.count_documents({}) == 0


def test_save_increments_revision_and_replaces_the_whole_snapshot(store, snapshot):
    assert store.save(snapshot, expected_revision=0) == 1
    assert store.load() == (1, snapshot)
    replacement = {'schema_version': 1, 'categories': [], 'closures': []}
    assert store.save(replacement, expected_revision=1) == 2
    assert store.load() == (2, replacement)


def test_stale_write_does_not_overwrite_existing_state(store, snapshot):
    store.save(snapshot, expected_revision=0)
    for revision in [0, 2, -1]:
        with pytest.raises(StorageConflict):
            store.save({'categories': []}, expected_revision=revision)
        assert store.load() == (1, snapshot)
    assert store.save({'categories': []}, expected_revision=1) == 2


def test_wrong_revision_cannot_create_missing_state(store):
    with pytest.raises(StorageConflict):
        store.save({'categories': []}, expected_revision=1)
    assert store.load() == (0, None)


def test_saved_snapshot_is_isolated_from_callers_changes(store, snapshot):
    original = deepcopy(snapshot)
    store.save(snapshot, expected_revision=0)
    snapshot['metadata']['settings']['currency'] = 'USD'
    snapshot['categories'].clear()
    assert store.load() == (1, original)


def test_loaded_snapshot_is_isolated_from_callers_changes(store, snapshot):
    store.save(snapshot, expected_revision=0)
    _, loaded = store.load()
    loaded['metadata']['settings']['currency'] = 'USD'
    loaded['closures'].clear()
    assert store.load() == (1, snapshot)


def test_empty_snapshot_is_stored_as_state(store):
    assert store.save({}, expected_revision=0) == 1
    assert store.load() == (1, {})


def test_concurrent_writers_have_one_winner_without_lost_updates(store):
    store.save({'winner': None}, expected_revision=0)
    barrier = Barrier(2)

    def write(value):
        revision, _ = store.load()
        barrier.wait(timeout=5)
        try:
            return value, store.save({'winner': value}, expected_revision=revision)
        except StorageConflict:
            return value, None

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(write, ['first', 'second']))
    winners = [(value, revision) for value, revision in results if revision is not None]
    assert len(winners) == 1
    assert winners[0][1] == 2
    assert store.load() == (2, {'winner': winners[0][0]})


def test_mongo_persists_revision_metadata_and_closures_in_one_budget_document(collection, snapshot):
    assert MongoStore(collection).save(snapshot, expected_revision=0) == 1
    assert MongoStore(collection).load() == (1, snapshot)
    assert list(collection.find()) == [{'_id': 'budget', 'revision': 1, 'snapshot': snapshot}]
    updated = deepcopy(snapshot)
    updated['closures'].append({'id': '2026-11:food', 'amount': 3000})
    assert MongoStore(collection).save(updated, expected_revision=1) == 2
    assert MongoStore(collection).load() == (2, updated)
    assert collection.count_documents({}) == 1


def test_mongo_preserves_unrelated_documents(collection, snapshot):
    collection.insert_one({'_id': 'other', 'value': 'untouched'})
    store = MongoStore(collection)
    assert store.load() == (0, None)
    store.save(snapshot, expected_revision=0)
    store.save({}, expected_revision=1)
    assert collection.find_one({'_id': 'other'}) == {'_id': 'other', 'value': 'untouched'}


@pytest.mark.parametrize('operation', ['find_one', 'insert_one', 'replace_one'])
def test_mongo_driver_failure_is_sanitized_and_does_not_lose_state(
    collection, snapshot, monkeypatch, operation
):
    store = MongoStore(collection)
    if operation != 'insert_one':
        store.save(snapshot, expected_revision=0)
    before = list(collection.find())

    def unavailable(*args, **kwargs):
        raise PyMongoError('mongodb://admin:secret@private-host:27017 budget contents')

    with monkeypatch.context() as patch:
        patch.setattr(collection, operation, unavailable)
        with pytest.raises(StorageUnavailable) as caught:
            if operation == 'find_one':
                store.load()
            else:
                store.save({'categories': []}, expected_revision=int(operation == 'replace_one'))
        assert str(caught.value)
        rendered = ''.join(format_exception(caught.value))
        for secret in ['admin:secret', 'private-host', 'budget contents', 'mongodb://']:
            assert secret not in rendered
    assert list(collection.find()) == before
    assert store.load() == ((0, None) if operation == 'insert_one' else (1, snapshot))
