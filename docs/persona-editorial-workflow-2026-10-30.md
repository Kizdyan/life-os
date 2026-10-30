# Persona P1 — выбор дублей и художественная приёмка

Работает локально, поверх существующих Whisper и FFmpeg. Не заменяет основной рендерер и не разрешает публикацию.

## Если Whisper не распознал реплику: автоматическое Recovery Review

Теперь `media:first-reel:draft` при ошибке ASR **после успешной приёмки исходников** сохраняет не пустую ошибку, а результат `needs-manual-transcript-review` с файлами `RECOVERY-RESULT.json` и `RECOVERY-RESULT.md`. Это не готовое видео и не результат технического QA.

Никаких новых команд для создания Recovery-пакета не требуется: Persona сама создаёт `DRAFT_DIR/editorial-review-kit/previews/review.html` и короткие локальные MP4-прокси доступных исходников. Если у всех источников отсутствует аудио, страница сообщит о необходимости пересъёмки.

1. Откройте `DRAFT_DIR/RECOVERY-RESULT.md`, затем `DRAFT_DIR/editorial-review-kit/previews/review.html`.
2. Просмотрите/прослушайте материалы. Для проблемной сцены выберите исходник и вручную укажите начало, длительность и **действительно услышанный текст**. Для успешно распознанных сцен выберите обычный дубль.
3. Впишите причины, сохраните из браузера `selection.reviewed.json` и найдите файл в папке загрузок.
4. Запустите привычную команду, даже если первого `draft-reel.mp4` никогда не существовало:

```powershell
npm run media:review:render -- `
  "D:\Persona\draft-01" `
  "C:\Users\Kostya\Downloads\selection.reviewed.json" `
  "D:\Persona\reviewed-01" `
  "C:\Users\Kostya\Tools\FFmpeg\ffmpeg-9.0.2-essentials_build\bin"
```

Persona сверит вручную выбранные отрезки с исходниками и их SHA-256, создаст **новый** timeline, MP4, SRT/VTT, QA и Creative Review; `transcriptSource=manual-review` останется виден в решениях. Исходный Whisper не переписывается; ASR для остальных сцен повторно не запускается. Если текст/границы не подтверждены или исходники изменились, рендер будет отклонён. Все исходники остаются на месте.

При штатном успешном первом MP4 процесс не меняется: `media:review:kit` → выбрать дубль → `media:review:render`. Если Preview собрал только часть сцен, отбор недостающих кадров допускает Recovery Review и затем полную Strict-сборку.

## Новый вариант: подготовить всё одной командой

После успешной работы media:first-reel:draft и появления RESULT.json запустите:

    node tools/persona-review-kit.mjs DRAFT_DIR

Вместо DRAFT_DIR укажите фактический каталог черновика — например, полный путь в кавычках: "C:\Users\Kostya\Videos\persona-draft-001".

Команда создаст новый каталог DRAFT_DIR/editorial-review-kit:

- candidate-pack.json и candidate-pack.json.md — видеоальтернативы и пояснения;
- selection.json — шаблон ручного выбора;
- previews/review.html — локальная страница с воспроизводимыми дублями;
- creative-review.template.json — шаблон художественного чек-листа;
- KIT.json — список результатов.

Откройте previews/review.html, посмотрите видео, выберите дубль и впишите причину. Нажмите «Сохранить мой выбор в JSON». Браузер создаст selection.reviewed.json, который затем передаётся в команду editorial-choices.mjs apply из инструкции ниже.

Страница работает локально, не публикует видео и не меняет оригиналы. Выполнить ещё раз в том же каталоге невозможно: новый пакет требует нового каталога черновика.

Если Whisper не нашёл реплику, страница не скрывает снятый материал и не создаёт вымышленный текст. В блоке **Recovery Review** появится локальный inspection-proxy исходника. После просмотра можно выбрать источник, вручную отметить начало и длительность фразы, ввести услышанный текст и причину. Эта разметка сохраняется отдельно как `manual-review`; она не переписывает исходный JSON Whisper и не считается автоматическим доказательством текста. Для исходника без аудио доступна только пересъёмка.

