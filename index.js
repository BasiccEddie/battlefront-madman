// --------------------------
// Load environment variables first
// --------------------------
const dotenv = require('dotenv');
dotenv.config();

// --------------------------
// Require other modules
// --------------------------
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

// --------------------------
// Check environment variables
// --------------------------
console.log("ENV check:", {
  DISCORD_BOT_TOKEN: !!process.env.DISCORD_BOT_TOKEN,
  GUILD_ID: !!process.env.GUILD_ID,
  CATEGORY_ID: !!process.env.CATEGORY_ID,
  BATTLEMETRICS_SERVER_ID: !!process.env.BATTLEMETRICS_SERVER_ID,
  BATTLEMETRICS_API_TOKEN: !!process.env.BATTLEMETRICS_API_TOKEN
});

// --------------------------
// Express setup
// --------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// Basic route to keep the container alive
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

// --------------------------
// Discord client setup
// --------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When bot is ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// --------------------------
// BattleMetrics banlog example
// --------------------------
async function fetchBanLogs() {
  try {
    const serverId = process.env.BATTLEMETRICS_SERVER_ID;
    const token = process.env.BATTLEMETRICS_API_TOKEN;

    const response = await axios.get(`https://api.battlemetrics.com/servers/${serverId}/bans`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log("Ban logs fetched:", response.data);
    // Here you can send them to your Discord channel
  } catch (error) {
    console.error("Error fetching ban logs:", error.response?.data || error.message);
  }
}

// Optional: periodically fetch ban logs every 10 minutes
setInterval(fetchBanLogs, 10 * 60 * 1000);

// --------------------------
// Login Discord bot
// --------------------------
client.login(process.env.DISCORD_BOT_TOKEN);
