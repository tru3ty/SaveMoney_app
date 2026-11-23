"""Преобразование снимка JSON в объекты бюджета с сохранением исходных ID."""

from datetime import date
from time import time_ns

from savemoney.api_validation import SCHEMAS, defaults, invalid, validate
from savemoney.budget import Budget
from savemoney.domain.calculations import goal_progress
from savemoney.domain.models import (
    Category,
    Envelope,
    Goal,
    IncomeSource,
    Obligation,
    Period,
    PeriodClosure,
    Transaction,
)
from savemoney.domain.validation import validate_goal_balances

COLLECTIONS = (
    'incomeSources',
    'obligations',
    'categories',
    'periods',
    'envelopes',
    'periodClosures',
    'transactions',
    'goals',
)


def empty_snapshot():
    return {
        'schemaVersion': 1,
        **{key: [] for key in COLLECTIONS},
        'settings': defaults('Settings', {}),
    }


def timestamp():
    return time_ns() // 1_000_000


def calendar_id(year, month):
    return f'{year:04d}-{month:02d}'


def transaction(value, periods):
    return Transaction(
        value['id'],
        value['type'],
        value['amount'],
        date.fromisoformat(value['date']),
        category_id=value['categoryId'],
        period_id=periods[value['periodId']],
        goal_id=value['goalId'],
        income_source_id=value['incomeSourceId'],
        obligation_id=value['obligationId'],
        comment=value['comment'],
        deleted=value['deletedAt'] is not None,
    )


class Codec:
    def __init__(self, snapshot):
        self.snapshot = snapshot
        self.budget = b = Budget()
        self.period_ids = {p['id']: calendar_id(p['year'], p['month']) for p in snapshot['periods']}
        self.envelope_ids = {
            e['id']: f'{self.period_ids[e["periodId"]]}:{e["categoryId"]}'
            for e in snapshot['envelopes']
        }
        self.external_periods = {v: k for k, v in self.period_ids.items()}
        self.external_envelopes = {v: k for k, v in self.envelope_ids.items()}
        for c in snapshot['categories']:
            b.categories[c['id']] = Category(
                c['id'], c['name'], c['parentId'], c['kind'], c['isArchived']
            )
        for s in snapshot['incomeSources']:
            b.sources[s['id']] = IncomeSource(
                s['id'], s['name'], s['amount'], s['schedule'], s['dayOfMonth'], s['isActive']
            )
        for o in snapshot['obligations']:
            b.obligations[o['id']] = Obligation(
                o['id'], o['name'], o['amount'], o['dayOfMonth'], o['categoryId'], o['isActive']
            )
        for g in snapshot['goals']:
            b.goals[g['id']] = Goal(
                g['id'],
                g['name'],
                g['targetAmount'],
                date.fromisoformat(g['targetDate']) if g['targetDate'] else None,
            )
        for p in snapshot['periods']:
            key = self.period_ids[p['id']]
            b.periods[key] = Period(key, p['year'], p['month'], p['status'])
        for e in snapshot['envelopes']:
            key = self.envelope_ids[e['id']]
            b.envelopes[key] = Envelope(
                key,
                self.period_ids[e['periodId']],
                e['categoryId'],
                e['limitAmount'],
                e['carryOverAmount'],
            )
        for t in snapshot['transactions']:
            b.transactions[t['id']] = transaction(t, self.period_ids)
        for c in snapshot['periodClosures']:
            key = self.envelope_ids[c['envelopeId']]
            b.closures[key] = PeriodClosure(key, c['decision'], c['leftoverAmount'], c['goalId'])

    def envelope(self, key, as_of=None):
        e = self.budget.envelopes[key]
        state = self.budget.envelope_state(key, as_of=as_of)
        return {
            'id': self.external_envelopes.get(key, key),
            'periodId': self.external_periods.get(e.period_id, e.period_id),
            'categoryId': e.category_id,
            'limitAmount': e.limit_amount,
            'carryOverAmount': e.carry_over_amount,
            **state._asdict(),
        }

    def sync(self):
        b, snapshot = self.budget, self.snapshot
        snapshot['periods'] = [
            {
                'id': self.external_periods.get(p.id, p.id),
                'year': p.year,
                'month': p.month,
                'startDate': p.start.isoformat(),
                'endDate': p.end.isoformat(),
                'status': p.status,
            }
            for p in b.periods.values()
        ]
        snapshot['envelopes'] = [self.envelope(key) for key in b.envelopes]
        snapshot['periodClosures'] = [
            {
                'envelopeId': self.external_envelopes.get(c.envelope_id, c.envelope_id),
                'decision': c.decision,
                'leftoverAmount': c.leftover_amount,
                'goalId': c.goal_id,
            }
            for c in b.closures.values()
        ]
        old_transactions = {t['id']: t for t in snapshot['transactions']}
        snapshot['transactions'] = []
        for tx in b.transactions.values():
            old = old_transactions.get(tx.id, {})
            snapshot['transactions'].append(
                {
                    'id': tx.id,
                    'type': tx.type,
                    'amount': tx.amount,
                    'date': tx.date.isoformat(),
                    'categoryId': tx.category_id,
                    'periodId': self.external_periods.get(tx.period_id, tx.period_id),
                    'goalId': tx.goal_id,
                    'incomeSourceId': tx.income_source_id,
                    'obligationId': tx.obligation_id,
                    'comment': tx.comment,
                    'createdAt': old.get('createdAt', timestamp()),
                    'deletedAt': (
                        old['deletedAt'] if old.get('deletedAt') is not None else timestamp()
                    )
                    if tx.deleted
                    else None,
                }
            )
        self.refresh_goal_statuses()
        return snapshot

    def refresh_goal_statuses(self):
        # Completion is a dated projection; persisted exports may outlive that date.
        today = date.today()
        for goal in self.snapshot['goals']:
            if goal['status'] != 'archived':
                progress = goal_progress(
                    self.budget.goals[goal['id']], self.budget.transactions.values(), today
                )
                goal['status'] = 'completed' if progress.status == 'completed' else 'active'


