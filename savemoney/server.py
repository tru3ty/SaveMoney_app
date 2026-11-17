"""Локальный HTTP-сервер учебного приложения без веб-фреймворков."""

import argparse
import json
import logging
import os
import re
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

from savemoney.api_types import APIError, Response

MAX_BODY = 1024 * 1024
LOGGER = logging.getLogger(__name__)


def _invalid_json(message='Некорректный JSON'):
    return APIError(400, 'invalid_json', message)


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Повтор ключа JSON')
        result[key] = value
    return result


def _constant(value):
    raise ValueError('Недопустимое число JSON')


def decode_json(raw):
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=_pairs, parse_constant=_constant)
    except (UnicodeError, ValueError, RecursionError) as error:
        raise _invalid_json() from error


class Handler(BaseHTTPRequestHandler):
    server_version = 'SaveMoney/0.2'
    sys_version = ''

    def __getattr__(self, name):
        if name.startswith('do_'):
            return self._handle
        raise AttributeError(name)

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, format, *args):
        # Не записываем URL, JSON и комментарии финансовых операций в access log.
        pass

    def _body(self):
        lengths = self.headers.get_all('Content-Length', [])
        if self.headers.get('Transfer-Encoding') or len(lengths) > 1:
            raise _invalid_json('Неоднозначная длина запроса')
        value = lengths[0] if lengths else '0'
        if not re.fullmatch(r'[0-9]+', value):
            raise _invalid_json('Некорректная длина запроса')
        normalized = value.lstrip('0') or '0'
        if len(normalized) > len(str(MAX_BODY)):
            raise APIError(413, 'payload_too_large', 'Тело запроса превышает 1 MiB')
        length = int(normalized)
        if length > MAX_BODY:
            raise APIError(413, 'payload_too_large', 'Тело запроса превышает 1 MiB')
        if not length:
            return None
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise _invalid_json('Тело запроса получено не полностью')
        if self.command in ('GET', 'HEAD', 'DELETE', 'OPTIONS'):
            raise APIError(422, 'validation_error', 'Этот запрос не принимает тело')
        if self.headers.get_content_type() != 'application/json':
            raise APIError(415, 'unsupported_media_type', 'Требуется application/json')
        return decode_json(raw)

    def _dispatch(self):
        try:
            parsed = urlsplit(self.path)
            if parsed.scheme or parsed.netloc or parsed.fragment:
                raise ValueError('Требуется локальный путь')
            if re.search(r'%(?![0-9a-fA-F]{2})', self.path):
                raise ValueError('Некорректное кодирование URL')
            unquote(parsed.path, errors='strict')  # Проверка UTF-8 без потери границ сегментов.
            path = parsed.path
            pairs = parse_qsl(
                parsed.query, keep_blank_values=True, errors='strict', max_num_fields=50
            )
            query = dict(pairs)
            if len(query) != len(pairs):
                raise ValueError('Повтор query-параметра')
        except ValueError as error:
            raise APIError(422, 'validation_error', 'Некорректные параметры URL') from error
        body = self._body()
        if path in ('/swagger', '/swagger/', '/openapi.json'):
            if self.command not in ('GET', 'HEAD'):
                raise APIError(
                    405,
                    'method_not_allowed',
                    'Метод не поддерживается',
                    headers={'Allow': 'GET, HEAD'},
                )
            if query:
                raise APIError(422, 'validation_error', 'Параметры не допускаются')
            root = Path(__file__).resolve().parent.parent
            if path == '/openapi.json':
                spec = json.loads((root / 'openapi.json').read_text())
                spec['servers'] = [{'url': '/', 'description': 'Текущий локальный сервер'}]
                return Response(200, spec)
            return Response(
                200,
                (root / 'swagger' / 'index.html').read_bytes(),
                {'Content-Type': 'text/html; charset=utf-8'},
            )
        return self.server.application.handle(self.command, path, query, body)

    def _respond(self, response):
        raw = (
            response.body
            if isinstance(response.body, bytes)
            else (
                b''
                if response.status == 204
                else json.dumps(
                    response.body,
                    ensure_ascii=False,
                    allow_nan=False,
                ).encode('utf-8')
            )
        )
        self.send_response(response.status)
        if response.status != 204:
            self.send_header(
                'Content-Type',
                response.headers.get('Content-Type', 'application/json; charset=utf-8'),
            )
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for key, value in response.headers.items():
            if key != 'Content-Type':
                self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(raw)

    def _handle(self):
        try:
            response = self._dispatch()
        except APIError as error:
            response = Response(error.status, error.payload(), error.headers)
        except TimeoutError:
            error = _invalid_json('Истекло время чтения запроса')
            response = Response(error.status, error.payload())
        except Exception:
            LOGGER.error('Необработанная ошибка приложения')
            error = APIError(500, 'internal_error', 'Внутренняя ошибка сервера')
            response = Response(error.status, error.payload())
        try:
            self._respond(response)
        except (BrokenPipeError, ConnectionResetError):
            LOGGER.info('Клиент закрыл соединение')

    do_GET = do_POST = do_PATCH = do_PUT = do_DELETE = do_HEAD = do_OPTIONS = _handle
    do_TRACE = do_CONNECT = _handle


def make_server(application, host='127.0.0.1', port=8000):
    if host not in ('127.0.0.1', 'localhost'):
        raise ValueError('Учебный сервер допускает только loopback: 127.0.0.1 или localhost')
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.application = application
    return server


def main(argv=None):
    from pymongo import MongoClient

    from savemoney.application import Application
    from savemoney.storage import MemoryStore, MongoStore

    parser = argparse.ArgumentParser(description='Локальный SaveMoney API')
    parser.add_argument('--storage', choices=('memory', 'mongo'), default='mongo')
    parser.add_argument('--host', choices=('127.0.0.1', 'localhost'), default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--init', action='store_true', help='Создать категорию Прочее и период')
    parser.add_argument('--date', type=date.fromisoformat, default=date.today())
    parser.add_argument(
        '--import-file', type=Path, help='Заменить бюджет JSON-снимком и завершиться'
    )
    parser.add_argument('--database', default=os.getenv('SAVEMONEY_DATABASE', 'savemoney'))
    args = parser.parse_args(argv)
    client = None
    try:
        if args.storage == 'mongo':
            client = MongoClient(
                os.getenv('SAVEMONEY_MONGO_URI', 'mongodb://127.0.0.1:27018'),
                serverSelectionTimeoutMS=2000,
                connectTimeoutMS=2000,
                socketTimeoutMS=5000,
            )
            store = MongoStore(client[args.database]['budgets'])
        else:
            store = MemoryStore()
        app = Application(store)
        if args.import_file:
            with args.import_file.open('rb') as source:
                raw = source.read(MAX_BODY + 1)
            if len(raw) > MAX_BODY:
                raise APIError(413, 'payload_too_large', 'Снимок превышает 1 MiB')
            app.handle('PUT', '/api/v1/snapshots/current', {}, decode_json(raw))
            print('Снимок импортирован')
            return
        if args.init:
            app.initialize(args.date)
        with make_server(app, args.host, args.port) as server:
            print(f'SaveMoney API: http://127.0.0.1:{server.server_port}/api/v1', flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
    finally:
        if client is not None:
            client.close()


if __name__ == '__main__':
    main()
