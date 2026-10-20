const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const E = require('../emojis');
const { db, cols, save } = require('../db');
const ui = require('../ui');
const sv = require('../services');

const vouch = {
  data: new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Leave a vouch for a seller')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('seller').setDescription('Seller you are vouching for').setRequired(true))
    .addStringOption((o) => o.setName('product').setDescription('Product you bought').setRequired(true).setMaxLength(100))
    .addIntegerOption((o) => o.setName('quantity').setDescription('Quantity you bought').setRequired(true).setMinValue(1).setMaxValue(100000))
    .addIntegerOption((o) => o.setName('rating').setDescription('Rating from 1 to 5').setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption((o) => o.setName('comment').setDescription('Your feedback (optional)').setMaxLength(200))
    .addStringOption((o) => o.setName('price').setDescription('Amount paid, e.g. 450 (optional)').setMaxLength(20)),

  async execute(i) {
    const seller = i.options.getUser('seller');
    if (seller.bot) return i.reply(ui.notice('You can’t vouch for a bot.', 'error'));
    if (seller.id === i.user.id) return i.reply(ui.notice('You can’t vouch for yourself.', 'error'));

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const recent = await cols.vouches.findOne({ buyerId: i.user.id, sellerId: seller.id, at: { $gt: Date.now() - 10 * 60_000 } });
    if (recent) return i.editReply(ui.noticeEdit('You already vouched for this seller a moment ago. Please wait a few minutes.', 'warn'));

    const v = {
      id: ++db.counters.vouch,
      buyerId: i.user.id,
      sellerId: seller.id,
      product: i.options.getString('product'),
      quantity: i.options.getInteger('quantity'),
      rating: i.options.getInteger('rating'),
      comment: i.options.getString('comment'),
      price: i.options.getString('price'),
      at: Date.now(),
    };
    save();
    await cols.vouches.insertOne({ ...v });

    // The vouch is already saved; a failed log post (missing permissions, deleted channel) must not undo that.
    const logged = await sv.logVouch(i.client, v, i.user, seller).catch((e) => { console.error('[vouch log failed]', e.message); return false; });
    // Feedback is sent automatically after every vouch.
    await cols.feedbacks.insertOne({ vouchId: v.id, buyerId: i.user.id, sellerId: seller.id, product: v.product, rating: v.rating, reason: v.comment, price: v.price, kind: 'auto', at: v.at });
    const fb = await sv.postFeedback(i.client, {
      buyer: i.user, product: `${v.quantity}x ${v.product}`, price: v.price, rating: v.rating, reason: v.comment, sellerId: seller.id,
    }).catch((e) => { console.error('[feedback post failed]', e.message); return false; });

    const note = logged || fb ? '' : '\n-# No log channels are configured yet (admins: use `/setup channels`).';
    await i.editReply(ui.noticeEdit(`Vouch #${v.id} recorded for ${ui.mention(seller.id)}. Thank you!${note}`, 'success'));
  },
};

const feedback = {
  data: new SlashCommandBuilder()
    .setName('feedback')
    .setDescription('Post feedback about a purchase')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('product').setDescription('Product you bought').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('price').setDescription('Price paid, e.g. 450').setRequired(true).setMaxLength(20))
    .addIntegerOption((o) => o.setName('rating').setDescription('Rating from 1 to 5').setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption((o) => o.setName('reason').setDescription('Your feedback').setRequired(true).setMaxLength(150))
    .addUserOption((o) => o.setName('seller').setDescription('Seller you dealt with (optional)')),

  async execute(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const data = {
      buyer: i.user,
      product: i.options.getString('product'),
      price: i.options.getString('price'),
      rating: i.options.getInteger('rating'),
      reason: i.options.getString('reason'),
      sellerId: i.options.getUser('seller')?.id,
    };
    const ok = await sv.postFeedback(i.client, data);
    if (!ok) return i.editReply(ui.noticeEdit('The feedback channel isn’t set up yet. Ask an admin to run `/setup channels`.', 'error'));
    await cols.feedbacks.insertOne({
      buyerId: i.user.id, sellerId: data.sellerId || null, product: data.product, rating: data.rating,
      reason: data.reason, price: data.price, kind: 'manual', at: Date.now(),
    });
    await i.editReply(ui.noticeEdit('Your feedback has been posted. Thank you!', 'success'));
  },
};

const profile = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View vouches and average rating')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User to check (defaults to you)')),

  async execute(i) {
    await i.deferReply();
    const u = i.options.getUser('user') || i.user;
    const [stats] = await cols.vouches.aggregate([
      { $match: { sellerId: u.id } },
      { $group: { _id: null, total: { $sum: 1 }, avg: { $avg: '$rating' }, sold: { $sum: '$quantity' } } },
    ]).toArray();
    const total = stats?.total || 0;
    const avg = stats?.avg || 0;
    const given = await cols.vouches.countDocuments({ buyerId: u.id });
    const recent = total ? await cols.vouches.find({ sellerId: u.id }).sort({ at: -1 }).limit(3).toArray() : [];

    const lines = [
      `**${E.user} User:** ${ui.mention(u.id)}`,
      `**${E.vouches} Total Vouches:** ${total}`,
      `**${E.rating} Average Rating:** ${total ? `${avg.toFixed(2)} / 5  ${ui.stars(Math.round(avg))}` : 'No ratings yet'}`,
      `**${E.itemsSold} Items Sold:** ${stats?.sold || 0}`,
      `**${E.vouchesGiven} Vouches Given:** ${given}`,
    ];
    if (recent.length) {
      lines.push('', '**Recent vouches**');
      recent.forEach((v) => lines.push(`${ui.stars(v.rating)} • ${v.quantity}x ${v.product} — ${ui.mention(v.buyerId)}`));
    }
    await i.editReply(ui.edit(ui.card({
      title: 'Vouch Profile',
      thumbnail: u.displayAvatarURL({ extension: 'png', size: 256 }),
      lines,
    })));
  },
};

module.exports = [vouch, feedback, profile];
