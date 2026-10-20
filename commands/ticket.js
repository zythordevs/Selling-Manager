const { SlashCommandBuilder } = require('discord.js');
const E = require('../emojis');
const { db, save } = require('../db');
const ui = require('../ui');
const tickets = require('../tickets');

const cmd = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the current ticket')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('close').setDescription('Close this ticket'))
    .addSubcommand((s) => s.setName('reopen').setDescription('Reopen this ticket'))
    .addSubcommand((s) => s.setName('rename').setDescription('Rename this ticket')
      .addStringOption((o) => o.setName('name').setDescription('New channel name').setRequired(true).setMaxLength(80)))
    .addSubcommand((s) => s.setName('add').setDescription('Add a user to this ticket')
      .addUserOption((o) => o.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a user from this ticket')
      .addUserOption((o) => o.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand((s) => s.setName('delete').setDescription('Delete this ticket (saves a transcript)')),

  async execute(i) {
    const t = db.tickets[i.channelId];
    if (!t) return i.reply(ui.notice('This command only works inside a ticket channel.', 'error'));
    const sub = i.options.getSubcommand();
    const staff = tickets.isStaff(i.member);
    const owner = t.userId === i.user.id;

    if (['close', 'reopen'].includes(sub)) {
      if (!staff && !owner) return i.reply(ui.notice('Only the ticket owner or staff can do that.', 'error'));
      if (sub === 'close' && t.status === 'closed') return i.reply(ui.notice('This ticket is already closed.', 'warn'));
      if (sub === 'reopen' && t.status === 'open') return i.reply(ui.notice('This ticket is already open.', 'warn'));
      await i.deferReply();
      const c = sub === 'close' ? await tickets.doClose(i.channel, i.user) : await tickets.doReopen(i.channel, i.user);
      return i.editReply(ui.edit(c));
    }

    if (!staff) return i.reply(ui.notice('Only support staff can use this command.', 'error'));

    if (sub === 'delete') {
      await i.deferReply();
      return i.editReply(ui.edit(await tickets.doDelete(i.channel, i.user)));
    }

    if (sub === 'rename') {
      const name = i.options.getString('name').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!name) return i.reply(ui.notice('Please use letters or numbers.', 'error'));
      t.name = name;
      save();
      i.channel.setName(name).catch(() => {}); // Discord allows 2 renames / 10 min per channel
      return i.reply(ui.send(ui.card({ title: `${E.rename} Ticket Renamed`, lines: [`**New name:** \`${name}\``, `**By:** ${ui.mention(i.user.id)}`], footer: 'Discord limits renames to 2 per 10 minutes.' })));
    }

    const user = i.options.getUser('user');
    if (sub === 'add') {
      await i.deferReply();
      await i.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
      if (!t.added.includes(user.id)) t.added.push(user.id);
      save();
      return i.editReply(ui.edit(ui.card({ title: `${E.add} User Added`, lines: [`${ui.mention(user.id)} was added by ${ui.mention(i.user.id)}.`], color: 0x2ecc71 })));
    }
    if (sub === 'remove') {
      if (user.id === t.userId) return i.reply(ui.notice('You can’t remove the ticket owner.', 'error'));
      await i.deferReply();
      await i.channel.permissionOverwrites.delete(user.id);
      t.added = t.added.filter((u) => u !== user.id);
      save();
      return i.editReply(ui.edit(ui.card({ title: `${E.remove} User Removed`, lines: [`${ui.mention(user.id)} was removed by ${ui.mention(i.user.id)}.`], color: 0xed4245 })));
    }
  },
};

module.exports = cmd;
