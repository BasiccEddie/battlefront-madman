// --------------------------
// Load environment variables
// --------------------------
const dotenv = require('dotenv');
dotenv.config();

// --------------------------
// Dependencies
// --------------------------
const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

// --------------------------
// Express keep-alive
// --------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => res.send('Bot is running'));
app.listen(PORT, () =>
  console.log(`Express running on port ${PORT}`)
);

// --------------------------
// Discord client
// --------------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --------------------------
// Internal state
// --------------------------
let lastProcessedBanId = null;

// --------------------------
// Resolve forum tags from reason
// --------------------------
function resolveTags(reason = '') {
  const tags = [];
  const r = reason.toLowerCase();

  if (r.includes('ban')) tags.push(process.env.TAG_BANNED);
  if (r.includes('sorted')) tags.push(process.env.TAG_SORTED);
  if (r.includes('kick')) tags.push(process.env.TAG_KICKED);
  if (r.includes('team')) tags.push(process.env.TAG_TEAMKILLING);
  if (r.includes('mob')) tags.push(process.env.TAG_WRONG_MOB);
  if (r.includes('cheat')) tags.push(process.env.TAG_CHEATING);
  if (r.includes('toxic')) tags.push(process.env.TAG_TOXIC);
  if (r.includes('kamikazi')) tags.push(process.env.TAG_KAMIKAZI);

  return tags.filter(Boolean);
}

// --------------------------
// Fetch & post BattleMetrics bans
// --------------------------
async function fetchBanLogs() {
  try {
    const res = await axios.get(
      `https://api.battlemetrics.com/servers/${process.env.BATTLEMETRICS_SERVER_ID}/bans`,
      { headers: { Authorization: `Bearer ${process.env.BATTLEMETRICS_API_TOKEN}` } }
    );

    const bans = res.data.data;
    if (!bans || !bans.length) return;

    bans.reverse(); // oldest → newest

    const forum = await client.channels.fetch(process.env.BANLOG_CHANNEL_ID);
    if (!forum) return;

    for (const ban of bans) {
      if (ban.id === lastProcessedBanId) continue;

      const attr = ban.attributes;
      const playerName = attr.player?.name || 'Unknown';
      const reason = attr.reason || 'No reason provided';
      const playerId = ban.relationships?.player?.data?.id || 'Unknown';
      const time = new Date(attr.timestamp).toLocaleString('sv-SE');

      const appliedTags = resolveTags(reason);

      await forum.threads.create({
        name: `Ban | ${playerName}`,
        autoArchiveDuration: 10080,
        appliedTags,
        message: {
          content:
`time and date : ${time}
players name : ${playerName}
reason : ${reason}
players id  : ${playerId}
ticket link :
result      : Warned`
        }
      });

      lastProcessedBanId = ban.id;
    }

  } catch (err) {
    console.error('Banlog fetch failed:', err.response?.data || err.message);
  }
}

// --------------------------
// Fetch server status
// --------------------------
async function getServerStatus() {
  try {
    const res = await axios.get(
      `https://api.battlemetrics.com/servers/${process.env.BATTLEMETRICS_SERVER_ID}`,
      { headers: { Authorization: `Bearer ${process.env.BATTLEMETRICS_API_TOKEN}` } }
    );
    return res.data.data.attributes.status; // "online" or "offline"
  } catch (err) {
    console.error('Failed to fetch server status:', err.response?.data || err.message);
    return 'offline'; // fallback
  }
}

// --------------------------
// Register slash commands
// --------------------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('server')
      .setDescription('Check if the server is online or offline')
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: commands });
  console.log('Registered /server command');
});

// --------------------------
// Handle slash commands
// --------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'server') {
    await interaction.deferReply();

    const status = await getServerStatus();
    const response =
      status === 'online'
        ? '🟢 Server is online'
        : '🔴 Server is offline';

    await interaction.editReply(response);
  }
});

// --------------------------
// Poll ban logs periodically
// --------------------------
setInterval(fetchBanLogs, 10 * 60 * 1000); // every 10 min

// --------------------------
// Login
// --------------------------
client.login(process.env.DISCORD_BOT_TOKEN);
