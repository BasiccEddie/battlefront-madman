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
const {
  Client,
  GatewayIntentBits
} = require('discord.js');

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

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// --------------------------
// Internal state
// --------------------------
let lastProcessedBanId = null;
let lastServerStatus = null;

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
      {
        headers: {
          Authorization: `Bearer ${process.env.BATTLEMETRICS_API_TOKEN}`
        }
      }
    );

    const bans = res.data.data;
    if (!bans || !bans.length) return;

    bans.reverse(); // oldest → newest

    const forum = await client.channels.fetch(
      process.env.BANLOG_CHANNEL_ID
    );
    if (!forum) return;

    for (const ban of bans) {
      if (ban.id === lastProcessedBanId) continue;

      const attr = ban.attributes;
      const playerName = attr.player?.name || 'Unknown';
      const reason = attr.reason || 'No reason provided';
      const playerId =
        ban.relationships?.player?.data?.id || 'Unknown';
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
    console.error(
      'Banlog fetch failed:',
      err.response?.data || err.message
    );
  }
}

// --------------------------
// Server online / offline check
// CATEGORY_ID = category or channel ID
// --------------------------
async function checkServerStatus() {
  try {
    const res = await axios.get(
      `https://api.battlemetrics.com/servers/${process.env.BATTLEMETRICS_SERVER_ID}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.BATTLEMETRICS_API_TOKEN}`
        }
      }
    );

    const currentStatus = res.data.data.attributes.status;

    if (!lastServerStatus) {
      lastServerStatus = currentStatus;
      return;
    }

    if (currentStatus === lastServerStatus) return;

    const channel = await client.channels.fetch(
      process.env.CATEGORY_ID
    );
    if (!channel) return;

    const newName =
      currentStatus === 'online'
        ? '🟢 SERVER ONLINE'
        : '🔴 SERVER OFFLINE';

    if (channel.name !== newName) {
      await channel.setName(newName);
      console.log(`Server status → ${newName}`);
    }

    lastServerStatus = currentStatus;

  } catch (err) {
    console.error(
      'Server status check failed:',
      err.response?.data || err.message
    );
  }
}

// --------------------------
// Intervals
// --------------------------
setInterval(fetchBanLogs, 10 * 60 * 1000);   // every 10 min
setInterval(checkServerStatus, 3 * 60 * 1000); // every 3 min

// --------------------------
// Login
// --------------------------
client.login(process.env.DISCORD_BOT_TOKEN);
