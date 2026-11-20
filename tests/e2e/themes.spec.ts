import { expect, test } from '@playwright/test'

test('el tema Gatitos se elige y usa la tipografía amigable', async ({ page }) => {
  await page.goto('/#/ajustes')
  await page.getByRole('button', { name: /Gatitos/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gatitos')
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(font).toContain('Nunito')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gatitos')
  await page.getByRole('button', { name: /Clásico/ }).click()
})

test('el tema se elige en Ajustes y sobrevive a la recarga', async ({ page }) => {
  await page.goto('/#/ajustes')
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()

  await page.getByRole('button', { name: /Neón/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oscuro')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oscuro')

  await page.getByRole('button', { name: /Clásico/ }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'oscuro')
})