def related(items, key, field):
    if key not in items:
        invalid('Связанный объект не найден', field)
    return items[key]


def validate_snapshot(snapshot):
    validate(snapshot, SCHEMAS['Snapshot'])
    indexes = {}
    for key in COLLECTIONS:
        id_key = 'envelopeId' if key == 'periodClosures' else 'id'
        indexes[key] = {item[id_key]: item for item in snapshot[key]}
        if len(indexes[key]) != len(snapshot[key]):
            invalid('Повторяющийся идентификатор', key)
    categories, periods = indexes['categories'], indexes['periods']
    for c in categories.values():
        if c['id'] == 'other' and (c['isArchived'] or c['kind'] != 'expense'):
            invalid('Прочее должна оставаться действующей расходной категорией')
        if c['parentId'] is not None:
            parent = related(categories, c['parentId'], 'parentId')
            if (
                parent['parentId'] is not None
                or parent['kind'] != c['kind']
                or (parent['isArchived'] and not c['isArchived'])
            ):
                invalid('Разрешены два уровня категорий одного вида с действующим родителем')
    for o in snapshot['obligations']:
        if (
            o['categoryId'] is not None
            and related(categories, o['categoryId'], 'categoryId')['kind'] != 'expense'
        ):
            invalid('Обязательству нужна расходная категория')
    for e in snapshot['envelopes']:
        related(periods, e['periodId'], 'periodId')
        if related(categories, e['categoryId'], 'categoryId')['kind'] != 'expense':
            invalid('Конверту нужна расходная категория')
    for t in snapshot['transactions']:
        payload = {
            k: t[k]
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
        }
        validate(payload, SCHEMAS['TransactionCreate'])
        period = related(periods, t['periodId'], 'periodId')
        if (period['year'], period['month']) != (
            date.fromisoformat(t['date']).year,
            date.fromisoformat(t['date']).month,
        ):
            invalid('Дата операции не принадлежит периоду')
        for field, collection in [
            ('categoryId', 'categories'),
            ('goalId', 'goals'),
            ('incomeSourceId', 'incomeSources'),
            ('obligationId', 'obligations'),
        ]:
            if t[field] is not None:
                related(indexes[collection], t[field], field)
        if t['categoryId'] is not None and categories[t['categoryId']]['kind'] != t['type']:
            invalid('Категория не соответствует типу операции')
    if snapshot['settings']['lastOpenedPeriodId'] is not None:
        related(periods, snapshot['settings']['lastOpenedPeriodId'], 'lastOpenedPeriodId')
    codec = Codec(snapshot)
    b = codec.budget
    if len(b.periods) != len(periods) or len(b.envelopes) != len(snapshot['envelopes']):
        invalid('Повтор периода или конверта категории')
    for p in snapshot['periods']:
        domain = b.periods[codec.period_ids[p['id']]]
        if (p['startDate'], p['endDate']) != (domain.start.isoformat(), domain.end.isoformat()):
            invalid('Границы периода не соответствуют календарю')
    ordered = sorted(b.periods.values(), key=lambda p: p.start)
    for previous, current in zip(ordered, ordered[1:], strict=False):
        if (
            current.year * 12 + current.month - previous.year * 12 - previous.month != 1
            or previous.status == 'active'
        ):
            invalid('Нарушена последовательность периодов')
    for p in ordered:
        envelopes = [e for e in b.envelopes.values() if e.period_id == p.id]
        closed = [e for e in envelopes if e.id in b.closures]
        if (
            (p.status == 'active' and closed)
            or (p.status == 'pending_review' and len(closed) == len(envelopes))
            or (p.status == 'closed' and len(closed) != len(envelopes))
        ):
            invalid('Статус периода не соответствует решениям')
    for e in snapshot['envelopes']:
        if e != codec.envelope(codec.envelope_ids[e['id']]):
            invalid('Вычисляемые поля конверта не соответствуют операциям')
    validate_goal_balances(b.transactions.values())
    _validate_closures(codec, indexes)
    return codec


