import { test, expect, type Page } from '@playwright/test';
import type { BoardDocument } from '../../src/core/types';

const writing = [
  [
    [300, 330],
    [308, 322],
    [323, 326],
    [326, 338],
    [301, 356],
    [326, 356],
  ],
  [
    [340, 340],
    [360, 340],
  ],
  [
    [350, 330],
    [350, 350],
  ],
  [
    [380, 330],
    [388, 322],
    [403, 326],
    [406, 338],
    [381, 356],
    [406, 356],
  ],
  [
    [420, 336],
    [442, 336],
  ],
  [
    [420, 346],
    [442, 346],
  ],
  [
    [482, 324],
    [462, 324],
    [462, 338],
    [479, 338],
    [485, 345],
    [478, 356],
    [462, 356],
  ],
];
async function create(page: Page, lasso = false) {
  await page.goto('/');
  await page.getByTestId('new-board').click();
  await page.getByTestId('create-board').click();
  await page.getByTestId('tool-pen').click();
  for (const points of writing) {
    await page.mouse.move(points[0][0], points[0][1]);
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) await page.mouse.move(x, y);
    await page.mouse.up();
  }
  await page.getByTestId('tool-select').click();
  if (lasso) {
    await page.getByRole('button', { name: 'Выделение рамкой', exact: true }).click();
    await page.getByTestId('tool-lasso').click();
  }
  await page.mouse.move(275, 300);
  await page.mouse.down();
  if (lasso) {
    for (const [x, y] of [
      [510, 300],
      [510, 380],
      [275, 380],
      [275, 300],
    ])
      await page.mouse.move(x, y, { steps: 4 });
  } else await page.mouse.move(510, 380, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('recognize-math')).toBeVisible();
}
async function doc(page: Page): Promise<BoardDocument> {
  await expect(page.getByTestId('save-status')).toContainText('Сохранено');
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ai-math-board', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<BoardDocument>((resolve, reject) => {
      const request = db.transaction('boards').objectStore('boards').getAll();
      request.onsuccess = () => resolve(request.result[0]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  });
}
async function recognize(page: Page) {
  await page.getByTestId('recognize-math').click();
  await expect(page.getByTestId('recognition-latex')).toHaveValue('2+2=5');
}
async function png(page: Page) {
  return page.getByTestId('recognition-source').evaluate(async (el) => {
    const blob = await (await fetch((el as HTMLImageElement).src)).blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  });
}

test('Select → real PNG → alternatives → confirmed replacement; Undo restores all original ink and math stays editable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await create(page);
  const original = (await doc(page)).objects;
  expect(original).toHaveLength(7);
  await recognize(page);
  await expect(page.getByRole('note')).toContainText('не зависят от рукописи');
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(page.getByTestId('recognition-replace')).toBeDisabled();
  expect((await doc(page)).objects).toEqual(original);
  const pixels = await page.getByTestId('recognition-source').evaluate(async (el) => {
    const blob = await (await fetch((el as HTMLImageElement).src)).blob();
    const bitmap = await createImageBitmap(blob),
      canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] < 200 && data[i + 1] < 200 && data[i + 2] < 200) dark++;
    bitmap.close();
    return {
      type: blob.type,
      width: canvas.width,
      height: canvas.height,
      background: [...data.slice(0, 4)],
      dark,
    };
  });
  expect(pixels.type).toBe('image/png');
  expect(pixels.width).toBeLessThanOrEqual(1536);
  expect(pixels.height).toBeLessThanOrEqual(1536);
  expect(pixels.background).toEqual([255, 255, 255, 255]);
  expect(pixels.dark).toBeGreaterThan(200);
  await page.getByRole('checkbox', { name: 'Я проверил формулу и подтверждаю замену' }).check();
  await page.getByTestId('recognition-replace').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let board = await doc(page);
  expect(board.objects).toHaveLength(1);
  const formula = board.objects[0];
  expect(formula.type === 'math' && formula.latex).toBe('2+2=5');
  expect(formula.source?.provider).toBe('development-mock');
  expect(formula.source?.strokes).toHaveLength(7);
  await page.getByTestId('board-canvas').focus();
  await page.keyboard.press('Control+z');
  expect((await doc(page)).objects).toEqual(original);
  await page.keyboard.press('Control+Shift+z');
  expect((await doc(page)).objects).toEqual([formula]);
  await page.mouse.click(550, 450);
  const object = page.getByTestId('object-math');
  const box = (await object.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  board = await doc(page);
  expect(board.objects[0].x).toBeCloseTo(formula.x + 40);
  expect(board.objects[0].y).toBeCloseTo(formula.y + 20);
  const moved = (await object.boundingBox())!;
  await page.mouse.move(moved.x + moved.width, moved.y + moved.height);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width + 60, moved.y + moved.height + 20, { steps: 8 });
  await page.mouse.up();
  board = await doc(page);
  expect(board.objects[0].height).toBeGreaterThan(formula.height);
  await page.getByTestId('edit-object').click();
  await page.getByTestId('content-input').fill('2+2=5\\quad x^2');
  await page.getByTestId('submit-content').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('object-math').locator('annotation')).toHaveText('2+2=5\\quad x^2');
  board = await doc(page);
  expect(board.objects[0].type === 'math' && board.objects[0].latex).toBe('2+2=5\\quad x^2');
  await page.getByTestId('board-canvas').focus();
  await page.keyboard.press('Delete');
  expect((await doc(page)).objects).toHaveLength(0);
  await page.keyboard.press('Control+z');
  const saved = await doc(page);
  await page.getByTestId('back').click();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть: Новый урок' }).click();
  expect((await doc(page)).objects).toEqual(saved.objects);
  expect(errors).toEqual([]);
});

