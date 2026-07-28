// Smoke test: the persistence spine (see docs/ARCHITECTURE.md, "Testing
// Policy"). A created profile must survive a reload and stay active. The
// canonical scenario also covers planning a semester, but that is not
// implemented yet (UC-11/UC-12) — this covers the persistence seam alone.
// Also covers the Completed (Concluídos) checklist's checkbox flow (UC-15,
// UC-20/21) — the closest fit for a persistence-through-reload assertion.

import { expect, test } from '@playwright/test';

test('created profile survives a reload and stays the active profile', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Criar perfil' }).click();
  const createDialog = page.locator('dialog[open]');
  await createDialog.getByLabel('Nome').fill('Maria Playwright');
  await createDialog
    .getByRole('button', { name: 'Criar', exact: true })
    .click();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(
    page.getByRole('heading', { name: 'Maria Playwright' }),
  ).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(
    page.getByRole('heading', { name: 'Maria Playwright' }),
  ).toBeVisible();
});

test('checking a Required Subject in Concluídos creates a Credit Entry that persists (UC-15)', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Criar perfil' }).click();
  const createDialog = page.locator('dialog[open]');
  await createDialog.getByLabel('Nome').fill('Carlos Playwright');
  // Ingress far in the future forces zero elapsed semesters, so profile
  // creation seeds no Credit Entries (UC-02) — every Required Subject in the
  // checklist starts unchecked. Under UC-15 step 4, a fully-unchecked group
  // starts collapsed, so its group must be expanded before interacting with
  // a row inside it.
  await createDialog.getByLabel('Ano de ingresso').fill('2099');
  await createDialog
    .getByRole('button', { name: 'Criar', exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan$/);

  await page.getByRole('button', { name: 'Concluídos' }).click();
  await expect(page.getByRole('tab', { name: 'Obrigatórias' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const groupHeader = page.getByRole('button', { name: '1º período' });
  await expect(groupHeader).toHaveAttribute('aria-expanded', 'false');
  await groupHeader.click();
  await expect(groupHeader).toHaveAttribute('aria-expanded', 'true');

  const requiredRow = page
    .getByRole('listitem')
    .filter({ hasText: 'PROGRAMAÇÃO I' });
  const checkbox = requiredRow.getByRole('checkbox');
  const auditToggle = requiredRow.getByRole('button', { name: 'Ouvinte' });
  await expect(checkbox).not.toBeChecked();
  await expect(auditToggle).not.toBeVisible();

  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(auditToggle).toBeVisible();

  // Checking one Subject in a fully-unchecked group makes it partially
  // checked — but collapse state is computed only when the view opens, so
  // the group must stay expanded until the next time Concluídos is opened.
  await expect(groupHeader).toHaveAttribute('aria-expanded', 'true');

  await page.reload();
  await page.getByRole('button', { name: 'Concluídos' }).click();

  // Re-opening Concluídos recomputes collapse state (UC-15 step 4): the
  // 1º período group is now partially checked, so it starts expanded.
  const groupHeaderAfterReload = page.getByRole('button', {
    name: '1º período',
  });
  await expect(groupHeaderAfterReload).toHaveAttribute('aria-expanded', 'true');

  const requiredRowAfterReload = page
    .getByRole('listitem')
    .filter({ hasText: 'PROGRAMAÇÃO I' });
  await expect(requiredRowAfterReload.getByRole('checkbox')).toBeChecked();

  await requiredRowAfterReload.getByRole('checkbox').uncheck();
  await expect(requiredRowAfterReload.getByRole('checkbox')).not.toBeChecked();
});

test('the Optional tab search in Concluídos is case- and accent-insensitive (UC-15 step 5)', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Criar perfil' }).click();
  const createDialog = page.locator('dialog[open]');
  await createDialog.getByLabel('Nome').fill('Ana Playwright');
  await createDialog
    .getByRole('button', { name: 'Criar', exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan$/);

  await page.getByRole('button', { name: 'Concluídos' }).click();
  await page.getByRole('tab', { name: 'Optativas' }).click();

  const search = page.getByPlaceholder('Buscar por nome ou código');
  await search.fill('computacao');
  await expect(page.getByText('COMPUTAÇÃO GRÁFICA')).toBeVisible();

  await search.fill('disciplina inexistente');
  await expect(page.getByText('Nenhuma disciplina encontrada.')).toBeVisible();
});
