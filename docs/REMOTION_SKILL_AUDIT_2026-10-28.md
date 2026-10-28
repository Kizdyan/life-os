# Remotion Agent Skills — P1 source audit, 28 October 2026

## Источник и проверенный масштаб
- Документированный standalone-источник: `https://github.com/remotion-dev/skills`.
- Зафиксированная ревизия: `30d4553ecd46fbc5212fd0ff006ae43af522158b`.
- Установочный пакет внутри репозитория: `skills/remotion-best-practices`.
- По Git tree этой ревизии: **144 blob-файла / 1 183 282 байта**, без submodule и git-symlink в составе пакета.
- Состав: 88 md, 13 yaml, 13 svg, 10 tsx, 8 json, 6 ts, 2 geojson, 4 mjs.
- **20 файлов программного кода**; 10 файлов в `remotion-markup/remotion-maps/**` побайтово идентичны парным файлам в `remotion-maps/**` по Git blob SHA-1. Это не означает, что оставшиеся файлы проверены автоматически.
- Основные внутренние маршруты из `SKILL.md` в `remotion-create/REFERENCE.md`, `remotion-render/REFERENCE.md`, `remotion-captions/REFERENCE.md` существуют. **Полная проверка всех 88 Markdown-файлов/локальных ссылок ещё не завершена.**

## Подтверждённые интересующие места исходников (чтение, без исполнения)

| Файл/действие | Факт из исходника | Требуемый контроль |
| --- | --- | --- |
| `remotion-maps/techniques/cesium/assets/CesiumFlythrough.tsx` | Использует `process.env.REMOTION_MAPTILER_KEY`, `process.env.REMOTION_GOOGLE_MAPS_API_KEY` и URL `api.maptiler.com` / `tile.googleapis.com` | Отдельная оценка работы с внешними сервисами, бюджетом, API-ключами и данными медиа |
| `remotion-maps/techniques/maptiler/assets/MapTilerVectorElement.ts` | Конструирует MapTiler tiles URL с параметром `key` | Проверка сетевой политики и управления ключами |
| `remotion-maps/techniques/maptiler/assets/RiverReveal.tsx` | Присваивает MapTiler SDK API-ключ из переменной окружения | Разрешать только явным allowlist и в изолированном окружении |
| `remotion-maps/techniques/cesium/scripts/prep-cesium-path.mjs` | Читает входной GeoJSON, создаёт директорию и пишет файл JSON; вход/выход могут задаваться CLI-аргументами | Отключить произвольный доступ к файловой системе до независимого review |
| `remotion-maps/techniques/maptiler/scripts/prep-geo.mjs` | Читает GeoJSON, создаёт каталоги и записывает несколько JSON | Проверить реальные пути записи, выполнять только в изолированном scratch-каталоге после допуска |

**Важно:** обращения к `process.env` и стандартным адресам API сами по себе не доказывают злонамеренность. Но такие примеры нельзя автоматически запускать с реальными API-ключами или частными роликами. Анализ ограничен указанными файлами и отдельной проверкой дерева; это не завершённый независимый аудит всего пакета.

## Новая воспроизводимая команда

Для *заранее полученного доверенным способом* локального Git checkout с HEAD ровно `30d4553ecd46fbc5212fd0ff006ae43af522158b`:

```bash
npm run skills:review-remotion -- /absolute/path/to/remotion-dev-skills /tmp/remotion-review.json
node --test scripts/remotion-skill-review.test.mjs
```

`scripts/remotion-skill-review.mjs` вызывает `verifySkillCheckout()` и проверяет:
- точный Git revision и SHA файлов по `git ls-tree`;
- размер, количество и типы файлов;
- оба SHA-256, полученные при чтении локального каталога;
- отсутствующие ссылки, опасные конструкции и явные операции с сетью/секретами/файлами;
- отдельный список `review` и `block` для проверяющего.

Отчёт `manual_review_required` **не является** разрешением на установку; `blocked` означает, что существует непройденная техническая проверка. Поля `reviewerApproved`, `mayInstallAutomatically`, `mayExecuteAutomatically`, `mayPublishAutomatically` всегда `false`. Пользовательские материалы, токены, production базы и соцсети не затрагиваются. Запись JSON производится только при переданном пути и с `wx` (не перезаписывать существующий файл).

**Контроль лицензии:** условия библиотеки Remotion зависят от типа юридического лица и использования. Лицензия конкретного `remotion-dev/skills` и право переиспользования навыков в коммерческой системе должны быть независимо подтверждены до установки/встраивания. Статус `licenseAccepted` не присваивался.

## Статус проверки
- GitHub API подтвердил факты по указанному публичному upstream Git tree и отдельно просмотренным файлам.
- Реального скачанного полного пакета Remotion в локальной среде не было; настоящий полный проход `skills:review-remotion` для 144 файлов **ещё не выполнялся**.
- Изолированные локальные Node-тесты инструментария — **20/20 PASS** на локальной копии тестируемых функций (7 Remotion review packet, 8 Git provenance, 5 вспомогательных source format/scale). Не эквивалентно полному `npm test` / `npm run typecheck` / `npm run web:build` точного GitHub SHA.
- GitHub Actions и Vercel не дают подтверждённого зелёного CI; работа ведётся в Draft PR #121.
- Следующий практический шаг: предоставленный доверенный checkout → полный read-only audit → ручная оценка findings и лицензии → изолированные Remotion/FFmpeg A/B с *тестовыми*, а не приватными файлами → только затем допуск.
