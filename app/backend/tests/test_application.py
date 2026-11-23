"""Public API behavior, financial state and atomic snapshot replacement."""

from copy import deepcopy
from datetime import date

import pytest

from savemoney.api_types import APIError
from savemoney.api_validation import SPEC, route, validate
from savemoney.application import Application
from savemoney.storage import MemoryStore


@pytest.fixture
def app():
    return Application(MemoryStore())


def call(app, method, path, body=None, **query):
    url = '/api/v1' + path
    response = app.handle(method, url, query, body)
    template, _, _ = route(method, url, query, body)
    contract = SPEC['paths'][template][method.lower()]['responses'][str(response.status)]
    if response.status != 204:
        validate(response.body, contract['content']['application/json']['schema'])
    else:
        assert response.body is None
    return response


def create(app, resource, **body):
    response = call(app, 'POST', '/' + resource, body)
    assert response.status == 201
    assert (
        call(app, 'GET', response.headers['Location'][7:]).body['data']['id']
        == response.body['data']['id']
    )
    return response.body['data']


def failure(app, method, path, status=422, body=None, **query):
    with pytest.raises(APIError) as caught:
        call(app, method, path, body, **query)
    assert caught.value.status == status
    return caught.value


def test_empty_reads_and_initialization_are_idempotent(app):
    assert call(app, 'GET', '/categories').body['data'] == []
    assert call(app, 'GET', '/snapshots/current').body['periods'] == []
    app.initialize(date(2026, 1, 4))
    app.initialize(date(2026, 1, 4))
    assert call(app, 'GET', '/categories').body['pagination']['total'] == 1
    assert call(app, 'GET', '/categories/other').body['data']['name'] == 'Прочее'
    assert call(app, 'GET', '/periods/2026-01').body['data']['startDate'] == '2026-01-01'
    failure(app, 'PATCH', '/categories/other', body={'isArchived': True})


@pytest.mark.parametrize(
    ('resource', 'body', 'patch'),
    [
        ('categories', {'name': ' Еда ', 'kind': 'expense'}, {'icon': '🍎', 'color': '#112233'}),
        (
            'income-sources',
            {'name': 'Зарплата', 'amount': 10000, 'schedule': 'monthly_day', 'dayOfMonth': 31},
            {'schedule': 'irregular', 'dayOfMonth': None},
        ),
        ('obligations', {'name': 'Аренда', 'amount': 300, 'dayOfMonth': 10}, {'isActive': False}),
        (
            'goals',
            {'name': 'Отпуск', 'targetAmount': 5000},
            {'targetDate': '2027-02-28', 'status': 'archived'},
        ),
    ],
)
def test_dictionary_crud_metadata_and_pagination(app, resource, body, patch):
    item = create(app, resource, **body)
    assert item['name'] == body['name'].strip()
    updated = call(app, 'PATCH', f'/{resource}/{item["id"]}', patch).body['data']
    assert all(updated[k] == v for k, v in patch.items())
    page = call(app, 'GET', '/' + resource, limit='1', offset='1').body
    assert page == {'data': [], 'pagination': {'limit': 1, 'offset': 1, 'total': 1}}
    failure(app, 'PATCH', f'/{resource}/{item["id"]}', body={})
    failure(app, 'POST', '/' + resource, body={**body, 'id': 'client'})
    failure(app, 'GET', '/' + resource + '/missing', 404)


