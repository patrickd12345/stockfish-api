import { test, expect } from '@playwright/test';

test.describe('Lichess Live Mode Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock session state
    await page.route('**/api/lichess/board/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'connected', activeGameId: null }),
      });
    });

    // Mock active game state (initially null)
    await page.route('**/api/lichess/board/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      });
    });

    await page.goto('/');
    // Navigate to Lichess Live Tab
    await page.getByRole('button', { name: 'Lichess Live' }).click();
  });

  test('should show lobby when connected and no game active', async ({ page }) => {
    await expect(page.getByText('Ready to Play')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Seek Human' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Practice Bot' })).toBeVisible();
  });

  test('should handle seek match flow', async ({ page }) => {
    // Mock the seek API
    await page.route('**/api/lichess/board/seek', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Click seek
    await page.getByRole('button', { name: 'Seek Human' }).click();
    
    // It should show "Seeking..." state
    await expect(page.getByRole('button', { name: 'Seeking...' })).toBeVisible();
  });

  test('should transition to active game when game starts', async ({ page }) => {
    // Re-mock state to show an active game
    await page.route('**/api/lichess/board/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          gameId: 'test-game',
          lichessUserId: 'me',
          status: 'started',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          moves: '',
          wtime: 180000,
          btime: 180000,
          winc: 0,
          binc: 0,
          myColor: 'white',
          opponentName: 'TestOpponent',
          opponentRating: 1500,
          initialTimeMs: 180000,
          initialIncrementMs: 2000
        }),
      });
    });

    // Wait for the UI to reflect the active game
    await expect(page.getByText('Live Game')).toBeVisible();
    await expect(page.getByText('TestOpponent')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resign' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Offer Draw' })).toBeVisible();
  });
});
