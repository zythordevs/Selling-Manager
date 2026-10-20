const {
  ChannelType, PermissionFlagsBits: P, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, AttachmentBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const E = require('./emojis');
const { db, save } = require('./db');
const ui = require('./ui');
const cfg = require('./config');
const sv = require('./services');

const { ButtonStyle } = ui;
const TYPES = {
  support: { label: 'Help & Support', emoji: E.menuHelp, desc: 'General inquiries & assistance' },
  buy: { label: 'Buy Products', emoji: E.menuBuy, desc: 'Purchase products or services' },
  claim: { label: 'Claim Rewards', emoji: E.menuClaim, desc: 'Giveaways & event prizes' },
};

const isStaff = (m) => m.permissions.has(P.ManageChannels) || db.settings.supportRoles.some((r) => m.roles.cache.has(r));
const openCount = (uid) => Object.values(db.tickets).filter((t) => t.userId === uid && t.status === 'open').length;
const tag = (n) => String(n).padStart(4, '0');

// ---------- panel ----------
function panel() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:menu')
    .setPlaceholder('Select a ticket type...')
    .addOptions(
      Object.entries(TYPES).map(([value, t]) =>
        new StringSelectMenuOptionBuilder().setLabel(t.label).setDescription(t.desc).setValue(value).setEmoji(t.emoji)),
    );

  return ui.card({
    title: `Ticket Panel | ${cfg.brand}`,
    description: [
      'Select a ticket type below to open a ticket.',
      '',
      `${E.panelHelp} **Help & Support** — General inquiries & assistance.`,
      `${E.panelBuy} **Buy Products** — Purchase Product Or Services`,
      `${E.panelClaim} **Claim Rewards** — Giveaways & event prizes.`,
    ].join('\n'),
    lines: [
      `### ${E.panelRules} Rules`,
      '> 1. One ticket per issue.',
      '> 2. Don\'t make a ticket for fun.',
      '> 3. No trolling or spamming.',
      '> 4. Be patient with staff.',
    ],
    rows: [ui.row(menu)],
  });
}

// ---------- modal ----------
function modal(type) {
  const field = (id, label, style, ph) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setPlaceholder(ph).setRequired(true).setMaxLength(style === TextInputStyle.Paragraph ? 900 : 100),
    );
  const m = new ModalBuilder().setCustomId(`ticket:modal:${type}`).setTitle(TYPES[type].label);
  if (type === 'buy') {
    m.addComponents(
      field('product', 'Product Name?', TextInputStyle.Short, 'What would you like to buy?'),
      field('budget', 'Budget', TextInputStyle.Short, 'e.g. ₹500'),
      field('payment', 'Payment Method', TextInputStyle.Short, 'UPI / Crypto / ...'),
    );
  } else if (type === 'claim') {
    m.addComponents(
      field('event', 'Giveaway / Event Name', TextInputStyle.Short, 'Which giveaway or event did you win?'),
      field('details', 'Winner Details', TextInputStyle.Paragraph, 'Prize won, message link or any proof'),
    );
  } else m.addComponents(field('issue', 'How can we help?', TextInputStyle.Paragraph, 'Describe your issue in detail'));
  return m;
}