## После выбора дублей: пересобрать и проверить одной командой

Получив из браузера файл `selection.reviewed.json`, укажите три пути (и при необходимости четвёртый — папку FFmpeg):

```powershell
npm run media:review:render -- `
  "C:\Users\Kostya\Videos\persona-draft-001" `
  "C:\Users\Kostya\Downloads\selection.reviewed.json" `
  "C:\Users\Kostya\Videos\persona-reviewed-001" `
  "C:\Users\Kostya\Tools\FFmpeg\ffmpeg-9.0.2-essentials_build\bin"
```

Последний аргумент необязателен, если `ffmpeg` и `ffprobe` уже доступны в PATH. Каталог `persona-reviewed-001` должен быть **новым**, его не нужно создавать заранее.

Команда проверяет оригинальный MP4 и его прежний SHA-256, блокировку публикации, вручную выбранные дубли, хеши исходных клипов и монтажные интервалы. Затем **без перезаписи** первого результата создаёт:

- `reviewed-decisions.json` и `decision-memory.json` — выбранные дубли и причины;
- `reviewed-timeline.json` и `reviewed-reel.mp4` — самостоятельная версия монтажа;
- `captions.draft.srt`, `captions.draft.vtt`, `captions.review.json` — субтитры нового монтажа;
- `reviewed-qa.json` — **повторная реальная техническая проверка**, публикация по-прежнему запрещена;
- `creative-review.json` — художественный чек-лист для уже выбранных дублей;
- `REVIEWED-RESULT.json` и `REVIEWED-RESULT.md` — машинный статус и понятный русский чек-лист следующего просмотра.

Даже после успешного QA нельзя считать ролик утверждённым. Отдельно посмотреть весь MP4, проверить звук, синхронизацию титров, кадрирование и финальный музыкальный момент.

Если что-то сломалось, внутри нового каталога останется FAILED.json, а первоначальные MP4 и `decisions.json` сохранятся.

Старый порядок с несколькими командами ниже остаётся как ручной резервный вариант.

## После съёмки A01 / B01

Сначала запустите существующие media:shoot:intake и media:first-reel:draft. В итоговом каталоге (ниже: DRAFT_DIR) должны появиться evidence/analysis.json и decisions.json. Затем, из корня репозитория:

### 1. Сформировать варианты

    node tools/persona-editorial-choices.mjs prepare DRAFT_DIR/evidence/analysis.json docs/persona-two-line-live-asr-check-2026-10-29.json DRAFT_DIR/decisions.json DRAFT_DIR/candidate-pack.json DRAFT_DIR/selection.json

Файлы: candidate-pack.json, candidate-pack.json.md и selection.json. До трёх разных речевых кандидатов на сцену; их ранжирование — по совпадению произнесённого текста с Whisper, **не по актёрской игре**.

### 2. Посмотреть настоящие видеодубли в браузере — новый удобный вариант

После создания candidate-pack.json запустите:

    node tools/persona-editorial-previews.mjs DRAFT_DIR/candidate-pack.json DRAFT_DIR/evidence/analysis.json DRAFT_DIR/preview-review-001

Последний аргумент — **новый, ещё не существующий каталог**. Persona локально создаст короткие MP4-копии только выбранных кандидатов, файл previews.json и **preview-review-001/review.html**.

Откройте review.html в браузере Windows, прослушайте и просмотрите варианты, у каждой сцены выберите лучший, впишите причину и нажмите «Сохранить мой выбор в JSON». Браузер выдаст **selection.reviewed.json** в папку загрузок. Облако, личные папки, изменение оригиналов и автоматическая публикация не используются.

Если подходящего ASR-варианта нет, не редактируйте Whisper-файл. В **Recovery Review** посмотрите созданный локальный прокси, выберите исходник и укажите проверенные вручную границы и текст. После этого `apply` создаст новую ревизию решений с меткой `manual-review`; следующий монтаж использует только этот явный, хеш-проверенный диапазон.

