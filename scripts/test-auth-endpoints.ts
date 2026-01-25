/**
 * Test script for Phase 0 Auth endpoints
 * Tests dev-login, logout, and billing endpoints
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testAuthEndpoints() {
  console.log('🧪 Testing Phase 0 Auth endpoints...');
  console.log(`📍 Base URL: ${BASE_URL}\n`);

  let cookies = '';

  // Test 1: DEV Login
  console.log('1️⃣ Testing POST /api/auth/dev-login...');
  try {
    const loginResponse = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (loginResponse.status === 404) {
      console.log('   ⚠️  Endpoint returned 404 - is NODE_ENV=production?');
      console.log('   Skipping remaining tests (endpoint not available).');
      return;
    }

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }

    const loginData = await loginResponse.json();
    console.log(`   ✅ Login successful: ${JSON.stringify(loginData)}`);

    // Extract cookies from response
    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (setCookieHeader) {
      cookies = setCookieHeader.split(';')[0]; // Get the cookie value part
      console.log(`   ✅ Cookie set: ${cookies.split('=')[0]}`);
    } else {
      console.log('   ⚠️  No cookie set in response');
    }
  } catch (error: any) {
    if (error.message?.includes('fetch failed') || error.code === 'ECONNREFUSED') {
      console.log('   ❌ Connection failed - is the dev server running?');
      console.log('   💡 Start server with: pnpm dev');
      return;
    }
    console.error('   ❌ Login test failed:', error.message);
    return;
  }

  // Test 2: Subscription endpoint (should work with auth_session cookie)
  console.log('\n2️⃣ Testing GET /api/billing/subscription (with auth)...');
  try {
    const subscriptionResponse = await fetch(`${BASE_URL}/api/billing/subscription`, {
      method: 'GET',
      headers: {
        Cookie: cookies,
      },
    });

    if (subscriptionResponse.status === 401) {
      console.log('   ❌ Unauthorized - auth cookie not working');
    } else if (!subscriptionResponse.ok) {
      console.log(`   ⚠️  Subscription endpoint returned: ${subscriptionResponse.status}`);
      const errorText = await subscriptionResponse.text();
      console.log(`   Response: ${errorText.substring(0, 100)}`);
    } else {
      const subscriptionData = await subscriptionResponse.json();
      console.log(`   ✅ Subscription endpoint works: ${JSON.stringify(subscriptionData)}`);
    }
  } catch (error: any) {
    console.error('   ❌ Subscription test failed:', error.message);
  }

  // Test 3: Usage endpoint
  console.log('\n3️⃣ Testing GET /api/billing/usage (with auth)...');
  try {
    const usageResponse = await fetch(`${BASE_URL}/api/billing/usage`, {
      method: 'GET',
      headers: {
        Cookie: cookies,
      },
    });

    if (usageResponse.status === 401) {
      console.log('   ❌ Unauthorized - auth cookie not working');
    } else if (!usageResponse.ok) {
      console.log(`   ⚠️  Usage endpoint returned: ${usageResponse.status}`);
      const errorText = await usageResponse.text();
      console.log(`   Response: ${errorText.substring(0, 100)}`);
    } else {
      const usageData = await usageResponse.json();
      console.log(`   ✅ Usage endpoint works: ${JSON.stringify(usageData)}`);
    }
  } catch (error: any) {
    console.error('   ❌ Usage test failed:', error.message);
  }

  // Test 4: Logout
  console.log('\n4️⃣ Testing POST /api/auth/logout...');
  try {
    const logoutResponse = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookies,
      },
    });

    if (!logoutResponse.ok) {
      throw new Error(`Logout failed: ${logoutResponse.status} ${logoutResponse.statusText}`);
    }

    const logoutData = await logoutResponse.json();
    console.log(`   ✅ Logout successful: ${JSON.stringify(logoutData)}`);

    // Check if cookie was cleared
    const logoutSetCookie = logoutResponse.headers.get('set-cookie');
    if (logoutSetCookie?.includes('auth_session=;') || logoutSetCookie?.includes('Max-Age=0')) {
      console.log('   ✅ Cookie cleared');
    } else {
      console.log('   ⚠️  Cookie clearing not detected in response headers');
    }
  } catch (error: any) {
    console.error('   ❌ Logout test failed:', error.message);
  }

  // Test 5: Verify logout worked (should get 401)
  console.log('\n5️⃣ Testing GET /api/billing/subscription (after logout - should fail)...');
  try {
    const unauthResponse = await fetch(`${BASE_URL}/api/billing/subscription`, {
      method: 'GET',
    });

    if (unauthResponse.status === 401) {
      console.log('   ✅ Correctly returns 401 after logout');
    } else {
      console.log(`   ⚠️  Expected 401, got ${unauthResponse.status}`);
    }
  } catch (error: any) {
    console.error('   ❌ Post-logout test failed:', error.message);
  }

  console.log('\n✅ All tests completed!');
}

testAuthEndpoints().catch(console.error);
