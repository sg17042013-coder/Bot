const { SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../db");
const U = require("../util");

const AC = () => db.data.activity;

const cmd = new SlashCommandBuilder().setName("activity").setDescription("Activity check infinito (staff)")
  .addSubcommand((s) => s.setName("crear").setDescription("Publica un activity check que nunca caduca")
    .addChannelOption((o) => o.setName("canal").setDescription("Canal").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName("titulo").setDescription("Título").setMaxLength(200))
    .addStringOption((o) => o.setName("descripcion").setDescription("Descripción").setMaxLength(1500))
    .addRoleOption((o) => o.setName("rol").setDescription("Solo este rol puede responder")))
  .addSubcommand((s) => s.setName("activos").setDescription("Quién ha respondido")
    .addStringOption((o) => o.setName("id").setDescription("ID (pie del activity)").setRequired(true)))
  .addSubcommand((s) => s.setName("inactivos").setDescription("Quién NO ha respondido")
    .addStringOption((o) => o.setName("id").setDescription("ID (pie del activity)").setRequired(true))
    .addRoleOption((o) => o.setName("rol").setDescription("Rol a revisar (por defecto, el del activity)")))
  .addSubcommand((s) => s.setName("reiniciar").setDescription("Borra las respuestas y empieza de nuevo")
    .addStringOption((o) => o.setName("id").setDescription("ID (pie del activity)").setRequired(true)));

const embedOf = (a) => U.emb(a.title, [a.description, `Pulsa **Estoy activo** para confirmar tu actividad. Este activity check no caduca.`].filter(Boolean).join("\n\n"))
  .addFields({ name: "Activos", value: String(Object.keys(a.users).length), inline: true }, ...(a.roleId ? [{ name: "Para", value: `<@&${a.roleId}>`, inline: true }] : []))
  .setFooter({ text: `Activity ${a.id}` });
const rowOf = (a) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("act.ok|" + a.id).setLabel("Estoy activo").setStyle(ButtonStyle.Success).setEmoji("✅"),
  new ButtonBuilder().setCustomId("act.who|" + a.id).setLabel("Ver activos").setStyle(ButtonStyle.Secondary)
);
const whoText = (a) => {
  const rows = Object.entries(a.users).sort((x, y) => y[1] - x[1]).map(([id, t]) => `<@${id}> · ${U.ts(t, "R")}`);
  return rows.length ? U.lines(rows) : "Todavía no ha respondido nadie.";
};

async function ok(i, [id]) {
  const a = AC()[id];
  if (!a) return i.reply({ content: "Este activity check ya no existe.", flags: U.EPH });
  if (a.roleId && !i.member.roles.cache.has(a.roleId)) return i.reply({ content: "Este activity check no es para tu rol.", flags: U.EPH });
  const again = !!a.users[i.user.id];
  a.users[i.user.id] = Date.now();
  db.save();
  await i.update({ embeds: [embedOf(a)] });
  return i.followUp({ content: again ? "Tu actividad ya estaba registrada. Te he actualizado la hora." : "¡Actividad registrada!", flags: U.EPH });
}
async function who(i, [id]) {
  const a = AC()[id];
  if (!a) return i.reply({ content: "Este activity check ya no existe.", flags: U.EPH });
  if (!U.isStaff(i.member)) return i.reply({ content: "Solo el staff puede ver esta lista.", flags: U.EPH });
  return i.reply({ embeds: [U.emb(`Activos (${Object.keys(a.users).length})`, whoText(a))], flags: U.EPH });
}

const run = {
  activity: async (i) => {
    if (!(await U.needStaff(i))) return;
    const sub = i.options.getSubcommand();
    if (sub === "crear") {
      const ch = i.options.getChannel("canal"), rol = i.options.getRole("rol");
      const a = { id: db.uid(), title: i.options.getString("titulo") || "Activity check", description: i.options.getString("descripcion"), roleId: rol ? rol.id : null, users: {}, channelId: ch.id, messageId: null };
      const msg = await ch.send({ embeds: [embedOf(a)], components: [rowOf(a)] });
      a.messageId = msg.id;
      AC()[a.id] = a;
      db.save();
      return i.reply({ content: `Activity check publicado en ${ch}. ID: \`${a.id}\``, flags: U.EPH });
    }
    const a = AC()[i.options.getString("id").trim()];
    if (!a) throw new U.UserError("No encuentro ese activity check.");
    if (sub === "activos") return i.reply({ embeds: [U.emb(`Activos (${Object.keys(a.users).length})`, whoText(a))], flags: U.EPH });
    if (sub === "reiniciar") {
      a.users = {};
      db.save();
      const ch = await U.chan(i.client, a.channelId);
      const msg = ch && (await ch.messages.fetch(a.messageId).catch(() => null));
      if (msg) await msg.edit({ embeds: [embedOf(a)] }).catch(() => {});
      return i.reply({ content: "Respuestas reiniciadas.", flags: U.EPH });
    }
    const roleId = (i.options.getRole("rol") || {}).id || a.roleId;
    if (!roleId) throw new U.UserError("Indica el rol que quieres revisar.");
    await i.deferReply({ flags: U.EPH });
    await i.guild.members.fetch();
    const role = i.guild.roles.cache.get(roleId);
    const missing = role ? [...role.members.values()].filter((m) => !m.user.bot && !a.users[m.id]) : [];
    return i.editReply({ embeds: [U.emb(`Sin responder (${missing.length})`, missing.length ? U.lines(missing.map((m) => `<@${m.id}>`)) : "Todos han respondido.")] });
  }
};

module.exports = { commands: [cmd], run, ui: { "act.ok": ok, "act.who": who } };
