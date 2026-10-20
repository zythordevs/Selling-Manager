const { SlashCommandBuilder, PermissionFlagsBits: P, MessageFlags, AttachmentBuilder } = require('discord.js');
const E = require('../emojis');
const { db, save } = require('../db');
const ui = require('../ui');
const cfg = require('../config');
const sv = require('../services');
const { bannerImage } = require('../images');

const nameOpt = (o) => o.setName('name').setDescription('Product name').setRequired(true).setAutocomplete(true);

const stock = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Save, edit and send your stock list')
    .setDefaultMemberPermissions(P.ManageMessages)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('add').setDescription('Add (or overwrite) a product')
      .addStringOption((o) => o.setName('name').setDescription('Product name').setRequired(true).setMaxLength(60))
      .addIntegerOption((o) => o.setName('quantity').setDescription('Units in stock').setRequired(true).setMinValue(0))
      .addNumberOption((o) => o.setName('price').setDescription('Price per unit').setRequired(true).setMinValue(0))
      .addStringOption((o) => o.setName('note').setDescription('Short note, e.g. "instant delivery"').setMaxLength(60)))
    .addSubcommand((s) => s.setName('edit').setDescription('Edit a product')
      .addStringOption(nameOpt)
      .addIntegerOption((o) => o.setName('quantity').setDescription('New quantity').setMinValue(0))
      .addNumberOption((o) => o.setName('price').setDescription('New price').setMinValue(0))
      .addStringOption((o) => o.setName('note').setDescription('New note (use - to clear)').setMaxLength(60))
      .addStringOption((o) => o.setName('new_name').setDescription('Rename product').setMaxLength(60)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a product').addStringOption(nameOpt))
    .addSubcommand((s) => s.setName('view').setDescription('Preview the stock list (only you)'))
    .addSubcommand((s) => s.setName('send').setDescription('Post the live stock board (auto-updates on edits)')
      .addChannelOption((o) => o.setName('channel').setDescription('Defaults to this channel'))),

  async autocomplete(i) {
    const q = i.options.getFocused().toLowerCase();
    await i.respond(Object.values(db.stocks).filter((s) => s.name.toLowerCase().includes(q)).slice(0, 25).map((s) => ({ name: s.name, value: s.name })));
  },

  async execute(i) {
    const sub = i.options.getSubcommand();
    const key = (n) => Buffer.from(n.toLowerCase()).toString('hex'); // Mongo-safe field name

    if (sub === 'view') return i.reply(ui.send(sv.stockCard(), { ephemeral: true }));
    await i.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'send') {
      const ch = i.options.getChannel('channel') || i.channel;
      const msg = await ch.send(ui.send(sv.stockCard()));
      db.settings.stockPanel = { channelId: ch.id, messageId: msg.id };
      save();
      return i.editReply(ui.noticeEdit(`Stock board posted in <#${ch.id}>. It will update automatically when you add/edit/remove products.`, 'success'));
    }

    if (sub === 'add') {
      const name = i.options.getString('name');
      db.stocks[key(name)] = { name, qty: i.options.getInteger('quantity'), price: i.options.getNumber('price'), note: i.options.getString('note') || '' };
    } else {
      const s = db.stocks[key(i.options.getString('name'))];
      if (!s) return i.editReply(ui.noticeEdit('Product not found.', 'error'));
      if (sub === 'remove') delete db.stocks[key(s.name)];
      else {
        const q = i.options.getInteger('quantity'), p = i.options.getNumber('price'), n = i.options.getString('note'), nn = i.options.getString('new_name');
        if (q !== null) s.qty = q;
        if (p !== null) s.price = p;
        if (n !== null) s.note = n === '-' ? '' : n;
        if (nn) {
          if (key(nn) !== key(s.name) && db.stocks[key(nn)]) return i.editReply(ui.noticeEdit(`A product named **${nn}** already exists.`, 'error'));
          delete db.stocks[key(s.name)]; s.name = nn; db.stocks[key(nn)] = s;
        }
      }
    }
    save();
    await sv.refreshStockPanel(i.client);
    await i.editReply(ui.noticeEdit(`Stock ${sub === 'add' ? 'saved' : sub === 'edit' ? 'updated' : 'removed'}.`, 'success'));
  },
};

const proofs = {
  data: new SlashCommandBuilder()
    .setName('proofs')
    .setDescription('Post a proof to the proofs channel')
    .setDefaultMemberPermissions(P.ManageMessages)
    .setDMPermission(false)
    .addAttachmentOption((o) => o.setName('image').setDescription('Proof screenshot').setRequired(true))
    .addStringOption((o) => o.setName('title').setDescription('Title, e.g. "3M NITRO ID SOLD"').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('description').setDescription('Optional description').setMaxLength(500)),

  async execute(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const img = i.options.getAttachment('image');
    if (!img.contentType?.startsWith('image/')) return i.editReply(ui.noticeEdit('That attachment isn’t an image.', 'error'));
    const ch = await sv.getChannel(i.client, 'proofs');
    if (!ch) return i.editReply(ui.noticeEdit('Proofs channel isn’t set. Run `/setup channels` first.', 'error'));
    const r = await ui.reupload(img, 'proof');
    const c = ui.card({
      title: i.options.getString('title'),
      description: i.options.getString('description') ? ui.clean(i.options.getString('description')) : undefined,
      images: [r.url],
      footer: `Uploaded by ${ui.mention(i.user.id)} • ${ui.ts()}`,
    });
    await ch.send(ui.send(c, { files: [r.file] }));
    await i.editReply(ui.noticeEdit(`Proof posted in <#${ch.id}>.`, 'success'));
  },
};

const complete = {
  data: new SlashCommandBuilder()
    .setName('complete')
    .setDescription('Log a completed order')
    .setDefaultMemberPermissions(P.ManageMessages)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('buyer').setDescription('Buyer').setRequired(true))
    .addStringOption((o) => o.setName('product').setDescription('Product').setRequired(true).setMaxLength(100))
    .addIntegerOption((o) => o.setName('quantity').setDescription('Quantity').setRequired(true).setMinValue(1)),

  async execute(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const ch = (await sv.getChannel(i.client, 'orders')) || i.channel;
    const n = ++db.counters.order;
    save();
    const buyer = i.options.getUser('buyer');
    const file = new AttachmentBuilder(bannerImage('ORDER COMPLETED'), { name: 'order.png' });
    const c = ui.card({
      title: `${E.success} Order Completed`,
      lines: [
        `### ${E.order} Order Number: #${n}`,
        `╰ **Buyer:** ${ui.mention(buyer.id)}`,
        `╰ **Product:** ${i.options.getString('product')}`,
        `╰ **Quantity:** ${i.options.getInteger('quantity')}`,
      ],
      images: ['attachment://order.png'],
      footer: `Order completed by ${ui.mention(i.user.id)} • ${ui.ts()}`,
    });
    await ch.send(ui.send(c, { files: [file] }));
    await i.editReply(ui.noticeEdit(`Order #${n} logged in <#${ch.id}>.`, 'success'));
  },
};

module.exports = [stock, proofs, complete];
