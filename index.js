require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const express = require("express");

/* =========================
   BASIC VALIDATION
========================= */
if (!process.env.DISCORD_BOT_TOKEN) {
    console.error("❌ DISCORD_BOT_TOKEN is missing");
    process.exit(1);
}

if (!process.env.GUILD_ID || !process.env.CATEGORY_ID || !process.env.BATTLEMETRICS_SERVER_ID) {
    console.error("❌ One or more required env vars are missing");
    process.exit(1);
}

/* =========================
   EXPRESS (RAILWAY / UPTIME)
========================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(PORT, () => {
    console.log(`Uptime server listening on port ${PORT}`);
});

/* =========================
   DISCORD CLIENT
========================= */
const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: 'BattleMetrics', type: 3 }],
    status: 'online'
  });

  client.guilds.cache.forEach(guild => {
    console.log(`✅ Bot is in guild: ${guild.name} (${guild.id})`);
  });
});

client.once("ready", () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
    checkServerStatus();
    setInterval(checkServerStatus, 30_000); // 30 seconds
});

/* =========================
   MAIN LOGIC
========================= */
let lastCategoryName = null;

async function checkServerStatus() {
    try {
        const res = await axios.get(
            `https://api.battlemetrics.com/servers/${process.env.BATTLEMETRICS_SERVER_ID}`,
            { timeout: 10_000 }
        );

        const attr = res.data.data.attributes;

        const status = attr.status;
        const players = attr.players ?? 0;
        const maxPlayers = attr.maxPlayers ?? 0;

        console.log(
            `BattleMetrics status: ${status} Players: ${players} / ${maxPlayers}`
        );

        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const category = await guild.channels.fetch(process.env.CATEGORY_ID);

        if (!category || category.type !== 4) {
            console.error("❌ Category not found or not a category");
            return;
        }

        let newName;
        if (status === "online") {
            newName = `🟢 SERVER ONLINE (${players}/${maxPlayers})`;
        } else {
            newName = `🔴 SERVER OFFLINE (0/${maxPlayers})`;
        }

        if (category.name !== newName) {
            await category.setName(newName);
            lastCategoryName = newName;
            console.log(`Updated category name → ${newName}`);
        }

    } catch (err) {
        console.error("❌ BattleMetrics / Discord error:", err.message);
    }
}

/* =========================
   LOGIN
========================= */
client.login(process.env.DISCORD_BOT_TOKEN);
