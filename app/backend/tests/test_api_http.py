"""Сквозной сценарий: настоящий HTTP → приложение → память или Mongo-коллекция."""

from copy import deepcopy
from threading import Thread
from urllib.parse import urljoin

import mongomock
import pytest
import requests

from savemoney.storage import MemoryStore, MongoStore

pytestmark = pytest.mark.network


@pytest.fixture(params=['memory', 'mongo'])
def api(request):
    from savemoney.application import Application
    from savemoney.server import make_server

    store = (
        MemoryStore()
        if request.param == 'memory'
        else MongoStore(mongomock.MongoClient().savemoney.budgets)
    )
    with make_server(Application(store), port=0) as server:
        worker = Thread(target=server.serve_forever, kwargs={'poll_interval': 0.01})
        worker.start()
        with requests.Session() as session:
            base = f'http://127.0.0.1:{server.server_port}/api/v1'

            def call(method, path, status=200, **kwargs):
                response = session.request(method, base + path, timeout=3, **kwargs)
                assert response.status_code == status, response.text
                if status == 204:
                    assert response.content == b''
                    return response
                assert 'application/json' in response.headers['Content-Type']
                if status == 201:
                    location = urljoin(base, response.headers['Location'])
                    created = session.get(location, timeout=3)
                    assert created.status_code == 200, created.text
                    data = response.json()['data']
                    entity = data.get('period', data)
                    assert created.json()['data']['id'] == entity['id']
                return response

            try:
                yield call
            finally:
                server.shutdown()
                worker.join(timeout=5)


def create(api, resource, **body):
    return api('POST', '/' + resource, status=201, json=body).json()['data']


def test_financial_workflow_persists_across_http_reads_and_atomic_import(api):
    assert api('GET', '/snapshots/current').json()['periods'] == []
    food = create(api, 'categories', name='Продукты', kind='expense')
    income = create(api, 'categories', name='Доход', kind='income')
    source = create(
        api,
        'income-sources',
        name='Зарплата',
        amount=8500000,
        schedule='monthly_day',
        dayOfMonth=20,
    )
    rent = create(api, 'obligations', name='Аренда', amount=5000000, dayOfMonth=10)
    goal = create(api, 'goals', name='Поездка', targetAmount=10000000)
    period = api('POST', '/periods', status=201, json={'date': '2026-11-05'}).json()['data']
    assert period['period']['id'] == '2026-11'
    repeated = api('POST', '/periods', json={'date': '2026-11-05'}).json()['data']
    assert repeated['createdIds'] == []
    create(
        api,
        'transactions',
        type='income',
        amount=8500000,
        date='2026-11-01',
        categoryId=income['id'],
        incomeSourceId=source['id'],
    )
    expense = create(
        api,
        'transactions',
        type='expense',
        amount=45000,
        date='2026-11-05',
        categoryId=food['id'],
        comment='Обед',
    )
    path = f'/periods/2026-11/envelopes/{food["id"]}'
    envelope = api('PUT', path, status=201, json={'limitAmount': 3000000}).json()['data']
    assert (envelope['spent'], envelope['remaining']) == (45000, 2955000)
    dashboard = api('GET', '/dashboard', params={'date': '2026-11-05'}).json()['data']
    assert (dashboard['balance'], dashboard['reserved'], dashboard['available']) == (
        8455000,
        5000000,
        3455000,
    )
    assert (dashboard['daysLeft'], dashboard['dailyLimit']) == (15, 230333)
    assert api('GET', '/obligations/' + rent['id']).json()['data']['amount'] == 5000000
    filtered = api('GET', '/transactions', params={'categoryId': food['id'], 'q': 'обед'}).json()
    assert filtered['pagination']['total'] == 1
    assert filtered['data'][0]['id'] == expense['id']
    report = api('GET', '/reports/categories', params={'periodId': '2026-11'}).json()['data']
    assert report['totalExpense'] == 45000
    assert report['categories'][0]['categoryId'] == food['id']
    assert report['categories'][0]['shareBasisPoints'] == 10000
    create(
        api,
        'transactions',
        type='goal_deposit',
        amount=100000,
        date='2026-11-05',
        goalId=goal['id'],
    )
    create(
        api,
        'transactions',
        type='goal_withdrawal',
        amount=25000,
        date='2026-11-05',
        goalId=goal['id'],
    )
    progress = api(
        'GET', '/goals/' + goal['id'] + '/progress', params={'date': '2026-11-05'}
    ).json()['data']
    assert (progress['saved'], progress['remaining']) == (75000, 9925000)
    settings = api('PATCH', '/settings', json={'theme': 'dark'}).json()['data']
    assert settings['theme'] == 'dark'
    before = api('GET', '/snapshots/current').json()
    invalid = deepcopy(before)
    invalid['categories'].append(deepcopy(invalid['categories'][0]))
    rejected = api('PUT', '/snapshots/current', status=422, json=invalid)
    assert rejected.json()['error']['code'] == 'validation_error'
    assert api('GET', '/snapshots/current').json() == before
    imported = api('PUT', '/snapshots/current', json=before).json()['data']
    assert imported['counts']['transactions'] == 4
    assert api('GET', '/snapshots/current').json() == before
    api('DELETE', '/transactions/' + expense['id'], status=204)
    api('DELETE', '/transactions/' + expense['id'], status=204)
    assert api('GET', path).json()['data']['spent'] == 0
    restored = api('PATCH', '/transactions/' + expense['id'], json={'deletedAt': None}).json()[
        'data'
    ]
    assert restored['deletedAt'] is None
    assert restored['createdAt'] == expense['createdAt']
    assert api('GET', path).json()['data']['spent'] == 45000


def test_invalid_http_mutations_preserve_snapshot(api):
    create(api, 'categories', name='Еда', kind='expense')
    before = api('GET', '/snapshots/current').json()
    cases = [
        (
            'POST',
            '/categories',
            {'json': {'name': 'Еда', 'kind': 'expense', 'id': 'client'}},
            422,
            'validation_error',
        ),
        (
            'POST',
            '/goals',
            {'json': {'name': 'Цель', 'targetAmount': True}},
            422,
            'validation_error',
        ),
        (
            'POST',
            '/transactions',
            {
                'json': {
                    'type': 'expense',
                    'amount': 0,
                    'date': '2026-11-05',
                    'categoryId': 'missing',
                }
            },
            422,
            'validation_error',
        ),
        (
            'POST',
            '/categories',
            {'data': '{', 'headers': {'Content-Type': 'application/json'}},
            400,
            'invalid_json',
        ),
        ('POST', '/categories', {'data': '{}'}, 415, 'unsupported_media_type'),
        ('GET', '/categories?limit=1&limit=2', {}, 422, 'validation_error'),
        ('PATCH', '/settings', {'json': {}}, 422, 'validation_error'),
        ('GET', '/categories/missing', {}, 404, 'not_found'),
        ('POST', '/settings', {'json': {'theme': 'dark'}}, 405, 'method_not_allowed'),
    ]
    for method, path, arguments, status, code in cases:
        response = api(method, path, status=status, **arguments)
        assert response.json()['error']['code'] == code
        if status == 405:
            assert set(response.headers['Allow'].replace(' ', '').split(',')) == {'GET', 'PATCH'}
        assert api('GET', '/snapshots/current').json() == before
