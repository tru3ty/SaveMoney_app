"""Проверки истории операций, которые нельзя выполнить в отдельной модели."""

from collections import defaultdict
from collections.abc import Iterable
from datetime import date

from savemoney.domain.models import Transaction


def validate_goal_balances(transactions: Iterable[Transaction]) -> None:
    # В модели нет времени суток, поэтому движения внутри дня неттируются.
    changes: dict[tuple[str, date], int] = defaultdict(int)
    for tx in transactions:
        if not tx.deleted and tx.type in ('goal_deposit', 'goal_withdrawal'):
            changes[tx.goal_id, tx.date] += tx.amount if tx.type == 'goal_deposit' else -tx.amount
    balances: dict[str, int] = defaultdict(int)
    for (goal, _), change in sorted(changes.items()):
        balances[goal] += change
        if balances[goal] < 0:
            raise ValueError('Изъятие превышает накопления цели на дату операции')
