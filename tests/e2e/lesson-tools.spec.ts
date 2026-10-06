import { test, expect, type Page } from '@playwright/test';
import type { BoardDocument, Point } from '../../src/core/types';
async function create(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-board').click();
  await page.getByTestId('create-board').click();
  await expect(page.getByTestId('board-canvas')).toBeVisible();
}
async function doc(page: Page): Promise<BoardDocument> {
  await expect(page.getByTestId('save-status')).toContainText('Сохранено');
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('ai-math-board', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const d = await new Promise<BoardDocument>((resolve) => {
      const r = db.transaction('boards').objectStore('boards').getAll();
      r.onsuccess = () => resolve(r.result[0]);
    });
    db.close();
    return d;
  });
}
async function camera(page: Page) {
  return page
    .getByTestId('board-canvas')
    .locator('.semantic-layer')
    .evaluate((el) => {
      const matrix = new DOMMatrix(getComputedStyle(el).transform);
      return { x: matrix.e, y: matrix.f, zoom: matrix.a };
    });
}
async function drag(page: Page, a: Point, b: Point, button: 'left' | 'middle' | 'right' = 'left') {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button });
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up({ button });
}
async function shape(page: Page, a: Point, b: Point) {
  await page.getByTestId('tool-shapes').click();
  await page.getByTestId('tool-rectangle').click();
  await drag(page, a, b);
  await page.getByTestId('tool-select').click();
}

