"""Чистые расчёты. Плановые будущие операции не меняют фактические остатки."""

from collections.abc import Iterable
from datetime import date
from typing import NamedTuple

from savemoney.domain.dates import next_payout, period_bounds, scheduled_date
from savemoney.domain.models import (
    Category,
    Envelope,
    Goal,
    IncomeSource,
    Obligation,
    Period,
    Transaction,
)


class AvailableMoney(NamedTuple):
    balance: int
    reserved: int
    available: int
    next_income: date | None


class EnvelopeState(NamedTuple):
    spent: int
    remaining: int
    status: str


class GoalProgress(NamedTuple):
    saved: int
    remaining: int
    per_month: int | None
    status: str


def available_money(
    transactions: Iterable[Transaction],
    obligations: Iterable[Obligation],
    sources: Iterable[IncomeSource],
    today: date,
) -> AvailableMoney:
    transactions = tuple(tx for tx in transactions if not tx.deleted and tx.date <= today)
    start, end = period_bounds(today.year, today.month)
    signs = {'income': 1, 'expense': -1, 'goal_deposit': -1, 'goal_withdrawal': 1}
    balance = sum(
        (signs[tx.type] * tx.amount for tx in transactions if start <= tx.date <= end),
    )
    next_income = next_payout(sources, today)
    horizon = next_income or end
    months = {(today.year, today.month), (horizon.year, horizon.month)}
    reserved = 0
    for obligation in obligations:
        if not obligation.is_active:
            continue
        for year, month in months:
            due = scheduled_date(year, month, obligation.day_of_month)
            if due > horizon or (next_income is not None and due == horizon):
                continue
            paid = any(
                tx.type == 'expense'
                and tx.obligation_id == obligation.id
                and (tx.date.year, tx.date.month) == (year, month)
                for tx in transactions
            )
            if not paid:
                reserved += obligation.amount
    return AvailableMoney(balance, reserved, balance - reserved, next_income)


def daily_limit(available: int, today: date, next_income: date | None) -> tuple[int, int]:
    horizon = next_income or period_bounds(today.year, today.month)[1]
    days = max(0, (horizon - today).days)
    return (days, available // days if days else available)


def envelope_state(
    envelope: Envelope,
    period: Period,
    transactions: Iterable[Transaction],
    categories: Iterable[Category],
    *,
    as_of: date | None = None,
) -> EnvelopeState:
    ids = {envelope.category_id}
    ids.update(
        (category.id for category in categories if category.parent_id == envelope.category_id),
    )
    cutoff = min(period.end, as_of) if as_of else period.end
    spent = sum(
        tx.amount
        for tx in transactions
        if tx.type == 'expense'
        and not tx.deleted
        and tx.category_id in ids
        and period.start <= tx.date <= cutoff
    )
    limit = envelope.limit_amount + envelope.carry_over_amount
    remaining = limit - spent
    status = (
        'over' if remaining < 0 else 'warning' if limit > 0 and spent * 100 >= limit * 80 else 'ok'
    )
    return EnvelopeState(spent, remaining, status)


def goal_progress(goal: Goal, transactions: Iterable[Transaction], today: date) -> GoalProgress:
    signs = {'goal_deposit': 1, 'goal_withdrawal': -1}
    saved = sum(
        signs[tx.type] * tx.amount
        for tx in transactions
        if tx.goal_id == goal.id and tx.type in signs and not tx.deleted and tx.date <= today
    )
    remaining = max(0, goal.target_amount - saved)
    status = 'completed' if remaining == 0 else 'active'
    per_month = None
    if goal.target_date is not None:
        if goal.target_date < today and remaining:
            status = 'overdue'
        months = max(
            1,
            (goal.target_date.year - today.year) * 12 + goal.target_date.month - today.month,
        )
        per_month = (remaining + months - 1) // months
    return GoalProgress(saved, remaining, per_month, status)
