"""CLI initialization, import and resource cleanup."""

import json
import runpy
import sys
from unittest.mock import MagicMock

import mongomock
import pytest

from savemoney import server
from savemoney.api_types import APIError
from savemoney.application import empty_snapshot


def stopping_server(monkeypatch):
    context = MagicMock()
    context.__enter__.return_value = context
    context.server_port = 8765
    context.serve_forever.side_effect = KeyboardInterrupt
    monkeypatch.setattr(server, 'make_server', lambda *args: context)
    return context


def test_memory_cli_initializes_and_shuts_down(monkeypatch, capsys):
    context = stopping_server(monkeypatch)
    server.main(['--storage', 'memory', '--init', '--date', '2026-11-05'])
    assert '8765' in capsys.readouterr().out
    context.__exit__.assert_called_once()


def test_mongo_cli_imports_and_closes_client(monkeypatch, tmp_path, capsys):
    client = mongomock.MongoClient()
    close = MagicMock()
    monkeypatch.setattr(client, 'close', close)
    monkeypatch.setattr('pymongo.MongoClient', lambda *args, **kwargs: client)
    data = empty_snapshot()
    data['settings']['theme'] = 'dark'
    source = tmp_path / 'snapshot.json'
    source.write_text(json.dumps(data))
    server.main(['--import-file', str(source), '--database', 'test_import'])
    assert client.test_import.budgets.find_one()['snapshot']['settings']['theme'] == 'dark'
    close.assert_called_once()
    assert 'импортирован' in capsys.readouterr().out


def test_cli_rejects_oversized_import_without_replacing(monkeypatch, tmp_path):
    client = mongomock.MongoClient()
    monkeypatch.setattr('pymongo.MongoClient', lambda *args, **kwargs: client)
    source = tmp_path / 'large.json'
    source.write_bytes(b' ' * (server.MAX_BODY + 1))
    with pytest.raises(APIError) as error:
        server.main(['--import-file', str(source)])
    assert error.value.status == 413
    assert client.savemoney.budgets.count_documents({}) == 0


def test_module_entrypoint_can_import_snapshot(monkeypatch, tmp_path, capsys):
    source = tmp_path / 'snapshot.json'
    source.write_text(json.dumps(empty_snapshot()))
    monkeypatch.setattr(
        sys, 'argv', ['savemoney.server', '--storage', 'memory', '--import-file', str(source)]
    )
    # Remove the imported module while exercising the real -m entrypoint.
    monkeypatch.delitem(sys.modules, 'savemoney.server')
    runpy.run_module('savemoney.server', run_name='__main__')
    assert 'импортирован' in capsys.readouterr().out
