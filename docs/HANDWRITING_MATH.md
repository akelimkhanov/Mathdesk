# MVP 2: распознавание математической рукописи

Работает pipeline выделенной рукописи. Реальный AI API **не подключён**:
по умолчанию используется явно обозначенный `development-mock`. Он возвращает
фиксированные варианты `2+2=5`, `2+2=S`, `2+2=8` с демонстрационными confidence.
Они не являются распознаванием введённых символов. Данные не отправляются в сеть.
Для произвольного выражения можно вручную изменить LaTeX в preview; для
автоматической транскрипции нужен настоящий provider.

## Ручная проверка

1. Создайте доску и выберите P / Pen. Напишите `2+2=5` несколькими strokes.
   Отпускайте мышь/стилус между штрихами. Удержание около 500 мс по-прежнему
   включает shape recognition; выделяйте strokes, а не преобразованные shapes.
2. Нажмите V и выделите выражение рамкой либо используйте Lasso в меню Select.
   Можно использовать Shift+click для нескольких объектов.
3. В контекстной панели нажмите **«Распознать как формулу»**.
4. Проверьте изображение выбранной рукописи, предупреждение о demo, три варианта,
   confidence, редактируемый LaTeX и KaTeX preview. Выберите вариант или введите
   свой LaTeX. `2+2=5` сохраняется точно так: выражение не вычисляется.
5. При confidence ниже 0.8 или неизвестном confidence для **«Заменить рукопись»**
   отметьте **«Я проверил формулу и подтверждаю замену»**. Замена создаёт одну
   команду Undo. Ctrl+Z восстанавливает исходные strokes с точками, давлением,
   стилями, группами и порядком; Ctrl+Shift+Z возвращает формулу.
6. **«Вставить рядом»** оставляет strokes и добавляет формулу справа. Одно Undo
   удаляет только формулу. **«Отмена»**, Esc и закрытие окна не меняют документ.
7. Перетащите формулу, измените размер ручкой, отредактируйте двойным кликом или
   кнопкой редактирования, удалите Delete: это обычный `MathObject`.
8. Дождитесь сохранения, откройте доску заново, экспортируйте/импортируйте JSON.
   LaTeX и source сохраняются. Undo относится к текущему сеансу, как и раньше.
9. Проверьте RU/KZ/EN, тёмную тему и zoom. PNG содержит только выбранные strokes
   на белом фоне чёрным пером. В него не попадают камера, сетка и выделение.
   В смешанном выделении обрабатываются только strokes; другие объекты остаются.
   Заблокированная рукопись не заменяется.

## Файлы и контракт

- `src/services/mathRecognition.ts`: `MathRecognitionProvider`, input/result,
  валидация внешних ответов, confidence policy и отмена.
- `src/services/mathRecognitionProvider.ts`: точка подключения адаптера.
- `src/services/developmentMathProvider.ts`: локальный fixture без AI/сети.
- `src/core/handwritingMath.ts`: snapshot strokes, world samples, проверка
  исходника и создание обычного MathObject.
- `src/render/handwritingImage.ts`: PNG crop и подготовка provider input.
- `src/components/MathRecognitionDialog.tsx`: loading/error/retry, варианты,
  preview, подтверждение и отмена.
- `src/core/math.ts`: общий KaTeX renderer с `trust: false`, без вычислений.
- `useEditor.applyRecognition`: атомарная отменяемая замена/вставка.

Вход содержит requestId, boardId, locale, PNG Blob, pixel dimensions, world bounds
и ordered world-coordinate samples с pressure. Resize/rotation учитываются,
viewport pan/zoom исключены. PNG ограничен 1536 пикселями по длинной стороне;
выбор — 1000 strokes / 200 000 samples. Provider может использовать оба формата.

Ответ: `{ candidates: [{ latex: string, confidence: number | null }] }`.
Принимаются первые три позиции ответа; неподходящие кандидаты отбрасываются.
Confidence — число 0–1 или `null`, если сервис не предоставляет его. Пустые,
слишком длинные (>10 000 символов) или не отображаемые KaTeX ответы отклоняются.
LaTeX не решается, не переписывается и не исправляется. После ручного изменения
LaTeX в recognition preview исходный confidence не записывается в результат.

Никакой ответ не применяется автоматически, включая высокий confidence.
Перед записью проверяются board ID, содержимое strokes и блокировки. Поздний
ответ не заменяет изменившийся исходник. Закрытие окна отменяет запрос и
освобождает Blob URL. Ошибки и 30-секундный timeout сохраняют рукопись и предлагают
Retry. `source.strokes` хранит мировые samples, `source.provider` — ID адаптера,
`source.confidence` — оценку неизменённого кандидата. Полные исходные объекты
сохраняются в Undo patches. Временное PNG в JSON не включается.

## Подключение настоящего API

1. Создайте адаптер `MathRecognitionProvider` с реальным ID и `mode: 'live'`.
   `recognize(input, signal)` должен вернуть candidates.
2. Передайте сервису `input.image` и/или `input.strokes`, преобразуйте его ответ
   в контракт Mathdesk. Передавайте `signal` в fetch/SDK. Используйте транскрипцию
   рукописи, без solve/simplify/validation endpoint.
3. Замените экспорт в `mathRecognitionProvider.ts`. Доска, история и dialog
   не требуют изменения. `recognizeMath` валидирует ответ перед показом.
4. Нужны browser-accessible endpoint и CORS. Приватные API keys не помещайте в
   исходники или `NEXT_PUBLIC_*`. Если сервис требует секретный ключ, потребуется
   отдельный защищённый посредник на следующем этапе. Backend сейчас не добавлен.

Пример для **уже существующего** endpoint без приватных ключей. Адрес, поля и
mapping ответа замените согласно документации выбранного сервиса:

```ts
import type { MathRecognitionProvider } from '@/services/mathRecognition';
import { validateMathResult } from '@/services/mathRecognition';

export function remoteMathProvider(endpoint: string): MathRecognitionProvider {
  return {
    id: 'your-handwriting-provider',
    mode: 'live',
    async recognize(input, signal) {
      const body = new FormData();
      body.append('image', input.image, 'handwriting.png');
      body.append('strokes', JSON.stringify(input.strokes));
      body.append('locale', input.locale);
      body.append('requestId', input.requestId);
      body.append('bounds', JSON.stringify(input.bounds));
      const response = await fetch(endpoint, {
        method: 'POST',
        body,
        signal,
        credentials: 'omit',
      });
      if (!response.ok) throw new Error('RECOGNITION_SERVICE_FAILED');
      return validateMathResult(await response.json());
    },
  };
}
```

Проверьте на реальном сервисе числа, дроби, степени, индексы, системы уравнений,
неоднозначные символы и специально неверное равенство `2+2=5`. Confidence разных
провайдеров не обязательно калиброван одинаково; он используется для предупреждения.

## Автоматические проверки

`npm test`, `npm run build`, `npm run test:e2e`, `npm run typecheck`,
`npm run format:check`. Build и e2e запускаются последовательно.

Unit: координаты/давление, malformed responses, отмена, блокировки, исходники,
точный Undo/Redo и JSON. E2E: реальные strokes, PNG pixels, Select/Lasso,
варианты, низкий confidence, move/resize/edit/delete, сохранение, отмена,
ошибка PNG/Retry, RU/KZ/EN и независимость PNG от zoom/theme.
OCR фотографий, voice input, 3D и backend не добавлены.
