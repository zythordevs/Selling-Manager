const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const E = require('../emojis');
const { db, getQr } = require('../db');
const ui = require('../ui');

const qrFiles = () => { const b = getQr(); return b ? [new AttachmentBuilder(b, { name: 'qr.png' })] : []; };
const code = (s) => '\n```\n' + s + '\n```';
const SAFE = '-# Send a screenshot of your payment in your ticket once done.';

const qr = {
  data: new SlashCommandBuilder().setName('qr').setDescription('Show the payment QR code').setDMPermission(false),
  async execute(i) {
    const files = qrFiles();
    const upi = db.settings.upi;
    if (!files.length && !upi) return i.reply(ui.notice('No QR code has been configured yet.', 'error'));
    const lines = upi ? [`**UPI ID**${code(upi.id)}`] : [];
    await i.reply(ui.send(ui.card({
      title: `${E.qr} Scan to Pay`,
      lines, images: files.length ? ['attachment://qr.png'] : [], footer: SAFE.slice(3),
    }), { files }));
  },
};

const upi = {
  data: new SlashCommandBuilder().setName('upi').setDescription('Show our UPI details').setDMPermission(false),
  async execute(i) {
    const u = db.settings.upi;
    if (!u) return i.reply(ui.notice('UPI details haven’t been configured yet.', 'error'));
    const files = qrFiles();
    await i.reply(ui.send(ui.card({
      title: `${E.upi} UPI Payment`,
      lines: [`**UPI ID**${code(u.id)}`, ...(u.name ? [`**Name:** ${u.name}`] : [])],
      images: files.length ? ['attachment://qr.png'] : [],
      footer: SAFE.slice(3),
    }), { files }));
  },
};

const crypto = {
  data: new SlashCommandBuilder()
    .setName('crypto')
    .setDescription('Show our crypto wallet addresses')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('coin').setDescription('Pick a coin').setAutocomplete(true)),

  async autocomplete(i) {
    const q = i.options.getFocused().toLowerCase();
    await i.respond(db.settings.crypto.filter((c) => c.coin.toLowerCase().includes(q)).slice(0, 25).map((c) => ({ name: c.coin, value: c.coin })));
  },

  async execute(i) {
    const want = i.options.getString('coin')?.toLowerCase();
    const list = db.settings.crypto.filter((c) => !want || c.coin.toLowerCase() === want);
    if (!list.length) return i.reply(ui.notice('No crypto addresses found. Admins can add them with `/setup crypto_add`.', 'error'));
    await i.reply(ui.send(ui.card({
      title: `${E.crypto} Crypto Payment`,
      lines: list.map((c) => `### ${c.coin}${c.network ? ` • ${c.network}` : ''}${code(c.address)}`),
      footer: 'Double-check the network before sending. Transfers are irreversible.',
    })));
  },
};

module.exports = [qr, upi, crypto];
