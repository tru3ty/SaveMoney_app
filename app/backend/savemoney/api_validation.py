"""Разбор маршрутов и проверка входных данных по схемам OpenAPI."""

import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import unquote

from savemoney.api_types import APIError

SPEC = json.loads((Path(__file__).resolve().parent.parent / 'openapi.json').read_text())
SCHEMAS = SPEC['components']['schemas']


def invalid(message, field='body'):
    raise APIError(422, 'validation_error', message, {field: message})


def conflict(message):
    raise APIError(409, 'conflict', message)


def schema_for(schema):
    return SCHEMAS[schema['$ref'].rsplit('/', 1)[1]] if '$ref' in schema else schema


def validate(value, schema, field='body'):
    schema = schema_for(schema)
    if 'oneOf' in schema:
        matches = 0
        for option in schema['oneOf']:
            try:
                validate(value, option, field)
                matches += 1
            except APIError:
                pass
        if matches != 1:
            invalid('Данные не соответствуют схеме', field)
        schema = {k: v for k, v in schema.items() if k != 'oneOf'}
    if value is None and schema.get('nullable'):
        return
    expected = schema.get('type', 'object' if 'properties' in schema else None)
    types = {'object': dict, 'array': list, 'integer': int, 'string': str, 'boolean': bool}
    valid_type = (
        (isinstance(value, int) and not isinstance(value, bool))
        if expected == 'integer'
        else expected not in types or type(value) is types[expected]
    )
    if not valid_type:
        invalid(f'Ожидается {expected}', field)
    if 'enum' in schema and value not in schema['enum']:
        invalid('Недопустимое значение', field)
    if expected == 'object':
        properties = schema.get('properties', {})
        if schema.get('additionalProperties') is False and value.keys() - properties.keys():
            invalid('Неизвестное поле', field)
        if set(schema.get('required', [])) - value.keys():
            invalid('Пропущено обязательное поле', field)
        if len(value) < schema.get('minProperties', 0):
            invalid('Пустое изменение', field)
        for key, item in value.items():
            if key in properties:
                validate(item, properties[key], f'{field}.{key}')
    elif expected == 'array':
        for index, item in enumerate(value):
            validate(item, schema['items'], f'{field}[{index}]')
    elif expected == 'integer':
        if value < schema.get('minimum', value) or value > schema.get('maximum', value):
            invalid('Число вне допустимого диапазона', field)
    elif expected == 'string':
        try:
            value.encode('utf-8')
        except UnicodeEncodeError:
            invalid('Некорректная строка Unicode', field)
        checked = value.strip() if field.endswith('.name') else value
        if not schema.get('minLength', 0) <= len(checked) <= schema.get('maxLength', len(checked)):
            invalid('Недопустимая длина строки', field)
        if 'pattern' in schema and re.fullmatch(schema['pattern'], value) is None:
            invalid('Недопустимый формат строки', field)
        if schema.get('format') == 'date':
            try:
                date.fromisoformat(value)
            except ValueError:
                invalid('Некорректная календарная дата', field)


def defaults(schema_name, values):
    properties = SCHEMAS[schema_name]['properties']
    return {**{k: v['default'] for k, v in properties.items() if 'default' in v}, **values}


def route(method, path, query, body):
    for template, methods in SPEC['paths'].items():
        match = re.fullmatch(re.sub(r'\{[^}]+\}', r'([^/]+)', template), path)
        if not match:
            continue
        if method.lower() not in methods:
            raise APIError(
                405,
                'method_not_allowed',
                'Метод не поддерживается',
                headers={'Allow': ', '.join(m.upper() for m in methods)},
            )
        operation = methods[method.lower()]
        names = re.findall(r'\{([^}]+)\}', template)
        try:
            params = dict(
                zip(names, (unquote(p, errors='strict') for p in match.groups()), strict=True)
            )
        except UnicodeDecodeError:
            invalid('Некорректный идентификатор в URL', 'path')
        parameters = {p['name']: p for p in operation.get('parameters', []) if p['in'] == 'query'}
        if query.keys() - parameters.keys():
            invalid('Неизвестный query-параметр', 'query')
        parsed = {}
        for name, parameter in parameters.items():
            schema = parameter['schema']
            if name not in query:
                if parameter.get('required'):
                    invalid('Обязательный query-параметр', name)
                if 'default' in schema:
                    parsed[name] = schema['default']
                continue
            value = query[name]
            if schema['type'] == 'integer':
                if not isinstance(value, str) or re.fullmatch('[0-9]+', value) is None:
                    invalid('Ожидается целое число', name)
                try:
                    value = int(value)
                except ValueError:
                    invalid('Слишком длинное целое число', name)
            elif schema['type'] == 'boolean':
                if value not in ('true', 'false'):
                    invalid('Ожидается true или false', name)
                value = value == 'true'
            validate(value, schema, name)
            parsed[name] = value
        request_schema = (
            operation.get('requestBody', {})
            .get('content', {})
            .get('application/json', {})
            .get('schema')
        )
        if request_schema:
            validate(body, request_schema)
        elif body is not None:
            invalid('Тело запроса не допускается')
        return template, params, parsed
    raise APIError(404, 'not_found', 'Ресурс не найден')
