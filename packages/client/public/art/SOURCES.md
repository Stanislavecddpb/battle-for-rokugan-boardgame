# Изображения компонентов «Битвы за Рокуган»

Использованы реальные изображения из правил и сканы компонентов, а не сгенерированные иллюстрации. Файлы оптимизированы в WebP для браузера; игровые надписи и значения на сканах сохранены.

## Источники

- Обложка и иллюстрация для заставки: первая страница [официальных правил Fantasy Flight Games](https://images-cdn.fantasyflightgames.com/filer_public/95/ef/95ef7efa-c0e1-4ae9-bd33-5439d236cefb/l5b01_rulebook_webcompressed.pdf). Рендер страницы выполнен из идентичного публичного файла `Rulebook_eng.pdf`, сохранённого в наборе ниже. `cover.webp` содержит всю обложку, `hero.webp` — фрагмент иллюстрации без титульных надписей.
- Поле, ширмы, жетоны и карты: [набор сканов litvinovmitch11/BattleForRokugan](https://github.com/litvinovmitch11/BattleForRokugan/tree/87f7ec42cc164bdfd6295c8afbbaf41d20e4b5c9/client/resources), зафиксированная ревизия `87f7ec42cc164bdfd6295c8afbbaf41d20e4b5c9`. Точный исходный файл указан для каждого изображения в `assets.json`.
- Карта игрового поля: Francesca Baerald; обложка: Mathias Kollros — согласно титрам официального буклета.
- Название, мир Legend of the Five Rings, графика и компоненты принадлежат своим правообладателям, включая Fantasy Flight Games / Asmodee. Эти файлы не объявляются самостоятельными произведениями проекта и не получают новую открытую лицензию от авторов приложения. Публичная доступность исходных сканов не является лицензией на их распространение.

## Формат и ориентация

`board.webp` — 1800×2700, север сверху. У исходного `MAP.jpg` неверный для выбранной ориентации EXIF `orientation=8`. Использованы исходные пиксели без автоматического поворота; EXIF в выходной файл не переносился. Геометрия поля не перерисована.

`board-points.json` содержит координаты центров провинций в системе 600×900, а также нормализованные `nx`, `ny`. ID совпадают с номерными ID `packages/engine/src/content.ts`. Эти точки вручную сверены со сканом; данные MORTEM не использованы без поправок, поскольку их координаты не совпадают с этим изображением.

Набор:

- `/art/clans/{clan}.webp` — ширма клана;
- `/art/emblems/{clan}.webp` — эмблема с жетона контроля;
- `/art/controls/{clan}-closed.webp`, `-open.webp` — контроль;
- `/art/tokens/{clan}-{kind}-{strength}.webp`, `{clan}-back.webp` — боевые жетоны;
- `/art/cards/{engine-card-id}.webp` — 20 имеющихся сканов карт территорий;
- `/art/objectives/{engine-objective-id}.webp` — 12 тайных целей;
- `/art/support/` — разведчик, сюгэндзя, первый игрок и три нейтральные карты инициативы;
- `/art/specials/` — имеющиеся особые жетоны.

У блефа Льва на оригинальном жетоне напечатана сила 2, поэтому `lion-bluff-0.webp` содержит именно этот скан. Суффикс `0` соответствует типу жетона в модели, а бонус силы применяется способностью клана.

## Отсутствующие изображения

В исходном наборе нет сканов `pirates`, `spy` и уникального `scorpion-shinobi-3`. Они явно записаны как `null` и перечислены в `assets.json.missing`. Для них следует показывать достоверное текстовое представление, а не изображение другой карты или другой силы. В набор не добавлялись выдуманные сканы.

## Territory card back
`cards/territory-back.png`: original Dragon territory reverse, extracted as embedded image from page 3 (Components) of the official English rulebook, https://images-cdn.fantasyflightgames.com/filer_public/95/ef/95ef7efa-c0e1-4ae9-bd33-5439d236cefb/l5b01_rulebook_webcompressed.pdf . Used as a common reverse for hidden territory cards; no invented symbol.

## Шрифт заголовков

`public/fonts/story-brush-rus.otf` — Story Brush (RUS BY LYAJKA), кириллическая версия Story Brush.
Им набраны заголовки русских правил Hobby World. Скачан с ffonts.net (лицензия по данным агрегаторов —
«бесплатно для личного использования»; официальной страницы автора и текста лицензии не найдено).
Перед публичным или коммерческим размещением лицензию нужно подтвердить или заменить шрифт.
