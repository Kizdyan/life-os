# Persona Local Library — реальный первый запуск на Windows

**Цель:** один раз положить реальные MOV/MP4/JPG/PNG в папку; Persona извлечёт техническую информацию и реальные превью, сможет найти фрагменты по доказуемым описаниям, а затем предложит B-roll для конкретного Production Brief. **Исходники никогда не переносятся и не меняются.**

## 1. Папка

Рекомендуемый новый путь (НЕ переименовывать существующие папки Persona и не переносить старые рабочие пакеты):

    C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\inbox

Рядом отдельно:

    C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\index

Достаточно 100–200 ГБ свободного места для начальной подборки. Учесть запас на превью и новые рендеры; медиа-оригиналы обязательно резервировать на отдельный носитель.

PowerShell из корня репозитория:

    New-Item -ItemType Directory -Force "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\inbox"
    New-Item -ItemType Directory -Force "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\index"

Положите в inbox несколько собственных видео/фото. Это **не** изменение существующих папок. Скрипт не сканирует другие директории и не отправляет файлы в облако.

## 2. Реальное извлечение метаданных и кадров

FFmpeg + FFprobe должны быть в PATH (или запустить из PowerShell с установленными ffmpeg/ffprobe).

    npm run persona:library -- scan "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\inbox" "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\index"

Результат: индекс persona-assets-v1.json, отдельные thumbnail JPG с нескольких действительных точек каждого видео, SHA-256 оригиналов, длительность, кодек, fps, разрешение, вид носителя. На повторном запуске файлы с прежними размером+mtime не хешируются заново; при изменении исходника индекс обновляется, старые ссылки с отсутствующими файлами маркируются missing.

Автоматическое наблюдение за папкой:

    npm run persona:library -- watch "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\inbox" "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\index"

Это реальный процесс на пользовательском компьютере, который пересканирует папку примерно каждые 30 секунд. Чтобы остановить, нажмите Ctrl+C. Пока компьютер и этот процесс выключены, папка сама не индексируется. На первом этапе никаких фоновых системных служб не создаётся.

## 3. Поиск действительно обнаруженных фрагментов

Без нейросетевого vision индексируются имена файлов и необязательные авторские описания. **Это не распознавание содержимого видео.** Для контроля человек может добавить рядом с собственным MOV/MP4 файл с именем видео плюс .persona.json:

    IMG_4001.MOV.persona.json

Содержимое:

    {
      "description": "Электричка проезжает мимо платформы",
      "tags": ["поезд", "перрон", "город"],
      "segments": [
        {"startSec": 4, "endSec": 8, "description": "Поезд движется мимо камеры", "tags": ["транспорт"]}
      ]
    }

Ни одна пометка не обязательна, это только начальный способ задать проверяемую авторскую подпись. Она не меняет исходный видеофайл.

Поиск:

    npm run persona:library -- search "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\index" "поезд"

Результат — путь к реальному файлу, source SHA, точный заявленный timecode, source='author_annotation' и совпавшие слова. Если доказательств нет, результатов тоже нет: ложного «нейросеть увидела поезд» не будет.

## 4. Автоматическое распознавание кадров локальной vision-моделью

Если на Windows уже установлена **реально поддерживающая изображения** модель в Ollama, можно включить визуальный анализ:

    npm run persona:library -- scan "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\inbox" "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\index" --vision-model "<installed-vision-model>"

Проверьте название в \`ollama list\`. Модель получает локальные JPG, созданные из исходника, и должна вернуть короткий JSON с видимыми объектами и тегами. Индекс сохраняет точное название модели и provenance local_vision_model. Анализируется один кадр, а не полное видео с движением: при совпадении всегда требуется человеческий просмотр.

В первой версии поддерживается только локальный Ollama на 127.0.0.1:11434 (или другом явно разрешённом localhost URL); никакой автоматической отправки кадров на посторонние серверы нет. Если модель недоступна или JSON неверен, ошибка фиксируется, модельное описание не подменяется фантазией.

## 5. Сопоставление с конкретным съёмочным планом

После \`persona:flow prepare\` или другого создания канонического Production Brief:

    npm run persona:library:match -- "C:\...\PRODUCTION-BRIEF.json" "C:\Users\Kostya\Documents\LifeOS\Persona\private-media\asset-library\index\persona-assets-v1.json" "C:\...\NEW-ASSET-MATCHES.json"

Получите NEW-ASSET-MATCHES.json и NEW-ASSET-MATCHES.json.md. Для каждого кадра: поиск по настоящему тексту сценария, локальные кандидаты, путь, checksum, timecode, чем подтверждено совпадение (авторское описание / vision-model / имя файла).

Важная граница: предложение B-roll ещё не доказывает, что актёр произнёс нужную реплику; только после авторского просмотра и утверждения фрагмент можно использовать в финальном монтажном плане. Пока не реализовано автоматическое добавление такого B-roll в FFmpeg timeline — это следующая интеграция с Local Media Worker.

## Проверяемый критерий готовности

Проверка синтетическим MP4 в CI: настоящий FFmpeg-клип добавляется в inbox, ffprobe читает его характеристики, создаются кадры, поисковый запрос находит авторский сегмент с заданным интервалом, исходный SHA сохраняется, исчезновение файла снимает его из активного поиска. Отдельный тест проверяет payload реального JPG в модельном API через подставленный HTTP-ответ. **CI не утверждает, что реальная vision-модель уже распознала личную запись поезда пользователя.**

Следующий реальный локальный тест: 1–5 существующих собственных файлов → scan → подключённая реальная vision-model → search → match с Production Brief → просмотр кандидатов → включение подтверждённого фрагмента в следующий настоящий MP4.
