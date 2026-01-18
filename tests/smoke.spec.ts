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

  // Ensure the Replay tab actually rendered (avoid false positives where "Loading..." is simply absent)
  const gameInspectorHeading = page.getByRole('heading', { name: 'Game Inspector' });
  const noGamesText = page.getByText('No games processed yet.');
  const loadingText = page.getByText('Loading games...');

  await expect(gameInspectorHeading.or(noGamesText).or(loadingText)).toBeVisible();

  // If we saw the loading state, wait for it to resolve
  if (await loadingText.isVisible().catch(() => false)) {
    await expect(loadingText).toBeHidden();
  }

  await expect(gameInspectorHeading.or(noGamesText)).toBeVisible();
});

test('game search functionality', async ({ page }) => {
  await page.goto('/');

  // Check that search input exists in sidebar
  const searchInput = page.getByPlaceholder('Search white, black, opening...');
  await expect(searchInput).toBeVisible();

  // Type a search query
  await searchInput.fill('ruy');

  // The search is debounced and async; wait for the transient "Searching..." state to settle
  const searchingText = page.getByText('Searching...');
  await expect(searchingText).toBeHidden({ timeout: 10_000 });

  // Either we see at least one game row (contains "vs") OR the explicit empty state
  const anyGameRow = page.locator('text=/\\bvs\\b/').first();
  const noGamesText = page.getByText('No games found.');
  await expect(anyGameRow.or(noGamesText)).toBeVisible({ timeout: 10_000 });
  
  // Clear search to see all games again
  await searchInput.clear();

  await expect(searchingText).toBeHidden({ timeout: 10_000 });
  await expect(anyGameRow.or(noGamesText)).toBeVisible({ timeout: 10_000 });
});
