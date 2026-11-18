import { expect, test } from '@playwright/test'

test('la pestaña Saldo muestra el saldo acumulado en modo local', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Saldo' }).click()
  await expect(page.getByRole('heading', { name: 'Saldo' })).toBeVisible()
  await expect(
    page.getByText(/Están a mano: no hay nada que pagar\.|Todavía no hay gastos/),
  ).toBeVisible()
})

test('autocompleta la descripción y recuerda el rubro', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const dialog = page.getByRole('dialog')
  const rubro = dialog.getByRole('combobox', { name: 'Rubro' })
  await expect(rubro.locator('option', { hasText: 'Vacaciones' })).toHaveCount(1)

  await dialog.getByPlaceholder('Ej.: Verdulería').fill('verduleria')
  await dialog.getByRole('button', { name: /Verdulería/ }).click()
  await expect(dialog.getByPlaceholder('Ej.: Verdulería')).toHaveValue('Verdulería')
  await expect(rubro).toHaveValue('Alimentación')
})

test('el reparto por partes se puede elegir y convertir', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Por partes' }).click()
  const partes = dialog.getByLabel('Partes de Vos')
  await expect(partes).toBeVisible()
  await expect(dialog.getByText('Equivale a 100 %')).toBeVisible()
  await partes.fill('3')
  await dialog.getByPlaceholder('Ej.: Verdulería').fill('Gasto por partes')
  await dialog.getByLabel('Monto').fill('900')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Gasto por partes')).toBeVisible()
})

test('un gasto se puede editar y el cambio persiste', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Editar Verdulería' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Editar gasto' })).toBeVisible()
  await expect(dialog.getByPlaceholder('Ej.: Verdulería')).toHaveValue('Verdulería')
  await dialog.getByPlaceholder('Ej.: Verdulería').fill('Verdulería del barrio')
  await dialog.getByLabel('Monto').fill('200')
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click()

  await expect(page.getByText('Verdulería del barrio')).toBeVisible()
  await expect(page.getByText('€ 200,00', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Verdulería del barrio')).toBeVisible()
  await expect(page.getByText('€ 200,00', { exact: true })).toBeVisible()
})

test('un gasto en la moneda base no muestra el equivalente', async ({ page }) => {
  await page.goto('/')
  const fila = page.getByText('Verdulería').locator('..').locator('..')
  await expect(fila).toContainText('€ 185,00')
  await expect(fila).not.toContainText('≈')
})

test('un gasto en otra moneda pide el equivalente y lo muestra', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ej.: Verdulería').fill('Café en dólares')
  await dialog.getByLabel('Monto').fill('20')
  await dialog.getByRole('combobox', { name: 'Moneda' }).selectOption('USD')
  const equivalente = dialog.getByLabel('Equivalente en EUR')
  await expect(equivalente).toBeVisible()
  await equivalente.fill('18,50')
  await dialog.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText('Café en dólares')).toBeVisible()
  const fila = page.getByText('Café en dólares').locator('..').locator('..')
  await expect(fila).toContainText('US$ 20,00')
  await expect(fila).toContainText('≈ € 18,50')
})

test('la búsqueda filtra por descripción', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Buscar gastos').fill('subte')
  await expect(page.getByText('Subte')).toBeVisible()
  await expect(page.getByText('Verdulería')).toBeHidden()
  await expect(page.getByText(/resultado/)).toBeVisible()
})

test('un gasto mensual aparece también en el mes siguiente', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ej.: Verdulería').fill('Alquiler')
  await dialog.getByLabel('Monto').fill('1000')
  await dialog.getByRole('combobox', { name: 'Repetir' }).selectOption('monthly')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Alquiler')).toBeVisible()
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await expect(page.getByText('Alquiler')).toBeVisible()
})

test('un viaje es un ámbito separado con su propia moneda', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await page.getByLabel('Nombre del viaje').fill('Viaje a la playa')
  await page.getByRole('combobox', { name: 'Moneda del viaje' }).selectOption('USD')
  await page.getByRole('button', { name: 'Crear viaje' }).click()
  await page.getByRole('link', { name: 'Gastos' }).click()
  await page.getByRole('button', { name: 'Viaje a la playa', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ej.: Verdulería').fill('Hotel')
  await dialog.getByLabel('Monto').fill('200')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Hotel')).toBeVisible()
  await page.getByRole('button', { name: 'Hogar' }).click()
  await expect(page.getByText('Hotel')).toBeHidden()
})

test('Ajustes permite cambiar el nombre visible', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await expect(page.getByLabel('Tu nombre')).toHaveValue('Vos')
})

test('se puede excluir a una persona del reparto', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('span').filter({ hasText: /^Vos$/ })).toBeVisible()
  const check = dialog.getByRole('checkbox', { name: /participa del gasto/ })
  await expect(check).toBeChecked()
  await check.uncheck()
  await expect(dialog.getByLabel(/Porcentaje de/)).toBeDisabled()
  await dialog.getByPlaceholder('Ej.: Verdulería').fill('Gasto sin participantes')
  await dialog.getByLabel('Monto').fill('100')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog.getByText(/Elegí al menos una persona/)).toBeVisible()
})

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
  await expect(page.getByText('€ 3.250,75', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByText('Café de especialidad')).toBeVisible()

  await page.getByRole('button', { name: 'Eliminar Café de especialidad' }).click()
  await expect(page.getByText('Café de especialidad')).toBeHidden()
})
