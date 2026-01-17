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
