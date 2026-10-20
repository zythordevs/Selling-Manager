const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, MessageFlags } = require('discord.js');
const E = require('../emojis');
const { db, save, getQr, setQr } = require('../db');
const ui = require('../ui');
const tickets = require('../tickets');

const textCh = (name, desc) => (o) => o.setName(name).setDescription(desc).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
const CHANNEL_KEYS = ['vouch', 'feedback', 'proofs', 'orders', 'ticket_logs', 'ticket_category'];

const cmd = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot (admins only)')
    .setDefaultMemberPermissions(P.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('channels').setDescription('Set log channels')
      .addChannelOption(textCh('vouch', 'Vouch log channel'))
      .addChannelOption(textCh('feedback', 'Feedback log channel'))
      .addChannelOption(textCh('proofs', 'Proofs channel'))
      .addChannelOption(textCh('orders', 'Completed-orders channel'))
      .addChannelOption(textCh('ticket_logs', 'Ticket log / transcript channel'))
      .addChannelOption((o) => o.setName('ticket_category').setDescription('Category where tickets are created').addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand((s) => s.setName('support_role').setDescription('Add or remove a support role')
      .addStringOption((o) => o.setName('action').setDescription('Add or remove').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
      .addRoleOption((o) => o.setName('role').setDescription('Support role').setRequired(true)))
    .addSubcommand((s) => s.setName('upi').setDescription('Set UPI details')
      .addStringOption((o) => o.setName('id').setDescription('UPI ID').setRequired(true).setMaxLength(80))
      .addStringOption((o) => o.setName('name').setDescription('Account holder name').setMaxLength(80)))
    .addSubcommand((s) => s.setName('qr').setDescription('Upload the payment QR image')
      .addAttachmentOption((o) => o.setName('image').setDescription('QR code image').setRequired(true)))
    .addSubcommand((s) => s.setName('crypto_add').setDescription('Add a crypto address')
      .addStringOption((o) => o.setName('coin').setDescription('e.g. USDT, BTC').setRequired(true).setMaxLength(20))
      .addStringOption((o) => o.setName('address').setDescription('Wallet address').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('network').setDescription('e.g. TRC20, BEP20').setMaxLength(30)))
    .addSubcommand((s) => s.setName('crypto_remove').setDescription('Remove a crypto address')
      .addStringOption((o) => o.setName('coin').setDescription('Coin to remove').setRequired(true)))
    .addSubcommand((s) => s.setName('panel').setDescription('Post the ticket panel')
      .addChannelOption(textCh('channel', 'Where to post (defaults here)')))
    .addSubcommand((s) => s.setName('view').setDescription('Show the current configuration')),

  async execute(i) {
    const sub = i.options.getSubcommand();
    const s = db.settings;

    if (sub === 'channels') {
      const set = [];
      for (const k of CHANNEL_KEYS) {
        const ch = i.options.getChannel(k);
        if (ch) { s.channels[k] = ch.id; set.push(`**${k}** → <#${ch.id}>`); }
      }
      if (!set.length) return i.reply(ui.notice('Pick at least one channel option.', 'warn'));
      save();
      return i.reply(ui.notice(`Saved:\n${set.join('\n')}`, 'success'));
    }

    if (sub === 'support_role') {
      const role = i.options.getRole('role');
      const add = i.options.getString('action') === 'add';
      s.supportRoles = s.supportRoles.filter((r) => r !== role.id);
      if (add) s.supportRoles.push(role.id);
      save();
      return i.reply(ui.notice(`${add ? 'Added' : 'Removed'} <@&${role.id}> ${add ? 'as' : 'from'} support roles.`, 'success'));
    }

    if (sub === 'upi') {
      s.upi = { id: i.options.getString('id'), name: i.options.getString('name') || '' };
      save();
      return i.reply(ui.notice('UPI details saved.', 'success'));
    }

    if (sub === 'qr') {
      const img = i.options.getAttachment('image');
      if (!img.contentType?.startsWith('image/')) return i.reply(ui.notice('That attachment isn’t an image.', 'error'));
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await setQr(Buffer.from(await (await fetch(img.url)).arrayBuffer()));
      return i.editReply(ui.noticeEdit('QR code saved. Try `/qr`.', 'success'));
    }

    if (sub === 'crypto_add') {
      const coin = i.options.getString('coin').toUpperCase();
      s.crypto = s.crypto.filter((c) => c.coin.toLowerCase() !== coin.toLowerCase());
      s.crypto.push({ coin, address: i.options.getString('address'), network: i.options.getString('network') || '' });
      save();
      return i.reply(ui.notice(`${coin} address saved.`, 'success'));
    }

    if (sub === 'crypto_remove') {
      const coin = i.options.getString('coin').toLowerCase();
      const before = s.crypto.length;
      s.crypto = s.crypto.filter((c) => c.coin.toLowerCase() !== coin);
      save();
      return i.reply(ui.notice(before === s.crypto.length ? 'Coin not found.' : 'Removed.', before === s.crypto.length ? 'error' : 'success'));
    }

    if (sub === 'panel') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const ch = i.options.getChannel('channel') || i.channel;
      await ch.send(ui.send(tickets.panel()));
      return i.editReply(ui.noticeEdit(`Ticket panel posted in <#${ch.id}>.`, 'success'));
    }

    if (sub === 'view') {
      const c = (k) => (s.channels[k] ? `<#${s.channels[k]}>` : '*not set*');
      return i.reply(ui.send(ui.card({
        title: `${E.settings} Configuration`,
        lines: [
          `**Vouches:** ${c('vouch')}`, `**Feedback:** ${c('feedback')}`, `**Proofs:** ${c('proofs')}`, `**Orders:** ${c('orders')}`,
          `**Ticket logs:** ${c('ticket_logs')}`, `**Ticket category:** ${s.channels.ticket_category ? `<#${s.channels.ticket_category}>` : '*not set*'}`,
          `**Support roles:** ${s.supportRoles.length ? s.supportRoles.map((r) => `<@&${r}>`).join(' ') : '*none*'}`,
          `**UPI:** ${s.upi ? `\`${s.upi.id}\`` : '*not set*'}`,
          `**QR image:** ${getQr() ? 'uploaded' : '*not set*'}`,
          `**Crypto:** ${s.crypto.length ? s.crypto.map((x) => x.coin).join(', ') : '*none*'}`,
        ],
      }), { ephemeral: true, allowedMentions: { parse: [] } }));
    }
  },
};

module.exports = cmd;