test('Lasso recognizes only ink; cancel preserves it; PNG is independent of zoom/theme and insert beside keeps originals', async ({
  page,
}) => {
  await create(page, true);
  const original = (await doc(page)).objects;
  await recognize(page);
  const source = await png(page);
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect((await doc(page)).objects).toEqual(original);
  await page.getByRole('button', { name: 'Сменить тему', exact: true }).click();
  await page.mouse.move(700, 500);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Масштаб 100%' })).toHaveText('182%');
  await recognize(page);
  expect(await png(page)).toBe(source);
  await page.getByRole('radio', { name: 'Вариант 3', exact: true }).check();
  await expect(page.getByTestId('recognition-latex')).toHaveValue('2+2=8');
  await page.getByTestId('recognition-latex').fill('\\frac{1}{2}+x^2');
  await page.getByTestId('recognition-beside').click();
  const objects = (await doc(page)).objects;
  expect(objects.slice(0, -1)).toEqual(original);
  const formula = objects.at(-1)!;
  expect(formula.type === 'math' && formula.latex).toBe('\\frac{1}{2}+x^2');
  expect(formula.source?.confidence).toBeUndefined();
  await page.getByTestId('board-canvas').focus();
  await page.keyboard.press('Control+z');
  expect((await doc(page)).objects).toEqual(original);
});

test('locked handwriting cannot be recognized; invalid preview cannot be applied; image errors can be retried', async ({
  page,
}) => {
  await create(page);
  const original = (await doc(page)).objects;
  await page.getByRole('button', { name: 'Заблокировать', exact: true }).click();
  await expect(page.getByTestId('recognize-math')).toBeDisabled();
  await page.getByRole('button', { name: 'Разблокировать', exact: true }).click();
  await page.evaluate(() => {
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(null);
    };
    document.addEventListener(
      'restore-recognition-image',
      () => {
        HTMLCanvasElement.prototype.toBlob = toBlob;
      },
      { once: true },
    );
  });
  await page.getByTestId('recognize-math').click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Распознавание не удалось',
  );
  expect((await doc(page)).objects).toEqual(original);
  await page.evaluate(() => document.dispatchEvent(new Event('restore-recognition-image')));
  await page.getByRole('dialog').getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByTestId('recognition-latex')).toHaveValue('2+2=5');
  await page.getByTestId('recognition-latex').fill('\\notarealcommand');
  await expect(page.getByTestId('recognition-beside')).toBeDisabled();
  await expect(page.getByTestId('recognition-replace')).toBeDisabled();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect((await doc(page)).objects).toEqual(original);
});

test('canceling an in-flight request does not mutate ink or history and permits a fresh request', async ({
  page,
}) => {
  await create(page);
  const original = (await doc(page)).objects;
  await page.evaluate(() => {
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function () {};
    document.addEventListener(
      'restore-recognition-image',
      () => {
        HTMLCanvasElement.prototype.toBlob = toBlob;
      },
      { once: true },
    );
  });
  await page.getByTestId('recognize-math').click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Подготовка и распознавание' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.evaluate(() => document.dispatchEvent(new Event('restore-recognition-image')));
  expect((await doc(page)).objects).toEqual(original);
  await recognize(page);
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByTestId('board-canvas').focus();
  await page.keyboard.press('Control+z');
  expect((await doc(page)).objects).toEqual(original.slice(0, -1));
});

test('recognition review is localized in English and Kazakh', async ({ page }) => {
  await create(page);
  await page.getByRole('combobox', { name: 'Язык' }).selectOption('en');
  await page.getByRole('button', { name: 'Recognize as formula', exact: true }).click();
  await expect(page.getByRole('note')).toContainText('Demo mode without AI');
  await expect(page.getByTestId('recognition-beside')).toHaveText('Insert beside');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('kk');
  await page.getByRole('button', { name: 'Формула ретінде тану', exact: true }).click();
  await expect(page.getByTestId('recognition-beside')).toHaveText('Жанына қою');
  await expect(page.getByRole('note')).toContainText('AI жоқ демо режим');
});
