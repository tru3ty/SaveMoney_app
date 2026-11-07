"""Keep the machine-readable contract aligned with the coursework README."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METHODS = {'get', 'post', 'put', 'patch', 'delete'}


def test_openapi_covers_every_documented_endpoint():
    spec = json.loads((ROOT / 'openapi.json').read_text())
    rows = re.findall(
        r'\| `(/api/v1/[^`]+)` \| (GET|POST|PUT|PATCH|DELETE) \|', (ROOT / 'README.md').read_text()
    )
    expected = {(path, method.lower()) for path, method in rows}
    actual = {
        (path, method)
        for path, item in spec['paths'].items()
        for method in item
        if method in METHODS
    }
    assert expected
    assert actual == expected


def test_openapi_references_and_path_parameters_resolve():
    spec = json.loads((ROOT / 'openapi.json').read_text())

    def visit(value):
        if isinstance(value, dict):
            if '$ref' in value:
                assert value['$ref'].startswith('#/')
                target = spec
                for key in value['$ref'][2:].split('/'):
                    target = target[key.replace('~1', '/').replace('~0', '~')]
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(spec)
    ids = []
    for path, item in spec['paths'].items():
        for method, operation in item.items():
            if method not in METHODS:
                continue
            ids.append(operation['operationId'])
            params = operation.get('parameters', [])
            actual = {p['name'] for p in params if p['in'] == 'path' and p['required']}
            assert actual == set(re.findall(r'{([^}]+)}', path))
    assert len(ids) == len(set(ids))


def test_openapi_success_examples_match_readme():
    spec = json.loads((ROOT / 'openapi.json').read_text())
    rows = re.findall(
        r'^\| [^|]+ \| `(/api/v1/[^`]+)` \| (GET|POST|PUT|PATCH|DELETE) \| (.+)$',
        (ROOT / 'README.md').read_text(),
        re.MULTILINE,
    )
    for path, method, description in rows:
        responses = spec['paths'][path][method.lower()]['responses']
        examples = [json.loads(raw) for raw in re.findall(r'`(\{[^`]+\})`', description)]
        success = [r for status, r in responses.items() if status.startswith('2')]
        assert success
        if method == 'DELETE':
            assert 'content' not in responses['204']
        else:
            assert examples
            assert any(
                response['content']['application/json']['example'] in examples
                for response in success
            )


def test_created_resources_have_readable_location_examples():
    spec = json.loads((ROOT / 'openapi.json').read_text())
    readable = [path for path, methods in spec['paths'].items() if 'get' in methods]
    for methods in spec['paths'].values():
        for method, operation in methods.items():
            if method not in METHODS or '201' not in operation['responses']:
                continue
            location = operation['responses']['201']['headers']['Location']['example']
            assert any(
                re.fullmatch(re.sub(r'\{[^}]+\}', '[^/]+', path), location) for path in readable
            ), location
