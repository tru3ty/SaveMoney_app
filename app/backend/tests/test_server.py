"""Проверки HTTP-транспорта настоящими запросами requests."""

import json
import socket
from contextlib import contextmanager
from threading import Thread

import pytest
import requests

from savemoney.api_types import APIError, Response


class EchoApplication:
    def handle(self, method, path, query, body):
        if path == '/error':
            raise APIError(
                405, 'method_not_allowed', 'Метод не поддерживается', headers={'Allow': 'GET'}
            )
        if path == '/crash':
            raise RuntimeError('private database credentials')
        if path == '/empty':
            return Response(204)
        return Response(200, {'method': method, 'path': path, 'query': query, 'body': body})


@contextmanager
def running_server(app=None):
    from savemoney.server import make_server

    with make_server(app or EchoApplication(), port=0) as server:
        worker = Thread(target=server.serve_forever, kwargs={'poll_interval': 0.01})
        worker.start()
        try:
            yield f'http://127.0.0.1:{server.server_port}'
        finally:
            server.shutdown()
            worker.join(timeout=5)


@pytest.mark.network
def test_transport_json_headers_and_empty_response():
    with running_server() as base:
        response = requests.post(
            base + '/api/v1/categories?name=еда', json={'name': 'Еда'}, timeout=3
        )
        assert response.status_code == 200
        assert response.json()['body'] == {'name': 'Еда'}
        assert response.json()['query'] == {'name': 'еда'}
        assert 'application/json' in response.headers['Content-Type']
        assert int(response.headers['Content-Length']) == len(response.content)
        assert requests.delete(base + '/empty', timeout=3).content == b''
        response = requests.get(base + '/error', timeout=3)
        assert response.status_code == 405
        assert response.headers['Allow'] == 'GET'
        response = requests.get(base + '/crash', timeout=3)
        assert response.status_code == 500
        assert 'private' not in response.text


@pytest.mark.network
@pytest.mark.parametrize(
    ('data', 'headers', 'status', 'code'),
    [
        ('{', {'Content-Type': 'application/json'}, 400, 'invalid_json'),
        ('{"x":NaN}', {'Content-Type': 'application/json'}, 400, 'invalid_json'),
        ('{"x":1,"x":2}', {'Content-Type': 'application/json'}, 400, 'invalid_json'),
        (b'\xff', {'Content-Type': 'application/json'}, 400, 'invalid_json'),
        ('{}', {}, 415, 'unsupported_media_type'),
        ('x' * (1024 * 1024 + 1), {'Content-Type': 'application/json'}, 413, 'payload_too_large'),
    ],
)
def test_transport_rejects_invalid_body(data, headers, status, code):
    with running_server() as base:
        result = requests.post(base + '/test', data=data, headers=headers, timeout=3)
        assert result.status_code == status
        assert result.json()['error']['code'] == code


@pytest.mark.network
def test_duplicate_query_and_unexpected_get_body():
    with running_server() as base:
        assert requests.get(base + '/test?a=1&a=2', timeout=3).status_code == 422
        assert requests.get(base + '/test', json={}, timeout=3).status_code == 422
        assert requests.get(base + '/test?x=%FF', timeout=3).status_code == 422


def test_public_bind_is_rejected():
    from savemoney.server import make_server

    with pytest.raises(ValueError, match='loopback'):
        make_server(EchoApplication(), host='0.0.0.0', port=0)


def raw_request(base, request):
    port = int(base.rsplit(':', 1)[1])
    with socket.create_connection(('127.0.0.1', port), timeout=3) as conn:
        conn.sendall(request)
        conn.shutdown(socket.SHUT_WR)
        chunks = []
        while data := conn.recv(4096):
            chunks.append(data)
    headers, body = b''.join(chunks).split(b'\r\n\r\n', 1)
    return headers, json.loads(body)


@pytest.mark.network
@pytest.mark.parametrize(
    'headers',
    [
        b'Content-Length: -1\r\n',
        b'Content-Length: abc\r\n',
        b'Content-Length: 2\r\nContent-Length: 3\r\n',
        b'Transfer-Encoding: chunked\r\n',
        b'Content-Length: 10\r\n',
    ],
)
def test_ambiguous_or_truncated_framing(headers):
    with running_server() as base:
        head, body = raw_request(base, b'POST /test HTTP/1.0\r\n' + headers + b'\r\n{}')
        assert b'400' in head
        assert body['error']['code'] == 'invalid_json'


@pytest.mark.network
@pytest.mark.parametrize('path', ['/test?x=%QQ', 'http://example.com/test', '/test#fragment'])
def test_bad_url(path):
    with running_server() as base:
        headers, body = raw_request(base, f'GET {path} HTTP/1.0\r\n\r\n'.encode())
        assert b'422' in headers
        assert body['error']['code'] == 'validation_error'


@pytest.mark.network
def test_head_has_no_body():
    with running_server() as base:
        response = requests.head(base + '/test', timeout=3)
        assert response.status_code == 200
        assert response.content == b''


def test_timeout_and_disconnected_client(monkeypatch):
    from savemoney.server import Handler

    handler = object.__new__(Handler)
    responses = []

    def timeout():
        raise TimeoutError

    monkeypatch.setattr(handler, '_dispatch', timeout)
    monkeypatch.setattr(handler, '_respond', responses.append)
    handler._handle()
    assert responses[0].status == 400
    assert responses[0].body['error']['code'] == 'invalid_json'

    def disconnect(response):
        raise BrokenPipeError

    monkeypatch.setattr(handler, '_respond', disconnect)
    handler._handle()


@pytest.mark.network
def test_unknown_method_reaches_application():
    with running_server() as base:
        response = requests.request('BREW', base + '/error', timeout=3)
        assert response.status_code == 405
        assert response.json()['error']['code'] == 'method_not_allowed'


def test_handler_unknown_attribute():
    from savemoney.server import Handler

    with pytest.raises(AttributeError):
        _ = object.__new__(Handler).missing_attribute


@pytest.mark.network
def test_enormous_content_length_is_rejected_before_integer_conversion():
    with running_server() as base:
        headers, body = raw_request(
            base, b'POST /test HTTP/1.0\r\nContent-Length: ' + b'9' * 5000 + b'\r\n\r\n'
        )
        assert b'413' in headers
        assert body['error']['code'] == 'payload_too_large'


@pytest.mark.network
def test_swagger_page_and_same_origin_spec():
    with running_server() as base:
        for path in ('/swagger', '/swagger/'):
            response = requests.get(base + path, timeout=3)
            assert response.status_code == 200
            assert response.headers['Content-Type'].startswith('text/html')
            assert 'SwaggerUIBundle' in response.text
            assert 'supportedSubmitMethods' in response.text
        response = requests.get(base + '/openapi.json', timeout=3)
        assert response.status_code == 200
        spec = response.json()
        assert spec['servers'][0]['url'] == '/'
        assert sum(len(operations) for operations in spec['paths'].values()) == 38
        assert requests.head(base + '/swagger', timeout=3).content == b''
        assert requests.get(base + '/swagger?unknown=1', timeout=3).status_code == 422
        response = requests.post(base + '/swagger', timeout=3)
        assert response.status_code == 405
        assert response.headers['Allow'] == 'GET, HEAD'
