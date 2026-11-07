import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from time import sleep

import pytest
import requests

from savemoney.http_client import get_json


@pytest.fixture
def http_url():

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            status = 503 if self.path == '/error' else 200
            if self.path == '/slow':
                sleep(0.1)
            body = (
                b'not json' if self.path == '/bad-json' else json.dumps({'amount': 4550}).encode()
            )
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except BrokenPipeError:
                pass

        def log_message(self, *_):
            pass

    server = HTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}'
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()


@pytest.mark.network
def test_get_json_reads_real_http_response(http_url):
    assert get_json(http_url) == {'amount': 4550}


@pytest.mark.network
def test_http_error_is_not_success(http_url):
    with pytest.raises(requests.HTTPError):
        get_json(http_url + '/error')


@pytest.mark.network
def test_invalid_json_is_rejected(http_url):
    with pytest.raises(requests.exceptions.JSONDecodeError):
        get_json(http_url + '/bad-json')


@pytest.mark.network
def test_timeout_is_bounded(http_url):
    with pytest.raises(requests.Timeout):
        get_json(http_url + '/slow', timeout=0.01)


@pytest.mark.parametrize('timeout', [0, -1, True, float('nan'), float('inf')])
def test_invalid_timeout_rejected_before_network(timeout):
    with pytest.raises(ValueError):
        get_json('http://127.0.0.1', timeout=timeout)


@pytest.mark.parametrize(
    ('status', 'body', 'error'),
    [
        (200, b'{"amount": 4550}', None),
        (503, b'{"error": "unavailable"}', requests.HTTPError),
        (200, b'bad json', requests.exceptions.JSONDecodeError),
    ],
)
def test_client_handles_response_at_transport_boundary(monkeypatch, status, body, error):

    def send(session, request, **kwargs):
        assert request.method == 'GET'
        assert request.url == 'http://example.test/budget'
        assert kwargs['timeout'] == 2.0
        response = requests.Response()
        response.status_code = status
        response._content = body
        response._content_consumed = True
        response.request = request
        return response

    monkeypatch.setattr(requests.Session, 'send', send)
    if error:
        with pytest.raises(error):
            get_json('http://example.test/budget', timeout=2.0)
    else:
        assert get_json('http://example.test/budget', timeout=2.0) == {'amount': 4550}


def test_client_propagates_transport_timeout(monkeypatch):

    def send(*args, **kwargs):
        assert kwargs['timeout'] == 5.0
        raise requests.Timeout('Timed out')

    monkeypatch.setattr(requests.Session, 'send', send)
    with pytest.raises(requests.Timeout):
        get_json('http://example.test/budget')
