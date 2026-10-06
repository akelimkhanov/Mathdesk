import { test, expect, type Page } from '@playwright/test';
import type { BoardDocument } from '../../src/core/types';

async function create(page: Page, title = 'Тестовый урок') {
  await page.goto('/');
  await page.getByTestId('new-board').click();
  await page.getByTestId('new-title').fill(title);
  await page.getByTestId('create-board').click();
  await expect(page.getByTestId('board-canvas')).toBeVisible();
}
async function savedDoc(page: Page): Promise<BoardDocument> {
  await expect(page.getByTestId('save-status')).toContainText('Сохранено');
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('ai-math-board', 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const doc = await new Promise<BoardDocument>((resolve, reject) => {
      const r = db.transaction('boards').objectStore('boards').getAll();
      r.onsuccess = () => resolve(r.result[0]);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return doc;
  });
}
async function drag(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

test('draw, move, erase, undo/redo and reload preserve real stroke data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await create(page);
  await page.getByTestId('tool-pen').click();
  await drag(page, { x: 390, y: 350 }, { x: 590, y: 445 });
  let doc = await savedDoc(page);
  expect(doc.objects).toHaveLength(1);
  expect(doc.objects[0].type).toBe('stroke');
  if (doc.objects[0].type === 'stroke') expect(doc.objects[0].points.length).toBeGreaterThan(5);
  await page.getByTestId('tool-select').click();
  await drag(page, { x: 490, y: 397 }, { x: 640, y: 497 });
  doc = await savedDoc(page);
  expect(doc.objects[0].x).toBeGreaterThan(500);
  await page.keyboard.press('Control+z');
  doc = await savedDoc(page);
  expect(doc.objects[0].x).toBeCloseTo(390, 0);
  await page.keyboard.press('Control+Shift+z');
  doc = await savedDoc(page);
  expect(doc.objects[0].x).toBeGreaterThan(500);
  await page.getByTestId('tool-eraser').click();
  await page.mouse.click(640, 497);
  expect((await savedDoc(page)).objects).toHaveLength(0);
  await page.getByTestId('undo').click();
  expect((await savedDoc(page)).objects).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: 'Открыть: Тестовый урок' }).click();
  expect((await savedDoc(page)).objects).toHaveLength(1);
  expect(errors).toEqual([]);
});
test('editable formulas preserve intentional math and changes are undoable', async ({ page }) => {
  await create(page);
  await page.getByTestId('tool-math').click();
  await page.mouse.click(420, 320);
  await page.getByTestId('content-input').fill('2 + 2 = 5');
  await page.getByTestId('submit-content').click();
  await expect(page.getByTestId('object-math')).toBeVisible();
  let doc = await savedDoc(page);
  expect(doc.objects[0].type === 'math' && doc.objects[0].latex).toBe('2 + 2 = 5');
  await page.getByTestId('edit-object').click();
  await page.getByTestId('content-input').fill('\\frac{1}{2} + x^2');
  await page.getByTestId('submit-content').click();
  doc = await savedDoc(page);
  expect(doc.objects[0].type === 'math' && doc.objects[0].latex).toBe('\\frac{1}{2} + x^2');
  await page.getByTestId('undo').click();
  doc = await savedDoc(page);
  expect(doc.objects[0].type === 'math' && doc.objects[0].latex).toBe('2 + 2 = 5');
});
test('shapes can be resized, rotated, duplicated, selected together and deleted', async ({
  page,
}) => {
  await create(page);
  await page.getByTestId('tool-shapes').click();
  await page.getByTestId('tool-rectangle').click();
  await drag(page, { x: 380, y: 300 }, { x: 620, y: 450 });
  await page.getByTestId('tool-select').click();
  await page.mouse.click(490, 375);
  await page.getByRole('spinbutton', { name: 'Ширина', exact: true }).fill('300');
  await page.getByRole('spinbutton', { name: 'Ширина', exact: true }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Поворот', exact: true }).fill('45');
  await page.getByRole('spinbutton', { name: 'Поворот', exact: true }).press('Enter');
  let doc = await savedDoc(page);
  expect(doc.objects[0].width).toBe(300);
  expect(doc.objects[0].rotation).toBeCloseTo(Math.PI / 4);
  await page.getByTestId('duplicate').click();
  expect((await savedDoc(page)).objects).toHaveLength(2);
  await page.mouse.click(800, 600);
  await drag(page, { x: 250, y: 160 }, { x: 850, y: 650 });
  await page.keyboard.press('Delete');
  expect((await savedDoc(page)).objects).toHaveLength(0);
  await page.getByTestId('undo').click();
  expect((await savedDoc(page)).objects).toHaveLength(2);
});
test('pan and zoom keep document data unchanged; text and locale persist', async ({ page }) => {
  await create(page);
  await page.getByTestId('tool-text').click();
  await page.mouse.click(420, 320);
  await page.getByTestId('content-input').fill('Решим квадратное уравнение');
  await page.getByTestId('submit-content').click();
  const before = await savedDoc(page);
  await page.mouse.move(750, 500);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Масштаб 100%' })).not.toHaveText('100%');
  await page.keyboard.down('Space');
  await drag(page, { x: 750, y: 500 }, { x: 860, y: 560 });
  await page.keyboard.up('Space');
  const after = await savedDoc(page);
  expect(after.objects).toEqual(before.objects);
  await page.getByRole('combobox', { name: 'Язык' }).selectOption('kk');
  await expect(page.getByRole('button', { name: 'Барлық тақта' })).toBeVisible();
  await page.getByRole('button', { name: 'Барлық тақта' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Тақталарыңыз/ })).toBeVisible();
});
test('JSON download/import round-trips and corrupt import is rejected', async ({ page }) => {
  await create(page, 'Backup');
  await page.getByTestId('tool-text').click();
  await page.mouse.click(420, 320);
  await page.getByTestId('content-input').fill('Сохранить это');
  await page.getByTestId('submit-content').click();
  const doc = await savedDoc(page);
  const downloaded = page.waitForEvent('download');
  await page.getByTestId('download').click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('Backup.mathboard.json');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = Buffer.concat(chunks);
  expect(JSON.parse(backup.toString())).toEqual(doc);
  await page.getByTestId('back').click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'corrupt.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":9}'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Некорректный' })).toBeVisible();
  await page
    .getByTestId('import-file')
    .setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: backup });
  await expect(page.getByTestId('object-text')).toContainText('Сохранить это');
  await expect(page.getByTestId('save-status')).toContainText('Сохранено');
});
test('dark theme, invalid LaTeX and locked objects behave correctly', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: 'Сменить тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('tool-math').click();
  await page.mouse.click(420, 320);
  await page.getByTestId('content-input').fill('\\frac{');
  await expect(page.getByTestId('submit-content')).toBeDisabled();
  await page.getByTestId('content-input').fill('x^2');
  await page.getByTestId('submit-content').click();
  await page.getByRole('button', { name: 'Заблокировать', exact: true }).click();
  await expect(page.getByTestId('delete-object')).toBeDisabled();
  await page.getByTestId('board-canvas').focus();
  await page.keyboard.press('Delete');
  expect((await savedDoc(page)).objects).toHaveLength(1);
  await page.getByRole('button', { name: 'Разблокировать', exact: true }).click();
  await page.getByTestId('delete-object').click();
  expect((await savedDoc(page)).objects).toHaveLength(0);
});
