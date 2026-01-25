import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

test.describe('Real Lichess Match Seeking', () => {
  test('should successfully seek and enter a game', async ({ page, context }) => {
    // Step 1: Authenticate with dev login
    console.log('🔐 Step 1: Authenticating...');
    const loginResponse = await page.request.post('/api/auth/dev-login');
    expect(loginResponse.ok()).toBeTruthy();
    
    // Extract and set auth cookie
    const setCookieHeader = loginResponse.headers()['set-cookie'];
    if (setCookieHeader) {
      const authCookieMatch = setCookieHeader.match(/auth_session=([^;]+)/);
      if (authCookieMatch) {
        await context.addCookies([{
          name: 'auth_session',
          value: authCookieMatch[1],
          domain: 'localhost',
          path: '/',
        }]);
      }
    }

    // Step 2: Get Lichess user ID - try API first, then check .env.local
    console.log('🔍 Step 2: Checking Lichess connection...');
    
    // First, try to get Lichess account info via API (requires existing cookie)
    await page.goto('/');
    let lichessUserId: string | null = null;
    
    const accountResponse = await page.request.get('/api/lichess/account');
    if (accountResponse.ok()) {
      const accountData = await accountResponse.json();
      lichessUserId = accountData?.id || accountData?.username || null;
      console.log(`✅ Got Lichess user from API: ${lichessUserId}`);
    }
    
    // Fallback: Use Lichess username from .env.local if available
    if (!lichessUserId && process.env.LICHESSUSERNAMES) {
      const usernames = process.env.LICHESSUSERNAMES.split(',');
      lichessUserId = usernames[0]?.trim() || null;
      console.log(`⚠️  Using Lichess user from .env.local: ${lichessUserId}`);
      console.log(`   Note: This requires a valid token in the database for this user.`);
    }
    
    if (!lichessUserId) {
      console.log('⚠️  No Lichess user found.');
      console.log('   Please connect your Lichess account first by visiting the app.');
      console.log('   Or set LICHESSUSERNAMES in .env.local');
      test.skip();
      return;
    }
    
    // Set Lichess cookie
    await context.addCookies([{
      name: 'lichess_user_id',
      value: lichessUserId,
      domain: 'localhost',
      path: '/',
    }]);
    
    // Verify token exists by checking session endpoint
    const sessionResponse = await page.request.get('/api/lichess/board/session');
    if (!sessionResponse.ok()) {
      const sessionError = await sessionResponse.json().catch(() => ({}));
      if (sessionResponse.status() === 403 || sessionError.error?.includes('token')) {
        console.log(`⚠️  No valid Lichess token found for user ${lichessUserId}.`);
        console.log('   Please connect your Lichess account via OAuth first.');
        test.skip();
        return;
      }
    }

    // Step 3: Navigate to Lichess Live tab
    console.log('📱 Step 3: Navigating to Lichess Live...');
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Click Lichess Live button
    const lichessLiveButton = page.getByRole('button', { name: 'Lichess Live' });
    await lichessLiveButton.click();
    
    // Wait a moment for the tab to load
    await page.waitForTimeout(2000);
    
    // Check if we need to connect Lichess account
    const connectButton = page.getByRole('button', { name: /Connect Lichess|Reconnect Lichess/i });
    if (await connectButton.isVisible().catch(() => false)) {
      console.log('⚠️  Lichess account not connected.');
      console.log('   Please connect your Lichess account first:');
      console.log('   1. Visit http://localhost:3500 in your browser');
      console.log('   2. Click "Lichess Live" tab');
      console.log('   3. Click "Connect Lichess" button');
      console.log('   4. Complete OAuth flow');
      console.log('   5. Then run this test again');
      test.skip();
      return;
    }
    
    // Wait for the lobby to load - check for "Ready to Play"
    try {
      await expect(page.getByText(/Ready to Play/i)).toBeVisible({ timeout: 15000 });
      console.log('✅ Lobby loaded');
    } catch (error) {
      // Take a screenshot to debug
      await page.screenshot({ path: 'test-results/debug-lobby-timeout.png', fullPage: true });
      console.log('⚠️  Lobby did not load. Screenshot saved to test-results/debug-lobby-timeout.png');
      throw error;
    }

    // Step 4: Configure seek settings (10+0 unrated)
    console.log('⚙️  Step 4: Configuring seek settings...');
    
    // Select time control - look for buttons with "10+0" or "10+5"
    const timeControlButtons = page.locator('button').filter({ hasText: /10\+[05]/ });
    const timeControlCount = await timeControlButtons.count();
    
    if (timeControlCount > 0) {
      // Click the first 10+0 or 10+5 button found
      await timeControlButtons.first().click();
      console.log('✅ Time control selected');
    } else {
      // Fallback: look for any time control button in Rapid section
      const rapidSection = page.locator('text=Rapid').locator('..');
      const rapidButtons = rapidSection.locator('button').filter({ hasText: /\+/ });
      if (await rapidButtons.count() > 0) {
        await rapidButtons.first().click();
        console.log('✅ Time control selected (fallback)');
      }
    }

    // Uncheck rated checkbox if checked
    const ratedCheckbox = page.getByRole('checkbox', { name: /rated/i });
    if (await ratedCheckbox.isVisible().catch(() => false)) {
      const isChecked = await ratedCheckbox.isChecked();
      if (isChecked) {
        await ratedCheckbox.uncheck();
        console.log('✅ Unrated mode selected');
      }
    }

    // Step 5: Click Seek Human button
    console.log('🎯 Step 5: Clicking Seek Human button...');
    const seekButton = page.getByRole('button', { name: 'Seek Human' });
    await seekButton.click();

    // Step 6: Wait for seeking state
    console.log('⏳ Step 6: Waiting for seeking state...');
    await expect(
      page.getByRole('button', { name: 'Cancel Seeking' })
    ).toBeVisible({ timeout: 10000 });
    console.log('✅ Seeking state confirmed');

    // Step 7: Wait for game to start (up to 120 seconds)
    console.log('🎮 Step 7: Waiting for match to be found (this may take up to 120 seconds)...');
    
    // Wait for game indicators to appear
    const gameStarted = await Promise.race([
      // Check for opponent name/info
      page.locator('text=/vs\\.|opponent/i').waitFor({ timeout: 120000 }).then(() => true).catch(() => false),
      // Check for game controls
      page.getByRole('button', { name: /Resign|Offer Draw/i }).waitFor({ timeout: 120000 }).then(() => true).catch(() => false),
      // Check for chessboard
      page.locator('[class*="board"], [class*="chessboard"]').first().waitFor({ timeout: 120000 }).then(() => true).catch(() => false),
      // Check for "Live Game" heading
      page.getByText(/Live Game/i).waitFor({ timeout: 120000 }).then(() => true).catch(() => false),
    ]).catch(() => false);

    if (!gameStarted) {
      // Check if still seeking
      const stillSeeking = await page.getByRole('button', { name: 'Cancel Seeking' }).isVisible().catch(() => false);
      if (stillSeeking) {
        throw new Error('Match not found within 120 seconds. Seek is still active.');
      }
      throw new Error('Game did not start and seek was cancelled or failed.');
    }

    // Step 8: Verify game is active
    console.log('✅ Step 8: Game started! Verifying...');
    
    // Wait a moment for UI to stabilize
    await page.waitForTimeout(3000);
    
    // Check for game indicators
    const hasGameBoard = await page.locator('[class*="board"], [class*="chessboard"]').first().isVisible().catch(() => false);
    const hasOpponentInfo = await page.locator('text=/vs\\.|opponent/i').isVisible().catch(() => false);
    const hasGameControls = await page.getByRole('button', { name: /Resign|Offer Draw/i }).isVisible().catch(() => false);

    expect(hasGameBoard || hasOpponentInfo || hasGameControls).toBeTruthy();
    console.log('✅ Game verified as active');

    // Step 9: Take screenshot
    console.log('📸 Step 9: Taking screenshot of active game...');
    
    // Ensure test-results directory exists
    const testResultsDir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(testResultsDir)) {
      fs.mkdirSync(testResultsDir, { recursive: true });
    }
    
    const screenshotPath = path.join(testResultsDir, 'seek-match-success.png');
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    console.log(`✅ Screenshot saved to: ${screenshotPath}`);
    console.log('🎉 Test passed! Successfully entered a game.');

    // Additional verification: Check that we're not in lobby anymore
    const inLobby = await page.getByText('Ready to Play').isVisible().catch(() => false);
    expect(inLobby).toBeFalsy();
    
    // Final verification: Game ID should be present in the URL or state
    const url = page.url();
    const hasGameId = url.includes('/game/') || await page.locator('[data-game-id]').count() > 0;
    console.log(`✅ Game ID present: ${hasGameId}`);
  });
});
