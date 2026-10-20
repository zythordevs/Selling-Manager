require('dotenv').config();
const { REST, Routes } = require('discord.js');
const loadCommands = require('./loader');

const body = loadCommands().map((c) => c.data.toJSON());
const rest = new REST().setToken((process.env.TOKEN || '').trim().replace(/^["']|["']$/g, ''));

(async () => {
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);
  await rest.put(route, { body });
  console.log(`Registered ${body.length} commands.`);
})().catch(console.error);
