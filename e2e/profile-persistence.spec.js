// Smoke test: the persistence spine (see docs/ARCHITECTURE.md, "Testing
// Policy"). A created profile must survive a reload and stay active. The
// canonical scenario also covers planning a semester, but that is not
// implemented yet (UC-11/UC-12) — this covers the persistence seam alone.

import { expect, test } from '@playwright/test';

test('created profile survives a reload and stays the active profile', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Criar perfil' }).click();
  const createDialog = page.locator('dialog[open]');
  await createDialog.getByLabel('Nome').fill('Maria Playwright');
  await createDialog.getByRole('button', { name: 'Criar', exact: true }).click();

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Maria Playwright' })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Maria Playwright' })).toBeVisible();
});
