const fs = require('fs');
const path = require('path');
const https = require('https');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) return;
    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('Checking "products" table...');
  const resProducts = await makeRequest('GET', '/rest/v1/products?select=id&limit=1');
  console.log('Products Status:', resProducts.status);
  console.log('Products Data:', resProducts.data);

  console.log('Checking "product_purchases" table...');
  const resPurchases = await makeRequest('GET', '/rest/v1/product_purchases?select=id&limit=1');
  console.log('Purchases Status:', resPurchases.status);
  console.log('Purchases Data:', resPurchases.data);
}

run();
