require('dotenv').config();
fetch('https://discord.com/api/v10/gateway', { signal: AbortSignal.timeout(15000) })
  .then(async (r) => console.log(r.status, r.headers.get('retry-after'), (await r.text()).slice(0, 300)))
  .catch((e) => console.log('FAILED', e.cause?.code || e.message));