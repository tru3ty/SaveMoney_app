import runpy

import main


def test_demo_calculates_budget_and_expense(capsys):
    main.main()
    output = capsys.readouterr().out
    assert 'Свободно: 35\xa0000,00 ₽' in output
    assert 'Еда: осталось 29\xa0550,00 ₽' in output
    assert 'После траты: 34\xa0550,00 ₽' in output


def test_script_entry_point_runs_without_network(capsys):
    runpy.run_module('main', run_name='__main__')
    assert 'После траты: 34\xa0550,00 ₽' in capsys.readouterr().out