Передайте скачанный файл вторым аргументом в команду apply ниже (вместо DRAFT_DIR/selection.json) — либо положите его в DRAFT_DIR, оставив имя selection.reviewed.json.

Если компьютер не может открыть локальную страницу, остаётся текстовый путь: candidate-pack.json.md и ручное редактирование selection.json. Никаких внешних сервисов не требуется.

### 2. Выбрать вручную

Посмотрите исходное видео, сравните варианты по candidate-pack.json.md. В selection.json у каждой сцены:

- candidateId — один из ID соответствующей сцены;
- reviewed — поставить true **только после личного просмотра**;
- reason — реальная причина выбора (взгляд, пауза, интонация и т. д.);
- rejected — необязательные отклонённые кандидаты с их ID и причиной.

Затем:

    node tools/persona-editorial-choices.mjs apply DRAFT_DIR/candidate-pack.json DRAFT_DIR/selection.json DRAFT_DIR/decisions.json DRAFT_DIR/reviewed-decisions.json DRAFT_DIR/decision-memory.json

Это создаст новый файл решений и отдельную память о выборе. Старый decisions.json не меняется. Пересечения, чёрные участки, хеши источников и границы перепроверяются.

### 3. Собрать альтернативную версию

    node tools/persona-semantic-montage.mjs assemble DRAFT_DIR/reviewed-decisions.json DRAFT_DIR/reviewed-timeline.json
    node tools/persona-timeline-render.mjs DRAFT_DIR/reviewed-timeline.json DRAFT_DIR/reviewed-reel.mp4
    node tools/persona-verify-render.mjs DRAFT_DIR/reviewed-reel.mp4 persona-first-reel reel DRAFT_DIR/reviewed-qa.json

Для субтитров новой версии вызвать persona-subtitle-draft.mjs с reviewed-timeline.json и reviewed-decisions.json; укажите отдельный **существующий пустой каталог**, потому что ранние SRT/VTT перезаписывать запрещено.

### 4. Пройти художественную приёмку

Профиль: docs/persona-creative-profile-v1.json. Он не дублирует Identity, а закрепляет практические правила: не менять внешность, сохранять игру, естественный цвет, музыкальные хвосты, безопасные субтитры.

    node tools/persona-creative-review.mjs init DRAFT_DIR/candidate-pack.json docs/persona-creative-profile-v1.json DRAFT_DIR/creative-review.json DRAFT_DIR/selection.json

Посмотрите reviewed-reel.mp4. В creative-review.json отметьте для каждой сцены: true — лично проверено, false — есть замечание, null — не проверено. Для false заполните замечание в remarks или issues.

    node tools/persona-creative-review.mjs finish DRAFT_DIR/creative-review.json docs/persona-creative-profile-v1.json DRAFT_DIR/creative-review.md DRAFT_DIR/creative-feedback.json

creative-review.md — русскоязычный итог проверки; creative-feedback.json — только **явно введённые человеком** замечания, без выдуманного анализа и автоматического обучения. Даже при всех true нужна отдельная авторская приёмка перед публикацией.

## Проверки

    node --test tools/persona-editorial-previews.test.mjs
    node --test tools/persona-review-kit.test.mjs
    node --test tools/persona-reviewed-render.test.mjs


    node --test tools/persona-editorial-choices.test.mjs tools/persona-creative-review.test.mjs
    node --test tools/persona-editorial-previews.test.mjs tools/persona-semantic-montage.test.mjs
    npm run media:test

Recovery Review покрыт локальными unit/integration-проверками, включая реальный FFmpeg inspection-proxy; это не заменяет личную проверку текста, игры, изображения и звука на настоящих съёмках.

## Защита локальных изменений

Codex мог оставить незакоммиченные правки по P0 до достижения лимита. До синхронизации проверить git status. Не выполнять reset --hard и не делать автоматическое перезаписывание локальных правок. Новые P1-компоненты добавлены отдельно; имеющийся рабочий код не заменён.