def test_transactions_dashboard_report_and_soft_delete(app):
    app.initialize(date(2026, 1, 1))
    income = create(app, 'categories', name='Зарплата', kind='income')
    create(
        app, 'income-sources', name='Работа', amount=10000, schedule='monthly_day', dayOfMonth=20
    )
    create(app, 'obligations', name='Квартира', amount=1000, dayOfMonth=10)
    create(
        app, 'transactions', type='income', amount=10000, date='2026-01-01', categoryId=income['id']
    )
    tx = create(
        app,
        'transactions',
        type='expense',
        amount=2000,
        date='2026-01-03',
        categoryId='other',
        comment='Магазин',
    )
    create(app, 'transactions', type='expense', amount=100, date='2026-01-19', categoryId='other')
    envelope = call(app, 'PUT', '/periods/2026-01/envelopes/other', {'limitAmount': 3000})
    assert envelope.status == 201
    assert envelope.body['data']['remaining'] == 900
    summary = call(app, 'GET', '/dashboard', date='2026-01-05').body['data']
    assert (
        summary['balance'],
        summary['reserved'],
        summary['available'],
        summary['daysLeft'],
        summary['dailyLimit'],
    ) == (8000, 1000, 7000, 15, 466)
    assert summary['envelopes'][0]['remaining'] == 1000
    report = call(app, 'GET', '/reports/categories', periodId='2026-01').body['data']
    assert report['totalExpense'] == 2100
    assert report['categories'][0]['shareBasisPoints'] == 10000
    assert call(app, 'GET', '/transactions', q='газ').body['pagination']['total'] == 1
    updated = call(app, 'PATCH', '/transactions/' + tx['id'], {'amount': 2500}).body['data']
    assert updated['createdAt'] == tx['createdAt']
    assert call(app, 'DELETE', '/transactions/' + tx['id']).status == 204
    assert call(app, 'DELETE', '/transactions/' + tx['id']).status == 204
    failure(app, 'PATCH', '/transactions/' + tx['id'], 409, {'comment': 'x'})
    assert call(app, 'GET', '/transactions', includeDeleted='true').body['pagination']['total'] == 3
    restored = call(app, 'PATCH', '/transactions/' + tx['id'], {'deletedAt': None}).body['data']
    assert restored['deletedAt'] is None
    assert restored['amount'] == 2500


def test_closure_carry_idempotence_and_frozen_history(app):
    app.initialize(date(2026, 1, 1))
    call(app, 'PUT', '/periods/2026-01/envelopes/other', {'limitAmount': 1000})
    tx = create(
        app, 'transactions', type='expense', amount=300, date='2026-01-02', categoryId='other'
    )
    assert call(app, 'POST', '/periods', {'date': '2026-03-02'}).body['data']['createdIds'] == [
        '2026-02',
        '2026-03',
    ]
    decision = {'envelopeId': '2026-01:other', 'decision': 'carry_over'}
    first = call(app, 'POST', '/periods/2026-01/closures', decision)
    assert first.status == 201
    assert first.body['data']['leftoverAmount'] == 700
    assert call(app, 'POST', '/periods/2026-01/closures', decision).status == 200
    assert (
        call(app, 'GET', '/periods/2026-02/envelopes/other').body['data']['carryOverAmount'] == 700
    )
    failure(app, 'POST', '/periods/2026-01/closures', 409, {**decision, 'decision': 'burn'})
    failure(app, 'DELETE', '/transactions/' + tx['id'], 409)
    failure(app, 'PUT', '/periods/2026-01/envelopes/other', 409, {'limitAmount': 3})


def test_goal_chronology_and_derived_closure(app):
    app.initialize(date(2026, 1, 1))
    goal = create(app, 'goals', name='Поездка', targetAmount=1000)
    deposit = create(
        app, 'transactions', type='goal_deposit', goalId=goal['id'], amount=600, date='2026-01-03'
    )
    create(
        app,
        'transactions',
        type='goal_withdrawal',
        goalId=goal['id'],
        amount=500,
        date='2026-01-04',
    )
    failure(app, 'DELETE', '/transactions/' + deposit['id'])
    failure(app, 'PATCH', '/transactions/' + deposit['id'], body={'date': '2026-01-05'})
    assert (
        call(app, 'GET', f'/goals/{goal["id"]}/progress', date='2026-01-04').body['data']['saved']
        == 100
    )
    call(app, 'PUT', '/periods/2026-01/envelopes/other', {'limitAmount': 900})
    call(app, 'POST', '/periods', {'date': '2026-02-01'})
    call(
        app,
        'POST',
        '/periods/2026-01/closures',
        {'envelopeId': '2026-01:other', 'decision': 'to_goal', 'goalId': goal['id']},
    )
    derived = call(app, 'GET', '/transactions', periodId='2026-02').body['data'][0]
    failure(app, 'PATCH', '/transactions/' + derived['id'], 409, {'amount': 1})
    failure(app, 'DELETE', '/transactions/' + derived['id'], 409)


