// Components V2 helpers - every message in the bot is built through these.
const path = require('path');
const E = require('./emojis');
const {
  ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MediaGalleryBuilder, MediaGalleryItemBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, MessageFlags, AttachmentBuilder,
} = require('discord.js');
const cfg = require('./config');

const NO_PING = { parse: [] };
const V2 = MessageFlags.IsComponentsV2;

const text = (c) => new TextDisplayBuilder().setContent(String(c).slice(0, 3900));
const sep = (large = false) =>
  new SeparatorBuilder().setDivider(true).setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

// Mentions render as a clickable account chip but never ping (allowedMentions is empty).
const mention = (id) => `<@${id}>`;
const ts = (d = Date.now(), f = 'f') => `<t:${Math.floor(new Date(d).getTime() / 1000)}:${f}>`;
const stars = (n) => E.starFull.repeat(n) + E.starEmpty.repeat(5 - n);
const clean = (s) => String(s ?? '').replace(/\\n/g, '\n');
const fmtPrice = (p) => (p ? `${cfg.currency}${String(p).replace(/^[^\d.]+/, '')}` : null);

function card({ title, description, lines = [], thumbnail, images = [], footer, color = cfg.color, rows = [], top }) {
  const c = new ContainerBuilder().setAccentColor(color);
  if (top) c.addTextDisplayComponents(text(top));

  const head = `## ${title}` + (description ? `\n${description}` : '');
  if (thumbnail) {
    c.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(head))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail)),
    );
  } else c.addTextDisplayComponents(text(head));

  if (lines.length) c.addSeparatorComponents(sep()).addTextDisplayComponents(text(lines.join('\n')));
  if (images.length) {
    c.addSeparatorComponents(sep());
    c.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(...images.map((u) => new MediaGalleryItemBuilder().setURL(u))),
    );
  }
  if (rows.length) {
    c.addSeparatorComponents(sep());
    rows.forEach((r) => c.addActionRowComponents(r));
  }
  if (footer) c.addSeparatorComponents(sep()).addTextDisplayComponents(text(`-# ${footer}`));
  return c;
}

const KINDS = { success: [cfg.green, E.success], error: [cfg.red, E.error], info: [cfg.color, E.info], warn: [cfg.gold, E.warn] };
const simple = (msg, kind = 'info') =>
  new ContainerBuilder().setAccentColor(KINDS[kind][0]).addTextDisplayComponents(text(`${KINDS[kind][1]}  ${msg}`));

const send = (container, { ephemeral = false, files, allowedMentions } = {}) => ({
  components: [].concat(container),
  flags: V2 | (ephemeral ? MessageFlags.Ephemeral : 0),
  allowedMentions: allowedMentions || NO_PING,
  ...(files?.length ? { files } : {}),
});
const edit = (container, files) => ({
  components: [].concat(container),
  flags: V2,
  allowedMentions: NO_PING,
  ...(files?.length ? { files } : {}),
});
const notice = (msg, kind = 'info', ephemeral = true) => send(simple(msg, kind), { ephemeral });
const noticeEdit = (msg, kind = 'info') => edit(simple(msg, kind));

const btn = (id, label, style = ButtonStyle.Secondary, emoji) => {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
};
const linkBtn = (label, url) => new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
const row = (...c) => new ActionRowBuilder().addComponents(...c);

// Download an attachment and re-upload it so the image never expires.
async function reupload(att, name = 'image') {
  const res = await fetch(att.url);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = `${name}${path.extname(att.name || '') || '.png'}`;
  return { file: new AttachmentBuilder(buf, { name: file }), url: `attachment://${file}` };
}

module.exports = {
  card, simple, send, edit, notice, noticeEdit, btn, linkBtn, row, reupload,
  mention, ts, stars, clean, fmtPrice, ButtonStyle,
};
