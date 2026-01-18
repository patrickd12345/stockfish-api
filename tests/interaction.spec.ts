import { test, expect } from '@playwright/test'

const stubAutoImport = async (page: any) => {
  await page.route('**/api/import/chesscom**', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, imported: 0 }),
    })
  })

  await page.route('**/api/engine/analyze**', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enqueued: 0 }),
    })
  })
}

test('replay tab shows inspector and chat input returns', async ({ page }) => {
  await stubAutoImport(page)

  const fulfillGames = async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ games: [] }),
    })
  }

  await page.route('**/api/games', fulfillGames)
  await page.route('**/api/games?*', fulfillGames)

  await page.goto('/')

  await page.getByRole('button', { name: 'Game Inspector (Replay)' }).click()

  const gameInspectorHeading = page.getByRole('heading', { name: 'Game Inspector' })
  const noGamesText = page.getByText('No games processed yet.')
  const loadingText = page.getByText('Loading games...')

  await expect(gameInspectorHeading.or(noGamesText).or(loadingText)).toBeVisible({ timeout: 30_000 })

  if (await loadingText.isVisible().catch(() => false)) {
    await expect(loadingText).toBeHidden({ timeout: 30_000 })
  }

  await expect(gameInspectorHeading.or(noGamesText)).toBeVisible()

  await page.getByRole('button', { name: 'Dashboard & Chat' }).click()
  await expect(page.getByPlaceholder('Ask your coach')).toBeVisible()
})

test.describe('mobile drawer interactions', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('games drawer opens and closes', async ({ page }) => {
    await stubAutoImport(page)

    const fulfillGames = async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ games: [] }),
      })
    }

    await page.route('**/api/games', fulfillGames)
    await page.route('**/api/games?*', fulfillGames)

    await page.goto('/')

    await page.getByRole('button', { name: 'Games' }).click()
    const drawer = page.getByRole('dialog', { name: 'Games drawer' })
    await expect(drawer).toBeVisible()

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(drawer).toHaveCount(0)
  })
})