def test_snapshot_import_is_atomic_preserves_metadata_and_ids(app):
    app.initialize(date(2026, 1, 1))
    call(app, 'PATCH', '/settings', {'theme': 'dark', 'lastOpenedPeriodId': '2026-01'})
    snapshot = call(app, 'GET', '/snapshots/current').body
    bad = deepcopy(snapshot)
    bad['categories'].append(deepcopy(bad['categories'][0]))
    failure(app, 'PUT', '/snapshots/current', body=bad)
    assert call(app, 'GET', '/snapshots/current').body == snapshot
    assert call(app, 'DELETE', '/budget').status == 204
    assert (
        call(app, 'PUT', '/snapshots/current', snapshot).body['data']['counts']['categories'] == 1
    )
    assert call(app, 'GET', '/snapshots/current').body == snapshot


@pytest.mark.parametrize(
    ('method', 'path', 'body', 'query', 'status'),
    [
        ('GET', '/unknown', None, {}, 404),
        ('POST', '/settings', {}, {}, 405),
        ('GET', '/categories', None, {'limit': '0'}, 422),
        ('GET', '/categories', None, {'offset': '-1'}, 422),
        ('GET', '/categories', None, {'x': '1'}, 422),
        ('GET', '/dashboard', None, {}, 422),
        ('GET', '/dashboard', None, {'date': '2026-02-30'}, 422),
        ('GET', '/categories', {}, {}, 422),
        ('POST', '/categories', {'name': '  ', 'kind': 'expense'}, {}, 422),
        ('POST', '/goals', {'name': 'a', 'targetAmount': True}, {}, 422),
        ('POST', '/goals', {'name': 'a', 'targetAmount': 1.5}, {}, 422),
    ],
)
def test_strict_protocol_validation(app, method, path, body, query, status):
    failure(app, method, path, status, body, **query)


def test_categories_children_archive_and_parent_filter(app):
    app.initialize(date(2026, 1, 1))
    parent = create(app, 'categories', name='Еда', kind='expense')
    child = create(app, 'categories', name='Кофе', kind='expense', parentId=parent['id'])
    failure(app, 'PATCH', '/categories/' + parent['id'], body={'isArchived': True})
    failure(app, 'PATCH', '/categories/' + parent['id'], body={'parentId': child['id']})
    failure(
        app, 'POST', '/categories', body={'name': 'x', 'kind': 'income', 'parentId': parent['id']}
    )
    tx = create(
        app, 'transactions', type='expense', amount=200, date='2026-01-02', categoryId=child['id']
    )
    failure(app, 'PATCH', '/categories/' + child['id'], 409, {'parentId': None})
    assert (
        call(app, 'GET', '/transactions', categoryId=parent['id'], type='expense').body['data'][0][
            'id'
        ]
        == tx['id']
    )
    call(app, 'PATCH', '/categories/' + child['id'], {'isArchived': True})
    failure(
        app,
        'POST',
        '/transactions',
        body={'type': 'expense', 'amount': 1, 'date': '2026-01-03', 'categoryId': child['id']},
    )
    assert (
        call(app, 'PATCH', '/transactions/' + tx['id'], {'comment': 'history'}).body['data'][
            'comment'
        ]
        == 'history'
    )
    report = call(app, 'GET', '/reports/categories', periodId='2026-01').body['data']
    assert (
        next(c for c in report['categories'] if c['categoryId'] == parent['id'])['children'][0][
            'amount'
        ]
        == 200
    )


