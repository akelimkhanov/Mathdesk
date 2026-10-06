import { test, expect, type Page } from '@playwright/test';
import type { BoardDocument } from '../../src/core/types';
async function board(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-board').click();
  await page.getByTestId('create-board').click();
  await page.getByTestId('tool-pen').click();
}
async function documentData(page: Page): Promise<BoardDocument> {
  await expect(page.getByTestId('save-status')).toContainText('Сохранено');
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('ai-math-board', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const value = await new Promise<BoardDocument>((resolve) => {
      const r = db.transaction('boards').objectStore('boards').getAll();
      r.onsuccess = () => resolve(r.result[0]);
    });
    db.close();
    return value;
  });
}
async function livePixels(page: Page) {
  return page.locator('.overlay-canvas').evaluate(async (el) => {
    // Let any scheduled preview frame run without releasing the pointer.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const canvas = el as HTMLCanvasElement;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
    return painted;
  });
}
test('mouse ink appears and grows before release, then clears on cancel', async ({ page }) => {
  await board(page);
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(420, 335, { steps: 8 });
  const first = await livePixels(page);
  expect(first).toBeGreaterThan(100);
  await page.mouse.move(540, 290, { steps: 8 });
  expect(await livePixels(page)).toBeGreaterThan(first + 100);
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.keyboard.press('Escape');
  expect(await livePixels(page)).toBe(0);
  await page.mouse.up();
  expect((await documentData(page)).objects).toHaveLength(0);
});
test('shape preview is visible during drag and is committed only on release', async ({ page }) => {
  await board(page);
  await page.getByTestId('tool-shapes').click();
  await page.getByTestId('tool-rectangle').click();
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(500, 400, { steps: 8 });
  expect(await livePixels(page)).toBeGreaterThan(500);
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.mouse.up();
  expect(await livePixels(page)).toBe(0);
  expect((await documentData(page)).objects).toHaveLength(1);
});
test('pen pressure is retained and canceled strokes never enter history', async ({ page }) => {
  await board(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 350,
    y: 330,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'pen',
    force: 0.2,
  });
  for (let i = 1; i <= 12; i++)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 350 + i * 15,
      y: 330 + i * 4,
      button: 'left',
      buttons: 1,
      pointerType: 'pen',
      force: 0.2 + i * 0.05,
    });
  expect(await livePixels(page)).toBeGreaterThan(100);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 530,
    y: 378,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'pen',
    force: 0,
  });
  const doc = await documentData(page);
  expect(doc.objects).toHaveLength(1);
  const stroke = doc.objects[0];
  expect(stroke.type).toBe('stroke');
  if (stroke.type === 'stroke') {
    expect(stroke.points[0].pressure).toBeCloseTo(0.2);
    expect(stroke.points.at(-1)!.pressure).toBeGreaterThan(0.7);
  }
  await page.mouse.move(600, 400);
  await page.mouse.down();
  await page.mouse.move(800, 450, { steps: 10 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await documentData(page)).objects).toHaveLength(1);
});
test('two-finger pinch zoom does not leave accidental ink', async ({ page }) => {
  await board(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 550, y: 400, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 550, y: 400, id: 1 },
      { x: 700, y: 400, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: 475, y: 400, id: 1 },
      { x: 775, y: 400, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('button', { name: 'Масштаб 100%' })).not.toHaveText('100%');
  expect((await documentData(page)).objects).toHaveLength(0);
});
test('resize and rotation handles form separate undoable operations', async ({ page }) => {
  await board(page);
  await page.getByTestId('tool-shapes').click();
  await page.getByTestId('tool-rectangle').click();
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(500, 400, { steps: 10 });
  await page.mouse.up();
  await page.getByTestId('tool-select').click();
  await page.mouse.click(400, 350);
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(600, 450, { steps: 10 });
  await page.mouse.up();
  let doc = await documentData(page);
  expect(doc.objects[0].width).toBeCloseTo(300);
  expect(doc.objects[0].height).toBeCloseTo(150);
  await page.mouse.move(450, 276);
  await page.mouse.down();
  await page.mouse.move(550, 375, { steps: 10 });
  await page.mouse.up();
  doc = await documentData(page);
  expect(Math.abs(doc.objects[0].rotation)).toBeGreaterThan(1);
  await page.getByTestId('undo').click();
  doc = await documentData(page);
  expect(doc.objects[0].rotation).toBe(0);
  expect(doc.objects[0].width).toBeCloseTo(300);
  await page.getByTestId('undo').click();
  doc = await documentData(page);
  expect(doc.objects[0].width).toBeCloseTo(200);
});
