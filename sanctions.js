const { SlashCommandBuilder } = require("discord.js");
const db = require("../db");
const U = require("../util");

const L = () => db.data.sanctions;
const TYPES = { advertencia: "Advertencia", mute: "Mute", expulsion: "Expulsión", ban: "Ban", rol: "Sanción de rol" };
const COL = { advertencia: U.COLOR.warn, mute: U.COLOR.warn, expulsion: U.COLOR.bad, ban: U.COLOR.bad, rol: U.COLOR.main };

const cmd = new SlashCommandBuilder().setName("sancion").setDescription("Sanciones (staff)")
  .addSubcommand((s) => s.setName("aplicar").setDescription("Aplica una sanción")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((o) => o.setName("tipo").setDescription("Tipo de sanción").setRequired(true)
      .addChoices(...Object.entries(TYPES).map(([value, name]) => ({ name, value }))))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(900))
    .addStringOption((o) => o.setName("duracion").setDescription("Duración (mute obligatorio; ban temporal). Ej: 1h, 7d").setMaxLength(20))
    .addAttachmentOption((o) => o.setName("prueba").setDescription("Captura o imagen de prueba"))
    .addStringOption((o) => o.setName("pruebas").setDescription("Enlaces de pruebas").setMaxLength(500)))
  .addSubcommand((s) => s.setName("historial").setDescription("Historial de sanciones de un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true)))
  .addSubcommand((s) => s.setName("ver").setDescription("Ver una sanción")
    .addIntegerOption((o) => o.setName("id").setDescription("Número de sanción").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("quitar").setDescription("Retira una sanción")
    .addIntegerOption((o) => o.setName("id").setDescription("Número de sanción").setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo de la retirada").setRequired(true).setMaxLength(500)));

function status(s) {
  if (s.removedAt) return "Revocada";
  if (s.expiresAt && s.expiresAt <= Date.now()) return "Caducada";
  return ["mute", "ban"].includes(s.type) ? "Activa" : "Registrada";
}
function logEmbed(s) {
  const e = U.emb(`Sanción #${s.id} · ${TYPES[s.type]}`, null, s.removedAt ? U.COLOR.mute : COL[s.type])
    .addFields(
      { name: "Usuario", value: `<@${s.userId}> (${s.userId})`, inline: true },
      { name: "Staff", value: `<@${s.modId}>`, inline: true },
      { name: "Estado", value: status(s), inline: true },
      { name: "Motivo", value: s.reason.slice(0, 1024) }
    ).setTimestamp(s.createdAt);
  if (s.expiresAt) e.addFields({ name: "Expira", value: U.ts(s.expiresAt, "R"), inline: true });
  if (s.evidence) e.addFields({ name: "Pruebas", value: s.evidence.slice(0, 1024) });
  if (s.removedAt) e.addFields({ name: "Revocada", value: `Por <@${s.removedBy}> ${U.ts(s.removedAt, "R")}\n${s.removedReason}`.slice(0, 1024) });
  return e;
}
const find = (id) => L().list.find((x) => x.id === id);

const run = {
  sancion: async (i) => {
    if (!(await U.needStaff(i))) return;
    const sub = i.options.getSubcommand();

    if (sub === "aplicar") {
      const user = i.options.getUser("usuario"), type = i.options.getString("tipo"), reason = i.options.getString("motivo");
      const durS = i.options.getString("duracion"), att = i.options.getAttachment("prueba"), pru = i.options.getString("pruebas");
      if (user.bot || user.id === i.user.id) throw new U.UserError("No puedes sancionar a ese usuario.");
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      if (["mute", "expulsion"].includes(type) && !member) throw new U.UserError("Ese usuario no está en el servidor.");
      if (member && i.guild.ownerId !== i.user.id && i.member.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
        throw new U.UserError("No puedes sancionar a alguien con un rol igual o superior al tuyo.");
      }
      let ms = null;
      if (durS) { ms = U.parseDuration(durS); if (!ms) throw new U.UserError("Duración no válida. Ejemplos: 30m, 2h, 7d."); }
      if (type === "mute") {
        if (!ms) throw new U.UserError("El mute necesita duración.");
        if (ms > 28 * 864e5) throw new U.UserError("El mute máximo es de 28 días.");
      }
      await i.deferReply({ flags: U.EPH });
      const s = {
        id: L().counter + 1, userId: user.id, modId: i.user.id, type, reason, createdAt: Date.now(),
        expiresAt: ms ? Date.now() + ms : null, evidence: [pru, att && att.url].filter(Boolean).join("\n") || null
      };
      await user.send({ embeds: [U.emb(`Has recibido: ${TYPES[type]}`, null, COL[type]).addFields({ name: "Servidor", value: i.guild.name, inline: true }, { name: "Motivo", value: reason })] }).catch(() => {});
      try {
        const why = `#${s.id} ${reason}`.slice(0, 500);
        if (type === "mute") await member.timeout(ms, why);
        if (type === "expulsion") await member.kick(why);
        if (type === "ban") await i.guild.members.ban(user.id, { reason: why });
      } catch (e) {
        throw new U.UserError("No he podido aplicar la sanción: " + e.message);
      }
      L().counter = s.id;
      L().list.push(s);
      const m = await U.sendLog(i.client, "sanciones", { embeds: [logEmbed(s)] });
      if (m) s.log = { channelId: m.channelId, messageId: m.id };
      db.save();
      return i.editReply(`Sanción **#${s.id}** (${TYPES[type]}) aplicada a ${user}.${m ? "" : "\nAviso: no hay canal de sanciones configurado (`/config canal`)."}`);
    }

    if (sub === "historial") {
      const user = i.options.getUser("usuario");
      const list = L().list.filter((x) => x.userId === user.id).reverse();
      if (!list.length) return i.reply({ content: "Este usuario no tiene sanciones.", flags: U.EPH });
      const rows = list.slice(0, 20).map((x) => `**#${x.id}** · ${TYPES[x.type]} · ${status(x)} · ${U.ts(x.createdAt, "d")}\n${x.reason.slice(0, 120)}`);
      return i.reply({ embeds: [U.emb(`Sanciones de ${user.username} (${list.length})`, U.lines(rows))], flags: U.EPH });
    }

    const s = find(i.options.getInteger("id"));
    if (!s) throw new U.UserError("No existe esa sanción.");
    if (sub === "ver") return i.reply({ embeds: [logEmbed(s)], flags: U.EPH });

    // quitar
    if (s.removedAt) throw new U.UserError("Esa sanción ya está retirada.");
    await i.deferReply({ flags: U.EPH });
    try {
      if (s.type === "ban") await i.guild.bans.remove(s.userId, `Sanción #${s.id} retirada`).catch(() => {});
      if (s.type === "mute") { const m = await i.guild.members.fetch(s.userId).catch(() => null); if (m) await m.timeout(null, `Sanción #${s.id} retirada`); }
    } catch (e) { throw new U.UserError("No he podido retirar la sanción: " + e.message); }
    s.removedAt = Date.now(); s.removedBy = i.user.id; s.removedReason = i.options.getString("motivo");
    db.save();
    if (s.log) {
      const ch = await U.chan(i.client, s.log.channelId);
      const msg = ch && (await ch.messages.fetch(s.log.messageId).catch(() => null));
      if (msg) await msg.edit({ embeds: [logEmbed(s)] }).catch(() => {});
      if (ch) await ch.send({ embeds: [U.emb(`Sanción #${s.id} retirada`, `Por <@${i.user.id}>: ${s.removedReason}`, U.COLOR.ok)] }).catch(() => {});
    }
    const user = await i.client.users.fetch(s.userId).catch(() => null);
    if (user) await user.send({ embeds: [U.emb("Sanción retirada", `Tu sanción #${s.id} en **${i.guild.name}** ha sido retirada.`, U.COLOR.ok)] }).catch(() => {});
    return i.editReply(`Sanción **#${s.id}** retirada.`);
  }
};

module.exports = {
  commands: [cmd], run,
  // Los baneos temporales se levantan solos al caducar
  tick: async (client) => {
    for (const s of L().list) {
      if (s.type !== "ban" || s.removedAt || !s.expiresAt || s.expiresAt > Date.now() || s.autoUnbanned) continue;
      s.autoUnbanned = true;
      for (const g of client.guilds.cache.values()) await g.bans.remove(s.userId, `Sanción #${s.id} caducada`).catch(() => {});
      db.save();
    }
  }
};
