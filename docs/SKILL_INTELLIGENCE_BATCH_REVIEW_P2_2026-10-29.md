# Skill Intelligence P2B — каталог → очередь → source-review (29.10.2026)

Дочернее продолжение P2 Find Skills (PR #122) и существующей системы допуска P1 (PR #121).
Новые инструменты **не устанавливают сторонние Skills и не запускают их инструкции**.

## Что реализовано

1. **Пакетный поиск по восьми направлениям**: Persona video, субтитры, фото/дизайн, React/TypeScript, Playwright, оркестрация агентов, голос Erika, PostgreSQL. \`scripts/skill-catalog-batch.mjs\` вызывает существующий защищённый \`skills.sh\` клиент **последовательно**, максимум 12 поисковых тем и 25 результатов на тему. Используются только заранее заданные обезличенные поисковые запросы.
2. **Офлайновая очередь допуска**: \`scripts/skill-review-queue.mjs\` проверяет JSON каждой темы, отклоняет поддельные домены/ID и статусы \`installed\`/\`approved\`, объединяет дубликаты, учитывает число совпавших направлений и лишь с небольшим весом — заявленную популярность. Выводится shortlist \`discovery_only\`.
3. **Пакет независимой проверки источника**: \`scripts/skill-source-review-packet.mjs\` вызывает *существующий* \`verifySkillCheckout()\` из P1 и требует совпадения полного локального Git-дерева с закреплённым SHA коммита, включая содержимое всех файлов. Пакет выводит файлы, хеши, находки, чек-лист и статус \`blocked\` или \`manual_review_required\`. Никаких \`approved\` или \`installed\` автоматически.
4. **Реальные JSON-файлы на Windows**: \`--out\` сохраняет UTF-8 с \`flag: wx\`, без перезаписи существующего отчёта; обход проблем кодировки PowerShell при перенаправлении вывода.

## Использование

В среде с Vercel OIDC (официальная документация: https://skills.sh/docs/api), когда переменная \`VERCEL_OIDC_TOKEN\` уже доступна процессу и сетевой доступ разрешён:

\`\`\`powershell
npm run skills:batch -- --out "$env:TEMP\life-os-skills-batch.json"
npm run skills:queue -- "$env:TEMP\life-os-skills-batch.json" --out "$env:TEMP\life-os-skills-queue.json"
\`\`\`

**Не передавайте токен в чат, Git, CLI-аргументы или логи.** При отсутствии Vercel OIDC пакетный онлайн-поиск завершится отказом; **не считайте его работающим**. Офлайновая очередь сможет обработать ранее полученный подлинный JSON-отчёт без авторизации. Протокол очереди не доказывает подлинность файлов: он сбрасывает любые заявления об одобрении и запрещает установку.

Чтобы сформировать проверочный пакет для *ранее полученного доверенным способом локального Git checkout*, где HEAD равен закреплённому коммиту:

\`\`\`powershell
npm run skills:review-source -- "C:\path\to\already-verified-skills-repository" skills/find-skills 699d35b21bd3c97dbc0edeae062b2698898bb2e5 "$env:TEMP\find-skills-review.json"
\`\`\`

Пример **не скачивает** репозиторий. Настоящий checkout, источник, лицензия и идентичность издателя должны быть независимо проверены. Ревизия взята из seed-реестра P1 и может устареть; код никогда не переключает checkout на неё автоматически.

## Дальнейший допуск

\`DISCOVERY_ONLY → PINNED_SOURCE_VERIFICATION → STATIC_REVIEW → MANUAL_APPROVAL → SANDBOX_BENCHMARK → PER_AGENT_RUNTIME_TEST\`.

Внешний \`vercel-labs/skills/skills/find-skills/SKILL.md\` при закреплённой ревизии содержит пример \`npx skills add ... -g -y\`, который существующий инспектор классифицирует как требующий ручной проверки. Он **не переносится** автоматически в проектные Skills.

Для Codex и Claude уже подготовлен отдельный **собственный** project-local \`life-os-skill-discovery\` из PR #122. Нужно получить обновлённую ветку и проверить фактическую загрузку Skill агентом. Claude Code по последнему известному статусу ожидал OAuth. ChatGPT подключает Skills/Plugins отдельно; наличие этих файлов не означает установки в ChatGPT.

## Команды тестирования

\`\`\`bash
npm run skills:batch:test
npm run qa:local
npm test
npm run typecheck
npm run web:build
\`\`\`

Фактически выполнено локально на Node.js 22.16: **18/18 изолированных Node-тестов P2B PASS** (5 batch, 7 queue, 4 review packet, 2 реальных CLI-теста). Шесть основных файлов и unit-тестов, а также CLI-тест проверены на совпадение Git blob SHA с локальным содержимым. В локальном наборе \`skill-catalog-find.mjs\` и \`skill-source-verify-git.mjs\` использовались заглушки, поскольку проверялись только pure/offline функции без сетевого и Git-подключения; **это не подтверждает полный интеграционный тест настоящего API или Git-verifier**. \`npm test\`, typecheck, сборка, фактический запуск Codex/Claude с новым Skill и полный CI на exact head ещё не подтверждены.

Нет автоматической установки, доступа к приватным медиа, изменения production/Supabase, merge или внешних платных вызовов. Держать PR в Draft до независимой проверки.
