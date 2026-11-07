# SaveMoney

Учебный проект управления личным бюджетом по методу конвертов: сколько можно
потратить сегодня, какие деньги зарезервированы и сколько накоплено на цели.

Конечный продукт включает готовые интерфейсы **React Native (mobile)** и
**Tauri (desktop, React + TypeScript)** с общим Python API. Сейчас реализуется
учебное ядро до второго чек-поинта; интерфейсы появятся следующим этапом.

## Что работает сейчас

- Python-классы доходов, обязательств, категорий, периодов, конвертов, операций и целей.
- Суммы в целых копейках, проверка ввода, календарь выплат и коротких месяцев.
- Расчёт свободных денег, резерва, дневного лимита, состояния конвертов и прогресса целей.
- Бюджет в памяти: создание периодов, операции, мягкое удаление и разбор остатков.
- Защита от повторного переноса остатка, отрицательного накопления и изменения закрытой истории.
- Демонстрация `main.py` и учебный requests-клиент с timeout и обработкой HTTP/JSON-ошибок.
- pytest, конфигурация coverage/Ruff, Git-хук и workflow GitHub Actions.

Сервер пока не запущен и маршруты API не реализованы. [Проект контракта](#api-будущего-restful-сервера)
предназначен для ревью. HTTP-сервер, Postman и MongoDB/PyMongo/mongomock идут
на этапах 7–9. [Устройство проекта и план развития](PROJECT.md).

## Установка и запуск

Нужны Python 3.13 и Git. Из корня репозитория, в macOS/Linux:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python main.py
```

Ожидаемый вывод:

```text
Свободно: 35 000,00 ₽
Еда: осталось 29 550,00 ₽
После траты: 34 550,00 ₽
```

В выводе используются неразрывные пробелы. Демонстрация использует фиксированную
дату и тестовые суммы; данные хранятся в памяти и исчезают после завершения процесса.
Рабочий сервер или база для неё не нужны. `bun` потребуется только будущим клиентам.

## PyCharm и отладчик

1. Открыть корень репозитория как проект.
2. Выбрать существующий интерпретатор `.venv/bin/python` в настройках Python Interpreter.
3. Создать Python Run Configuration: script `main.py`, working directory — корень проекта.
4. Поставить breakpoint на строку `budget.add_transaction(...)` с операцией `lunch`.
5. Запустить Debug, посмотреть `before.available` (3500000 копеек) и `budget.transactions`.
6. Выполнить Step Over и продолжить до расчёта `after`: доступно 3455000 копеек,
   остаток конверта 2955000 копеек. Step Into позволяет пройти валидацию и расчёт.

## Проверки

```sh
python -m pytest
python -m coverage run -m pytest
python -m coverage report --fail-under=100
python -m ruff check .
python -m ruff format --check .
python -m compileall -q savemoney main.py
```

Все проверки одной командой: `sh scripts/check.sh`. Форматирование перед проверкой:
`python -m ruff format .`; автоматически исправимые замечания — `python -m ruff check --fix .`.

Требование покрытия — 100% строк реализованного приложения. Из измерения исключён
только блок `if TYPE_CHECKING`, исполняемый статическим анализатором, а не приложением.
`main.py`, HTTP-клиент и ветки обработки ошибок входят в измерение.

Четыре теста с меткой `network` открывают HTTP-сервер на случайном loopback-порту,
выполняют requests-запросы и закрывают сервер. Это тестовая фикстура, не продуктовый сервер.
Если среда запрещает открытие сокетов, диагностический запуск:

```sh
python -m pytest -m 'not network'
```

Он **не заменяет полный запуск**: Git-хук и CI всегда запускают весь набор.
Транспортные ошибки также проверяются отдельно с подменой только сетевой передачи,
с настоящими объектами Response и обработкой requests.

## Git, ветки и CI

```sh
git status
git log --oneline
git branch -a
git diff --check
git config core.hooksPath .githooks
```

Хук запускает те же проверки, что CI, и прекращает работу при первой ошибке.
Он проверяет текущее рабочее дерево; перед коммитом необходимо проверить также
`git diff --cached`, особенно при частичном добавлении файлов.

Ветка разработки — `dev`, актуальная версия проекта — `staging`.
Для новых задач используются `feature/*` от `dev`; `master` — основная ветка репозитория.
По заданию спецификация сдаётся через отдельную ветку `apispec`, а следующая стадия
реализуется в `server`. Для сдачи PR направляется **из `apispec` в `master`** —
основную ветку этого репозитория. **До ревью преподавателя PR не сливается.**
Коммиты оформляются по Conventional Commits.

Workflow запускается на push и pull request: Python 3.13, установка зафиксированных
зависимостей, Ruff, pytest, покрытие 100% и компиляция модулей. Успех CI подтверждается
фактическим запуском на GitHub, не наличием YAML-файла.

## Устройство ядра

- `savemoney/domain/` — модели, календарь, деньги, расчёты и проверки истории.
- `savemoney/budget.py` — согласованные операции над бюджетом в памяти.
- `savemoney/http_client.py` — учебный GET-клиент для JSON-ресурса.
- `tests/` — поведенческие проверки и краевые случаи.

Финансовые правила, ограничения и план развития описаны в [PROJECT.md](PROJECT.md).
В реальной работе с деньгами до развёртывания требуется завершить и проверить
серверную фазу; текущая версия — учебная модель с данными в памяти.

## API будущего RESTful-сервера

**Статус:** спецификация для ревью в ветке `apispec`, этап 6 / чек-поинт 2.
Сервер пока не реализован. Контракт должен пройти ревью до этапов 7–8.
Потребители: мобильный клиент React Native и десктопный клиент Tauri.

### Общие правила

- Базовый путь: `/api/v1`. Учебный сервер в дальнейшем слушает только localhost.
- Запросы с телом: `Content-Type: application/json`; ответы с телом — JSON UTF-8.
- Деньги: целые копейки от 0 до `9007199254740991`; суммы операций строго больше 0.
  Дробные числа, JSON `true` и строка вместо числа отклоняются. Расчётные остатки
  могут быть отрицательными. Денежные суммы не округляются при вводе.
- Даты: строки `YYYY-MM-DD`; timestamp: целые миллисекунды UTC.
- ID: непрозрачная непустая строка. Клиент не извлекает смысл из ID и не генерирует его.
  Создающий запрос не принимает `id`; сервер назначает ID. Для периода может
  использоваться `YYYY-MM`, как в учебном ядре, для прочих сущностей — UUID-строка.
- Названия ресурсов во множественном числе, поля JSON в `camelCase`.
- Неизвестные поля и неизвестные query-параметры отклоняются; пропуск обязательного
  поля — ошибка. `null` допустим только для явно необязательных связей/дат.
- PATCH изменяет только переданные поля; нельзя менять ID, `createdAt` и
  вычисляемые суммы. Исключение для восстановления операции: отдельный PATCH
  только с `deletedAt: null`; произвольный timestamp удаления принимать нельзя. Пустой PATCH — ошибка.
- Один пользователь. Авторизация и публичный сетевой доступ вне текущего контракта.
- GET не создаёт периоды и не меняет данные; инициализация выполняется отдельной командой.

### Формат ответов

Одна сущность: `{"data": {...}}` (кроме скачиваемого снимка бюджета). Список:

```json
{"data": [], "pagination": {"limit": 50, "offset": 0, "total": 0}}
```

Пагинация всех списков: `limit` по умолчанию 50, диапазон 1–100;
`offset` по умолчанию 0, неотрицательное целое. Порядок стабилен:
операции по `date` по убыванию, затем `id` по возрастанию;
периоды по `(year, month)` по убыванию; остальные списки по `id` по возрастанию.
`total` считается после фильтров, до пагинации.

Ошибки:

```json
{"error": {"code": "validation_error", "message": "Некорректная сумма", "fields": {"amount": "Ожидается положительное целое число"}}}
```

| HTTP | code | Значение |
|---|---|---|
| 400 | `invalid_json` | Синтаксически невалидный JSON |
| 404 | `not_found` | Ресурс по URL не найден |
| 405 | `method_not_allowed` | Метод не поддерживается, заголовок `Allow` перечисляет допустимые |
| 409 | `conflict` | Повтор/конфликт уникальности, закрытый период, изменение уже принятого решения |
| 413 | `payload_too_large` | Тело более 1 MiB; лимит также относится к импорту учебной версии |
| 415 | `unsupported_media_type` | У запроса с телом отсутствует JSON Content-Type |
| 422 | `validation_error` | Нарушение схемы или предметных правил, в том числе неверная связанная сущность |
| 500 | `internal_error` | Неожиданная ошибка без внутренних трассировок в ответе |
| 503 | `storage_unavailable` | Хранилище недоступно |

Успех: GET/PATCH — 200; создание — 201 с `Location`; DELETE — 204 без тела.
Исключения для PUT и идемпотентного создания периодов/решений указаны в таблице.
`Location` указывает на доступный GET URL созданного ресурса.
Повтор DELETE уже мягко удалённой операции — 204. Несуществующий ID — 404.

### Таблица эндпоинтов

| Название действия | Локейшн (URL) | Тип запроса | Описание запроса и ответа |
|---|---|---|---|
| Получить категории | `/api/v1/categories` | GET | Query: `limit`, `offset` (правила ниже). Тело отсутствует. **200**, JSON: `{"data":[{"id":"food","name":"Еда","kind":"expense","parentId":null,"icon":"","color":"#34a06a","isArchived":false,"sortOrder":0}],"pagination":{"limit":50,"offset":0,"total":1}}`. |
| Создать категорию | `/api/v1/categories` | POST | JSON: `{"name":"Еда","kind":"expense"}`; дополнительные поля и значения по умолчанию — в схеме ниже. **201**, `Location`, JSON: `{"data":{"id":"food","name":"Еда","kind":"expense","parentId":null,"icon":"","color":"#34a06a","isArchived":false,"sortOrder":0}}`. |
| Получить категорию | `/api/v1/categories/{id}` | GET | Path: `id`. Тело отсутствует. **200**, JSON: `{"data":{"id":"food","name":"Еда","kind":"expense","parentId":null,"icon":"","color":"#34a06a","isArchived":false,"sortOrder":0}}`; неизвестный ID — **404**. |
| Изменить категорию | `/api/v1/categories/{id}` | PATCH | Path: `id`; JSON, например `{"name":"Продукты"}`. Допустимы поля POST; правила связей ниже. **200**, JSON: `{"data":{"id":"food","name":"Продукты","kind":"expense","parentId":null,"icon":"","color":"#34a06a","isArchived":false,"sortOrder":0}}`. |
| Получить источники дохода | `/api/v1/income-sources` | GET | Query: `limit`, `offset` (правила ниже). Тело отсутствует. **200**, JSON: `{"data":[{"id":"salary","name":"Зарплата","amount":8500000,"schedule":"monthly_day","dayOfMonth":20,"isActive":true,"sortOrder":0}],"pagination":{"limit":50,"offset":0,"total":1}}`. |
| Создать источник дохода | `/api/v1/income-sources` | POST | JSON: `{"name":"Зарплата","amount":8500000,"schedule":"monthly_day","dayOfMonth":20}`; дополнительные поля и значения по умолчанию — в схеме ниже. **201**, `Location`, JSON: `{"data":{"id":"salary","name":"Зарплата","amount":8500000,"schedule":"monthly_day","dayOfMonth":20,"isActive":true,"sortOrder":0}}`. |
| Получить источник дохода | `/api/v1/income-sources/{id}` | GET | Path: `id`. Тело отсутствует. **200**, JSON: `{"data":{"id":"salary","name":"Зарплата","amount":8500000,"schedule":"monthly_day","dayOfMonth":20,"isActive":true,"sortOrder":0}}`; неизвестный ID — **404**. |
| Изменить источник дохода | `/api/v1/income-sources/{id}` | PATCH | Path: `id`; JSON, например `{"amount":9000000}`. Допустимы поля POST; правила связей ниже. **200**, JSON: `{"data":{"id":"salary","name":"Зарплата","amount":9000000,"schedule":"monthly_day","dayOfMonth":20,"isActive":true,"sortOrder":0}}`. |
| Получить обязательства | `/api/v1/obligations` | GET | Query: `limit`, `offset` (правила ниже). Тело отсутствует. **200**, JSON: `{"data":[{"id":"rent","name":"Аренда","amount":5000000,"dayOfMonth":10,"categoryId":null,"isActive":true,"sortOrder":0}],"pagination":{"limit":50,"offset":0,"total":1}}`. |
| Создать обязательство | `/api/v1/obligations` | POST | JSON: `{"name":"Аренда","amount":5000000,"dayOfMonth":10}`; дополнительные поля и значения по умолчанию — в схеме ниже. **201**, `Location`, JSON: `{"data":{"id":"rent","name":"Аренда","amount":5000000,"dayOfMonth":10,"categoryId":null,"isActive":true,"sortOrder":0}}`. |
| Получить обязательство | `/api/v1/obligations/{id}` | GET | Path: `id`. Тело отсутствует. **200**, JSON: `{"data":{"id":"rent","name":"Аренда","amount":5000000,"dayOfMonth":10,"categoryId":null,"isActive":true,"sortOrder":0}}`; неизвестный ID — **404**. |
| Изменить обязательство | `/api/v1/obligations/{id}` | PATCH | Path: `id`; JSON, например `{"isActive":false}`. Допустимы поля POST; правила связей ниже. **200**, JSON: `{"data":{"id":"rent","name":"Аренда","amount":5000000,"dayOfMonth":10,"categoryId":null,"isActive":false,"sortOrder":0}}`. |
| Получить цели накопления | `/api/v1/goals` | GET | Query: `limit`, `offset` (правила ниже). Тело отсутствует. **200**, JSON: `{"data":[{"id":"trip","name":"Отпуск","targetAmount":10000000,"targetDate":null,"icon":"","color":"#34a06a","status":"active","sortOrder":0}],"pagination":{"limit":50,"offset":0,"total":1}}`. |
| Создать цель накопления | `/api/v1/goals` | POST | JSON: `{"name":"Отпуск","targetAmount":10000000}`; дополнительные поля и значения по умолчанию — в схеме ниже. **201**, `Location`, JSON: `{"data":{"id":"trip","name":"Отпуск","targetAmount":10000000,"targetDate":null,"icon":"","color":"#34a06a","status":"active","sortOrder":0}}`. |
| Получить цель накопления | `/api/v1/goals/{id}` | GET | Path: `id`. Тело отсутствует. **200**, JSON: `{"data":{"id":"trip","name":"Отпуск","targetAmount":10000000,"targetDate":null,"icon":"","color":"#34a06a","status":"active","sortOrder":0}}`; неизвестный ID — **404**. |
| Изменить цель накопления | `/api/v1/goals/{id}` | PATCH | Path: `id`; JSON, например `{"targetAmount":12000000}`. Допустимы поля POST; правила связей ниже. **200**, JSON: `{"data":{"id":"trip","name":"Отпуск","targetAmount":12000000,"targetDate":null,"icon":"","color":"#34a06a","status":"active","sortOrder":0}}`. |
| Создать текущий и пропущенные периоды | `/api/v1/periods` | POST | JSON: `{"date":"2026-11-07"}`. **201**, если целевой период создан (`Location: /api/v1/periods/2026-11`); иначе **200**. JSON: `{"data":{"period":{"id":"2026-11","year":2026,"month":11,"startDate":"2026-11-01","endDate":"2026-11-30","status":"active"},"createdIds":["2026-11"]}}`; при повторе `createdIds: []`. |
| Получить периоды | `/api/v1/periods` | GET | Query: `limit`, `offset`, необязательный `status` (active/pending_review/closed). **200**, JSON: `{"data":[{"id":"2026-11","year":2026,"month":11,"startDate":"2026-11-01","endDate":"2026-11-30","status":"active"}],"pagination":{"limit":50,"offset":0,"total":1}}`. |
| Получить период | `/api/v1/periods/{id}` | GET | Path: `id`. **200**, JSON: `{"data":{"id":"2026-11","year":2026,"month":11,"startDate":"2026-11-01","endDate":"2026-11-30","status":"active"}}`. |
| Получить конверты периода | `/api/v1/periods/{id}/envelopes` | GET | Path: `id`; query: `limit`, `offset`. **200**, JSON: `{"data":[{"id":"2026-11:food","periodId":"2026-11","categoryId":"food","limitAmount":3000000,"carryOverAmount":0,"spent":45000,"remaining":2955000,"status":"ok"}],"pagination":{"limit":50,"offset":0,"total":1}}`. Остатки на конец периода, включая запланированные операции этого периода. |
| Получить конверт категории | `/api/v1/periods/{id}/envelopes/{categoryId}` | GET | Path: `id`, `categoryId`. **200**, JSON: `{"data":{"id":"2026-11:food","periodId":"2026-11","categoryId":"food","limitAmount":3000000,"carryOverAmount":0,"spent":45000,"remaining":2955000,"status":"ok"}}`; отсутствующий конверт — **404**. |
| Задать лимит конверта | `/api/v1/periods/{id}/envelopes/{categoryId}` | PUT | Path: `id`, `categoryId`; JSON: `{"limitAmount":3000000}`. Полностью заменяет настраиваемый план; перенос и расход вычисляет сервер. **201** и `Location` при создании, **200** при обновлении; JSON: `{"data":{"id":"2026-11:food","periodId":"2026-11","categoryId":"food","limitAmount":3000000,"carryOverAmount":0,"spent":45000,"remaining":2955000,"status":"ok"}}`. |
| Получить принятые решения периода | `/api/v1/periods/{id}/closures` | GET | Path: `id`; query: `limit`, `offset`. **200**, JSON: `{"data":[{"envelopeId":"2026-11:food","decision":"carry_over","leftoverAmount":600000,"goalId":null}],"pagination":{"limit":50,"offset":0,"total":1}}`. Решения сортируются по `envelopeId`. |
| Получить решение по конверту | `/api/v1/periods/{id}/closures/{envelopeId}` | GET | Path: `id`, `envelopeId`. **200**, JSON: `{"data":{"envelopeId":"2026-11:food","decision":"carry_over","leftoverAmount":600000,"goalId":null}}`; до принятия решения — **404**. |
| Зафиксировать решение по остатку | `/api/v1/periods/{id}/closures` | POST | Path: `id`; JSON: `{"envelopeId":"2026-11:food","decision":"carry_over","goalId":null}`. **201**, `Location` на решение; точный повтор — **200**, другое решение — **409**. JSON: `{"data":{"envelopeId":"2026-11:food","decision":"carry_over","leftoverAmount":600000,"goalId":null}}`. |
| Создать операцию | `/api/v1/transactions` | POST | JSON: `{"type":"expense","amount":45000,"date":"2026-11-07","categoryId":"food","comment":"Обед"}`. Обязательные связи для других типов — ниже. **201**, `Location`, JSON: `{"data":{"id":"tx-1","type":"expense","amount":45000,"date":"2026-11-07","categoryId":"food","periodId":"2026-11","goalId":null,"incomeSourceId":null,"obligationId":null,"comment":"Обед","createdAt":1794013200000,"deletedAt":null}}`. |
| Получить историю операций | `/api/v1/transactions` | GET | Query: `limit`, `offset`, необязательные `periodId`, `categoryId`, `type`, `q`, `includeDeleted=false`. **200**, JSON: `{"data":[{"id":"tx-1","type":"expense","amount":45000,"date":"2026-11-07","categoryId":"food","periodId":"2026-11","goalId":null,"incomeSourceId":null,"obligationId":null,"comment":"Обед","createdAt":1794013200000,"deletedAt":null}],"pagination":{"limit":50,"offset":0,"total":1}}`. |
| Получить операцию | `/api/v1/transactions/{id}` | GET | Path: `id`. **200**, JSON: `{"data":{"id":"tx-1","type":"expense","amount":45000,"date":"2026-11-07","categoryId":"food","periodId":"2026-11","goalId":null,"incomeSourceId":null,"obligationId":null,"comment":"Обед","createdAt":1794013200000,"deletedAt":null}}`. Для удалённой операции возвращается timestamp `deletedAt`. |
| Изменить или восстановить операцию | `/api/v1/transactions/{id}` | PATCH | Path: `id`; JSON: `{"amount":50000}` (также date/связи/comment), либо отдельный `{"deletedAt":null}` для восстановления. **200**, JSON: `{"data":{"id":"tx-1","type":"expense","amount":50000,"date":"2026-11-07","categoryId":"food","periodId":"2026-11","goalId":null,"incomeSourceId":null,"obligationId":null,"comment":"Обед","createdAt":1794013200000,"deletedAt":null}}`. При восстановлении возвращается исходная сумма и `deletedAt: null`. |
| Удалить операцию | `/api/v1/transactions/{id}` | DELETE | Path: `id`. Тело отсутствует. Мягкое удаление; повтор допустим. **204**, тело пустое. Закрытая история или отрицательные накопления после удаления — **409/422** соответственно. |
| Получить сводку бюджета | `/api/v1/dashboard` | GET | Query: обязательная `date=2026-11-07`. **200**, JSON: `{"data":{"balance":8455000,"reserved":5000000,"available":3455000,"nextIncomeDate":"2026-11-20","daysLeft":13,"dailyLimit":265769,"envelopes":[{"id":"2026-11:food","periodId":"2026-11","categoryId":"food","limitAmount":3000000,"carryOverAmount":0,"spent":45000,"remaining":2955000,"status":"ok"}]}}`. Конверты на дату запроса; будущие операции исключены. |
| Получить прогресс цели | `/api/v1/goals/{id}/progress` | GET | Path: `id`; query: обязательная `date=2026-11-07`. **200**, JSON: `{"data":{"saved":3000000,"remaining":7000000,"perMonth":null,"status":"active"}}`. |
| Получить отчёт по категориям | `/api/v1/reports/categories` | GET | Query: обязательный `periodId=2026-11`. **200**, JSON: `{"data":{"periodId":"2026-11","totalExpense":45000,"categories":[{"categoryId":"food","amount":45000,"shareBasisPoints":10000,"previousAmount":50000,"changeBasisPoints":-1000,"children":[]}]}}`. Доля/изменение в сотых процента; сравнение с предыдущим месяцем, при отсутствии базы изменение null. Отчёт содержит все даты выбранного периода. |
| Получить настройки | `/api/v1/settings` | GET | Параметров и тела нет. **200**, JSON: `{"data":{"onboardingCompletedAt":null,"theme":"system","dailyReminderEnabled":false,"dailyReminderTime":"20:00","payoutReminderEnabled":false,"lastOpenedPeriodId":null}}`. |
| Изменить настройки | `/api/v1/settings` | PATCH | JSON: `{"theme":"dark"}`; остальные допустимые поля и значения — ниже. **200**, JSON: `{"data":{"onboardingCompletedAt":null,"theme":"dark","dailyReminderEnabled":false,"dailyReminderTime":"20:00","payoutReminderEnabled":false,"lastOpenedPeriodId":null}}`. |
| Получить снимок для экспорта | `/api/v1/snapshots/current` | GET | Параметров и тела нет. **200**, JSON: `{"schemaVersion":1,"incomeSources":[],"obligations":[],"categories":[],"periods":[],"envelopes":[],"periodClosures":[],"transactions":[],"goals":[],"settings":{"onboardingCompletedAt":null,"theme":"system","dailyReminderEnabled":false,"dailyReminderTime":"20:00","payoutReminderEnabled":false,"lastOpenedPeriodId":null}}` — пример пустого бюджета до первичной настройки. Этот маршрут возвращает снимок напрямую, без обёртки data. |
| Заменить бюджет снимком | `/api/v1/snapshots/current` | PUT | JSON в точном формате предыдущей строки (`schemaVersion`, все массивы и `settings`). Полная атомарная замена после проверки; не объединение. **200**, JSON: `{"data":{"counts":{"incomeSources":0,"obligations":0,"categories":0,"periods":0,"envelopes":0,"periodClosures":0,"transactions":0,"goals":0}}}`. Ошибка не меняет прежний бюджет. |
| Сбросить бюджет | `/api/v1/budget` | DELETE | Параметров и тела нет. Удаляет все данные и возвращает настройки к значениям по умолчанию. **204**, тело пустое; повтор допустим. Клиент запрашивает явное подтверждение пользователя перед отправкой. |

### Справочники

Для каждого ресурса ниже: `GET /resource`, `POST /resource`, `GET /resource/{id}`,
`PATCH /resource/{id}`. Физическое удаление не предусмотрено: история должна сохраняться.

| Ресурс | Обязательные поля POST | Необязательные поля / значения по умолчанию |
|---|---|---|
| `/categories` | `name`, `kind`: `expense` или `income` | `parentId: null`, `icon: ""`, `color: "#34a06a"`, `isArchived: false`, `sortOrder: 0` |
| `/income-sources` | `name`, `amount`, `schedule` | `dayOfMonth: null`, `isActive: true`, `sortOrder: 0` |
| `/obligations` | `name`, `amount`, `dayOfMonth` | `categoryId: null`, `isActive: true`, `sortOrder: 0` |
| `/goals` | `name`, `targetAmount` | `targetDate: null`, `icon: ""`, `color: "#34a06a"`, `status: "active"`, `sortOrder: 0` |

`name`: 1–100 символов после trim. `icon`: до 16 символов; `color`: `#RRGGBB`.
`sortOrder`: неотрицательное целое. `dayOfMonth`: 1–31.
`schedule`: `monthly_day`, `monthly_last_day`, `irregular`; день обязателен
только для `monthly_day`, для остальных — `null`. В коротком месяце 29–31 число
сдвигается на последний день. Неактивные/нерегулярные доходы не участвуют в прогнозе.
`targetAmount` и суммы обязательств/доходов строго положительные.
Отображаемый `completed` определяется достижением цели; через PATCH клиент может
переключать только `active`/`archived`, а `completed` нельзя назначить без достижения суммы.
Статус цели: `active`, `completed`, `archived`; вычисляемый прогресс отдаётся отдельно.

Категории имеют не больше двух уровней; родитель того же `kind`. Нельзя создавать
циклы, архивировать родителя с активными детьми или менять `kind`/`parentId` категории,
уже использованной в операциях/конвертах. Архивные категории остаются в истории,
но недоступны для новых операций. Категория «Прочее» создаётся при инициализации
как расходная, её архивация запрещена. Обязательство ссылается на расходную категорию.

### Периоды и конверты

Период: `id`, `year`, `month`, `startDate`, `endDate`, `status`.
Конверт: `id`, `periodId`, `categoryId`, `limitAmount`, `carryOverAmount` и вычисленные
`spent`, `remaining`, `status` (`ok`, `warning`, `over`). Сервер проверяет,
что `categoryId` принадлежит расходной действующей категории.

`POST /periods` создаёт пропущенные месяцы по порядку, копируя лимиты, но не переносы.
Законченные месяцы получают `pending_review`; месяцы без конвертов сразу `closed`.
Первый вызов задаёт начало учёта. Создание более раннего месяца отклоняется.
Повторный вызов не создаёт дубликаты. Вызов для существующего периода его не открывает заново.

Запрос закрытия:

```json
{"envelopeId": "2026-11:food", "decision": "carry_over", "goalId": null}
```

Ответ:

```json
{"data": {"envelopeId": "2026-11:food", "decision": "carry_over", "leftoverAmount": 600000, "goalId": null}}
```

Решения: `burn`, `carry_over`, `to_goal`. `goalId` обязателен только для `to_goal`.
Остаток вычисляет сервер. Перевести в цель можно только положительный остаток.
Закрываются только `pending_review`, от старого к новому. После первого решения
операции этого периода замораживаются, после последнего — период `closed`.
Лимит закрытого конверта менять нельзя. Повтор решения с теми же параметрами не
создаёт денежный эффект; с другими параметрами — 409.

**Правило для ревью:** у пересекающихся конвертов родителя и ребёнка только один
может иметь `carry_over`/`to_goal`; второй закрывается через `burn`. Это предотвращает
двойное распределение бюджета. Более гибкое распределение требует отдельного решения.
Производную операцию `to_goal` нельзя самостоятельно удалить или отредактировать.

### Операции

Создание:

```json
{"type": "expense", "amount": 45000, "date": "2026-11-07", "categoryId": "food", "comment": "Обед"}
```

Обязательны `type`, `amount`, `date`. Типы: `expense`, `income`, `goal_deposit`,
`goal_withdrawal`. Для дохода/расхода обязательна категория соответствующего вида;
для накоплений — `goalId`. Другие необязательные связи по умолчанию `null`:
`incomeSourceId` допустим только для дохода, `obligationId` только для расхода,
`goalId` только для накоплений. `comment` по умолчанию `""`, до 500 символов.
Все связанные сущности должны существовать. `periodId` сервер выводит из даты;
период должен быть предварительно создан, закрытый период менять нельзя.
В ответ добавляются `id`, `periodId`, `createdAt`, `deletedAt` (`null` до удаления).

Фильтры списка: `periodId`, `categoryId`, `type`, `q` (подстрока комментария),
`includeDeleted` (`false` по умолчанию). Фильтр категории включает её подкатегории.
Будущие операции разрешены, но до указанной даты не меняют фактические остатки.
Удалённые операции не участвуют в расчётах. При изменении даты обновляется `periodId`;
проверяются как старый, так и новый период. Поле `type` после создания неизменно.

Сумма накоплений цели не должна становиться отрицательной ни на одну дату,
включая изменение истории и удаление пополнения. Внутри календарного дня движения
неттируются: более точное время операции в текущей модели не задано.
Только PATCH с `deletedAt: null` восстанавливает удалённую операцию; обычный PATCH
удалённой операции возвращает 409. Восстановление уже активной операции возвращает
200 без изменений. Восстановление в закрытый период запрещено.

Обычный повтор POST не считается повтором той же операции: UI блокирует повторное
нажатие, а автоматический повтор POST после неопределённого сетевого сбоя запрещён.
Идемпотентность специально определена только для закрытия конверта и создания периодов.

### Сводки, настройки и обмен данными

Настройки: `onboardingCompletedAt` (timestamp/null), `theme` (system/light/dark),
`dailyReminderEnabled` (bool), `dailyReminderTime` (`HH:MM`),
`payoutReminderEnabled` (bool), `lastOpenedPeriodId` (string/null).
Дефолты: null/system/false/20:00/false/null. Настройки уведомлений — для будущих клиентов;
сервер не создаёт локальные уведомления устройства.

Снимок экспорта: ключи `incomeSources`, `obligations`, `categories`, `periods`,
`envelopes`, `periodClosures`, `transactions`, `goals`, `settings`.
ID в импортируемом снимке сохраняются. Проверяются версия, типы, уникальность,
ссылки, хронология накоплений, решения о закрытии и соответствующие эффекты.
При любой ошибке импорта прежние данные целиком сохраняются. Деструктивность замены
должна быть явно показана будущим интерфейсом до отправки запроса.

Баланс на дашборде следует исходной модели: движения текущего календарного периода,
с исключением будущих и удалённых операций. Дневной лимит округляется вниз до копейки;
дней до выплаты 0 — доступная сумма целиком. При отсутствии выплат горизонт — конец месяца.
Свободный баланс может быть отрицательным. Перенос лимита конверта не является доходом.

### Граница реализации

На чек-поинте 2 реализованы классы, расчёты и основные сценарии бюджета в памяти;
эта спецификация описывает также последующие серверные CRUD, фильтры, настройки и импорт.
Наличие маршрута в документе не означает, что он уже доступен.
На ревью направляется PR `apispec` → `master`; слияние выполняется только после
обратной связи преподавателя. Swagger/OpenAPI — необязательное задание на +5 баллов,
текущий комплект использует предусмотренный заданием табличный формат.
На этапе 7 пишутся запросы/тесты по прошедшему ревью контракту, на этапе 8 — сервер,
на этапе 9 — хранилище MongoDB. Контракт может корректироваться по результатам ревью.


## Комплект для сдачи

- [Концепция, устройство проекта и план развития](PROJECT.md).
- Таблица API находится непосредственно в этом README, как требует задание.
- Участники: Рогаткин Руслан, Тимченко Руслан. Роли, формат и объём участия
  каждого необходимо дополнить перед сдачей по фактическому распределению работы.
- [Pull request для ревью](https://github.com/tru3ty/SaveMoney_app/pull/1).
- [Результаты CI](https://github.com/tru3ty/SaveMoney_app/actions).

Общая папка должна открываться в режиме просмотра всем, у кого есть ссылка.
В неё помещаются концепция, план и ссылка на открытый PR `apispec` → `master`.
Ссылку на папку в личном кабинете Нетологии оставляет один участник команды.