// ---------- create ----------
async function create(i, type) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  if (!TYPES[type]) return i.editReply(ui.noticeEdit('Unknown ticket type.', 'error'));
  if (openCount(i.user.id) >= cfg.maxOpenTickets)
    return i.editReply(ui.noticeEdit(`You already have ${cfg.maxOpenTickets} open tickets. Please close one first.`, 'warn'));
  const g = i.guild;
  const num = ++db.counters.ticket;
  save();

  const roles = db.settings.supportRoles.filter((r) => g.roles.cache.has(r));
  const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
  const parent = g.channels.cache.has(db.settings.channels.ticket_category) ? db.settings.channels.ticket_category : null;
  const name = `${type}-${i.user.username}`.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 90) || `${type}-${tag(num)}`;

  const ch = await g.channels.create({
    name, type: ChannelType.GuildText, parent, topic: `${TYPES[type].label} #${tag(num)} • ${i.user.id}`,
    permissionOverwrites: [
      { id: g.roles.everyone.id, deny: [P.ViewChannel] },
      { id: i.user.id, allow },
      ...roles.map((id) => ({ id, allow: [...allow, P.ManageMessages] })),
      { id: i.client.user.id, allow: [...allow, P.ManageChannels] },
    ],
  });

  const v = (id) => i.fields.getTextInputValue(id);
  const answers = type === 'buy'
    ? [['Product', v('product')], ['Budget', v('budget')], ['Payment Method', v('payment')]]
    : type === 'claim'
      ? [['Giveaway / Event', v('event')], ['Winner Details', v('details')]]
      : [['Issue', v('issue')]];

  db.tickets[ch.id] = { id: num, channelId: ch.id, userId: i.user.id, type, status: 'open', name: ch.name, answers, createdAt: Date.now(), added: [] };
  save();

  const c = ui.card({
    top: roles.length ? `-# Staff: ${roles.map((r) => `<@&${r}>`).join(' ')}` : undefined,
    title: `${TYPES[type].emoji} ${TYPES[type].label} #${tag(num)}`,
    description: `Welcome ${ui.mention(i.user.id)}! A team member will assist you shortly.`,
    thumbnail: i.user.displayAvatarURL({ extension: 'png', size: 256 }),
    lines: answers.map(([k, v]) => `**${k}**\n> ${v.replace(/\n/g, '\n> ')}`),
    rows: [ui.row(ui.btn('ticket:close', 'Close', ButtonStyle.Danger, E.close))],
    footer: `Opened ${ui.ts()}`,
  });
  // Only support roles are allowed to ping here; user accounts are shown as chips without pinging.
  await ch.send(ui.send(c, { allowedMentions: { roles } }));

  const log = await sv.getChannel(i.client, 'ticket_logs');
  if (log) {
    await log.send(ui.send(ui.card({
      title: `${E.ticketOpen} Ticket Opened`,
      lines: [`**Ticket:** <#${ch.id}> (#${tag(num)})`, `**Type:** ${TYPES[type].label}`, `**User:** ${ui.mention(i.user.id)}`],
      color: cfg.green, footer: ui.ts(),
    })));
  }
  await i.editReply(ui.noticeEdit(`Your ticket is ready: <#${ch.id}>`, 'success'));
}

// ---------- close / reopen / delete ----------
async function doClose(ch, by) {
  const t = db.tickets[ch.id];
  t.status = 'closed';
  t.closedBy = by.id;
  save();
  await ch.permissionOverwrites.edit(t.userId, { SendMessages: false }).catch(() => {});
  ch.setName(`closed-${t.name.replace(/^closed-/, '')}`.slice(0, 100)).catch(() => {}); // rename is rate limited; don't block
  return ui.card({
    title: `${E.close} Ticket Closed`,
    lines: [`**Ticket:** #${tag(t.id)}`, `**Closed by:** ${ui.mention(by.id)}`],
    rows: [ui.row(ui.btn('ticket:reopen', 'Reopen', ButtonStyle.Success, E.reopen), ui.btn('ticket:delete', 'Delete', ButtonStyle.Danger, E.delete))],
    color: cfg.red, footer: ui.ts(),
  });
}

async function doReopen(ch, by) {
  const t = db.tickets[ch.id];
  t.status = 'open';
  save();
  await ch.permissionOverwrites.edit(t.userId, { ViewChannel: true, SendMessages: true }).catch(() => {});
  ch.setName(t.name).catch(() => {});
  return ui.card({
    title: `${E.reopen} Ticket Reopened`,
    lines: [`**Ticket:** #${tag(t.id)}`, `**Reopened by:** ${ui.mention(by.id)}`],
    rows: [ui.row(ui.btn('ticket:close', 'Close', ButtonStyle.Danger, E.close))],
    color: cfg.green, footer: ui.ts(),
  });
}

