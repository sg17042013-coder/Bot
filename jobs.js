const { SlashCommandBuilder, PermissionFlagsBits: P } = require("discord.js");
const db = require("../db");
const U = require("../util");

const J = () => db.data.jobs;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fmt = () => db.data.config.jobFormat;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cmd = new SlashCommandBuilder().setName("trabajo").setDescription("Nombre automático según el rol (admin)")
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) => s.setName("agregar").setDescription("Asocia un rol con un trabajo")
    .addRoleOption((o) => o.setName("rol").setDescription("Rol").setRequired(true))
    .addStringOption((o) => o.setName("etiqueta").setDescription("Texto que sale en el nombre. Ej: Policía").setRequired(true).setMaxLength(20))
    .addIntegerOption((o) => o.setName("prioridad").setDescription("Si tiene varios roles gana la prioridad más alta (por defecto 0)").setMinValue(0).setMaxValue(1000)))
  .addSubcommand((s) => s.setName("quitar").setDescription("Quita un rol de la lista")
    .addRoleOption((o) => o.setName("rol").setDescription("Rol").setRequired(true)))
  .addSubcommand((s) => s.setName("lista").setDescription("Muestra los trabajos configurados"))
  .addSubcommand((s) => s.setName("formato").setDescription("Formato del nombre. Usa {tag} y {name}")
    .addStringOption((o) => o.setName("texto").setDescription("Ej: [{tag}] {name}  ·  {name} | {tag}").setRequired(true).setMaxLength(30)))
  .addSubcommand((s) => s.setName("sincronizar").setDescription("Aplica los nombres a todos los miembros ahora"));

function tagFor(member) {
  const r = J().roles.filter((x) => member.roles.cache.has(x.roleId)).sort((a, b) => b.priority - a.priority)[0];
  return r ? r.tag : null;
}
function baseOf(current) {
  const tags = J().roles.map((r) => esc(r.tag));
  if (!tags.length) return current;
  const re = new RegExp("^" + esc(fmt()).replace(esc("{tag}"), () => "(?:" + tags.join("|") + ")").replace(esc("{name}"), () => "(.+)") + "$");
  const m = re.exec(current);
  return m ? m[1] : current;
}
function nickFor(tag, base) {
  const t = fmt();
  const over = t.replace("{tag}", () => tag).replace("{name}", () => "").length;
  const b = base.slice(0, Math.max(1, 32 - over));
  return t.replace("{tag}", () => tag).replace("{name}", () => b).slice(0, 32);
}
async function apply(member) {
  if (!J().roles.length || member.user.bot || !member.manageable) return false;
  const cur = member.nickname ?? member.user.globalName ?? member.user.username;
  const base = baseOf(cur);
  const tag = tagFor(member);
  const want = tag ? nickFor(tag, base) : base;
  if (want === cur) return false;
  await member.setNickname(want, "Trabajo según rol");
  return true;
}

const run = {
  trabajo: async (i) => {
    if (!(await U.needAdmin(i))) return;
    const sub = i.options.getSubcommand();
    if (sub === "agregar") {
      const rol = i.options.getRole("rol");
      J().roles = J().roles.filter((x) => x.roleId !== rol.id);
      J().roles.push({ roleId: rol.id, tag: i.options.getString("etiqueta").trim(), priority: i.options.getInteger("prioridad") || 0 });
      db.save();
      return i.reply({ content: `Hecho: quien tenga ${rol} se llamará \`${nickFor(i.options.getString("etiqueta").trim(), "Nombre")}\`.`, flags: U.EPH, allowedMentions: { parse: [] } });
    }
    if (sub === "quitar") {
      J().roles = J().roles.filter((x) => x.roleId !== i.options.getRole("rol").id);
      db.save();
      return i.reply({ content: "Rol quitado de la lista.", flags: U.EPH });
    }
    if (sub === "lista") {
      const rows = J().roles.sort((a, b) => b.priority - a.priority).map((r) => `<@&${r.roleId}> → **${r.tag}** (prioridad ${r.priority})`);
      return i.reply({ embeds: [U.emb("Trabajos por rol", (rows.length ? U.lines(rows) : "No hay trabajos configurados.") + `\n\nFormato: \`${fmt()}\``)], flags: U.EPH, allowedMentions: { parse: [] } });
    }
    if (sub === "formato") {
      const t = i.options.getString("texto");
      if (!t.includes("{tag}") || !t.includes("{name}")) throw new U.UserError("El formato debe incluir {tag} y {name}.");
      db.data.config.jobFormat = t;
      db.save();
      return i.reply({ content: `Formato guardado: \`${t}\`. Usa \`/trabajo sincronizar\` para aplicarlo a todos.`, flags: U.EPH });
    }
    await i.deferReply({ flags: U.EPH });
    const all = await i.guild.members.fetch();
    let changed = 0, failed = 0;
    for (const m of all.values()) {
      try { if (await apply(m)) { changed++; await sleep(1200); } } catch { failed++; }
    }
    return i.editReply(`Sincronización terminada: ${changed} nombres cambiados${failed ? `, ${failed} no se pudieron cambiar` : ""}.`);
  }
};

module.exports = {
  commands: [cmd], run, tagFor,
  events: {
    guildMemberUpdate: async (o, n) => {
      const same = !o.partial && o.roles.cache.size === n.roles.cache.size && [...n.roles.cache.keys()].every((k) => o.roles.cache.has(k));
      if (!same) await apply(n);
    }
  }
};