def test_period_lists_envelopes_closures_and_burn(app):
    app.initialize(date(2026, 1, 1))
    failure(app, 'GET', '/periods/2026-01/envelopes/other', 404)
    call(app, 'PUT', '/periods/2026-01/envelopes/other', {'limitAmount': 100})
    assert call(app, 'PUT', '/periods/2026-01/envelopes/other', {'limitAmount': 200}).status == 200
    assert call(app, 'GET', '/periods/2026-01/envelopes').body['data'][0]['remaining'] == 200
    failure(
        app,
        'POST',
        '/periods/2026-01/closures',
        409,
        {'envelopeId': '2026-01:other', 'decision': 'burn'},
    )
    failure(
        app, 'POST', '/periods/2026-01/closures', body={'envelopeId': 'missing', 'decision': 'burn'}
    )
    call(app, 'POST', '/periods', {'date': '2026-02-01'})
    assert call(app, 'POST', '/periods', {'date': '2026-01-01'}).status == 200
    assert call(app, 'GET', '/periods', status='pending_review').body['pagination']['total'] == 1
    assert call(app, 'GET', '/periods/2026-01/closures').body['data'] == []
    result = call(
        app,
        'POST',
        '/periods/2026-01/closures',
        {'envelopeId': '2026-01:other', 'decision': 'burn'},
    )
    assert call(app, 'GET', result.headers['Location'][7:]).body == result.body
    assert call(app, 'GET', '/periods/2026-01/closures').body['data'] == [result.body['data']]
    failure(
        app,
        'POST',
        '/transactions',
        body={'type': 'expense', 'categoryId': 'other', 'amount': 1, 'date': '2027-01-01'},
    )
    assert call(app, 'GET', '/settings').body['data']['theme'] == 'system'
    assert call(app, 'GET', '/dashboard', date='2026-02-02').body['data']['nextIncomeDate'] is None


@pytest.mark.parametrize(
    ('path', 'body'),
    [
        ('/income-sources', {'name': 'x', 'amount': 1, 'schedule': 'monthly_day'}),
        (
            '/transactions',
            {
                'type': 'expense',
                'amount': 1,
                'date': '2026-01-01',
                'categoryId': 'other',
                'goalId': 'bad',
            },
        ),
        ('/categories', {'name': 'x', 'kind': 'expense', 'color': 'red'}),
    ],
)
def test_variant_and_pattern_validation(app, path, body):
    failure(app, 'POST', path, body=body)


def test_invalid_boolean_query(app):
    failure(app, 'GET', '/transactions', includeDeleted='1')


def test_opaque_imported_period_and_envelope_ids_survive_operations(app):
    app.initialize(date(2026, 1, 1))
    goal = create(app, 'goals', name='Trip', targetAmount=100)
    call(app, 'PUT', '/periods/2026-01/envelopes/other', {'limitAmount': 100})
    snapshot = call(app, 'GET', '/snapshots/current').body
    snapshot['periods'][0]['id'] = 'opaque-period'
    snapshot['envelopes'][0].update(id='opaque-envelope', periodId='opaque-period')
    call(app, 'PUT', '/snapshots/current', snapshot)
    assert call(app, 'POST', '/periods', {'date': '2026-02-01'}).status == 201
    result = call(
        app,
        'POST',
        '/periods/opaque-period/closures',
        {'envelopeId': 'opaque-envelope', 'decision': 'to_goal', 'goalId': goal['id']},
    )
    assert result.body['data']['envelopeId'] == 'opaque-envelope'
    exported = call(app, 'GET', '/snapshots/current').body
    assert exported['transactions'][0]['id'] == 'closure:opaque-envelope'
    assert call(app, 'PUT', '/snapshots/current', exported).status == 200
    assert (
        call(
            app,
            'POST',
            '/periods/opaque-period/closures',
            {'envelopeId': 'opaque-envelope', 'decision': 'to_goal', 'goalId': goal['id']},
        ).status
        == 200
    )
    failure(app, 'DELETE', '/transactions/closure:opaque-envelope', 409)


