from datetime import date

import pytest

from savemoney.budget import Budget
from savemoney.domain.models import Category, Goal, IncomeSource, Obligation, Transaction


@pytest.fixture
def budget():
    budget = Budget()
    budget.add_category(Category('food', 'Еда'))
    budget.add_category(Category('cafe', 'Кафе', parent_id='food'))
    budget.add_category(Category('salary', 'Зарплата', kind='income'))
    budget.add_source(
        IncomeSource('salary-source', 'Зарплата', 10000, day_of_month=5),
    )
    budget.add_obligation(
        Obligation('rent', 'Квартира', 1000, 10, category_id='food'),
    )
    budget.add_goal(Goal('trip', 'Отпуск', 50000))
    budget.ensure_period(date(2026, 11, 1))
    budget.set_envelope('2026-11', 'food', 10000)
    return budget


def test_add_transaction_assigns_period_and_delete_restores_remaining(budget):
    tx = Transaction('out', 'expense', 450, date(2026, 11, 2), category_id='cafe')
    saved = budget.add_transaction(tx)
    assert saved.period_id == '2026-11'
    assert budget.envelope_state('2026-11:food').remaining == 9550
    budget.delete_transaction('out')
    assert budget.envelope_state('2026-11:food').remaining == 10000
    budget.delete_transaction('out')


@pytest.mark.parametrize(
    'category',
    [
        Category('food', 'Дубликат'),
        Category('third', 'Третий уровень', parent_id='cafe'),
        Category('orphan', 'Без родителя', parent_id='missing'),
        Category('wrong-kind', 'Доход', parent_id='food', kind='income'),
        Category('self', 'Цикл', parent_id='self'),
    ],
)
def test_invalid_categories_do_not_change_budget(budget, category):
    before = dict(budget.categories)
    with pytest.raises(ValueError):
        budget.add_category(category)
    assert budget.categories == before


@pytest.mark.parametrize(
    'tx',
    [
        Transaction('out', 'expense', 100, date(2026, 11, 2), category_id='missing'),
        Transaction('out', 'expense', 100, date(2026, 11, 2), category_id='salary'),
        Transaction('out', 'goal_deposit', 100, date(2026, 11, 2), goal_id='missing'),
        Transaction(
            'out',
            'income',
            100,
            date(2026, 11, 2),
            category_id='salary',
            income_source_id='missing',
        ),
        Transaction(
            'out',
            'expense',
            100,
            date(2026, 11, 2),
            category_id='food',
            obligation_id='missing',
        ),
    ],
)
def test_invalid_references_never_insert_partial_transaction(budget, tx):
    with pytest.raises(ValueError):
        budget.add_transaction(tx)
    assert budget.transactions == {}


def test_duplicate_transaction_and_archived_category_rejected(budget):
    tx = Transaction('out', 'expense', 100, date(2026, 11, 2), category_id='food')
    budget.add_transaction(tx)
    with pytest.raises(ValueError):
        budget.add_transaction(tx)
    budget.add_category(Category('archived', 'Архив', is_archived=True))
    with pytest.raises(ValueError):
        budget.add_transaction(
            Transaction('out2', 'expense', 100, tx.date, category_id='archived'),
        )
    assert len(budget.transactions) == 1


def test_missing_period_requires_explicit_initialization(budget):
    with pytest.raises(ValueError):
        budget.add_transaction(
            Transaction('out', 'expense', 100, date(2026, 10, 2), category_id='food'),
        )
    with pytest.raises(ValueError):
        budget.delete_transaction('missing')


def test_missing_months_are_created_in_order_with_copied_limits(budget):
    budget.ensure_period(date(2027, 2, 2))
    assert list(budget.periods) == ['2026-11', '2026-12', '2027-01', '2027-02']
    assert [period.status for period in budget.periods.values()] == [
        'pending_review',
        'pending_review',
        'pending_review',
        'active',
    ]
    assert budget.envelopes['2027-02:food'].limit_amount == 10000
    assert budget.envelopes['2027-02:food'].carry_over_amount == 0
    budget.ensure_period(date(2027, 2, 2))
    assert len(budget.periods) == 4
    with pytest.raises(ValueError):
        budget.ensure_period(date(2026, 10, 1))


def test_carry_over_once_and_conflicting_decision_rejected(budget):
    budget.add_transaction(
        Transaction('out', 'expense', 4000, date(2026, 11, 2), category_id='food'),
    )
    budget.ensure_period(date(2026, 12, 1))
    closure = budget.close_envelope('2026-11:food', 'carry_over')
    assert closure.leftover_amount == 6000
    assert budget.envelopes['2026-12:food'].carry_over_amount == 6000
    assert budget.periods['2026-11'].status == 'closed'
    assert budget.close_envelope('2026-11:food', 'carry_over') == closure
    assert budget.envelopes['2026-12:food'].carry_over_amount == 6000
    with pytest.raises(ValueError):
        budget.close_envelope('2026-11:food', 'burn')
    with pytest.raises(ValueError):
        budget.add_transaction(
            Transaction(
                'late',
                'expense',
                100,
                date(2026, 11, 2),
                category_id='food',
            ),
        )
    with pytest.raises(ValueError):
        budget.delete_transaction('out')
    with pytest.raises(ValueError):
        budget.set_envelope('2026-11', 'food', 100)


def test_goal_transfer_once_and_burn_has_no_money_effect(budget):
    budget.ensure_period(date(2026, 12, 1))
    budget.close_envelope('2026-11:food', 'to_goal', goal_id='trip')
    budget.close_envelope('2026-11:food', 'to_goal', goal_id='trip')
    assert len(budget.transactions) == 1
    tx = next(iter(budget.transactions.values()))
    assert (tx.type, tx.amount, tx.goal_id) == ('goal_deposit', 10000, 'trip')
    budget.ensure_period(date(2027, 1, 1))
    budget.close_envelope('2026-12:food', 'burn')
    assert len(budget.transactions) == 1


