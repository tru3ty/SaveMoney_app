"""Учебный requests-клиент. Продуктовый HTTP-сервер появится на этапе 8."""

from math import isfinite

import requests


def get_json(url: str, *, timeout: float = 5.0) -> object:
    """Получить JSON; HTTP-, сетевые и JSON-ошибки передаются вызывающему коду."""
    if type(timeout) not in (float, int) or not isfinite(timeout) or timeout <= 0:
        raise ValueError('Timeout должен быть положительным конечным числом')
    with requests.get(url, timeout=timeout) as response:
        response.raise_for_status()
        return response.json()
