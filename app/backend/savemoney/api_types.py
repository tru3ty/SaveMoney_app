"""Общий контракт прикладного слоя и HTTP-транспорта."""

from dataclasses import dataclass, field


@dataclass
class Response:
    status: int = 200
    body: object = None
    headers: dict[str, str] = field(default_factory=dict)


class APIError(Exception):
    def __init__(self, status, code, message, fields=None, headers=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.fields = fields or {}
        self.headers = headers or {}

    def payload(self):
        return {'error': {'code': self.code, 'message': str(self), 'fields': self.fields}}
