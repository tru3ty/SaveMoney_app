"""Реальная MongoDB: перезапуск HTTP-процесса и перенос JSON-снимка."""

import json
import os
import select
import subprocess
import sys
from contextlib import contextmanager
from uuid import uuid4

import pytest
import requests
from pymongo import MongoClient

URI = os.getenv('SAVEMONEY_TEST_MONGO_URI')
pytestmark = [
    pytest.mark.network,
    pytest.mark.mongo,
    pytest.mark.skipif(not URI, reason='Set SAVEMONEY_TEST_MONGO_URI for real MongoDB'),
]


@contextmanager
def process_server(database):
    env = {**os.environ, 'SAVEMONEY_MONGO_URI': URI}
    command = [
        sys.executable,
        '-m',
        'savemoney.server',
        '--database',
        database,
        '--port',
        '0',
        '--init',
        '--date',
        '2026-11-05',
    ]
    process = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env
    )
    try:
        ready, _, _ = select.select([process.stdout], [], [], 15)
        assert ready, 'HTTP server did not start in 15 seconds'
        line = process.stdout.readline().strip()
        if not line.startswith('SaveMoney API: http://127.0.0.1:'):
            raise AssertionError(process.stderr.read())
        yield line.removeprefix('SaveMoney API: ')
    finally:
        process.terminate()
        process.communicate(timeout=10)


def test_real_mongo_survives_restart_and_cli_migration(tmp_path):
    databases = ['savemoney_test_' + uuid4().hex for _ in range(2)]
    with MongoClient(URI, serverSelectionTimeoutMS=3000) as client:
        client.admin.command('ping')
        try:
            with process_server(databases[0]) as base:
                created = requests.post(
                    base + '/categories', json={'name': 'Кафе', 'kind': 'expense'}, timeout=5
                )
                assert created.status_code == 201
                category = created.json()['data']
                expense = requests.post(
                    base + '/transactions',
                    json={
                        'type': 'expense',
                        'amount': 45000,
                        'date': '2026-11-05',
                        'categoryId': category['id'],
                    },
                    timeout=5,
                )
                assert expense.status_code == 201
                snapshot = requests.get(base + '/snapshots/current', timeout=5).json()
            assert client[databases[0]].budgets.count_documents({}) == 1
            with process_server(databases[0]) as base:
                restored = requests.get(base + '/categories/' + category['id'], timeout=5)
                assert restored.json()['data'] == category
                assert requests.get(base + '/snapshots/current', timeout=5).json() == snapshot
            source = tmp_path / 'snapshot.json'
            source.write_text(json.dumps(snapshot, ensure_ascii=False))
            result = subprocess.run(
                [
                    sys.executable,
                    '-m',
                    'savemoney.server',
                    '--database',
                    databases[1],
                    '--import-file',
                    str(source),
                ],
                env={**os.environ, 'SAVEMONEY_MONGO_URI': URI},
                capture_output=True,
                text=True,
                timeout=15,
            )
            assert result.returncode == 0, result.stderr
            assert client[databases[1]].budgets.find_one()['snapshot'] == snapshot
        finally:
            for database in databases:
                client.drop_database(database)
