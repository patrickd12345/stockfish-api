import { test, expect } from '@playwright/test'

test('import flow shows progress without a live database', async ({ page }) => {
  await page.route('**/api/process-pgn**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 1, saved: true }),
    })
  })

  await page.route('**/api/import/chesscom**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, imported: 1 }),
    })
  })

  await page.route('**/api/engine/analyze**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enqueued: 0 }),
    })
  })

  const fulfillGames = async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ games: [] }),
    })
  }

  await page.route('**/api/games', fulfillGames)
  await page.route('**/api/games?*', fulfillGames)

  await page.goto('/?autoImport=true')

  const importButton = page.getByRole('button', { name: /import/i })
  if ((await importButton.count()) > 0) {
    await importButton.first().click()
  }

  await expect(page.getByText(/Importing/i)).toBeVisible()
})