def _validate_closures(codec, indexes):
    b = codec.budget
    carries = {key: 0 for key in b.envelopes}
    for c in codec.snapshot['periodClosures']:
        e = b.envelopes[codec.envelope_ids[c['envelopeId']]]
        period = b.periods[e.period_id]
        if period.status == 'active' or c['leftoverAmount'] != b.envelope_state(e.id).remaining:
            invalid('Решение не соответствует периоду или остатку')
        if any(p.start < period.start and p.status != 'closed' for p in b.periods.values()):
            invalid('Нарушен порядок закрытия периодов')
        if (c['decision'] == 'to_goal') != (c['goalId'] is not None):
            invalid('Цель допустима только для to_goal')
        if c['decision'] == 'burn':
            continue
        for other in b.closures.values():
            other_e = b.envelopes[other.envelope_id]
            if (
                other_e.period_id == e.period_id
                and other.decision != 'burn'
                and (
                    b.categories[e.category_id].parent_id == other_e.category_id
                    or b.categories[other_e.category_id].parent_id == e.category_id
                )
            ):
                invalid('Остатки пересекающихся конвертов распределены дважды')
        year, month = (
            (period.year + 1, 1) if period.month == 12 else (period.year, period.month + 1)
        )
        next_id = calendar_id(year, month)
        if c['decision'] == 'carry_over':
            target = f'{next_id}:{e.category_id}'
            related(b.envelopes, target, 'carryOverAmount')
            carries[target] += c['leftoverAmount']
        else:
            related(indexes['goals'], c['goalId'], 'goalId')
            tx = related(indexes['transactions'], f'closure:{c["envelopeId"]}', 'transactions')
            if (
                c['leftoverAmount'] <= 0
                or tx['type'] != 'goal_deposit'
                or tx['amount'] != c['leftoverAmount']
                or tx['goalId'] != c['goalId']
                or tx['date'] != f'{next_id}-01'
                or tx['deletedAt'] is not None
            ):
                invalid('Эффект перевода в цель не соответствует решению')
    for key, amount in carries.items():
        if b.envelopes[key].carry_over_amount != amount:
            invalid('Перенос не соответствует решениям прошлого периода')