def test_active_period_and_invalid_closures_do_not_mutate_data(budget):
    with pytest.raises(ValueError):
        budget.close_envelope('2026-11:food', 'burn')
    budget.ensure_period(date(2026, 12, 1))
    for decision, goal in [
        ('unknown', None),
        ('to_goal', None),
        ('to_goal', 'missing'),
        ('burn', 'trip'),
    ]:
        with pytest.raises(ValueError):
            budget.close_envelope('2026-11:food', decision, goal_id=goal)
    assert budget.closures == {}
    assert budget.transactions == {}


def test_negative_remainder_can_be_carried_but_not_saved(budget):
    budget.add_transaction(
        Transaction('out', 'expense', 11000, date(2026, 11, 2), category_id='food'),
    )
    budget.ensure_period(date(2026, 12, 1))
    with pytest.raises(ValueError):
        budget.close_envelope('2026-11:food', 'to_goal', goal_id='trip')
    budget.close_envelope('2026-11:food', 'carry_over')
    assert budget.envelopes['2026-12:food'].carry_over_amount == -1000


def test_catalog_duplicates_and_bad_envelopes_are_rejected(budget):
    with pytest.raises(ValueError):
        budget.add_source(budget.sources['salary-source'])
    with pytest.raises(ValueError):
        budget.add_goal(budget.goals['trip'])
    with pytest.raises(ValueError):
        budget.add_obligation(budget.obligations['rent'])
    with pytest.raises(ValueError):
        budget.add_obligation(
            Obligation('bad', 'Платёж', 100, 5, category_id='missing'),
        )
    with pytest.raises(ValueError):
        budget.set_envelope('2026-11', 'salary', 100)
    with pytest.raises(ValueError):
        budget.set_envelope('missing', 'food', 100)
    budget.set_envelope('2026-11', 'food', 9000)
    assert budget.envelopes['2026-11:food'].limit_amount == 9000


def test_obligation_cannot_reference_income_category(budget):
    with pytest.raises(ValueError):
        budget.add_obligation(
            Obligation('bad', 'Платёж', 100, 5, category_id='salary'),
        )
    assert 'bad' not in budget.obligations


def test_periods_must_be_closed_oldest_first(budget):
    budget.ensure_period(date(2027, 1, 1))
    with pytest.raises(ValueError):
        budget.close_envelope('2026-12:food', 'burn')
    assert budget.closures == {}
    budget.close_envelope('2026-11:food', 'burn')
    budget.close_envelope('2026-12:food', 'burn')
    assert budget.periods['2026-12'].status == 'closed'


def test_cannot_withdraw_unfunded_goal_or_before_deposit(budget):
    budget.add_transaction(
        Transaction(
            'deposit',
            'goal_deposit',
            1000,
            date(2026, 11, 10),
            goal_id='trip',
        ),
    )
    for id, amount, day in [('too-much', 1001, 11), ('too-early', 100, 9)]:
        with pytest.raises(ValueError):
            budget.add_transaction(
                Transaction(
                    id,
                    'goal_withdrawal',
                    amount,
                    date(2026, 11, day),
                    goal_id='trip',
                ),
            )
    budget.add_transaction(
        Transaction(
            'valid',
            'goal_withdrawal',
            1000,
            date(2026, 11, 11),
            goal_id='trip',
        ),
    )
    assert len(budget.transactions) == 2
    with pytest.raises(ValueError):
        budget.delete_transaction('deposit')
    assert not budget.transactions['deposit'].deleted


def test_closed_envelope_transfer_cannot_be_deleted(budget):
    budget.ensure_period(date(2026, 12, 1))
    budget.close_envelope('2026-11:food', 'to_goal', goal_id='trip')
    with pytest.raises(ValueError):
        budget.delete_transaction('closure:2026-11:food')
    assert not budget.transactions['closure:2026-11:food'].deleted


def test_empty_period_does_not_block_later_closure():
    budget = Budget()
    budget.add_category(Category('food', 'Еда'))
    budget.ensure_period(date(2026, 11, 1))
    budget.ensure_period(date(2026, 12, 1))
    budget.set_envelope('2026-12', 'food', 1000)
    budget.ensure_period(date(2027, 1, 1))
    assert budget.periods['2026-11'].status == 'closed'
    budget.close_envelope('2026-12:food', 'burn')
    assert budget.periods['2026-12'].status == 'closed'


@pytest.mark.parametrize(('first', 'second'), [('food', 'cafe'), ('cafe', 'food')])
def test_overlapping_envelopes_cannot_transfer_same_budget_twice(budget, first, second):
    budget.set_envelope('2026-11', 'cafe', 5000)
    budget.ensure_period(date(2026, 12, 1))
    budget.close_envelope(f'2026-11:{first}', 'to_goal', goal_id='trip')
    with pytest.raises(ValueError):
        budget.close_envelope(f'2026-11:{second}', 'carry_over')
    with pytest.raises(ValueError):
        budget.close_envelope(f'2026-11:{second}', 'to_goal', goal_id='trip')
    budget.close_envelope(f'2026-11:{second}', 'burn')
    assert len(budget.transactions) == 1


def test_burn_allows_transfer_of_other_overlapping_envelope(budget):
    budget.set_envelope('2026-11', 'cafe', 5000)
    budget.ensure_period(date(2026, 12, 1))
    budget.close_envelope('2026-11:cafe', 'burn')
    budget.close_envelope('2026-11:food', 'carry_over')
    assert budget.envelopes['2026-12:food'].carry_over_amount == 10000
