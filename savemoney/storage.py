"""Атомарное сохранение снимка бюджета с проверкой ревизии."""

from copy import deepcopy
from threading import Lock

from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError, PyMongoError

_CONFLICT_MESSAGE = 'Бюджет изменён другим запросом; повторите операцию'
_UNAVAILABLE_MESSAGE = 'Хранилище бюджета недоступно'


class StorageConflict(Exception):
    """Ожидаемая ревизия отличается от сохранённой."""


class StorageUnavailable(Exception):
    """Драйвер не смог прочитать или сохранить бюджет."""


class MemoryStore:
    def __init__(self) -> None:
        self._revision = 0
        self._snapshot: dict | None = None
        self._lock = Lock()

    def load(self) -> tuple[int, dict | None]:
        with self._lock:
            return self._revision, deepcopy(self._snapshot)

    def save(self, snapshot: dict, expected_revision: int) -> int:
        with self._lock:
            if expected_revision != self._revision:
                raise StorageConflict(_CONFLICT_MESSAGE)
            self._snapshot = deepcopy(snapshot)
            self._revision += 1
            return self._revision


class MongoStore:
    def __init__(self, collection: Collection) -> None:
        self._collection = collection

    def load(self) -> tuple[int, dict | None]:
        try:
            document = self._collection.find_one({'_id': 'budget'})
        except PyMongoError:
            raise StorageUnavailable(_UNAVAILABLE_MESSAGE) from None
        if document is None:
            return 0, None
        return document['revision'], deepcopy(document['snapshot'])

    def save(self, snapshot: dict, expected_revision: int) -> int:
        revision = expected_revision + 1
        document = {'_id': 'budget', 'revision': revision, 'snapshot': deepcopy(snapshot)}
        try:
            if expected_revision == 0:
                try:
                    self._collection.insert_one(document)
                except DuplicateKeyError:
                    raise StorageConflict(_CONFLICT_MESSAGE) from None
            else:
                # Без upsert: устаревшая запись не должна создавать новый бюджет.
                result = self._collection.replace_one(
                    {'_id': 'budget', 'revision': expected_revision}, document
                )
                if result.matched_count != 1:
                    raise StorageConflict(_CONFLICT_MESSAGE)
        except PyMongoError:
            raise StorageUnavailable(_UNAVAILABLE_MESSAGE) from None
        return revision
