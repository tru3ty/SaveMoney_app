import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('fail_on', ['', 'ruff', 'coverage', 'compileall'])
def test_check_script_stops_on_failed_tool(tmp_path, fail_on):
    (tmp_path / 'scripts').mkdir()
    shutil.copy(ROOT / 'scripts/check.sh', tmp_path / 'scripts/check.sh')
    bin_dir = tmp_path / '.venv/bin'
    bin_dir.mkdir(parents=True)
    python = bin_dir / 'python'
    python.write_text(
        '#!/bin/sh\nprintf "%s\\n" "$*" >> calls.txt\nif [ "$2" = "$FAIL_ON" ]; then exit 7; fi\n',
    )
    python.chmod(493)
    result = subprocess.run(
        ['sh', str(tmp_path / 'scripts/check.sh')],
        env={**os.environ, 'FAIL_ON': fail_on},
        capture_output=True,
        text=True,
    )
    calls = (tmp_path / 'calls.txt').read_text().splitlines()
    if fail_on:
        assert result.returncode == 7
        assert calls[-1].startswith(f'-m {fail_on}')
    else:
        assert result.returncode == 0
        assert any('coverage report --fail-under=100' in call for call in calls)
        assert any('compileall' in call for call in calls)


def test_hook_forwards_failed_check_from_repository_root(tmp_path):
    subprocess.run(['git', 'init', '-q', str(tmp_path)], check=True)
    (tmp_path / '.githooks').mkdir()
    (tmp_path / 'scripts').mkdir()
    hook = tmp_path / '.githooks/pre-commit'
    shutil.copy(ROOT / '.githooks/pre-commit', hook)
    (tmp_path / 'scripts/check.sh').write_text(
        '#!/bin/sh\ntest -d .git || exit 99\nexit 7\n',
    )
    result = subprocess.run(
        ['sh', str(hook)],
        cwd=tmp_path / '.githooks',
        capture_output=True,
    )
    assert result.returncode == 7
