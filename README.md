# SaveMoney

Учебное приложение для личного бюджета по методу конвертов.

- [Сервер и REST API](app/backend/README.md) — Python 3.13, MongoDB, OpenAPI.
- `app/frontend` — мобильный интерфейс на React, TypeScript и Vite.
- [Архитектура](PROJECT.md) и [третий чек-поинт](CHECKPOINT3.md).

## Локальный запуск

Инструкции по установке Python-зависимостей и запуску MongoDB находятся
в [README сервера](app/backend/README.md).

Для фронтенда из корня репозитория:

```sh
cd app/frontend
bun install --frozen-lockfile
bun run dev
```

Проверки и сборка обоих приложений из корня: `sh scripts/check.sh`.
