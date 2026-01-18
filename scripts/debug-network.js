const https = require('https');

async function debugConnection(host) {
  console.log(`\n--- Testing ${host} ---`);
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.request({
      hostname: host,
      port: 443,
      path: '/',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      res.resume()
      console.log(`[${host}] Connected! Status: ${res.statusCode}`);
      console.log(`[${host}] Time: ${Date.now() - start}ms`);
      resolve(true);
    });

    req.on('error', (err) => {
      console.error(`[${host}] Failed! Error: ${err.message}`);
      console.error(`[${host}] Code: ${err.code}`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.error(`[${host}] Timeout!`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function run() {
  await debugConnection('ai-gateway.vercel.sh');
  await debugConnection('gateway.ai.vercel.pub');
  await debugConnection('gateway.ai.vercel.com');
  await debugConnection('api.openai.com');
  await debugConnection('google.com');
}

run();
