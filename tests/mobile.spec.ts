import { test, expect } from '@playwright/test'

test('mobile shows header + tabs', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Games' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Openings' })).toBeVisible()
})

test('mobile chat posts selected gameId (drawer flow)', async ({ page }) => {
  await page.route('**/api/import/chesscom**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, imported: 0 }),
    })
  })

  const fulfillGames = async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        games: [
          {
            id: 'g1',
            white: 'Alice',
            black: 'Bob',
            opening_name: 'Ruy Lopez',
            date: '2026.01.17',
            result: '1-0',
            pgn_text:
              '[Event "?"]\n[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
          },
        ],
      }),
    })
  }

  await page.route('**/api/games', fulfillGames)
  await page.route('**/api/games?*', fulfillGames)

  let lastChatBody: any = null
  await page.route('**/api/chat', async (route) => {
    lastChatBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: 'ok' }),
    })
  })

  await page.goto('/')

  await page.getByRole('button', { name: 'Games' }).click()
  await expect(page.getByPlaceholder('Search white, black, opening...')).toBeVisible()

  await page.getByRole('button', { name: /Alice vs Bob/i }).click()

  await page.getByPlaceholder('Ask your coach').fill('hi')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('ok')).toBeVisible()
  expect(lastChatBody).toEqual({ message: 'hi', gameId: 'g1' })
})

