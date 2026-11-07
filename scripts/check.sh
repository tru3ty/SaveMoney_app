#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
if [ -x .venv/bin/python ]; then
    python_runner="$project_dir/.venv/bin/python"
else
    python_runner=python3
fi
"$python_runner" -m ruff check .
"$python_runner" -m ruff format --check .
"$python_runner" -m coverage run -m pytest
"$python_runner" -m coverage report --fail-under=100
"$python_runner" -m compileall -q savemoney main.py
