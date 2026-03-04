/**
 * fetch-instruments.js
 *
 * Downloads the Upstox NSE instrument list (NSE.json.gz), decompresses it,
 * filters for NSE_EQ equity shares, and writes a compact instruments.json
 * to dist/trading/browser/ so it is deployed to GitHub Pages as a static asset.
 *
 * The Angular app then fetches it from the same origin — no CORS required.
 *
 * Run automatically as part of: npm run deploy
 */

const https = require('https');
const zlib  = require('zlib');
const fs    = require('fs');
const path  = require('path');

const CDN_URL  = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';
const OUT_DIR  = path.join(__dirname, '..', 'dist', 'trading', 'browser');
const OUT_FILE = path.join(OUT_DIR, 'instruments.json');

function download(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/octet-stream,*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://upstox.com/'
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const gunzip = zlib.createGunzip();
      const chunks = [];
      res.pipe(gunzip);
      gunzip.on('data', chunk => chunks.push(chunk));
      gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      gunzip.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  console.log('[fetch-instruments] Downloading NSE.json.gz from Upstox CDN...');
  const jsonText = await download(CDN_URL);

  console.log('[fetch-instruments] Parsing JSON...');
  const all = JSON.parse(jsonText);
  console.log(`[fetch-instruments] Total instruments: ${all.length}`);

  // Keep only NSE_EQ equity shares
  const equity = all.filter(item =>
    item.segment === 'NSE_EQ' &&
    (item.instrument_type === 'EQ' || item.instrument_type === 'BE' || item.instrument_type === 'SM')
  ).map(item => ({
    instrument_key:  item.instrument_key  || '',
    exchange_token:  item.exchange_token  || '',
    tradingsymbol:   item.trading_symbol  || item.tradingsymbol || '',
    name:            item.name            || '',
    instrument_type: item.instrument_type || '',
    exchange:        item.exchange        || '',
    tick_size:       String(item.tick_size    ?? ''),
    lot_size:        String(item.lot_size     ?? ''),
    strike:          String(item.strike_price ?? ''),
    expiry:          item.expiry || '',
    option_type:     item.option_type || '',
    last_price:      item.last_price || 0
  }));

  console.log(`[fetch-instruments] Equity stocks: ${equity.length}`);

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(equity));
  console.log(`[fetch-instruments] Written to: ${OUT_FILE}`);
})().catch(err => {
  console.error('[fetch-instruments] ERROR:', err.message);
  process.exit(1);
});
