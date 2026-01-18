import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

async function testConnection() {
  const apiKey = process.env.VERCEL_VIRTUAL_KEY;
  const gatewayId = process.env.VERCEL_AI_GATEWAY_ID;
  
  console.log('Testing with:');
  console.log('Gateway ID:', gatewayId);
  console.log('Has Virtual Key:', !!process.env.VERCEL_VIRTUAL_KEY);

  const baseURLs = [
    'https://ai-gateway.vercel.sh/v1'
  ];

  for (const url of baseURLs) {
    console.log('\nTrying Base URL:', url);
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: url,
    });

    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      });
      console.log('Success with', url);
      console.log('Response:', response.choices[0].message.content);
      return;
    } catch (err: any) {
      console.error('Failed with', url);
      console.error('Status:', err.status);
      console.error('Message:', err.message);
    }
  }
}

testConnection();
