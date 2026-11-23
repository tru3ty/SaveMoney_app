import pytest

from savemoney.domain.money import format_money, parse_money


@pytest.mark.parametrize(
    ('text', 'amount'),
    [
        ('45,50', 4550),
        ('45.5', 4550),
        ('0', 0),
        (' 1 234,01 ', 123401),
        ('-12,01', -1201),
    ],
)
def test_parse_money_without_rounding(text, amount):
    assert parse_money(text) == amount


@pytest.mark.parametrize(
    'text',
    ['', 'abc', '1.001', '1,2.3', 'NaN', '1e3', '--1', '.', '1,', '1 2', '12 34'],
)
def test_reject_invalid_money(text):
    with pytest.raises(ValueError):
        parse_money(text)


@pytest.mark.parametrize(
    ('amount', 'text'),
    [(4321000, '43\xa0210,00 ₽'), (4550, '45,50 ₽'), (-1, '-0,01 ₽'), (0, '0,00 ₽')],
)
def test_format_money(amount, text):
    assert format_money(amount) == text


@pytest.mark.parametrize('amount', [True, 4.5, '1'])
def test_format_rejects_non_integer_kopecks(amount):
    with pytest.raises(ValueError):
        format_money(amount)
