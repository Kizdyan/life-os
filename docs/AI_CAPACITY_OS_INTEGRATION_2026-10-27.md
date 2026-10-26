# AI Capacity OS — интеграционный реестр от 27.10.2026

Цель: внедрение применимых методов из 8 видео и 5 Instagram-слайдов в **существующие** Life OS / Erika / Persona / DIVE M+ без дублирования ядра.

## Подтверждённый baseline по коду
- `skills.ts`: существующий SkillRegistry.
- `reference-evidence.ts`: оценки достоверности и запрет превращать недоказанные советы в автоматические правила.
- `media-jobs.ts` / `media-orchestrator.ts` / `media-supervisor.ts`: очередь, ingestion, bounded work cycles.
- `content-factory.ts` / `media-pipeline.ts`: подготовка контента и контроль перед публикацией.
- `media-review.ts`, `style-memory.ts`, `media-analytics.ts`: обратная связь, стиль, метрики.
- `docs/AUTONOMY.md`: AUTO / AUTO_REPORT / APPROVAL. Ни код, ни промпт не отменяют утверждение пользователя для чувствительных внешних эффектов.

## Матрица изученного
| Материал | Реализуемая возможность | Что дальше | Статус |
|---|---|---|---|
| Видео 1 | Семантические вставки, монтаж речи, B-roll | FFmpeg / Remotion pilot | RESEARCH |
| Видео 2 | Самоанализ, повторяющиеся паттерны | аналитика Life OS, источники и степень уверенности | RESEARCH |
| Видео 3 | Текст за человеком, маски, цвет, звук | тест с сохранением оригинала и QA | RESEARCH |
| Видео 4 | OmniRoute / Claude-Mem / Headroom | privacy + benchmark + optional adapters | RESEARCH |
| Видео 5 | Context7, Chrome DevTools, GitHub, Supabase, Figma | capability discovery, least privilege, браузерный QA | RESEARCH |
| Видео 6 | Freebuff | публичный sandbox, лимиты/условия данных | RESEARCH |
| Видео 7 | Каталог Claude Skills | discover → security scan → pilot → measured registry | RESEARCH |
| Видео 8 | Shorts workflow + ElevenLabs | лицензия, синтез речи, рендер, QA, черновик | RESEARCH |
| 5 скриншотов | Benefit / shareable / reference remix / expert comments / CTA | A/B тест и измерение shares, saves, follows | RESEARCH |

## В этом PR: работающий базовый срез
`packages/core/src/ai-capacity-routing.ts` добавляет независимый от провайдера алгоритм кандидатов. Он выбирает по реальному benchmark, необходимым инструментам, privacy clearance, качеству, надёжности, цене и наблюдаемой задержке. Провайдер не участвует в выборе без проверенного подключения; отсутствие проверки стоимости или превышение бюджета блокируют выбор. Высокорисковые действия только в состоянии `approval_required`. Типизированный тестовый контракт — в `ai-capacity-routing.test.ts`. Модуль **не выполняет задачи** и не подключает модели: адаптеры и production orchestration будут отдельно проверены.

## Порядок внедрения
1. **P0** ROUTING: typecheck + unit tests; добавить каталог фактически доступных провайдеров и проверенные бенчмарки (никаких искусственных статусов VERIFIED).
2. **P1** SKILLS: расширить текущий `SkillRegistry` и `reference-evidence` цепочкой происхождение → версия → лицензия → security scan → ограниченные права → sandbox.
3. **P2** MEDIA: через существующий `ContentFactory` выполнить один настоящий пилот: транскрипт → монтаж → графика → титры → звук/цвет → QA → превью. Не публиковать без approval.
4. **P3** MCP: провести проверки существующих GitHub/Supabase; подключать Context7 / Chrome DevTools / Figma только когда подтверждены полномочия, среда и задача.
5. **P4** MEMORY: сравнить Claude-Mem / Headroom / OmniRoute на обезличенном наборе по точности, токенам, задержке, стоимости и privacy. Life OS остаётся источником истины.
6. **P5** SHORTS: н8n/другой event workflow с лицензированными ассетами, авторизованным голосом ElevenLabs; черновик, автоматические технические проверки и человеческое ревью.
7. **P6** GROWTH: тесты позиционирования, пересылаемых сценариев, анализа референсов, осмысленных комментариев и CTA. Измерять реальные metrics вместо обещаний алгоритма.
8. **P7** FREEBUFF: только открытый учебный проект до отдельной проверки условий и одобрения для приватных данных.

