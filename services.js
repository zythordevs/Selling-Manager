// Shared logic used by several commands.
const { AttachmentBuilder } = require('discord.js');
const E = require('./emojis');
const { db, save } = require('./db');
const ui = require('./ui');
const cfg = require('./config');
const { feedbackImage } = require('./images');

async function getChannel(client, key) {
  const id = db.settings.channels[key];
  if (!id) return null;
  return client.channels.fetch(id).catch(() => null);
}

async function logVouch(client, v, buyer, seller) {
  const ch = await getChannel(client, 'vouch');
  if (!ch) return false;
  const lines = [
    `**${E.product} Product:** ${v.quantity}x ${v.product}`,
    ...(v.price ? [`**${E.price} Price:** ${ui.fmtPrice(v.price)}`] : []),
    `**${E.seller} Seller:** ${ui.mention(seller.id)}`,
    `**${E.buyer} Buyer:** ${ui.mention(buyer.id)}`,
    `**${E.rating} Rating:** ${ui.stars(v.rating)}`,
  ];
  const c = ui.card({
    title: 'New Vouch Recorded!',
    thumbnail: buyer.displayAvatarURL({ extension: 'png', size: 256 }),
    lines,
    footer: `Vouch #${v.id} • ${ui.ts(v.at)}`,
  });
  await ch.send(ui.send(c));
  return true;
}

async function postFeedback(client, { buyer, product, price, rating, reason, sellerId }) {
  const ch = await getChannel(client, 'feedback');
  if (!ch) return false;
  const png = await feedbackImage({
    username: buyer.username,
    avatarUrl: buyer.displayAvatarURL({ extension: 'png', size: 256 }),
    product,
    price: ui.fmtPrice(price),
    rating,
    reason,
  });
  const file = new AttachmentBuilder(png, { name: 'feedback.png' });
  const lines = [
    `**${E.product} Product:** ${product}`,
    ...(price ? [`**${E.priceArrow} Price:** ${ui.fmtPrice(price)}`] : []),
    `**${E.buyer} Buyer:** ${ui.mention(buyer.id)}`,
    ...(sellerId ? [`**${E.seller} Seller:** ${ui.mention(sellerId)}`] : []),
    '',
    `**${E.rating} Rating:** ${ui.stars(rating)}`,
    `**${E.reason} Reason:** ${reason || 'No comment'}`,
  ];
  const c = ui.card({
    title: 'New Feedback Recorded !',
    thumbnail: buyer.displayAvatarURL({ extension: 'png', size: 256 }),
    lines,
    images: ['attachment://feedback.png'],
  });
  await ch.send(ui.send(c, { files: [file] }));
  return true;
}

// ---- stock board ----
function stockCard() {
  const items = Object.values(db.stocks);
  const lines = items.length
    ? items.map((s) => {
        const status = s.qty > 0 ? `${s.qty} in stock` : 'Out of stock';
        return `${s.qty > 0 ? E.inStock : E.outOfStock} **${s.name}**\n-# ${ui.fmtPrice(s.price)} • ${status}${s.note ? ` • ${s.note}` : ''}`;
      })
    : ['No products listed yet.'];
  return ui.card({
    title: `${E.stock} ${cfg.brand} • Live Stock`,
    lines,
    footer: `Last updated ${ui.ts(Date.now(), 'R')}`,
  });
}

async function refreshStockPanel(client) {
  const p = db.settings.stockPanel;
  if (!p) return;
  try {
    const ch = await client.channels.fetch(p.channelId);
    const msg = await ch.messages.fetch(p.messageId);
    await msg.edit(ui.edit(stockCard()));
  } catch {
    db.settings.stockPanel = null; // message was deleted
    save();
  }
}

module.exports = { getChannel, logVouch, postFeedback, stockCard, refreshStockPanel };
