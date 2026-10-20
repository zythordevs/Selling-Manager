// MongoDB persistence.
//  - `db`  : small, hot config/state (settings, stock, tickets, counters) cached in memory and
//            saved to the `state` collection (debounced).
//  - `cols`: real collections for data that grows (vouches, feedbacks) + `files` for the QR image.
const { MongoClient, Binary } = require('mongodb');

const defaults = {
  settings: { channels: {}, supportRoles: [], upi: null, crypto: [], stockPanel: null },
  stocks: {},
  tickets: {},
  counters: { ticket: 0, order: 1500, vouch: 0 },
};

const db = JSON.parse(JSON.stringify(defaults));
const cols = {};
let client;
let qrBuf = null;
let timer = null;

async function connect() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in your .env file');
  client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const d = client.db(process.env.MONGO_DB || 'shopsy_manager');
  cols.state = d.collection('state');
  cols.vouches = d.collection('vouches');
  cols.feedbacks = d.collection('feedbacks');
  cols.files = d.collection('files');

  await cols.vouches.createIndexes([
    { key: { sellerId: 1, at: -1 } },
    { key: { buyerId: 1, sellerId: 1, at: -1 } },
  ]);

  const saved = await cols.state.findOne({ _id: 'main' });
  if (saved) {
    const { _id, ...rest } = saved;
    Object.assign(db, rest, {
      settings: { ...defaults.settings, ...(rest.settings || {}) },
      counters: { ...defaults.counters, ...(rest.counters || {}) },
    });
  }
  const q = await cols.files.findOne({ _id: 'qr' });
  if (q) qrBuf = Buffer.from(q.data.value ? q.data.value() : q.data.buffer);
  console.log('MongoDB connected.');
}

async function flush() {
  clearTimeout(timer);
  if (!cols.state) return;
  await cols.state.replaceOne({ _id: 'main' }, { ...db }, { upsert: true }).catch((e) => console.error('DB save failed:', e));
}

function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

const getQr = () => qrBuf;
async function setQr(buf) {
  qrBuf = buf;
  await cols.files.replaceOne({ _id: 'qr' }, { _id: 'qr', data: new Binary(buf) }, { upsert: true });
}

module.exports = { db, cols, connect, save, flush, getQr, setQr };
