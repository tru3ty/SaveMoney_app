"""Воспроизводимая демонстрация для терминала и отладчика PyCharm."""

from datetime import date

from savemoney.budget import Budget
from savemoney.domain.calculations import available_money
from savemoney.domain.models import Category, IncomeSource, Obligation, Transaction
from savemoney.domain.money import format_money


def main() -> None:
    # Фиксированная дата делает результат одинаковым при каждом учебном запуске.
    today = date(2026, 11, 5)
    budget = Budget()
    budget.add_category(Category('salary', 'Зарплата', kind='income'))
    budget.add_category(Category('food', 'Еда'))
    budget.add_source(
        IncomeSource('salary-source', 'Следующая выплата', 8500000, day_of_month=20),
    )
    budget.add_obligation(Obligation('rent', 'Квартира', 5000000, 10))
    budget.ensure_period(today)
    budget.set_envelope('2026-11', 'food', 3000000)
    budget.add_transaction(
        Transaction(
            'salary-payment',
            'income',
            8500000,
            today,
            category_id='salary',
            income_source_id='salary-source',
        ),
    )
    before = available_money(
        budget.transactions.values(),
        budget.obligations.values(),
        budget.sources.values(),
        today,
    )
    print(f'Свободно: {format_money(before.available)}')
    budget.add_transaction(
        Transaction('lunch', 'expense', 45000, today, category_id='food'),
    )
    envelope = budget.envelope_state('2026-11:food', as_of=today)
    after = available_money(
        budget.transactions.values(),
        budget.obligations.values(),
        budget.sources.values(),
        today,
    )
    print(f'Еда: осталось {format_money(envelope.remaining)}')
    print(f'После траты: {format_money(after.available)}')


if __name__ == '__main__':
    main()
