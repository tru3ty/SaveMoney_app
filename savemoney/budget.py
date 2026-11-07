"""Сценарии учебного ядра. Хранилище в памяти заменяется репозиториями на этапе 9."""

from dataclasses import replace
from datetime import date

from savemoney.domain.calculations import envelope_state
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


def _get(items: dict, id: str):
    try:
        return items[id]
    except KeyError as error:
        raise ValueError(f'Объект не найден: {id}') from error


def _insert(items: dict, item) -> None:
    if item.id in items:
        raise ValueError(f'Идентификатор уже существует: {item.id}')
    items[item.id] = item


class Budget:
    def __init__(self) -> None:
        self.categories: dict[str, Category] = {}
        self.sources: dict[str, IncomeSource] = {}
        self.obligations: dict[str, Obligation] = {}
        self.goals: dict[str, Goal] = {}
        self.periods: dict[str, Period] = {}
        self.envelopes: dict[str, Envelope] = {}
        self.transactions: dict[str, Transaction] = {}
        self.closures: dict[str, PeriodClosure] = {}

    def add_category(self, category: Category) -> None:
        if category.parent_id:
            parent = _get(self.categories, category.parent_id)
            if parent.parent_id is not None or parent.kind != category.kind:
                raise ValueError('Разрешены два уровня категорий одного вида')
        _insert(self.categories, category)

    def add_source(self, source: IncomeSource) -> None:
        _insert(self.sources, source)

    def add_obligation(self, obligation: Obligation) -> None:
        if obligation.category_id:
            category = _get(self.categories, obligation.category_id)
            if category.kind != 'expense':
                raise ValueError('Платёж должен относиться к расходной категории')
        _insert(self.obligations, obligation)

    def add_goal(self, goal: Goal) -> None:
        _insert(self.goals, goal)

    def ensure_period(self, today: date) -> Period:
        key = today.strftime('%Y-%m')
        if self.periods:
            latest = max(self.periods.values(), key=lambda period: period.start)
            if today < min(period.start for period in self.periods.values()):
                raise ValueError('Нельзя создать период до начала учёта')
            year, month = (latest.year, latest.month)
        else:
            year, month = (today.year, today.month)
        while (year, month) <= (today.year, today.month):
            id = f'{year:04d}-{month:02d}'
            if id not in self.periods:
                previous = max(
                    self.periods.values(),
                    key=lambda period: period.start,
                    default=None,
                )
                self.periods[id] = Period(id, year, month)
                if previous:
                    for envelope in list(self.envelopes.values()):
                        if envelope.period_id == previous.id:
                            copied = replace(
                                envelope,
                                id=f'{id}:{envelope.category_id}',
                                period_id=id,
                                carry_over_amount=0,
                            )
                            self.envelopes[copied.id] = copied
            year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        for id, period in self.periods.items():
            if period.end < today and period.status == 'active':
                has_envelopes = any(e.period_id == id for e in self.envelopes.values())
                self.periods[id] = replace(
                    period,
                    status='pending_review' if has_envelopes else 'closed',
                )
        return self.periods[key]

    def set_envelope(self, period_id: str, category_id: str, amount: int) -> Envelope:
        period = _get(self.periods, period_id)
        category = _get(self.categories, category_id)
        id = f'{period_id}:{category_id}'
        if period.status == 'closed' or id in self.closures:
            raise ValueError('План закрытого конверта нельзя менять')
        if category.kind != 'expense' or category.is_archived:
            raise ValueError('Конверт требует действующую расходную категорию')
        carry = self.envelopes[id].carry_over_amount if id in self.envelopes else 0
        envelope = Envelope(id, period_id, category_id, amount, carry)
        self.envelopes[id] = envelope
        return envelope

    def add_transaction(self, transaction: Transaction) -> Transaction:
        period = _get(self.periods, transaction.date.strftime('%Y-%m'))
        if period.status == 'closed' or any(
            self.envelopes[id].period_id == period.id for id in self.closures
        ):
            raise ValueError(
                'Нельзя менять операции периода после начала разбора остатков',
            )
        if transaction.type in ('expense', 'income'):
            category = _get(self.categories, transaction.category_id)
            if category.kind != transaction.type or category.is_archived:
                raise ValueError('Категория не подходит для операции')
        if transaction.goal_id:
            _get(self.goals, transaction.goal_id)
        if transaction.income_source_id:
            _get(self.sources, transaction.income_source_id)
        if transaction.obligation_id:
            _get(self.obligations, transaction.obligation_id)
        saved = replace(transaction, period_id=period.id)
        validate_goal_balances([*self.transactions.values(), saved])
        _insert(self.transactions, saved)
        return saved

    def delete_transaction(self, id: str) -> None:
        transaction = _get(self.transactions, id)
        period = self.periods[transaction.period_id]
        if any(id == f'closure:{key}' for key in self.closures):
            raise ValueError('Перевод закрытого конверта нельзя удалить отдельно')
        if period.status == 'closed' or any(
            self.envelopes[key].period_id == period.id for key in self.closures
        ):
            raise ValueError('Нельзя менять операции после начала разбора остатков')
        deleted = replace(transaction, deleted=True)
        validate_goal_balances(
            [tx for key, tx in self.transactions.items() if key != id] + [deleted],
        )
        self.transactions[id] = deleted

    def envelope_state(self, id: str, *, as_of: date | None = None):
        envelope = _get(self.envelopes, id)
        return envelope_state(
            envelope,
            self.periods[envelope.period_id],
            self.transactions.values(),
            self.categories.values(),
            as_of=as_of,
        )

    def close_envelope(
        self, id: str, decision: str, *, goal_id: str | None = None
    ) -> PeriodClosure:
        envelope = _get(self.envelopes, id)
        if id in self.closures:
            existing = self.closures[id]
            if (existing.decision, existing.goal_id) != (decision, goal_id):
                raise ValueError('Для конверта уже принято другое решение')
            return existing
        period = self.periods[envelope.period_id]
        if period.status != 'pending_review':
            raise ValueError('Закрывать можно только завершившийся период')
        if any(
            (p.start < period.start and p.status != 'closed' for p in self.periods.values()),
        ):
            raise ValueError('Сначала разберите более ранние периоды')
        if decision not in ('burn', 'carry_over', 'to_goal'):
            raise ValueError('Неизвестное решение')
        if decision != 'to_goal' and goal_id is not None:
            raise ValueError('Цель нужна только для перевода в накопления')
        if decision != 'burn':
            category = self.categories[envelope.category_id]
            for key, closed in self.closures.items():
                other = self.envelopes[key]
                if other.period_id != period.id or closed.decision == 'burn':
                    continue
                other_category = self.categories[other.category_id]
                if (
                    category.parent_id == other.category_id
                    or other_category.parent_id == category.id
                ):
                    raise ValueError('Остаток пересекающегося конверта уже распределён')
        remaining = self.envelope_state(id).remaining
        closure = PeriodClosure(id, decision, remaining, goal_id)
        next_year, next_month = (
            (period.year + 1, 1) if period.month == 12 else (period.year, period.month + 1)
        )
        next_id = f'{next_year:04d}-{next_month:02d}'
        if decision == 'carry_over':
            target_id = f'{next_id}:{envelope.category_id}'
            target = _get(self.envelopes, target_id)
            updated = replace(target, carry_over_amount=target.carry_over_amount + remaining)
            self.envelopes[target_id] = updated
        elif decision == 'to_goal':
            _get(self.goals, goal_id)
            if remaining <= 0:
                raise ValueError('Перевести в цель можно только положительный остаток')
            self.add_transaction(
                Transaction(
                    f'closure:{id}',
                    'goal_deposit',
                    remaining,
                    date(next_year, next_month, 1),
                    goal_id=goal_id,
                ),
            )
        self.closures[id] = closure
        if all(
            (e.id in self.closures for e in self.envelopes.values() if e.period_id == period.id),
        ):
            self.periods[period.id] = replace(period, status='closed')
        return closure
