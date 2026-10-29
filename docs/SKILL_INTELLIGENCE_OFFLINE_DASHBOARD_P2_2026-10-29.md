# Skill Intelligence P2C — офлайн-обзор Skills и проверка локальных агентов

Дата: 29 октября 2026 г. Продолжает PR #123 (batch search → queue → pinned source review); не меняет Persona P2.

## Что реализовано

- `scripts/skill-review-dashboard.mjs` — формирует **самостоятельный HTML-файл** из JSON-очереди, созданной `skills:queue`. Адаптивная мобильная карточная панель, индикаторы найденных направлений и ссылки на канонические GitHub/skills.sh.
- Весь HTML **статический и не содержит JavaScript**. Включены Content Security Policy, экранирование всех текстов и строгая проверка доменов ссылок. Ни одна строка из внешнего каталога не используется как HTML-код или исполняемый скрипт. Открытие HTML само по себе не вызывает API и не отправляет файлов.
- `scripts/skill-agent-local-audit.mjs` — читает только проектные `.agents/skills/life-os-skill-discovery/SKILL.md` и `.claude/skills/life-os-skill-discovery/SKILL.md` в выбранном checkout, запрещает симлинки в пути, сверяет frontmatter, SHA-256 и равенство содержимого.
- Он сознательно возвращает `authorization: unverified`, `runtimeLoaded: false`, `executionVerified: false`, даже если обе копии присутствуют. **Наличие SKILL.md не доказывает, что Codex или Claude авторизованы, загрузили навык или могут его выполнять.**
- Тесты `scripts/skill-review-dashboard.test.mjs`, `scripts/skill-agent-local-audit.test.mjs` охватывают XSS, подделку статусов, несоответствие ссылок, испорченные манифесты, симлинки и отсутствие Claude.

## Как запустить в checkout этой ветки

Если уже существует JSON очереди после `skills:batch` и `skills:queue`, всё ниже выполняется **без интернета и без API-токенов**:

```powershell
npm run skills:dashboard -- "$env:TEMP\life-os-skills-queue.json" "$env:TEMP\life-os-skills-review.html"
npm run skills:agents -- .
npm run skills:offline:test
```

Файл `life-os-skills-review.html` открывается в любом современном браузере (в том числе после передачи файла на iPhone). Вы можете переходить по ссылкам на первоисточники, но сам просмотр **не запускает** сторонние Skills и не утверждает, что они безопасны.

Команда HTML-экспорта пишет только в **новый файл** (флаг `wx`), никогда не перезаписывает существующий отчёт.

Вся сквозная последовательность для среды с валидным Vercel OIDC:

```powershell
npm run skills:batch -- --out "$env:TEMP\life-os-skills-batch.json"
npm run skills:queue -- "$env:TEMP\life-os-skills-batch.json" --out "$env:TEMP\life-os-skills-queue.json"
npm run skills:dashboard -- "$env:TEMP\life-os-skills-queue.json" "$env:TEMP\life-os-skills-review.html"
```

**Не отправляйте приватные данные в поисковых запросах.** Требования авторизации skills.sh: https://skills.sh/docs/api. В этой задаче не генерировался и не использовался Vercel OIDC-токен, поэтому живой сетевой поиск не подтверждён.

## Что означает статус

| Статус | Смысл |
|---|---|
| `discovery_only` | Только информация каталога, допуск не выдан |
| `matching_local_manifests` | Одинаковые SKILL.md доступны локально, но авторизация и исполнение не проверены |
| `not_ready` | Локальные файлы отсутствуют, изменены или небезопасны |
| `manual_review_required` | Исходники проверены по Git, но ещё требуется решение человека |

Нет статусов `approved`, `installed` или `verifiedWorking` на основании одних только данных каталога.

## Проверено и не проверено

- Изолированное исполнение **точных чистых функций с опубликованного GitHub blob**: HTML-валидация и экранирование, 18 проверок PASS; реальные операции файловой системы CLI не исполнялись в этой проверке.
- Изолированные проверки логики агента на контролируемой имитации файловой системы: 5 сценариев PASS. Это не проверка реальных авторизаций Codex/Claude и не запуск Node-test CLI.
- Подлинные GitHub-файлы `.agents/...` и `.claude/...` сопоставлены по Git blob SHA: совпадают.
- Новые файлы тестов добавлены, но точный `node --test` на полном checkout, `npm test`, `npm run typecheck`, `npm run web:build` и GitHub CI **ещё требуют подтверждения**.
- Не было реальной установки сторонних Skills, merge, production deploy, изменения Supabase или передачи пользовательских медиа.

## Дальнейшая приёмка

1. Получить эту ветку в полноценном checkout Windows.
2. Выполнить `npm run skills:offline:test` и `npm run qa:local`, затем полные typecheck/build/CI.
3. Проверить HTML в браузере и проектный манифест в реальных сессиях Codex/Claude.
4. После отдельного человеческого допуска взять один закреплённый Skill и испытать на синтетической задаче.
5. Отдельно решить вопрос авторизации Anthropic (OAuth) и Vercel OIDC. Эти учётные действия не выполняются через данный PR.

Состояние: **DRAFT / НЕ ГОТОВО К MERGE**.
