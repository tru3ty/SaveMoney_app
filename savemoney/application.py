"""Single-user REST application; every mutation validates a private copy before CAS."""

from copy import deepcopy
from dataclasses import replace
from datetime import date
from urllib.parse import quote
from uuid import uuid4

from savemoney.api_codec import (
    COLLECTIONS,
    Codec,
    calendar_id,
    empty_snapshot,
    timestamp,
    transaction,
    validate_snapshot,
)
from savemoney.api_types import APIError, Response
from savemoney.api_validation import SCHEMAS, conflict, defaults, invalid, route, validate
from savemoney.domain.calculations import available_money, daily_limit, goal_progress
from savemoney.storage import StorageConflict, StorageUnavailable

RESOURCES = {
    'categories': ('categories', 'Category'),
    'income-sources': ('incomeSources', 'IncomeSource'),
    'obligations': ('obligations', 'Obligation'),
    'goals': ('goals', 'Goal'),
}


def find(items, key, field='id'):
    for item in items:
        if item[field] == key:
            return item
    raise APIError(404, 'not_found', 'Ресурс не найден')


def data(value, status=200, location=None):
    return Response(status, {'data': value}, {'Location': location} if location else {})


def page(items, query, key='id'):
    items = list(items)
    if key:
        items.sort(key=lambda item: item[key])
    limit, offset = query.get('limit', 50), query.get('offset', 0)
    return Response(
        200,
        {
            'data': items[offset : offset + limit],
            'pagination': {'limit': limit, 'offset': offset, 'total': len(items)},
        },
    )


