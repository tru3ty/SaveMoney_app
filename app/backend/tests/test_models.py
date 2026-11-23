from datetime import date

import pytest

from savemoney.domain.models import (
    Category,
    Envelope,
    Goal,
    IncomeSource,
    Obligation,
    Period,
    Transaction,
)


@pytest.mark.parametrize('amount', [0, -1, True, 1.5])
def test_transaction_rejects_invalid_money(amount):
    with pytest.raises(ValueError):
        Transaction('tx', 'expense', amount, date(2026, 11, 1), category_id='food')


def test_transaction_requires_correct_relationship():
    with pytest.raises(ValueError):
        Transaction('tx', 'expense', 1, date(2026, 11, 1))
    with pytest.raises(ValueError):
        Transaction('tx', 'goal_deposit', 1, date(2026, 11, 1))
    with pytest.raises(ValueError):
        Transaction('tx', 'invalid', 1, date(2026, 11, 1), category_id='food')


def test_models_reject_invalid_schedules_and_limits():
    for kwargs in [
        {'day_of_month': 32},
        {'schedule': 'unknown'},
        {'schedule': 'monthly_day'},
        {'schedule': 'irregular', 'day_of_month': 5},
    ]:
        with pytest.raises(ValueError):
            IncomeSource('salary', 'Зарплата', 100, **kwargs)
    with pytest.raises(ValueError):
        Obligation('rent', 'Аренда', 100, 0)
    with pytest.raises(ValueError):
        Envelope('env', 'period', 'food', -1)
    with pytest.raises(ValueError):
        Goal('goal', 'Цель', 0)
    with pytest.raises(ValueError):
        Category('food', 'Еда', kind='invalid')
    with pytest.raises(ValueError):
        Period('period', 2026, 11, status='invalid')


def test_names_and_dates_are_validated():
    with pytest.raises(ValueError):
        Category('food', '  ')
    with pytest.raises(ValueError):
        Category('', 'Еда')
    with pytest.raises(ValueError):
        Transaction('tx', 'expense', 100, '2026-11-01', category_id='food')
    with pytest.raises(ValueError):
        Goal('goal', 'Цель', 100, target_date='soon')


def test_valid_models_preserve_integer_money():
    tx = Transaction('tx', 'income', 12345, date(2026, 11, 1), category_id='income')
    assert tx.amount == 12345
    assert not tx.deleted
    period = Period('nov', 2026, 11)
    assert period.start == date(2026, 11, 1)
    assert period.end == date(2026, 11, 30)


def test_timestamps_are_not_accepted_as_calendar_dates():
    from datetime import datetime

    timestamp = datetime(2026, 11, 1, 12)
    with pytest.raises(ValueError):
        Transaction('tx', 'expense', 100, timestamp, category_id='food')
    with pytest.raises(ValueError):
        Goal('goal', 'Цель', 100, target_date=timestamp)