test('Space, middle drag, and Select right-drag pan without adding history or ink', async ({
  page,
}) => {
  await create(page);
  await page.keyboard.press('p');
  let previous = await camera(page);
  await page.keyboard.down('Space');
  await drag(page, { x: 500, y: 400 }, { x: 600, y: 480 });
  await page.keyboard.up('Space');
  let next = await camera(page);
  expect(next.x - previous.x).toBeCloseTo(100);
  expect(next.y - previous.y).toBeCloseTo(80);
  previous = next;
  await drag(page, { x: 600, y: 500 }, { x: 650, y: 540 }, 'middle');
  next = await camera(page);
  expect(next.x - previous.x).toBeCloseTo(50);
  await page.keyboard.press('v');
  previous = next;
  await drag(page, { x: 650, y: 500 }, { x: 700, y: 550 }, 'right');
  next = await camera(page);
  expect(next.y - previous.y).toBeCloseTo(50);
  expect((await doc(page)).objects).toHaveLength(0);
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.keyboard.press('h');
  await expect(page.getByTestId('tool-pan')).toHaveAttribute('aria-pressed', 'true');
});
test('animated cursor zoom stays anchored, reaches limits, and supports reset/fit', async ({
  page,
}) => {
  await create(page);
  await shape(page, { x: 350, y: 320 }, { x: 550, y: 420 });
  const original = (await doc(page)).objects;
  const rect = await page.getByTestId('board-canvas').boundingBox();
  const anchor = { x: 760, y: 480 };
  const before = await camera(page),
    world = {
      x: (anchor.x - rect!.x - before.x) / before.zoom,
      y: (anchor.y - rect!.y - before.y) / before.zoom,
    };
  await page.mouse.move(anchor.x, anchor.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Масштаб 100%' })).toHaveText('182%');
  const after = await camera(page);
  expect(world.x * after.zoom + after.x).toBeCloseTo(anchor.x - rect!.x, 2);
  expect(world.y * after.zoom + after.y).toBeCloseTo(anchor.y - rect!.y, 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -1000);
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Масштаб 100%' })).toHaveText('500%');
  await page.keyboard.down('Control');
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 1000);
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Масштаб 100%' })).toHaveText('10%');
  await page.getByRole('button', { name: 'Масштаб 100%' }).click();
  await expect(page.getByRole('button', { name: 'Масштаб 100%' })).toHaveText('100%');
  await page.getByRole('button', { name: 'Показать всё', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Масштаб 100%' })).toHaveText('200%');
  expect((await doc(page)).objects).toEqual(original);
});
const line = Array.from({ length: 18 }, (_, i) => ({
  x: 300 + i * 14,
  y: 350 + Math.sin(i) * 1.2,
}));
const circle = Array.from({ length: 51 }, (_, i) => ({
  x: 450 + 80 * Math.cos((i * Math.PI) / 25),
  y: 390 + 80 * Math.sin((i * Math.PI) / 25),
}));
const rectangle = [
  ...Array.from({ length: 15 }, (_, i) => ({ x: 320 + i * 12, y: 300 })),
  ...Array.from({ length: 10 }, (_, i) => ({ x: 500, y: 300 + i * 12 })),
  ...Array.from({ length: 15 }, (_, i) => ({ x: 500 - i * 12, y: 420 })),
  ...Array.from({ length: 11 }, (_, i) => ({ x: 320, y: 420 - i * 12 })),
];
for (const [name, points, kind] of [
  ['line', line, 'line'],
  ['circle', circle, 'ellipse'],
  ['rectangle', rectangle, 'rectangle'],
] as const) {
  test(`hold recognizes ${name}; Undo restores original ink, then removes stroke`, async ({
    page,
  }) => {
    await create(page);
    await page.keyboard.press('p');
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('hold-recognition')).toBeVisible();
    await page.mouse.up();
    let board = await doc(page);
    expect(board.objects).toHaveLength(1);
    expect(board.objects[0].type === 'shape' && board.objects[0].kind).toBe(kind);
    expect(board.objects[0].source?.strokes?.[0].length).toBeGreaterThan(1);
    await page.keyboard.press('Control+z');
    board = await doc(page);
    expect(board.objects[0].type).toBe('stroke');
    const original = board.objects[0];
    await page.keyboard.press('Control+z');
    expect((await doc(page)).objects).toHaveLength(0);
    await page.keyboard.press('Control+Shift+z');
    expect((await doc(page)).objects[0]).toEqual(original);
    await page.keyboard.press('Control+Shift+z');
    expect((await doc(page)).objects[0].type).toBe('shape');
  });
}
test('moving after a hold cancels conversion; immediate release keeps handwriting', async ({
  page,
}) => {
  await create(page);
  await page.keyboard.press('p');
  await page.mouse.move(300, 350);
  await page.mouse.down();
  await page.mouse.move(540, 350, { steps: 15 });
  await expect(page.getByTestId('hold-recognition')).toBeVisible();
  await page.mouse.move(570, 400);
  await page.mouse.up();
  expect((await doc(page)).objects[0].type).toBe('stroke');
  await drag(page, { x: 350, y: 500 }, { x: 650, y: 500 });
  expect((await doc(page)).objects[1].type).toBe('stroke');
});
test('lasso selects by polygon, groups move/duplicate together, locks and JSON preserve groups', async ({
  page,
}) => {
  await create(page);
  await shape(page, { x: 300, y: 300 }, { x: 400, y: 360 });
  await shape(page, { x: 450, y: 300 }, { x: 550, y: 360 });
  await shape(page, { x: 720, y: 520 }, { x: 820, y: 580 });
  await page.getByRole('button', { name: 'Выделение рамкой', exact: true }).click();
  await page.getByTestId('tool-lasso').click();
  await page.mouse.move(250, 250);
  await page.mouse.down();
  for (const p of [
    { x: 620, y: 250 },
    { x: 620, y: 430 },
    { x: 250, y: 430 },
    { x: 250, y: 250 },
  ])
    await page.mouse.move(p.x, p.y, { steps: 10 });
  await page.mouse.up();
  await page.getByTestId('group').click();
  let board = await doc(page);
  expect(board.objects[0].groupId).toBeTruthy();
  expect(board.objects[1].groupId).toBe(board.objects[0].groupId);
  expect(board.objects[2].groupId).toBeUndefined();
  await page.keyboard.press('v');
  await drag(page, { x: 350, y: 330 }, { x: 390, y: 390 });
  board = await doc(page);
  expect(board.objects[0].x).toBeCloseTo(340);
  expect(board.objects[1].x).toBeCloseTo(490);
  await page.getByRole('button', { name: 'Заблокировать', exact: true }).click();
  await page.getByTestId('board-canvas').focus();
  await page.keyboard.press('Delete');
  expect((await doc(page)).objects).toHaveLength(3);
  await page.getByRole('button', { name: 'Разблокировать', exact: true }).click();
  await page.getByTestId('board-canvas').focus();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  board = await doc(page);
  expect(board.objects).toHaveLength(5);
  expect(board.objects[3].groupId).toBe(board.objects[4].groupId);
  expect(board.objects[3].groupId).not.toBe(board.objects[0].groupId);
  await page.getByTestId('ungroup').click();
  board = await doc(page);
  expect(board.objects[3].groupId).toBeUndefined();
  await page.keyboard.press('Control+z');
  board = await doc(page);
  expect(board.objects[3].groupId).toBeTruthy();
  await page.getByTestId('back').click();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть: Новый урок' }).click();
  board = await doc(page);
  expect(board.objects[0].groupId).toBe(board.objects[1].groupId);
  expect(board.objects[3].groupId).toBe(board.objects[4].groupId);
});
test('color and thickness changes undo/redo independently', async ({ page }) => {
  await create(page);
  await shape(page, { x: 320, y: 320 }, { x: 520, y: 440 });
  await page.mouse.click(400, 380);
  await page.getByRole('button', { name: 'Красный', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Толщина', exact: true });
  await slider.focus();
  await page.keyboard.press('End');
  await page.getByTestId('board-canvas').focus();
  let board = await doc(page);
  expect(board.objects[0].style.color).toBe('#dc5972');
  expect(board.objects[0].style.width).toBe(30);
  await page.keyboard.press('Control+z');
  board = await doc(page);
  expect(board.objects[0].style.width).toBe(3);
  expect(board.objects[0].style.color).toBe('#dc5972');
  await page.keyboard.press('Control+z');
  expect((await doc(page)).objects[0].style.color).toBe('#303245');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  expect((await doc(page)).objects[0].style.width).toBe(30);
});
test('presentation keeps its working toolbar independently of browser fullscreen', async ({
  page,
}) => {
  await create(page);
  await page.getByRole('button', { name: 'Режим презентации', exact: true }).click();
  await expect(page.locator('.editor-header')).toHaveCount(0);
  await expect(page.locator('.compact-toolbar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.getByRole('button', { name: 'На весь экран', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByTestId('tool-pen').click();
  await drag(page, { x: 350, y: 350 }, { x: 600, y: 400 });
  await page.getByRole('button', { name: 'Выйти из полного экрана', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(page.locator('.compact-toolbar')).toBeVisible();
  await expect(page.locator('.editor-header')).toHaveCount(0);
  await page.getByRole('button', { name: 'Выйти из презентации', exact: true }).click();
  await expect(page.locator('.editor-header')).toBeVisible();
  expect((await doc(page)).objects).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.keyboard.press('m');
  await expect(page.getByTestId('tool-math')).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(420, 320);
  await page.getByTestId('content-input').fill('2+2=5');
  await page.getByTestId('submit-content').click();
  const board = await doc(page);
  expect(board.objects[1].type === 'math' && board.objects[1].latex).toBe('2+2=5');
});
