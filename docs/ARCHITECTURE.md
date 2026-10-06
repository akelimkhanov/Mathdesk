# AI Math Board — технический план

## 1. Продукт и границы первой версии

Основной сценарий: учитель открывает локальную доску, пишет стилусом, вставляет
формулы и геометрические объекты, перемещает и масштабирует материал и возвращается
к сохранённому уроку. MVP 1 работает без учётной записи, сети и AI-ключей после
загрузки приложения. Никакая математика пользователя не исправляется автоматически.
Это редактор, а не система проверки доказательств.

Реализуем: infinite canvas, pressure-aware pen/pencil/marker, object eraser,
single/multiple/marquee selection, drag, resize, rotate, text, LaTeX, line/arrow/
rectangle/ellipse/triangle, undo/redo, pan/zoom/pinch/fit, dashboard, autosave,
JSON save/load, light/dark, RU/KZ/EN. AI, 3D, OCR, экспорт Word и совместная работа
не подменяются статическими кнопками или фиктивными результатами.

## 2. Стек и структура

Next.js App Router + React + strict TypeScript; Zustand — документ и история;
Canvas 2D — рукопись и геометрия; HTML + KaTeX — редактируемые semantic objects;
IndexedDB (`idb`) — локальные доски; Vitest — ядро; Playwright — реальные сценарии.
Стили — CSS variables и адаптивные компоненты без дополнительного CSS runtime.
Внешние шрифты не нужны: формулы используют локально поставляемые шрифты KaTeX.

```text
src/app/                 Next routes, shell, styles
src/components/          editor, canvas, toolbar, inspector, dialogs, dashboard
src/core/                types, coordinates, geometry, history, validation
src/store/               document and interaction state
src/render/              canvas renderer (no React dependency)
src/persistence/         IndexedDB repository
src/i18n/                typed RU/KZ/EN dictionaries
src/services/            provider contracts for later recognition/collaboration
tests/                   unit and browser tests
docs/                    architecture and roadmap
```

## 3. Состояние и модель объектов

Документ: schemaVersion, id, title, subject, grade, topic, createdAt, updatedAt,
background, objects. UI-состояние (инструмент, выделение, камера, панели) отдельно
от документа; его изменение не попадает в Undo. Объекты имеют стабильный UUID,
type, x/y, width/height, rotation, style. Положение — world units, углы — radians.
Порядок массива определяет z-order; locked запрещает изменение объекта.

Stroke хранит local samples {x,y,pressure}; brush различает pen/pencil/marker.
Shape — редактируемая семантическая фигура, а не PNG. Text хранит строку и fontSize.
Math хранит LaTeX и fontSize. SourceData сохраняет исходную рукопись/изображение и
метаданные распознавания; результат AI не уничтожает исходник.

Следующие версии добавляют Geometry {points, constraints, labels}, FunctionGraph
{expression, domain, range}, Solid {kind, parameters, transform3D, material},
Media {assetId, crop}, Group {children}, Layers {visibility, teacherOnly}.
Данные импортируются через проверку версии, типов, finite numbers и лимитов;
ошибки импорта не заменяют открытый документ. Никакого eval для математики.

## 4. Координаты и рендеринг

screen = world × zoom + pan; inverse используется всеми hit tests и инструментами.
Zoom относительно указателя сохраняет world point под курсором; pinch делает то же
относительно midpoint. Wheel — pan, Ctrl/Cmd+wheel — zoom, Space+drag — pan.
Камера и размер viewport не ограничивают размеры документа.

Постоянный canvas рисует завершённые strokes/shapes. Отдельный transient canvas
рисует текущий stroke/drag/selection через requestAnimationFrame, без обновления
Zustand на каждом sample. DPR-aware backing store даёт чёткую картинку. DOM слой
формул и текста получает ту же камеру и индивидуальные transform. Bounding-box
culling исключает невидимые объекты; математический слой учитывает viewport.
Pressure samples сохраняются и задают ширину сегментов. Pointer capture обеспечивает
завершение штриха вне края viewport; touch-action отключён только в области доски.

Canvas overlays: selection bounds, resize/rotation handles и marquee. Hit tests
выполняются в local coordinates после inverse rotation/scale. Для strokes и линий
используется расстояние до сегмента, для фигур — форма. Multi-selection — Shift.
Resize масштабирует strokes и semantic frame; rotation остаётся свойством объекта.
Для масштабирования выше десятков тысяч объектов: spatial index, tiles и worker
для stroke simplification. 60 FPS — цель, не заявленный без измерений результат.

## 5. Undo/Redo

Команда — набор patch {id, before, after, beforeIndex, afterIndex}; одна завершённая
операция рисования/перемещения/resize/AI-conversion — одна команда. История ограничена
200 операциями. Изменение после Undo очищает Redo. Камера, выбор инструмента и
autosave не загрязняют историю. Отмена удаления восстанавливает исходный z-order.
Загрузка другого документа сбрасывает историю. Незавершённый gesture можно отменить
Escape. Исходные samples не теряются при перемещении и масштабировании.

## 6. Save/Load и будущая БД

В MVP: IndexedDB store boards (key id, index updatedAt), debounce autosave после
команд и изменения метаданных; явный статус pending/saved/error. Запись асинхронная,
рисование не ждёт I/O. Dashboard — название, класс, тема, дата. JSON — переносимый
документ с version и проверкой; скачивание и импорт не требуют серверного хранилища.
Данные остаются в этом браузере; backup JSON нужен для переноса и защиты от очистки.

