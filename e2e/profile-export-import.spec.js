// Smoke test: the export -> delete -> import round-trip (see
// docs/ARCHITECTURE.md, "Testing Policy", and docs/USE_CASES.md UC-05/06/07).

import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('a profile exported, then deleted, can be imported back', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Criar perfil' }).click();
  const createDialog = page.locator('dialog[open]');
  await createDialog.getByLabel('Nome').fill('Maria Export');
  await createDialog
    .getByRole('button', { name: 'Criar', exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan$/);

  await page.goto('/');
  const row = page.getByRole('listitem').filter({ hasText: 'Maria Export' });
  await expect(row).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    row.getByRole('button', { name: 'Exportar' }).click(),
  ]);
  const exportedPath = await download.path();
  const exportedContent = await fs.readFile(exportedPath, 'utf-8');

  await row.getByRole('button', { name: 'Excluir' }).click();
  const deleteDialog = page.locator('dialog[open]');
  await deleteDialog
    .getByRole('button', { name: 'Excluir', exact: true })
    .click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Maria Export' }),
  ).toHaveCount(0);

  await page.setInputFiles('input[type="file"]', {
    name: 'maria-export.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedContent, 'utf-8'),
  });

  await expect(
    page.getByRole('listitem').filter({ hasText: 'Maria Export' }),
  ).toBeVisible();
});
