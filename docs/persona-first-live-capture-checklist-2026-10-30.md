# Persona — первая реальная проверка A01/B01

**Цель:** впервые получить локальный MP4 из двух настоящих русскоязычных реплик, затем сравнить дубли и проверить художественное качество. Это **технический тест первых сцен**, не готовый семикадровый Reels.

## 1. Съёмка

- A01 (Актёр): «Я актёр. И ещё пишу музыку». Крупный план; 2–3 дубля.
- B01 (Композитор): «И у нас есть проблема». Средний план за клавишами; 2–3 дубля.
- Вертикально 9:16; по возможности 1080p/30 fps, штатный баланс белого и мягкий стабильный свет.
- До и после реплики оставить 1–2 секунды тишины; сохранить оригиналы без ретуши и обрезки.
- Указать **только лично выбранные пути**, не сканировать папки и не отправлять видео в Descript без отдельного согласия.

## 2. Команды на Windows

В PowerShell из корня Life OS выполнить (папки `D:\chosen` и имена A01.mp4/B01.mp4 — примеры: подставьте реальные существующие файлы; целевые `D:\Persona\intake-01`, `draft-01`, `reviewed-01` заранее **не создавать**):

```powershell
$env:PATH = "C:\Users\Kostya\Tools\FFmpeg\ffmpeg-9.0.2-essentials_build\bin;$env:PATH"

npm run media:shoot:intake -- `
  "D:\Persona\intake-01" `
  "A01=D:\chosen\A01.mp4" `
  "B01=D:\chosen\B01.mp4"
```

При нескольких дублях добавьте новые аргументы `"A01=D:\chosen\A01_take02.mp4"`, `"B01=D:\chosen\B01_take02.mp4"` и т. д. Не более шести на сцену.

Открыть `D:\Persona\intake-01\INTAKE.md`. Проверить сообщения об отсутствии звука, тишине, чёрных кадрах и экспозиции. Это не гарантия фокуса, красивого цвета и хорошей актёрской игры.

Если обе реплики реально присутствуют, запустить Strict с **двухрепликовым**, а не полным брифом:

```powershell
npm run media:first-reel:draft -- `
  "D:\Persona\intake-01\sources.json" `
  "docs\persona-two-line-live-asr-check-2026-10-29.json" `
  "D:\Persona\draft-01" `
  "C:\Users\Kostya\Tools\whisper.cpp\bin\whisper-cli.exe" `
  "C:\Users\Kostya\Tools\whisper.cpp\models\ggml-small.bin" `
  "C:\Users\Kostya\Tools\FFmpeg\ffmpeg-9.0.2-essentials_build\bin" `
  "strict"
```

**Не подставляйте** сюда `docs\persona-first-reel-production-brief-2026-10-29.json`: в нём семь сцен, а A01/B01 содержат только две. Для неполного семикадрового черновика используется отдельный осознанный режим `preview`, но для проверки первых двух кадров он не нужен.

## 3. Первый результат

Ожидаемые файлы в `D:\Persona\draft-01`: `draft-reel.mp4`, `qa.json`, `captions.draft.srt`, `captions.draft.vtt`, `captions.review.json`, `RESULT.json` и технические промежуточные данные.

Если Whisper не подтвердил фразу, увидите `FAILED.json`. **Это не ошибка, которую надо обходить подставным транскриптом.** Сравните настоящую запись и ASR; при необходимости исправьте звук или переснимите реплику.

После успешного MP4:

```powershell
npm run media:review:kit -- "D:\Persona\draft-01"
```

Откройте локальный файл `D:\Persona\draft-01\editorial-review-kit\previews\review.html`. Просмотрите разные дубли, укажите причину выбора и сохраните `selection.reviewed.json`. Обычно браузер сохраняет файл в «Загрузки» — проверьте реальный путь.

```powershell
npm run media:review:render -- `
  "D:\Persona\draft-01" `
  "C:\Users\Kostya\Downloads\selection.reviewed.json" `
  "D:\Persona\reviewed-01" `
  "C:\Users\Kostya\Tools\FFmpeg\ffmpeg-9.0.2-essentials_build\bin"
```

Итог: `D:\Persona\reviewed-01\reviewed-reel.mp4`, обновлённые субтитры, новый QA, `REVIEWED-RESULT.md` и Creative QA. Путь к файлу выбора измените, если браузер сохранил его в другом месте.

## 4. Визуальный контроль после выбора дублей

Когда готов `D:\Persona\reviewed-01\reviewed-reel.mp4`, можно **дополнительно** проверить кадрирование и согласованность света:

```powershell
npm run media:visual:review -- prepare "D:\Persona\reviewed-01\reviewed-timeline.json" "D:\Persona\visual-review-01"
```

Откройте `D:\Persona\visual-review-01\review.html`: там три контрольных кадра каждой сцены, предупреждения по средней яркости и ручные настройки `contain/cover` с X/Y. После просмотра и ввода причин браузер сохранит `visual-framing.reviewed.json`.

```powershell
npm run media:visual:finalize -- `
  "D:\Persona\reviewed-01" `
  "D:\Persona\visual-review-01\visual-review-pack.json" `
  "C:\Users\Kostya\Downloads\visual-framing.reviewed.json" `
  "D:\Persona\framed-01" `
  "C:\Users\Kostya\Tools\FFmpeg\ffmpeg-9.0.2-essentials_build\bin"
```

Новые целевые каталоги заранее не создавать. Получатся новый `framed-reel.mp4`, SRT/VTT, `framed-qa.json`, `VISUAL-RESULT.md` и новый Creative QA. Исходники и предыдущие версии останутся неизменными; публикация заблокирована.

Подробности: `docs/persona-visual-qa-and-framing-2026-10-30.md`. Цель — проверить геометрию кадра, **не менять лицо или цвет кожи**.

## 5. Условия приёмки

1. Оригиналы A01/B01 остались побайтно неизменными.
2. В первом и повторном MP4 звучат две настоящие реплики, слова не обрезаны.
3. Голос комфортен на склейке, без искажений; SRT соответствует реальной речи.
4. Лицо, очки, кожа, руки и клавиши не искажены и не обрезаны неправильно.
5. Автор посмотрел целиком автоматический и исправленный варианты и указал, какой лучше и почему.
6. `qa.json`/`reviewed-qa.json` технически прошли; публикация остаётся заблокированной.

**Важно:** 95 прошедших тестов Codex подтверждают локальную техническую работоспособность на синтетических исходниках, но не гарантируют качество настоящей русской речи и актёрского исполнения. CI GitHub может не запускаться из-за account billing; настройки оплаты не менять автоматически.