const extract = (c) => {
  if (!c) return [];
  const out = [];
  if (typeof c.content === 'string') out.push(c.content);
  (c.components || []).forEach((x) => out.push(...extract(x)));
  if (c.accessory) out.push(...extract(c.accessory));
  return out;
};

async function transcript(ch) {
  const all = [];
  let before;
  while (all.length < 2000) {
    const batch = await ch.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
  }
  const lines = all.reverse().map((m) => {
    const body = [m.content, ...m.components.flatMap(extract), ...m.attachments.map((a) => a.url)].filter(Boolean).join(' | ').replace(/\n/g, ' ');
    return `[${m.createdAt.toISOString()}] ${m.author.tag}: ${body}`;
  });
  return Buffer.from(lines.join('\n') || 'Empty transcript', 'utf8');
}

async function doDelete(ch, by) {
  const t = db.tickets[ch.id];
  const log = await sv.getChannel(ch.client, 'ticket_logs');
  if (log) {
    const file = new AttachmentBuilder(await transcript(ch), { name: `transcript-${tag(t.id)}.txt` });
    await log.send(ui.send(ui.card({
      title: `${E.delete} Ticket Deleted`,
      lines: [`**Ticket:** #${tag(t.id)} (${t.type})`, `**Opened by:** ${ui.mention(t.userId)}`, `**Deleted by:** ${ui.mention(by.id)}`],
      color: cfg.red, footer: ui.ts(),
    }), { files: [file] }));
  }
  delete db.tickets[ch.id];
  save();
  setTimeout(() => ch.delete().catch(() => {}), 5000);
  return ui.card({ title: `${E.delete} Deleting Ticket`, description: 'This channel will be deleted in 5 seconds. A transcript was saved to the logs.', color: cfg.red });
}

// ---------- interaction router ----------
async function handle(i) {
  const [, action, arg] = i.customId.split(':');

  if (i.isModalSubmit() && action === 'modal') return create(i, arg);

  if (i.isStringSelectMenu() && action === 'menu') {
    const type = i.values[0];
    // reset the dropdown afterwards so the same option can be picked again
    const reset = () => i.message.edit(ui.edit(panel())).catch(() => {});
    if (!TYPES[type]) return reset();
    if (openCount(i.user.id) >= cfg.maxOpenTickets) {
      await i.reply(ui.notice(`You already have ${cfg.maxOpenTickets} open tickets. Please close one first.`, 'warn'));
      return reset();
    }
    await i.showModal(modal(type));
    return reset();
  }

  if (i.isButton()) {
    if (action === 'open') {
      if (openCount(i.user.id) >= cfg.maxOpenTickets)
        return i.reply(ui.notice(`You already have ${cfg.maxOpenTickets} open tickets. Please close one first.`, 'warn'));
      return i.showModal(modal(arg));
    }

    const t = db.tickets[i.channelId];
    if (!t) return i.reply(ui.notice('This isn’t an active ticket.', 'error'));
    const staff = isStaff(i.member);
    const owner = t.userId === i.user.id;

    if (action === 'close') {
      if (!staff && !owner) return i.reply(ui.notice('Only the ticket owner or staff can close this.', 'error'));
      if (t.status === 'closed') return i.reply(ui.notice('Already closed.', 'warn'));
      await i.deferReply();
      return i.editReply(ui.edit(await doClose(i.channel, i.user)));
    }
    if (action === 'reopen') {
      if (!staff && !owner) return i.reply(ui.notice('Only the ticket owner or staff can reopen this.', 'error'));
      if (t.status === 'open') return i.reply(ui.notice('This ticket is already open.', 'warn'));
      await i.deferReply();
      return i.editReply(ui.edit(await doReopen(i.channel, i.user)));
    }
    if (action === 'delete') {
      if (!staff) return i.reply(ui.notice('Only staff can delete tickets.', 'error'));
      await i.deferReply();
      return i.editReply(ui.edit(await doDelete(i.channel, i.user)));
    }
  }
}

module.exports = { handle, panel, modal, TYPES, doClose, doReopen, doDelete, isStaff, tag };