@pytest.fixture
def import_snapshot(app):
    app.initialize(date(2026, 1, 1))
    income = create(app, 'categories', name='Доход', kind='income')
    child = create(app, 'categories', name='Child', kind='expense', parentId='other')
    goal = create(app, 'goals', name='Trip', targetAmount=1000)
    create(app, 'obligations', name='bill', amount=1, dayOfMonth=2, categoryId='other')
    create(app, 'transactions', type='expense', amount=10, date='2026-01-01', categoryId='other')
    call(app, 'PUT', '/periods/2026-01/envelopes/other', {'limitAmount': 100})
    call(app, 'PUT', f'/periods/2026-01/envelopes/{child["id"]}', {'limitAmount': 100})
    call(app, 'POST', '/periods', {'date': '2026-03-01'})
    call(
        app,
        'POST',
        '/periods/2026-01/closures',
        {'envelopeId': '2026-01:other', 'decision': 'to_goal', 'goalId': goal['id']},
    )
    call(
        app,
        'POST',
        '/periods/2026-01/closures',
        {'envelopeId': '2026-01:' + child['id'], 'decision': 'burn'},
    )
    return call(app, 'GET', '/snapshots/current').body, income['id']


@pytest.mark.parametrize(
    'case',
    [
        'missing_reference',
        'obligation_income',
        'envelope_income',
        'transaction_date',
        'transaction_kind',
        'duplicate_period',
        'duplicate_envelope',
        'period_bounds',
        'period_gap',
        'period_status',
        'calculated',
        'closure_amount',
        'closure_order',
        'closure_goal',
        'closure_overlap',
        'closure_effect',
        'carry_effect',
        'orphan_closure',
        'negative_goal',
    ],
)
def test_import_rejects_inconsistent_financial_history_atomically(app, import_snapshot, case):
    snapshot, income = import_snapshot
    bad = deepcopy(snapshot)
    if case == 'missing_reference':
        bad['settings']['lastOpenedPeriodId'] = 'missing'
    elif case == 'obligation_income':
        bad['obligations'][0]['categoryId'] = income
    elif case == 'envelope_income':
        bad['envelopes'][0]['categoryId'] = income
    elif case == 'transaction_date':
        bad['transactions'][0]['date'] = '2026-02-01'
    elif case == 'transaction_kind':
        bad['transactions'][0]['categoryId'] = income
    elif case == 'duplicate_period':
        bad['periods'].append({**bad['periods'][0], 'id': 'duplicate'})
    elif case == 'duplicate_envelope':
        bad['envelopes'].append({**bad['envelopes'][0], 'id': 'duplicate'})
    elif case == 'period_bounds':
        bad['periods'][0]['endDate'] = '2026-01-30'
    elif case == 'period_gap':
        bad['periods'][-1].update(year=2026, month=4, startDate='2026-04-01', endDate='2026-04-30')
    elif case == 'period_status':
        bad['periods'][0]['status'] = 'active'
    elif case == 'calculated':
        bad['envelopes'][0]['remaining'] = 999
    elif case == 'closure_amount':
        bad['periodClosures'][0]['leftoverAmount'] = 99
    elif case == 'closure_order':
        bad['periods'][0]['status'] = 'pending_review'
        bad['periodClosures'].pop()
        bad['periodClosures'].append(
            {
                'envelopeId': bad['envelopes'][2]['id'],
                'decision': 'burn',
                'leftoverAmount': 100,
                'goalId': None,
            }
        )
    elif case == 'closure_goal':
        bad['periodClosures'][1]['goalId'] = bad['goals'][0]['id']
    elif case == 'closure_overlap':
        bad['periodClosures'][1]['decision'] = 'carry_over'
    elif case == 'closure_effect':
        bad['transactions'][1]['amount'] = 1
    elif case == 'carry_effect':
        bad['envelopes'][2]['carryOverAmount'] = 1
        bad['envelopes'][2]['remaining'] = 101
    elif case == 'orphan_closure':
        bad['periodClosures'][0]['envelopeId'] = 'missing'
    elif case == 'negative_goal':
        bad['transactions'][1]['type'] = 'goal_withdrawal'
    failure(app, 'PUT', '/snapshots/current', body=bad)
    assert call(app, 'GET', '/snapshots/current').body == snapshot


