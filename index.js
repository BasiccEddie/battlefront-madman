require("dotenv").config();

const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const axios = require("axios");
const express = require("express");

/* =========================
   ENV VALIDATION
========================= */
const REQUIRED_ENVS = [
  "DISCORD_BOT_TOKEN",
  "GUILD_ID",
  "CATEGORY_ID",
  "BANLOG_FORUM_CHANNEL_ID",
  "BATTLEMETRICS_SERVER_ID",
  "BATTLEMETRICS_API_TOKEN",
];

for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.error(`❌ Missing env var: ${key}`);
    process.exit(1);
  }
}

/* =========================
   EXPRESS (UPTIME)
========================= */
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("Bot alive"));
app.listen(PORT);

/* =========================
   DISCORD CLIENT
========================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/* =========================
   FORUM TAG IDS
========================= */
const TAGS = {
  banned: "TAG_ID_BANNED",
  teamkilling: "TAG_ID_TEAM_KILLING",
  cheating: "TAG_ID_CHEATING",
  toxic: "TAG_ID_TOXIC",
  wrongmob: "TAG_ID_WRONG_MOB",
  sorted: "TAG_ID_SORTED",
};

/* =========================
   SERVER STATUS
========================= */
async function checkServerStatus() {
  try {
    const res = await axios.get(
      `https://api.battlemetrics.com/servers/${process.env.BATTLEMETRICS_SERVER_ID}`
    );

    const attr = res.data.data.attributes;
    const status = attr.status;
    const players = attr.players ?? 0;
    const maxPlayers = attr.maxPlayers ?? 0;

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const category = await guild.channels.fetch(process.env.CATEGORY_ID);

    if (!category || category.type !== ChannelType.GuildCategory) return;

    const newName =
      status === "online"
        ? `🟢 SERVER ONLINE (${players}/${maxPlayers})`
        : `🔴 SERVER OFFLINE (0/${maxPlayers})`;

    if (category.name !== newName) {
      await category.setName(newName);
      console.log(`🔄 Category updated → ${newName}`);
    }
  } catch (err) {
    console.error("❌ Server status error:", err.message);
  }
}

/* =========================
   BAN WATCHER
========================= */
const seenBans = new Set();

async function checkBans() {
  try {
    const res = await axios.get("https://api.battlemetrics.com/bans", {
      headers: {
        Authorization: `Bearer ${process.env.BATTLEMETRICS_API_TOKEN}`,
      },
      params: {
        "filter[server]": process.env.BATTLEMETRICS_SERVER_ID,
        "page[size]": 10,
        include: "player,admin",
      },
    });

    for (const ban of res.data.data) {
      if (seenBans.has(ban.id)) continue;
      seenBans.add(ban.id);

      await postBan(ban, res.data.included);
    }
  } catch (err) {
    console.error("❌ Ban fetch error:", err.message);
  }
}

/* =========================
   POST BAN TO FORUM
========================= */
async function postBan(ban, included) {
  const forum = await client.channels.fetch(
    process.env.BANLOG_FORUM_CHANNEL_ID
  );

  if (!forum || forum.type !== ChannelType.GuildForum) return;

  const player = included.find(i => i.type === "player");
  const admin = included.find(i => i.type === "user");

  const reason = ban.attributes.reason || "No reason provided";
  const perma = !ban.attributes.expires;
  const timestamp = Math.floor(
    new Date(ban.attributes.createdAt).getTime() / 1000
  );

  let appliedTag = TAGS.banned;

  const reasonLower = reason.toLowerCase();
  if (reasonLower.includes("team")) appliedTag = TAGS.teamkilling;
  if (reasonLower.includes("cheat")) appliedTag = TAGS.cheating;
  if (reasonLower.includes("toxic")) appliedTag = TAGS.toxic;
  if (reasonLower.includes("mob")) appliedTag = TAGS.wrongmob;

  await forum.threads.create({
    name: `Ban | ${player?.attributes?.name || "Unknown"}`,
    message: {
      content:
`**Time & Date:** <t:${timestamp}:F>
**Player Name:** ${player?.attributes?.name || "Unknown"}
**Player ID:** ${player?.id || "Unknown"}
**Reason:** ${reason}
**Admin:** ${admin?.attributes?.nickname || "BattleMetrics"}
**Result:** ${perma ? "Perma" : "Temporary"}`,
    },
    appliedTags: [appliedTag],
  });

  console.log(`🚫 Logged ban → ${player?.attributes?.name}`);
}

/* =========================
   READY
========================= */
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  checkServerStatus();
  checkBans();

  setInterval(checkServerStatus, 30_000);
  setInterval(checkBans, 60_000);
});

/* =========================
   LOGIN
========================= */
client.login(process.env.DISCORD_BOT_TOKEN);