## QA и права
- Каждый результат: исходный hash, выходной hash, измеримые артефакты, лог, заявленный vs наблюдаемый результат, возможность отката.
- Видео: fps/resolution/audio loudness, субтитры и sync, артефакты масок, сохранение лица/очков/кожи/цветовой гаммы, происхождение лицензий. Фото без генерации лица.
- Не ставить сторонние навыки без аудита на скрытые команды, эксфильтрацию, dependency risks, сетевые запросы.
- Не отправлять приватные данные, историю ребёнка, здоровье, финансы или секреты в ad-funded/непроверенные сервисы.
- Публичные публикации, комментарии, траты, ключи, миграции и удаление — APPROVAL-level.
- Никаких заявлений «DEPLOYED», если есть только код, документ, issue или PR; завершение требует реального OBSERVER и тестового эффекта.

## Первоисточники кандидатов
- Skills CLI: https://github.com/vercel-labs/skills
- Freebuff: https://github.com/CodebuffAI/freebuff (обязательно privacy review)
- OmniRoute: https://github.com/arnoldwender/omniroute
- Пример Shorts-конвейера: https://n8n.io/workflows/16419-generate-youtube-shorts-from-prompts-with-openai-elevenlabs-and-pexels/

## Текущая реализация P1/P2 (27.10.2026)
- `skill-admission.ts`: доказательное разрешение сторонних Skills по конкретному HTTPS-источнику, неизменяемому commit SHA, digest SHA-256, лицензии, проверке исходников, разрешённым tool scopes, персональным данным и результатам sandbox-тестов. Только после human approval локальная реализация может войти через `registerAuditedSkill`. Это **барьер регистрации**, не самостоятельный установщик и не сканер, который гарантирует безопасность. Старый `SkillRegistry.register` для доверенных внутренних Skills остаётся доступным; сторонние интеграции обязаны использовать защищённый путь.
- `media-export-qa.ts`: отдельный fail-closed assessment результата рендера; проверяет evidence хеша и медиаметрик, вертикальность 9:16, качество звука, синхронизацию субтитров, ошибки кадра/рендера, сохранность личности, палитры и права на ассеты. Без наблюдений статус `review_required`, при нарушениях — `fail`. **Не подключён к уже существующему пути публикации**: до запуска автоматического экспорта нужно включить блокировку публикации по этому результату и проверить в интеграционных тестах.

### Текущие внешние условия
- `skills.sh` публикует CLI `npx skills find` и `npx skills add` (см. https://www.skills.sh/docs/cli), но сам предупреждает: качество и безопасность навыков не гарантируются. CLI собирает анонимную телеметрию по умолчанию; для отключения предусмотрен `DISABLE_TELEMETRY=1`. До установки смотри исходники и лицензии.
- `Freebuff` — исследовательский кандидат, **не разрешён для приватных репозиториев**: его README описывает функции с возможным использованием контента для обучения ИИ и рекламных моделей. Источник: https://github.com/CodebuffAI/freebuff . Тест — только на отдельно созданном публичном demo без персональных данных и секретов.
- Нет реального подключения Claude/ElevenLabs/Freebuff через эти модули; нет подтверждённого сквозного video render pipeline.
- GitHub Actions web/core/Media Brain CI на PR #108 показывают failure; попытка получить job logs через GitHub API дала `BlobNotFound`. Vercel статусы выдают `build-rate-limit`. Причина CI не подтверждена; PR остаётся draft, merge запрещён до зелёного независимого QA.

### Что требуется для acceptance
1. Полноценный `npm test && npm run typecheck && npm run web:build` на реальном репозитории и воспроизводимая CI.
2. Один Skill с реальным immutable commit/digest, source scan, лицензией и sandbox-бенчмарком (без ввода секретов).
3. Один Persona MP4 с реальным ffprobe/аудио/subtitle evidence, проверкой лица человеком и тестом запрета публикации при fail.
4. Подтверждённые provider adapters с реальными credentials/cost limits и audit trails до заявлений о работающем автономном цикле.
