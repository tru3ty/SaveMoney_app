from datetime import date

from savemoney.domain.calculations import (
    available_money,
    daily_limit,
    envelope_state,
    goal_progress,
)
from savemoney.domain.models import (
    Category,
    Envelope,
    Goal,
    IncomeSource,
    Obligation,
    Period,
    Transaction,
)

TODAY = date(2026, 11, 1)
PERIOD = Period('nov', 2026, 11)


def test_available_money_reserves_unpaid_obligations():
    transactions = [
        Transaction('in', 'income', 100000, TODAY, category_id='salary'),
        Transaction('out', 'expense', 10000, TODAY, category_id='food'),
        Transaction('saved', 'goal_deposit', 5000, TODAY, goal_id='trip'),
    ]
    sources = [IncomeSource('salary', 'Зарплата', 100000, day_of_month=20)]
    obligations = [Obligation('rent', 'Аренда', 20000, 5)]
    result = available_money(transactions, obligations, sources, TODAY)
    assert (result.balance, result.reserved, result.available) == (85000, 20000, 65000)
    assert result.next_income == date(2026, 11, 20)


def test_paid_inactive_and_later_obligations_not_reserved():
    transactions = [
        Transaction(
            'paid',
            'expense',
            10000,
            TODAY,
            category_id='home',
            obligation_id='rent',
        ),
    ]
    obligations = [
        Obligation('rent', 'Аренда', 10000, 5),
        Obligation('late', 'Позже', 10000, 25),
        Obligation('off', 'Отключён', 10000, 2, is_active=False),
    ]
    result = available_money(
        transactions,
        obligations,
        [IncomeSource('salary', 'Зарплата', 100, day_of_month=20)],
        TODAY,
    )
    assert (result.balance, result.reserved, result.available) == (-10000, 0, -10000)


def test_deleted_previous_month_and_future_transactions_do_not_change_balance():
    transactions = [
        Transaction(
            'deleted',
            'expense',
            100,
            TODAY,
            category_id='food',
            deleted=True,
        ),
        Transaction('old', 'income', 100, date(2026, 10, 1), category_id='salary'),
        Transaction('planned', 'expense', 100, date(2026, 11, 2), category_id='food'),
        Transaction('withdraw', 'goal_withdrawal', 100, TODAY, goal_id='trip'),
    ]
    result = available_money(transactions, [], [], TODAY)
    assert (result.balance, result.reserved, result.available) == (100, 0, 100)
    assert result.next_income is None


def test_reserve_can_cross_month_boundary():
    source = IncomeSource('salary', 'Зарплата', 100, day_of_month=5)
    obligation = Obligation('rent', 'Аренда', 500, 2)
    paid_this_month = Transaction(
        'paid',
        'expense',
        500,
        date(2026, 12, 2),
        category_id='home',
        obligation_id='rent',
    )
    result = available_money([paid_this_month], [obligation], [source], date(2026, 12, 28))
    assert result.reserved == 500


def test_no_payout_reserves_last_day_of_month():
    result = available_money(
        [],
        [Obligation('rent', 'Аренда', 100, 31)],
        [],
        date(2026, 2, 10),
    )
    assert result.reserved == 100


def test_daily_limit_uses_integer_kopecks_and_end_of_period():
    assert daily_limit(100, TODAY, date(2026, 11, 4)) == (3, 33)
    assert daily_limit(100, TODAY, TODAY) == (0, 100)
    assert daily_limit(-100, TODAY, date(2026, 11, 4)) == (3, -34)
    assert daily_limit(100, date(2026, 11, 30), None) == (0, 100)
    assert daily_limit(100, TODAY, date(2026, 10, 31)) == (0, 100)


def test_envelope_includes_child_once_and_excludes_other_period():
    envelope = Envelope('food-env', 'nov', 'food', 1000, 100)
    categories = [Category('food', 'Еда'), Category('cafe', 'Кафе', parent_id='food')]
    transactions = [
        Transaction('food', 'expense', 300, TODAY, category_id='food'),
        Transaction('cafe', 'expense', 500, TODAY, category_id='cafe'),
        Transaction('old', 'expense', 9999, date(2026, 10, 1), category_id='cafe'),
        Transaction('gone', 'expense', 9999, TODAY, category_id='cafe', deleted=True),
    ]
    result = envelope_state(envelope, PERIOD, transactions, categories)
    assert (result.spent, result.remaining, result.status) == (800, 300, 'ok')


def test_envelope_warning_over_and_zero_limit():
    tx = [Transaction('food', 'expense', 800, TODAY, category_id='food')]
    assert envelope_state(Envelope('e', 'nov', 'food', 1000), PERIOD, tx, []).status == 'warning'
    assert envelope_state(Envelope('e', 'nov', 'food', 500), PERIOD, tx, []).status == 'over'
    assert envelope_state(Envelope('e', 'nov', 'food', 0), PERIOD, [], []).status == 'ok'
    assert envelope_state(Envelope('e', 'nov', 'food', 0), PERIOD, tx, []).status == 'over'


def test_goal_progress_uses_all_periods_and_ignores_deleted():
    goal = Goal('trip', 'Отпуск', 1000, date(2027, 1, 1))
    transactions = [
        Transaction(
            'deposit',
            'goal_deposit',
            600,
            date(2026, 10, 1),
            goal_id='trip',
        ),
        Transaction('withdraw', 'goal_withdrawal', 100, TODAY, goal_id='trip'),
        Transaction(
            'gone',
            'goal_deposit',
            1000,
            TODAY,
            goal_id='trip',
            deleted=True,
        ),
        Transaction('other', 'goal_deposit', 1000, TODAY, goal_id='other'),
    ]
    result = goal_progress(goal, transactions, TODAY)
    assert (result.saved, result.remaining, result.per_month, result.status) == (
        500,
        500,
        250,
        'active',
    )


def test_goal_without_deadline_overdue_and_completed():
    assert goal_progress(Goal('g', 'Цель', 100), [], TODAY).per_month is None
    assert goal_progress(Goal('g', 'Цель', 100, date(2026, 10, 31)), [], TODAY).status == 'overdue'
    assert goal_progress(Goal('g', 'Цель', 100, TODAY), [], TODAY).per_month == 100
    tx = [Transaction('dep', 'goal_deposit', 200, TODAY, goal_id='g')]
    result = goal_progress(Goal('g', 'Цель', 100, TODAY), tx, TODAY)
    assert (result.saved, result.remaining, result.status) == (200, 0, 'completed')
