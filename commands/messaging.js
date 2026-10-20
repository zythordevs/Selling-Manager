const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, MessageFlags } = require('discord.js');
const ui = require('../ui');
const cfg = require('../config');

const isImage = (a) => a?.contentType?.startsWith('image/');
const COLORS = { blue: cfg.color, green: cfg.green, red: cfg.red, gold: cfg.gold };

const dm = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Send a styled DM to a user')
    .setDefaultMemberPermissions(P.ManageMessages)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Who to message').setRequired(true))
    .addStringOption((o) => o.setName('message').setDescription('Message (use \\n for a new line)').setRequired(true).setMaxLength(3500))
    .addStringOption((o) => o.setName('title').setDescription('Optional title').setMaxLength(100))
    .addAttachmentOption((o) => o.setName('image').setDescription('Optional image')),

  async execute(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const user = i.options.getUser('user');
    const img = i.options.getAttachment('image');
    if (img && !isImage(img)) return i.editReply(ui.noticeEdit('That attachment isn’t an image.', 'error'));
    const files = [], images = [];
    if (img) { const r = await ui.reupload(img); files.push(r.file); images.push(r.url); }

    const c = ui.card({
      title: i.options.getString('title') || `Message from ${cfg.brand}`,
      description: ui.clean(i.options.getString('message')),
      thumbnail: i.guild.iconURL({ extension: 'png' }),
      images,
      footer: `${cfg.brand} Team • ${ui.ts()}`,
    });
    try {
      await user.send(ui.send(c, { files }));
      await i.editReply(ui.noticeEdit(`DM delivered to ${ui.mention(user.id)}.`, 'success'));
    } catch {
      await i.editReply(ui.noticeEdit(`Couldn’t DM ${ui.mention(user.id)} — their DMs are closed.`, 'error'));
    }
  },
};

const say = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .setDefaultMemberPermissions(P.ManageMessages)
    .setDMPermission(false)
    .addStringOption((o) => o.setName('message').setDescription('Message (use \\n for a new line)').setRequired(true).setMaxLength(3500))
    .addChannelOption((o) => o.setName('channel').setDescription('Where to send (defaults here)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName('style').setDescription('Plain text or a card').addChoices({ name: 'Card', value: 'card' }, { name: 'Plain text', value: 'plain' })),

  async execute(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const target = i.options.getChannel('channel') || i.channel;
    const msg = ui.clean(i.options.getString('message'));
    if (i.options.getString('style') === 'plain') await target.send({ content: msg, allowedMentions: { parse: [] } });
    else await target.send(ui.send(ui.card({ title: cfg.brand, description: msg })));
    await i.editReply(ui.noticeEdit(`Sent in <#${target.id}>.`, 'success'));
  },
};

const send = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a styled announcement card to a channel')
    .setDefaultMemberPermissions(P.ManageMessages)
    .setDMPermission(false)
    .addChannelOption((o) => o.setName('channel').setDescription('Target channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName('title').setDescription('Card title').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('message').setDescription('Body (use \\n for a new line)').setRequired(true).setMaxLength(3500))
    .addAttachmentOption((o) => o.setName('image').setDescription('Optional image'))
    .addStringOption((o) => o.setName('color').setDescription('Accent colour').addChoices(
      { name: 'Blue', value: 'blue' }, { name: 'Green', value: 'green' }, { name: 'Red', value: 'red' }, { name: 'Gold', value: 'gold' }))
    .addStringOption((o) => o.setName('button_label').setDescription('Optional link button label').setMaxLength(40))
    .addStringOption((o) => o.setName('button_url').setDescription('Optional link button URL')),

  async execute(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const ch = i.options.getChannel('channel');
    const img = i.options.getAttachment('image');
    if (img && !isImage(img)) return i.editReply(ui.noticeEdit('That attachment isn’t an image.', 'error'));
    const files = [], images = [];
    if (img) { const r = await ui.reupload(img); files.push(r.file); images.push(r.url); }

    const rows = [];
    const label = i.options.getString('button_label'), url = i.options.getString('button_url');
    if (label && url) {
      try { new URL(url); rows.push(ui.row(ui.linkBtn(label, url))); }
      catch { return i.editReply(ui.noticeEdit('That button URL isn’t valid.', 'error')); }
    }

    const c = ui.card({
      title: i.options.getString('title'),
      description: ui.clean(i.options.getString('message')),
      images, rows,
      color: COLORS[i.options.getString('color') || 'blue'],
      footer: `${cfg.brand} • ${ui.ts()}`,
    });
    await ch.send(ui.send(c, { files }));
    await i.editReply(ui.noticeEdit(`Sent in <#${ch.id}>.`, 'success'));
  },
};

module.exports = [dm, say, send];
