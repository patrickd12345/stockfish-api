// Native fetch is available in Node 18+
// Using a simple .js file to avoid TS complications for this quick test
const fs = require('fs');
const path = require('path');

// Basic env parser since we have issues with multiple env vars
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
});

async function testFetch() {
  const virtualKey = env.VERCEL_VIRTUAL_KEY;
  const url = 'https://ai-gateway.vercel.sh/v1/chat/completions';

  console.log('Fetching:', url);
  console.log('Key:', virtualKey ? 'Present' : 'Missing');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${virtualKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
    });

    console.log('Status:', res.status);
    const data = await res.text();
    console.log('Body:', data);
  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

testFetch();
