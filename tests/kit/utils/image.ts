import { join } from 'node:path';

import type { Page } from '@playwright/test';

export async function importImage(page: Page, pathInFixtures: string) {
  await page.evaluate(() => {
    // Force fallback to input[type=file] in tests
    // See https://github.com/microsoft/playwright/issues/8850
    // @ts-expect-error allow
    window.showOpenFilePicker = undefined;
  });

  const fileChooser = page.waitForEvent('filechooser');

  // open slash menu
  await page.keyboard.type('/image', { delay: 50 });
  await page.keyboard.press('Enter');
  await (
    await fileChooser
  ).setFiles(join(__dirname, '../../fixtures', pathInFixtures));
  // TODO(@catsjuice): wait for image to be loaded more reliably
  await page.waitForTimeout(1000);
}