class Application:
    def __init__(self, store):
        self.store = store

    def initialize(self, today):
        try:
            revision, loaded = self.store.load()
            snapshot = deepcopy(loaded) if loaded is not None else empty_snapshot()
            if not any(c['id'] == 'other' for c in snapshot['categories']):
                snapshot['categories'].append(
                    defaults('Category', {'id': 'other', 'name': 'Прочее', 'kind': 'expense'})
                )
            codec = Codec(snapshot)
            codec.budget.ensure_period(today)
            codec.sync()
            validate_snapshot(snapshot)
            if snapshot != loaded:
                self.store.save(snapshot, revision)
            return snapshot
        except StorageConflict as error:
            raise APIError(409, 'conflict', 'Бюджет изменён другим запросом') from error
        except StorageUnavailable as error:
            raise APIError(503, 'storage_unavailable', 'Хранилище недоступно') from error
        except ValueError as error:
            raise APIError(422, 'validation_error', str(error)) from error

    def handle(self, method, path, query, body):
        template, params, query = route(method, path, query, body)
        try:
            revision, loaded = self.store.load()
            snapshot = deepcopy(loaded) if loaded is not None else empty_snapshot()
            Codec(snapshot).refresh_goal_statuses()
            response, snapshot = self._dispatch(
                method, path, template, params, query, body, snapshot
            )
            if method != 'GET' and snapshot != loaded:
                validate_snapshot(snapshot)
                self.store.save(snapshot, revision)
            return response
        except StorageConflict as error:
            raise APIError(409, 'conflict', 'Бюджет изменён другим запросом') from error
        except StorageUnavailable as error:
            raise APIError(503, 'storage_unavailable', 'Хранилище недоступно') from error
        except (ValueError, KeyError, OverflowError) as error:
            raise APIError(422, 'validation_error', str(error)) from error

    def _dispatch(self, method, path, template, params, query, body, snapshot):
        resource = template.split('/')[3]
        if resource == 'snapshots':
            if method == 'GET':
                return Response(200, snapshot), snapshot
            snapshot = deepcopy(body)
            validate_snapshot(snapshot).refresh_goal_statuses()
            return data({'counts': {key: len(snapshot[key]) for key in COLLECTIONS}}), snapshot
        if resource == 'budget':
            return Response(204), empty_snapshot()
        if resource == 'settings':
            if method == 'PATCH':
                snapshot['settings'].update(body)
            return data(snapshot['settings']), snapshot
        if resource in RESOURCES and not template.endswith('/progress'):
            return self._dictionary(method, path, resource, params, query, body, snapshot), snapshot
        codec = Codec(snapshot)
        if resource == 'periods':
            response = self._periods(method, path, template, params, query, body, codec)
        elif resource == 'transactions':
            response = self._transactions(method, path, params, query, body, codec)
        else:
            response = self._summary(resource, params, query, codec)
        return response, snapshot

    def _dictionary(self, method, path, resource, params, query, body, snapshot):
        key, schema = RESOURCES[resource]
        items = snapshot[key]
        if method == 'GET':
            return data(find(items, params['id'])) if params else page(items, query)
        values = deepcopy(body)
        if 'name' in values:
            values['name'] = values['name'].strip()
        if method == 'POST':
            item = defaults(schema + 'Create', {'id': str(uuid4()), **values})
            items.append(item)
        else:
            item = find(items, params['id'])
            if resource == 'categories':
                changed = any(
                    name in values and values[name] != item[name] for name in ('kind', 'parentId')
                )
                used = any(t['categoryId'] == item['id'] for t in snapshot['transactions']) or any(
                    e['categoryId'] == item['id'] for e in snapshot['envelopes']
                )
                if changed and used:
                    conflict('Категория уже использована в истории')
            item.update(values)
        Codec(snapshot).sync()
        return data(
            item,
            201 if method == 'POST' else 200,
            path + '/' + quote(item['id'], safe='') if method == 'POST' else None,
        )

    def _periods(self, method, path, template, params, query, body, codec):
        snapshot, b = codec.snapshot, codec.budget
        if not params:
            if method == 'GET':
                items = [
                    p
                    for p in snapshot['periods']
                    if 'status' not in query or p['status'] == query['status']
                ]
                return page(
                    sorted(items, key=lambda p: (p['year'], p['month']), reverse=True), query, None
                )
            previous = set(b.periods)
            period = b.ensure_period(date.fromisoformat(body['date']))
            codec.sync()
            external = codec.external_periods.get(period.id, period.id)
            result = {
                'period': find(snapshot['periods'], external),
                'createdIds': [p for p in b.periods if p not in previous],
            }
            return data(
                result,
                201 if period.id not in previous else 200,
                '/api/v1/periods/' + quote(external, safe='')
                if period.id not in previous
                else None,
            )
        period = find(snapshot['periods'], params['id'])
        period_key = codec.period_ids[period['id']]
        if '/envelopes' in template:
            return self._envelopes(method, path, period_key, params, query, body, codec)
        if '/closures' in template:
            return self._closures(method, path, period_key, params, query, body, codec)
        return data(period)

    def _envelopes(self, method, path, period_key, params, query, body, codec):
        b = codec.budget
        if 'categoryId' not in params:
            return page(
                [
                    codec.envelope(key)
                    for key, e in b.envelopes.items()
                    if e.period_id == period_key
                ],
                query,
            )
        key = f'{period_key}:{params["categoryId"]}'
        if method == 'GET':
            if key not in b.envelopes:
                raise APIError(404, 'not_found', 'Конверт не найден')
            return data(codec.envelope(key))
        if b.periods[period_key].status == 'closed' or key in b.closures:
            conflict('План закрытого конверта нельзя менять')
        created = key not in b.envelopes
        b.set_envelope(period_key, params['categoryId'], body['limitAmount'])
        codec.sync()
        return data(codec.envelope(key), 201 if created else 200, path if created else None)

    def _closures(self, method, path, period_key, params, query, body, codec):
        b = codec.budget
        items = [
            c
            for c in codec.snapshot['periodClosures']
            if b.envelopes[codec.envelope_ids[c['envelopeId']]].period_id == period_key
        ]
        if method == 'GET':
            return (
                data(find(items, params['envelopeId'], 'envelopeId'))
                if 'envelopeId' in params
                else page(items, query, 'envelopeId')
            )
        external_key = body['envelopeId']
        if (
            external_key not in codec.envelope_ids
            or b.envelopes[codec.envelope_ids[external_key]].period_id != period_key
        ):
            invalid('Конверт не принадлежит выбранному периоду', 'envelopeId')
        key = codec.envelope_ids[external_key]
        created = key not in b.closures
        if not created:
            existing = b.closures[key]
            if (existing.decision, existing.goal_id) != (body['decision'], body.get('goalId')):
                conflict('Для конверта уже принято другое решение')
        elif b.periods[period_key].status != 'pending_review' or any(
            p.start < b.periods[period_key].start and p.status != 'closed'
            for p in b.periods.values()
        ):
            conflict('Период нельзя закрыть до завершения и разбора предыдущих')
        if created and body['decision'] == 'to_goal':
            generated_ids = {'closure:' + key, 'closure:' + external_key}
            if generated_ids.intersection(b.transactions):
                conflict('Идентификатор производной операции уже существует')
        b.close_envelope(key, body['decision'], goal_id=body.get('goalId'))
        # Derived transaction IDs refer to the public envelope ID, including after import.
        if created and body['decision'] == 'to_goal' and external_key != key:
            tx = b.transactions.pop('closure:' + key)
            b.transactions['closure:' + external_key] = replace(tx, id='closure:' + external_key)
        codec.sync()
        result = find(codec.snapshot['periodClosures'], external_key, 'envelopeId')
        return data(
            result,
            201 if created else 200,
            path + '/' + quote(external_key, safe='') if created else None,
        )

    def _mutable_period(self, codec, period_id):
        b = codec.budget
        if period_id not in b.periods:
            invalid('Период предварительно не создан', 'date')
        if b.periods[period_id].status == 'closed' or any(
            b.envelopes[key].period_id == period_id for key in b.closures
        ):
            conflict('Операции периода заморожены после начала разбора остатков')

    def _transactions(self, method, path, params, query, body, codec):
        snapshot, b = codec.snapshot, codec.budget
        if method == 'GET':
            if params:
                return data(find(snapshot['transactions'], params['id']))
            items = snapshot['transactions']
            for field in ('periodId', 'type'):
                if field in query:
                    items = [t for t in items if t[field] == query[field]]
            if 'categoryId' in query:
                ids = {query['categoryId']} | {
                    c.id for c in b.categories.values() if c.parent_id == query['categoryId']
                }
                items = [t for t in items if t['categoryId'] in ids]
            items = [
                t
                for t in items
                if (query.get('includeDeleted', False) or t['deletedAt'] is None)
                and query.get('q', '').casefold() in t['comment'].casefold()
            ]
            return page(
                sorted(sorted(items, key=lambda t: t['id']), key=lambda t: t['date'], reverse=True),
                query,
                None,
            )
        old = find(snapshot['transactions'], params['id']) if params else None
        if old:
            if method == 'DELETE' and old['deletedAt'] is not None:
                return Response(204)
            if old['id'] in {'closure:' + c['envelopeId'] for c in snapshot['periodClosures']}:
                conflict('Производную операцию закрытия нельзя менять')
            self._mutable_period(codec, codec.period_ids[old['periodId']])
            if method == 'DELETE':
                b.delete_transaction(old['id'])
                codec.sync()
                return Response(204)
            if old['deletedAt'] is not None and 'deletedAt' not in body:
                conflict('Сначала восстановите удалённую операцию')
            values = {**old, **body}
        else:
            values = defaults(
                'Transaction',
                {'id': str(uuid4()), 'createdAt': timestamp(), 'deletedAt': None, **body},
            )
        day = date.fromisoformat(values['date'])
        period_id = calendar_id(day.year, day.month)
        self._mutable_period(codec, period_id)
        values['periodId'] = codec.external_periods.get(period_id, period_id)
        validate(
            {
                k: values[k]
                for k in (
                    'type',
                    'amount',
                    'date',
                    'categoryId',
                    'goalId',
                    'incomeSourceId',
                    'obligationId',
                    'comment',
                )
            },
            SCHEMAS['TransactionCreate'],
        )
        category = values['categoryId']
        if category is not None and (
            not old or old['categoryId'] != category or old['deletedAt'] is not None
        ):
            if category not in b.categories or b.categories[category].is_archived:
                invalid('Нужна действующая категория', 'categoryId')
        tx = transaction(values, {**codec.period_ids, values['periodId']: period_id})
        if old:
            b.transactions[tx.id] = tx
        else:
            b.add_transaction(tx)
        codec.sync()
        return data(
            find(snapshot['transactions'], tx.id),
            201 if not old else 200,
            path + '/' + quote(tx.id, safe='') if not old else None,
        )

    def _summary(self, resource, params, query, codec):
        b = codec.budget
        if resource == 'reports':
            return data(self._report(query['periodId'], codec))
        today = date.fromisoformat(query['date'])
        if resource == 'goals':
            goal = find(codec.snapshot['goals'], params['id'])
            progress = goal_progress(b.goals[goal['id']], b.transactions.values(), today)
            return data(
                {
                    'saved': progress.saved,
                    'remaining': progress.remaining,
                    'perMonth': progress.per_month,
                    'status': progress.status,
                }
            )
        available = available_money(
            b.transactions.values(), b.obligations.values(), b.sources.values(), today
        )
        days, limit = daily_limit(available.available, today, available.next_income)
        return data(
            {
                'balance': available.balance,
                'reserved': available.reserved,
                'available': available.available,
                'nextIncomeDate': available.next_income.isoformat()
                if available.next_income
                else None,
                'daysLeft': days,
                'dailyLimit': limit,
                'envelopes': sorted(
                    [
                        codec.envelope(key, today)
                        for key, e in b.envelopes.items()
                        if e.period_id == calendar_id(today.year, today.month)
                    ],
                    key=lambda e: e['id'],
                ),
            }
        )

    def _report(self, period_id, codec):
        period = find(codec.snapshot['periods'], period_id)
        b = codec.budget
        ordinal = period['year'] * 12 + period['month']
        amounts, previous = {}, {}
        for tx in b.transactions.values():
            if tx.type != 'expense' or tx.deleted:
                continue
            month = tx.date.year * 12 + tx.date.month
            target = amounts if month == ordinal else previous if month == ordinal - 1 else None
            if target is not None:
                target[tx.category_id] = target.get(tx.category_id, 0) + tx.amount
        total = sum(amounts.values())

        def entry(category, ids):
            amount = sum(amounts.get(key, 0) for key in ids)
            prior = sum(previous.get(key, 0) for key in ids)
            return {
                'categoryId': category.id,
                'amount': amount,
                'shareBasisPoints': amount * 10000 // total if total else 0,
                'previousAmount': prior,
                'changeBasisPoints': (amount - prior) * 10000 // prior if prior else None,
            }

        result = []
        for category in sorted(b.categories.values(), key=lambda c: c.id):
            if category.kind != 'expense' or category.parent_id is not None:
                continue
            children = sorted(
                [c for c in b.categories.values() if c.parent_id == category.id], key=lambda c: c.id
            )
            item = entry(category, [category.id, *[c.id for c in children]])
            item['children'] = [entry(c, [c.id]) for c in children]
            result.append(item)
        return {'periodId': period_id, 'totalExpense': total, 'categories': result}
