"""Календарные даты без привязки к часовому поясу."""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterable

    from savemoney.domain.models import IncomeSource


def period_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    return (start, date(year, month, monthrange(year, month)[1]))


def scheduled_date(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, monthrange(year, month)[1]))


def next_payout(sources: Iterable[IncomeSource], today: date) -> date | None:
    candidates = []
    for source in sources:
        if not source.is_active or source.schedule == 'irregular':
            continue
        day = source.day_of_month if source.schedule == 'monthly_day' else 31
        candidate = scheduled_date(today.year, today.month, day)
        if candidate < today:
            year, month = (
                (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
            )
            candidate = scheduled_date(year, month, day)
        candidates.append(candidate)
    return min(candidates, default=None)