В дальнейшем PostgreSQL: users, workspaces, memberships, boards, board_versions,
board_objects (id, board_id, type, z_index, payload JSONB, revision), assets
(storage_key, MIME, size, owner), lessons, layers, rooms, permissions. Snapshot JSON
на board_versions + incremental operations для истории и совместной работы.
Объектное хранилище — изображения/PDF через signed upload, лимиты MIME/size и access
control. Repository interface отделяет редактор от способа сохранения.

## 7. 3D архитектура (MVP 4)

Three.js / React Three Fiber в отдельном viewport semantic Solid. Параметры модели
порождают mesh; orbit/pan/zoom управляют внутренней камерой, не камерой доски.
Переключение edit-board / inspect-solid предотвращает конфликт жестов.
Orthographic/perspective presets, transparency, edges и скрытые элементы — свойства.
Сечение — плоскость normal+offset; пересечения рёбер вычисляются в математическом
ядре и тестируются отдельно. Three-point plane отклоняет collinear input.
В 2D→3D conversion неоднозначность показывается как выбор, не угадывание.

## 8. AI архитектура (MVP 2+)

Отдельные provider contracts: Handwriting, MathRecognition, OCR, Speech, Shape,
ProblemUnderstanding, DiagramGeneration, EquationValidation, Assistant. Запрос
содержит source, язык, requestId; ответ — candidates, confidence, provenance.
AbortSignal и revision проверяются перед применением, устаревший ответ не меняет
документ. Background queue не блокирует pen. Ключи только на сервере; proxy route
проверяет права, лимиты и payload. Провайдера можно заменить без изменения core.

Handwriting mode никогда не преобразует; Smart Ink всегда спрашивает; Auto Math
применяет лишь confidence >= 0.98 и сохранив source; остальные ответы дают варианты.
Нормализация оформления отделена от математической проверки. `2+2=5` остаётся
таким, как введено. Все изменения подтверждаемы и отменяемы.

## 9. Совместная работа и безопасность (MVP 5)

Operation transport отделён от command application. WebSocket rooms + server-side
permissions; teacher/student roles, per-layer visibility и право писать.
Teacher-only данные не просто скрываются CSS, а не отправляются student client.
CRDT/operation rebasing требуется до включения concurrent edits. MVP локальный,
не обещает защищённый Student View. KaTeX trust=false, import limits, text escaping,
отсутствие arbitrary code evaluation. Учётные записи и серверная авторизация
обязательны до публикации multi-user режима.

## 10. Дизайн

Большая светлая доска, компактная верхняя строка, вертикальная панель инструментов,
контекстный inspector справа только при необходимости, zoom внизу. Тёплый белый,
графит, фиолетовый акцент; dark theme через CSS variables. Tooltips и hotkeys,
keyboard focus, aria labels, минимум постоянных кнопок. RU/KZ/EN словари типизированы.

## 11. Roadmap и критерии

1. MVP 1: рабочее ядро и инструменты, локальное хранение, локализация. Проверка:
   pressure/coordinates/history unit tests, browser draw-select-edit-undo-save-reload,
   build и strict typecheck.
2. MVP 2: подключённый recognition provider, confidence review, source retention,
   copy LaTeX/MathML, SVG/PNG/PDF, DOCX с отрендеренными формулами. Проверять на
   корпусе реальной рукописи RU/KZ/EN; mocks явно отделять от production.
3. MVP 3: безопасный function parser/graphs, geometry constraint solver, OCR,
   speech, condition-to-diagram; тесты математических инвариантов и неоднозначностей.
4. MVP 4: editable parametric solids, cameras, sections, 2D→3D; тесты геометрии
   сечений, degenerate cases, stylus gesture interactions.
5. MVP 5: комнаты/права, teacher/student views, lesson templates, AI assistant,
   server-backed versions и collaboration conflict tests.

Редактируемый Word OMML, сложные жесты и полноценная CAD-геометрия — отдельные
задачи после проверки качества основного преподавательского сценария.

## Улучшения ядра для урока

`core/ink.ts` — адаптивная фильтрация координат, quadratic midpoint spline и
упрощение с учётом давления. Сохраняемые samples упрощены; spline рассчитывается
для рендера и hit tests, кешируется для неизменных массивов.
`core/shapeRecognition.ts` — локальные геометрические критерии (прямолинейность,
радиальный остаток/замкнутость, близость к сторонам и углам прямоугольника),
без AI. После 500 мс без значимого движения появляется предпросмотр; при
отпускании отдельно фиксируются штрих и преобразование. SourceData хранит
исходные точки; Undo восстанавливает исходный объект.

`core/selection.ts` — polygon lasso, расширение выбора групп и общие transforms.
`groupId` — optional field в BaseObject, совместимый с schemaVersion 1; отдельной
вложенной сцены нет. Group/Ungroup — команды изменения membership. Копии
получают новые groupId; блокировка одного члена защищает всю группу. Члены
группы масштабируются одинаково, без shear.

`core/cameraMotion.ts` — короткая RAF-анимация камеры, сохраняющая world anchor
под курсором, с диапазоном 10–500% и уважением prefers-reduced-motion. Любое
начало gesture останавливает текущую анимацию. Space и middle drag приоритетны
над созданием объектов. Правое перетаскивание пустой области Select — Pan,
левое — rectangle selection; пальцем по пустой области Select — Pan.

Fullscreen API отделён от UI presentation: вход в презентацию не включает
fullscreen. Кнопка «На весь экран» вызывает requestFullscreen на documentElement,
повторное нажатие — exitFullscreen. fullscreenchange синхронизирует кнопку с
браузером. Выход из fullscreen (включая Esc) оставляет презентацию активной;
отказ или отсутствие API сохраняет рабочую презентацию внутри окна.
Физическое качество пера и 60 FPS требуют проверки на устройствах; сценарии
браузера и числовые инварианты покрывают ввод, давление, zoom, историю и hold.
