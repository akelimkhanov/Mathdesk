import { test, expect, type Page } from '@playwright/test';

async function present(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-board').click();
  await page.getByTestId('create-board').click();
  await page.getByRole('button', { name: 'Режим презентации', exact: true }).click();
  await expect(page.locator('.compact-toolbar')).toBeVisible();
}

const isFullscreen = (page: Page) => page.evaluate(() => !!document.fullscreenElement);

test('fullscreen button targets documentElement, toggles its icon and leaves presentation active', async ({
  page,
}) => {
  await present(page);
  expect(await isFullscreen(page)).toBe(false);
  const button = page.getByTestId('browser-fullscreen');
  await expect(button).toHaveText('На весь экран');
  await expect(button.locator('.lucide-maximize')).toBeVisible();
  await button.click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement))
    .toBe(true);
  await expect(button).toHaveText('Выйти из полного экрана');
  await expect(button.locator('.lucide-minimize')).toBeVisible();
  await button.click();
  await expect.poll(() => isFullscreen(page)).toBe(false);
  await expect(button).toHaveText('На весь экран');
  await expect(page.locator('.compact-toolbar')).toBeVisible();
  await expect(page.locator('.editor-header')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('tool-pen').click();
  const controls = await page.locator('.presentation-exit').boundingBox();
  const context = await page.locator('.minimal-context').boundingBox();
  expect(controls!.x).toBeGreaterThan(context!.x + context!.width);
  await page.getByRole('button', { name: 'На весь экран', exact: true }).click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await page.getByRole('button', { name: 'Выйти из полного экрана', exact: true }).click();
  await expect.poll(() => isFullscreen(page)).toBe(false);
});

test('Escape exits browser fullscreen while presentation remains; windowed Escape still exits presentation', async ({
  page,
}) => {
  await present(page);
  await page.getByTestId('browser-fullscreen').click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => isFullscreen(page)).toBe(false);
  await expect(page.getByTestId('browser-fullscreen')).toHaveText('На весь экран');
  await expect(page.locator('.compact-toolbar')).toBeVisible();
  await expect(page.locator('.editor-header')).toHaveCount(0);
  // A separate key press after the native Escape transition retains the existing windowed shortcut.
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await expect(page.locator('.editor-header')).toBeVisible();
});

test('fullscreenchange synchronizes UI for browser-initiated changes, including native Escape event order', async ({
  page,
}) => {
  await present(page);
  // Enter outside the Mathdesk button, then leave as a browser control would.
  await page.evaluate(() => document.documentElement.requestFullscreen());
  await expect(page.getByTestId('browser-fullscreen')).toHaveText('Выйти из полного экрана');
  await page.evaluate(async () => {
    await document.exitFullscreen();
    // The element is cleared before fullscreenchange reaches the page.
    document
      .querySelector('[data-testid="board-canvas"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  await expect(page.getByTestId('browser-fullscreen')).toHaveText('На весь экран');
  await expect(page.locator('.compact-toolbar')).toBeVisible();
  await expect(page.locator('.editor-header')).toHaveCount(0);
  await page.getByTestId('browser-fullscreen').click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        document.addEventListener(
          'fullscreenchange',
          () => {
            // Native Escape can also arrive after fullscreenchange has been handled.
            document
              .querySelector('[data-testid="board-canvas"]')!
              .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            resolve();
          },
          { once: true },
        );
        document.exitFullscreen().catch(reject);
      }),
  );
  await expect(page.getByTestId('browser-fullscreen')).toHaveText('На весь экран');
  await expect(page.locator('.compact-toolbar')).toBeVisible();
});

test('presentation works without Fullscreen API', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      value: undefined,
      configurable: true,
    });
  });
  await present(page);
  await expect(page.getByTestId('browser-fullscreen')).toHaveCount(0);
  await page.getByTestId('tool-pen').click();
  await expect(page.getByTestId('tool-pen')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Выйти из презентации', exact: true }).click();
  await expect(page.locator('.editor-header')).toBeVisible();
  expect(errors).toEqual([]);
});

test('denied fullscreen requests do not change state or break the presentation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      value: () => Promise.reject(new Error('Fullscreen denied')),
      configurable: true,
    });
  });
  await present(page);
  const button = page.getByTestId('browser-fullscreen');
  await button.click();
  await expect(button).toBeEnabled();
  await expect(button).toHaveText('На весь экран');
  expect(await isFullscreen(page)).toBe(false);
  await expect(page.locator('.compact-toolbar')).toBeVisible();
  await page.getByRole('button', { name: 'Выйти из презентации', exact: true }).click();
  await expect(page.locator('.editor-header')).toBeVisible();
  expect(errors).toEqual([]);
});
