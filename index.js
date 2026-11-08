require("dotenv").config();
const { Client, GatewayIntentBits: G, Partials, Events } = require("discord.js");
const db = require("./db");
const U = require("./util");

const NAMES = ["config", "welcome", "tickets", "session", "polls", "giveaways", "sanctions", "blacklist", "activity", "jobs", "updates", "staffrating", "reports", "dni", "autoroles"];
const modules = NAMES.map((n) => require("./modules/" + n));

if (!process.env.DISCORD_TOKEN) {
  console.error("Falta DISCORD_TOKEN. Copia .env.example a .env y rellénalo.");
  process.exit(1);
}

const client = new Client({
  intents: [G.Guilds, G.GuildMembers, G.GuildMessages, G.MessageContent],
  partials: [Partials.GuildMember]
});

const defs = [], run = new Map(), auto = new Map(), ui = new Map();
for (const m of modules) {
  for (const c of m.commands || []) {
    if (!m.run || !m.run[c.name]) throw new Error("Falta el manejador del comando /" + c.name);
    defs.push(c.toJSON());
    run.set(c.name, m.run[c.name]);
  }
  for (const [k, f] of Object.entries(m.auto || {})) auto.set(k, f);
  for (const [k, f] of Object.entries(m.ui || {})) ui.set(k, f);
  for (const [ev, f] of Object.entries(m.events || {})) {
    client.on(ev, async (...a) => { try { await f(...a); } catch (e) { console.error(`[${ev}]`, e); } });
  }
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) return await run.get(i.commandName)?.(i);
    if (i.isAutocomplete()) return await auto.get(i.commandName)?.(i);
    if (i.isMessageComponent() || i.isModalSubmit()) {
      const [k, ...a] = i.customId.split("|");
      return await ui.get(k)?.(i, a);
    }
  } catch (e) {
    if (!(e instanceof U.UserError)) console.error(e);
    if (i.isAutocomplete()) return;
    const p = { content: e instanceof U.UserError ? e.message : "Ha ocurrido un error inesperado. Inténtalo de nuevo.", flags: U.EPH };
    try { (i.deferred || i.replied) ? await i.followUp(p) : await i.reply(p); } catch { /* ya respondida */ }
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Conectado como ${c.user.tag}`);
  try {
    if (process.env.GUILD_ID) {
      const g = await c.guilds.fetch(process.env.GUILD_ID);
      await g.commands.set(defs);
    } else {
      await c.application.commands.set(defs);
    }
    console.log(`${defs.length} comandos registrados`);
  } catch (e) { console.error("Error registrando comandos", e); }
  for (const g of c.guilds.cache.values()) g.members.fetch().catch(() => {});
  for (const m of modules) { try { await m.ready?.(c); } catch (e) { console.error(e); } }
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    for (const m of modules) { try { await m.tick?.(c); } catch (e) { console.error(e); } }
    busy = false;
  };
  setInterval(tick, 15000);
  tick();
});

process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
const bye = () => { try { db.flush(); } catch {} process.exit(0); };
process.on("SIGINT", bye);
process.on("SIGTERM", bye);

client.login(process.env.DISCORD_TOKEN);
