from datetime import date

import pytest

from savemoney.domain.dates import next_payout, period_bounds, scheduled_date
from savemoney.domain.models import IncomeSource


def test_period_bounds_handles_leap_year():
    assert period_bounds(2024, 2) == (date(2024, 2, 1), date(2024, 2, 29))


@pytest.mark.parametrize(('year', 'month'), [(2026, 13), (2026, 0), (0, 1)])
def test_period_bounds_rejects_bad_calendar(year, month):
    with pytest.raises(ValueError):
        period_bounds(year, month)


def test_schedule_clamps_day_in_short_month():
    assert scheduled_date(2026, 2, 31) == date(2026, 2, 28)


def test_next_payout_rolls_over_year():
    source = IncomeSource('salary', 'Зарплата', 10000, day_of_month=5)
    assert next_payout([source], date(2026, 12, 6)) == date(2027, 1, 5)
    assert next_payout([source], date(2026, 12, 5)) == date(2026, 12, 5)


def test_next_payout_selects_earliest_active_source():
    sources = [
        IncomeSource('late', 'Позже', 10000, day_of_month=20),
        IncomeSource('early', 'Раньше', 10000, day_of_month=5),
        IncomeSource('off', 'Отключён', 10000, day_of_month=2, is_active=False),
    ]
    assert next_payout(sources, date(2026, 11, 1)) == date(2026, 11, 5)


def test_last_day_and_irregular_sources():
    irregular = IncomeSource('freelance', 'Фриланс', 10000, schedule='irregular')
    last = IncomeSource('last', 'Последний день', 10000, schedule='monthly_last_day')
    assert next_payout([irregular], date(2026, 2, 1)) is None
    assert next_payout([], date(2026, 2, 1)) is None
    assert next_payout([last], date(2026, 2, 1)) == date(2026, 2, 28)
