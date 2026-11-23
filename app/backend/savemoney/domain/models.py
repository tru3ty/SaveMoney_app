"""Неизменяемые модели. Проверки связей между сущностями находятся в Budget."""

from dataclasses import dataclass
from datetime import date, datetime

from savemoney.domain.dates import period_bounds
from savemoney.domain.money import require_int


def require_name(id: str, name: str) -> None:
    if not isinstance(id, str) or not id.strip() or not isinstance(name, str) or not name.strip():
        raise ValueError('Идентификатор и название обязательны')


def require_choice(value: str, choices: tuple[str, ...]) -> None:
    if value not in choices:
        raise ValueError('Недопустимое значение')


@dataclass(frozen=True, slots=True)
class Category:
    id: str
    name: str
    parent_id: str | None = None
    kind: str = 'expense'
    is_archived: bool = False

    def __post_init__(self) -> None:
        require_name(self.id, self.name)
        require_choice(self.kind, ('expense', 'income'))


@dataclass(frozen=True, slots=True)
class IncomeSource:
    id: str
    name: str
    amount: int
    schedule: str = 'monthly_day'
    day_of_month: int | None = None
    is_active: bool = True

    def __post_init__(self) -> None:
        require_name(self.id, self.name)
        require_int(self.amount, minimum=1)
        require_choice(
            self.schedule,
            ('monthly_day', 'monthly_last_day', 'irregular'),
        )
        if self.schedule == 'monthly_day':
            require_int(self.day_of_month, minimum=1, maximum=31)
        elif self.day_of_month is not None:
            raise ValueError('День месяца допустим только для monthly_day')


@dataclass(frozen=True, slots=True)
class Obligation:
    id: str
    name: str
    amount: int
    day_of_month: int
    category_id: str | None = None
    is_active: bool = True

    def __post_init__(self) -> None:
        require_name(self.id, self.name)
        require_int(self.amount, minimum=1)
        require_int(self.day_of_month, minimum=1, maximum=31)


@dataclass(frozen=True, slots=True)
class Period:
    id: str
    year: int
    month: int
    status: str = 'active'

    def __post_init__(self) -> None:
        require_name(self.id, self.id)
        period_bounds(self.year, self.month)
        require_choice(self.status, ('active', 'pending_review', 'closed'))

    @property
    def start(self) -> date:
        return period_bounds(self.year, self.month)[0]

    @property
    def end(self) -> date:
        return period_bounds(self.year, self.month)[1]


@dataclass(frozen=True, slots=True)
class Envelope:
    id: str
    period_id: str
    category_id: str
    limit_amount: int
    carry_over_amount: int = 0

    def __post_init__(self) -> None:
        require_int(self.limit_amount, minimum=0)
        require_int(self.carry_over_amount)


@dataclass(frozen=True, slots=True)
class Transaction:
    id: str
    type: str
    amount: int
    date: date
    category_id: str | None = None
    period_id: str | None = None
    goal_id: str | None = None
    income_source_id: str | None = None
    obligation_id: str | None = None
    comment: str = ''
    deleted: bool = False

    def __post_init__(self) -> None:
        require_name(self.id, self.id)
        require_int(self.amount, minimum=1)
        require_choice(
            self.type,
            ('expense', 'income', 'goal_deposit', 'goal_withdrawal'),
        )
        if not isinstance(self.date, date) or isinstance(self.date, datetime):
            raise ValueError('Дата операции должна быть календарной датой')
        if self.type in ('expense', 'income') and (not self.category_id):
            raise ValueError('Для дохода и расхода нужна категория')
        if self.type.startswith('goal_') and (not self.goal_id):
            raise ValueError('Для операции накопления нужна цель')


@dataclass(frozen=True, slots=True)
class Goal:
    id: str
    name: str
    target_amount: int
    target_date: date | None = None

    def __post_init__(self) -> None:
        require_name(self.id, self.name)
        require_int(self.target_amount, minimum=1)
        if self.target_date is not None and (
            not isinstance(self.target_date, date) or isinstance(self.target_date, datetime)
        ):
            raise ValueError('Срок цели должен быть календарной датой')


@dataclass(frozen=True, slots=True)
class PeriodClosure:
    envelope_id: str
    decision: str
    leftover_amount: int
    goal_id: str | None = None


@dataclass(frozen=True, slots=True)
class AppSettings:
    onboarding_completed: bool = False
    theme: str = 'system'
    daily_reminder_enabled: bool = False
