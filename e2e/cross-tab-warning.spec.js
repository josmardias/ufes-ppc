// Smoke test: the two-tab warning (see docs/ARCHITECTURE.md, "Testing
// Policy" and "Concurrent tabs"). The `storage` event only fires in *other*
// tabs than the one that wrote the data, so the writer never sees its own
// banner, while the other tab does.

import { expect, test } from '@playwright/test';

test('a write in one tab warns another tab, but not itself', async ({
  context,
}) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto('/');
  await pageA.getByRole('button', { name: 'Criar perfil' }).click();
  const createDialogA = pageA.locator('dialog[open]');
  await createDialogA.getByLabel('Nome').fill('Maria A');
  await createDialogA
    .getByRole('button', { name: 'Criar', exact: true })
    .click();
  await expect(pageA).toHaveURL(/\/plan$/);

  await pageB.goto('/');
  await expect(pageB.getByText('Maria A')).toBeVisible();

  await pageA.goto('/');
  await pageA.getByRole('button', { name: 'Criar perfil' }).click();
  const createDialogA2 = pageA.locator('dialog[open]');
  await createDialogA2.getByLabel('Nome').fill('Maria B');
  await createDialogA2
    .getByRole('button', { name: 'Criar', exact: true })
    .click();

  await expect(
    pageB.getByText('Os dados foram alterados em outra aba.'),
  ).toBeVisible();
  await expect(
    pageA.getByText('Os dados foram alterados em outra aba.'),
  ).not.toBeVisible();
});
