const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

async function testFetch() {
  const virtualKey = process.env.VERCEL_VIRTUAL_KEY;
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
