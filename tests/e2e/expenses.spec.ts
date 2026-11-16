import { expect, test } from '@playwright/test'

test('se agrega un gasto y persiste tras recargar', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Gastos' })).toBeVisible()

  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ej.: Verdulería').fill('Café de especialidad')
  await dialog.getByPlaceholder('1250,50').fill('3250,75')
  await dialog.getByRole('combobox', { name: 'Rubro' }).selectOption('Entretenimiento')
  await dialog.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText('Café de especialidad')).toBeVisible()
  await expect(page.getByText('$ 3.250,75', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByText('Café de especialidad')).toBeVisible()

  await page.getByRole('button', { name: 'Eliminar Café de especialidad' }).click()
  await expect(page.getByText('Café de especialidad')).toBeHidden()
})