def test_application_storage_conflict_and_outage_are_reported_without_mutation(app, monkeypatch):
    from savemoney.storage import StorageConflict, StorageUnavailable

    snapshot = call(app, 'GET', '/snapshots/current').body
    for exception, status in [(StorageConflict, 409), (StorageUnavailable, 503)]:

        def fail_save(*args, error_type=exception):
            raise error_type('unavailable')

        with monkeypatch.context() as patch:
            patch.setattr(app.store, 'save', fail_save)
            failure(app, 'POST', '/categories', status, {'name': 'x', 'kind': 'expense'})
            with pytest.raises(APIError) as caught:
                app.initialize(date(2026, 1, 1))
            assert caught.value.status == status
        assert call(app, 'GET', '/snapshots/current').body == snapshot
    app.initialize(date(2026, 1, 1))
    with pytest.raises(APIError) as caught:
        app.initialize(date(2025, 1, 1))
    assert caught.value.status == 422


def test_extreme_integer_query_and_invalid_unicode_are_validation_errors(app):
    failure(app, 'GET', '/categories', offset='9' * 5000)
    failure(app, 'POST', '/categories', body={'name': '\ud800', 'kind': 'expense'})


def test_imported_ids_with_reserved_url_characters_are_addressable(app):
    from urllib.parse import quote

    app.initialize(date(2026, 1, 1))
    call(app, 'PUT', '/periods/2026-01/envelopes/other', {'limitAmount': 100})
    snapshot = call(app, 'GET', '/snapshots/current').body
    identifier = 'period/with?#% пробел'
    envelope = 'envelope/with?#% пробел'
    snapshot['periods'][0]['id'] = identifier
    snapshot['envelopes'][0].update(id=envelope, periodId=identifier)
    call(app, 'PUT', '/snapshots/current', snapshot)
    path = '/periods/' + quote(identifier, safe='')
    assert call(app, 'GET', path).body['data']['id'] == identifier
    call(app, 'POST', '/periods', {'date': '2026-02-01'})
    result = call(app, 'POST', path + '/closures', {'envelopeId': envelope, 'decision': 'burn'})
    assert call(app, 'GET', result.headers['Location'][7:]).body == result.body
    failure(app, 'GET', '/periods/%FF')


def test_import_rejects_closed_period_with_unreviewed_envelopes(app, import_snapshot):
    snapshot, _ = import_snapshot
    snapshot['periods'][1]['status'] = 'closed'
    failure(app, 'PUT', '/snapshots/current', body=snapshot)


def test_bson_int64_values_survive_snapshot_import_and_later_mutations(app):
    from bson.int64 import Int64

    app.initialize(date(2026, 1, 1))
    tx = create(
        app, 'transactions', type='expense', amount=1, date='2026-01-01', categoryId='other'
    )
    snapshot = call(app, 'GET', '/snapshots/current').body
    snapshot['transactions'][0]['createdAt'] = Int64(tx['createdAt'])
    assert call(app, 'PUT', '/snapshots/current', snapshot).status == 200
    assert (
        call(app, 'PATCH', '/transactions/' + tx['id'], {'amount': 2}).body['data']['amount'] == 2
    )


def test_zero_deleted_timestamp_is_preserved_across_unrelated_mutations(app):
    app.initialize(date(2026, 1, 1))
    tx = create(
        app, 'transactions', type='expense', amount=1, date='2026-01-01', categoryId='other'
    )
    snapshot = call(app, 'GET', '/snapshots/current').body
    snapshot['transactions'][0].update(createdAt=0, deletedAt=0)
    call(app, 'PUT', '/snapshots/current', snapshot)
    create(app, 'goals', name='Trip', targetAmount=100)
    deleted = call(app, 'GET', '/transactions/' + tx['id']).body['data']
    assert deleted['deletedAt'] == 0
    assert deleted['createdAt'] == 0


