"""Деньги хранятся в копейках: преобразования не используют float."""

import re

# Ограничение точности целых сумм у будущих JavaScript-клиентов.
MAX_MONEY = 9_007_199_254_740_991


def require_int(value: int, *, minimum: int = -MAX_MONEY, maximum: int = MAX_MONEY) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or (not minimum <= value <= maximum):
        raise ValueError('Ожидалось целое число в допустимом диапазоне')


def parse_money(text: str) -> int:
    text = text.strip().replace('\xa0', ' ')
    if not re.fullmatch('-?(?:\\d+|\\d{1,3}(?: \\d{3})+)(?:[.,]\\d{1,2})?', text):
        raise ValueError('Введите сумму с точностью до копейки')
    whole, _, fraction = text.replace(' ', '').replace(',', '.').partition('.')
    amount = int(whole.lstrip('-')) * 100 + int(fraction.ljust(2, '0'))
    amount = -amount if text.startswith('-') else amount
    require_int(amount)
    return amount


def format_money(amount: int) -> str:
    require_int(amount)
    rubles, kopecks = divmod(abs(amount), 100)
    whole = f'{rubles:,}'.replace(',', '\xa0')
    sign = '-' if amount < 0 else ''
    return f'{sign}{whole},{kopecks:02d} ₽'
