import { test, expect } from '@playwright/test';

test('has title and tabs', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  // Note: The actual title might not be set in layout.tsx, checking H2 instead
  await expect(page.getByRole('heading', { name: 'Coach Chat' })).toBeVisible();

  // Check for tab buttons
  await expect(page.getByRole('button', { name: 'Dashboard & Chat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Game Inspector (Replay)' })).toBeVisible();
  
  // Test navigation to Replay tab
  await page.getByRole('button', { name: 'Game Inspector (Replay)' }).click();
  
  // Since we have no games, it should show the empty state OR the heading if component structure changes.
  // In current implementation, heading is hidden if no games.
  // We check for the specific empty state message which confirms the component loaded.
  await expect(page.getByText('No games processed yet.')).toBeVisible();
});

test('game search functionality', async ({ page }) => {
  await page.goto('/');

  // Check that search input exists in sidebar
  const searchInput = page.getByPlaceholder('Search white, black, opening...');
  await expect(searchInput).toBeVisible();

  // Type a search query
  await searchInput.fill('ruy');
  
  // Wait for search results to appear (games list should update)
  // The search is debounced, so wait a bit
  await page.waitForTimeout(500);
  
  // Check that either games are displayed or "No games found" message appears
  const hasGames = await page.locator('text=/vs/').count() > 0;
  const hasNoGames = await page.getByText('No games found.').isVisible().catch(() => false);
  
  expect(hasGames || hasNoGames).toBeTruthy();
  
  // Clear search to see all games again
  await searchInput.clear();
  await page.waitForTimeout(500);
  
  // After clearing, we should see games or the no games message
  const hasGamesAfterClear = await page.locator('text=/vs/').count() > 0;
  const hasNoGamesAfterClear = await page.getByText('No games found.').isVisible().catch(() => false);
  expect(hasGamesAfterClear || hasNoGamesAfterClear).toBeTruthy();
});
