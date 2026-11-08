const {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits: P, ActionRowBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder
} = require("discord.js");
const db = require("../db");
const U = require("../util");

const AR = () => db.data.autoroles;
const pending = new Map();

const cmd = new SlashCommandBuilder().setName("autoroles").setDescription("Panel de autoroles (admin)")
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) => s.setName("panel").setDescription("Crea un panel de autoroles")
    .addChannelOption((o) => o.setName("canal").setDescription("Canal del panel").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName("titulo").setDescription("Título del panel").setMaxLength(200))
    .addStringOption((o) => o.setName("descripcion").setDescription("Descripción").setMaxLength(2000))
    .addBooleanOption((o) => o.setName("exclusivo").setDescription("Solo se puede elegir un rol del panel")));

const dangerous = (r) => r.permissions.any([P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.KickMembers, P.BanMembers, P.ModerateMembers, P.ManageMessages, P.MentionEveryone]);

const run = {
  autoroles: async (i) => {
    if (!(await U.needAdmin(i))) return;
    const key = db.uid();
    pending.set(key, {
      channelId: i.options.getChannel("canal").id,
      title: i.options.getString("titulo") || "Elige tus roles",
      desc: i.options.getString("descripcion") || "Selecciona en el menú los roles que quieras tener. Para quitarte uno, desmárcalo.",
      exclusive: !!i.options.getBoolean("exclusivo")
    });
    setTimeout(() => pending.delete(key), 30 * 60 * 1000);
    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId("ar.pick|" + key).setPlaceholder("Elige los roles de la plantilla").setMinValues(1).setMaxValues(25));
    return i.reply({ content: "Elige los roles que quieres ofrecer en este panel:", components: [row], flags: U.EPH });
  }
};

async function pick(i, [key]) {
  const p = pending.get(key);
  if (!p) return i.update({ content: "Esta plantilla ha caducado. Vuelve a usar `/autoroles panel`.", components: [] });
  const me = i.guild.members.me;
  const ok = [], bad = [];
  for (const r of i.roles.values()) {
    if (r.managed || r.id === i.guild.id || r.position >= me.roles.highest.position || dangerous(r)) bad.push(r); else ok.push(r);
  }
  if (!ok.length) return i.update({ content: "Ninguno de esos roles se puede ofrecer (por seguridad no se admiten roles con permisos de moderación o superiores al del bot). Prueba con otros.", components: [] });
  const ch = await U.chan(i.client, p.channelId);
  if (!ch) return i.update({ content: "No encuentro el canal.", components: [] });
  pending.delete(key);
  const id = db.uid();
  AR()[id] = { roleIds: ok.map((r) => r.id), exclusive: p.exclusive };
  db.save();
  const menu = new StringSelectMenuBuilder().setCustomId("ar.sel|" + id).setPlaceholder("Elige tus roles")
    .setMinValues(0).setMaxValues(p.exclusive ? 1 : ok.length)
    .addOptions(ok.map((r) => ({ label: r.name.slice(0, 100), value: r.id })));
  await ch.send({ embeds: [U.emb(p.title, p.desc)], components: [new ActionRowBuilder().addComponents(menu)] });
  const warn = bad.length ? `\nNo se han incluido: ${bad.map((r) => r.name).join(", ")} (rol gestionado, superior al bot o con permisos de moderación).` : "";
  return i.update({ content: `Panel publicado en ${ch} con ${ok.length} roles.${warn}`, components: [] });
}

async function select(i, [id]) {
  const panel = AR()[id];
  if (!panel) return i.reply({ content: "Este panel ya no está activo.", flags: U.EPH });
  const chosen = new Set(i.values);
  const add = [], rem = [];
  for (const rid of panel.roleIds) {
    const role = i.guild.roles.cache.get(rid);
    if (!role) continue;
    const has = i.member.roles.cache.has(rid);
    if (chosen.has(rid) && !has) add.push(role);
    if (!chosen.has(rid) && has) rem.push(role);
  }
  if (add.length) await i.member.roles.add(add, "Autoroles");
  if (rem.length) await i.member.roles.remove(rem, "Autoroles");
  const parts = [];
  if (add.length) parts.push("Añadidos: " + add.map((r) => r.name).join(", "));
  if (rem.length) parts.push("Quitados: " + rem.map((r) => r.name).join(", "));
  return i.reply({ content: parts.join("\n") || "No ha cambiado nada.", flags: U.EPH });
}

module.exports = { commands: [cmd], run, ui: { "ar.pick": pick, "ar.sel": select } };