def test_goal_status_refreshes_on_reads_without_writes_and_stale_export_is_importable(
    app, monkeypatch
):
    from savemoney import api_codec

    class FixedDate(date):
        current = date(2026, 11, 17)

        @classmethod
        def today(cls):
            return cls.current

    monkeypatch.setattr(api_codec, 'date', FixedDate)
    app.initialize(date(2026, 11, 1))
    goal = create(app, 'goals', name='Trip', targetAmount=100)
    create(
        app, 'transactions', type='goal_deposit', amount=100, date='2026-11-17', goalId=goal['id']
    )
    create(
        app,
        'transactions',
        type='goal_withdrawal',
        amount=100,
        date='2026-11-18',
        goalId=goal['id'],
    )
    exported = call(app, 'GET', '/snapshots/current').body
    assert exported['goals'][0]['status'] == 'completed'
    persisted = deepcopy(app.store.load())
    FixedDate.current = date(2026, 11, 18)
    assert call(app, 'GET', '/goals/' + goal['id']).body['data']['status'] == 'active'
    assert call(app, 'GET', '/goals').body['data'][0]['status'] == 'active'
    assert call(app, 'GET', '/snapshots/current').body['goals'][0]['status'] == 'active'
    assert app.store.load() == persisted
    assert call(app, 'PATCH', '/settings', {'theme': 'dark'}).status == 200
    assert call(app, 'PUT', '/snapshots/current', exported).status == 200
    assert call(app, 'GET', '/goals/' + goal['id']).body['data']['status'] == 'active'
    call(app, 'PATCH', '/goals/' + goal['id'], {'status': 'archived'})
    FixedDate.current = date(2026, 11, 17)
    assert call(app, 'GET', '/goals/' + goal['id']).body['data']['status'] == 'archived'


@pytest.mark.parametrize(
    'identifier', ['envelopes-imported', 'closures-imported', 'id/envelopes/nested']
)
def test_period_ids_never_select_child_routes(app, identifier):
    from urllib.parse import quote

    app.initialize(date(2026, 1, 1))
    snapshot = call(app, 'GET', '/snapshots/current').body
    snapshot['periods'][0]['id'] = identifier
    call(app, 'PUT', '/snapshots/current', snapshot)
    period = call(app, 'GET', '/periods/' + quote(identifier, safe='')).body['data']
    assert period['id'] == identifier
    assert period['month'] == 1


@pytest.mark.parametrize('existing_id', ['closure:opaque', 'closure:2026-01:other'])
def test_closure_generated_id_collision_preserves_existing_transaction(app, existing_id):
    app.initialize(date(2026, 1, 1))
    category = create(app, 'categories', name='Income', kind='income')
    goal = create(app, 'goals', name='Trip', targetAmount=100)
    create(
        app,
        'transactions',
        type='income',
        amount=1000,
        date='2026-01-02',
        categoryId=category['id'],
    )
    call(app, 'PUT', '/periods/2026-01/envelopes/other', {'limitAmount': 100})
    snapshot = call(app, 'GET', '/snapshots/current').body
    snapshot['envelopes'][0]['id'] = 'opaque'
    snapshot['transactions'][0]['id'] = existing_id
    call(app, 'PUT', '/snapshots/current', snapshot)
    call(app, 'POST', '/periods', {'date': '2026-02-01'})
    before = call(app, 'GET', '/snapshots/current').body
    failure(
        app,
        'POST',
        '/periods/2026-01/closures',
        409,
        {'envelopeId': 'opaque', 'decision': 'to_goal', 'goalId': goal['id']},
    )
    assert call(app, 'GET', '/snapshots/current').body == before
    assert call(app, 'GET', '/transactions/' + existing_id).body['data']['amount'] == 1000


def test_snapshot_import_recomputes_goal_completion_and_preserves_archived(app):
    create(app, 'goals', name='Trip', targetAmount=100)
    snapshot = call(app, 'GET', '/snapshots/current').body
    snapshot['goals'][0]['status'] = 'completed'
    assert call(app, 'PUT', '/snapshots/current', snapshot).status == 200
    assert call(app, 'GET', '/goals').body['data'][0]['status'] == 'active'
    snapshot['goals'][0]['status'] = 'archived'
    call(app, 'PUT', '/snapshots/current', snapshot)
    assert call(app, 'GET', '/goals').body['data'][0]['status'] == 'archived'
