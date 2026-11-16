import { expect, test } from '@playwright/test'

test('el tema se elige en Ajustes y sobrevive a la recarga', async ({ page }) => {
  await page.goto('/#/ajustes')
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()

  await page.getByRole('button', { name: /Oscuro/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oscuro')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oscuro')

  await page.getByRole('button', { name: /Clásico/ }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'oscuro')
})
