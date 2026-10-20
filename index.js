require('dotenv').config();
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const ui = require('./ui');
const tickets = require('./tickets');
const loadCommands = require('./loader');
const { connect, flush } = require('./db');

const STATUS_TEXT = process.env.STATUS_TEXT || 'Managing MR ASHISH';
const TOKEN = (process.env.TOKEN || '').trim().replace(/^["']|["']$/g, '');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [] }, // nothing pings unless a message explicitly allows it
  rest: { timeout: 30_000 },
});

client.commands = new Map(loadCommands().map((c) => [c.data.name, c]));

// ---------- ready ----------
client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag} • ${client.commands.size} commands • ${c.guilds.cache.size} server(s)`);
  c.user.setPresence({
    status: 'dnd',
    activities: [{ name: STATUS_TEXT, state: STATUS_TEXT, type: ActivityType.Custom }],
  });
});

// ---------- diagnostics (so a stuck login is never silent) ----------
client.on(Events.Error, (e) => console.error('[client error]', e));
client.on(Events.Warn, (w) => console.warn('[warn]', w));
client.on(Events.ShardError, (e) => console.error('[shard error]', e));
client.on(Events.ShardDisconnect, (ev, id) => console.warn(`[shard ${id}] disconnected, code ${ev?.code}`));
client.on(Events.ShardReconnecting, (id) => console.warn(`[shard ${id}] reconnecting...`));
client.on(Events.Debug, (m) => {
  if (/Preparing to connect|Connecting to|Session|Identifying|Ready|Fetched Gateway|close|error/i.test(m)) console.log('[debug]', m);
});
client.rest.on('rateLimited', (r) => console.warn(`[rate limited] ${r.method} ${r.route} retry in ${r.timeToReset}ms`));
process.on('unhandledRejection', (e) => console.error('[unhandled rejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaught exception]', e));

// ---------- interactions ----------
client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) return await client.commands.get(i.commandName)?.execute(i);
    if (i.isAutocomplete()) return await client.commands.get(i.commandName)?.autocomplete?.(i);
    if ((i.isButton() || i.isModalSubmit() || i.isStringSelectMenu()) && i.customId.startsWith('ticket:')) return await tickets.handle(i);
  } catch (err) {
    if (err?.code === 10062) return console.warn(`[slow] /${i.commandName || i.customId} took more than 3s, Discord expired the interaction.`);
    console.error(err);
    if (!i.isRepliable()) return;
    if (i.deferred || i.replied) await i.editReply(ui.noticeEdit('Something went wrong. Please try again.', 'error')).catch(() => {});
    else await i.reply(ui.notice('Something went wrong. Please try again.', 'error')).catch(() => {});
  }
});

// ---------- shutdown ----------
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`${sig} received, saving data...`);
    await flush();
    process.exit(0);
  });
}

// ---------- start ----------
(async () => {
  if (!TOKEN) {
    console.error('TOKEN is empty. Create a file named exactly ".env" next to index.js with a line:  TOKEN=your-bot-token');
    process.exit(1);
  }
  await connect();

  // Check the token over plain HTTPS first, so we get a clear error instead of a silent hang.
  try {
    const r = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 401) { console.error('Discord rejected the token (401). Reset it in the Developer Portal > Bot and update .env'); process.exit(1); }
    if (r.status === 429) console.warn('Discord is rate-limiting this host (429). The login may be delayed.');
    if (r.ok) { const me = await r.json(); console.log(`Token OK for bot: ${me.username} (${me.id})`); }
  } catch (e) {
    console.error('Cannot reach discord.com from this host:', e.cause?.code || e.message);
    console.error('Ask your host to allow outbound access to discord.com and gateway.discord.gg');
    process.exit(1);
  }

  const watchdog = setTimeout(
    () => console.error('Still not connected after 45s. The websocket to gateway.discord.gg may be blocked by your host.'),
    45_000,
  );
  client.once(Events.ClientReady, () => clearTimeout(watchdog));

  console.log('Logging in to Discord...');
  await client.login(TOKEN);
})().catch((e) => { console.error('Startup failed:', e); process.exit(1); });
