const { SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../db");
const U = require("../util");

const GW = () => db.data.giveaways;
const CH_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const cmd = new SlashCommandBuilder().setName("sorteo").setDescription("Sorteos (staff)")
  .addSubcommand((s) => s.setName("crear").setDescription("Crea un sorteo")
    .addStringOption((o) => o.setName("premio").setDescription("Premio").setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName("duracion").setDescription("Duración. Ej: 30m, 2h, 1d").setRequired(true).setMaxLength(20))
    .addIntegerOption((o) => o.setName("ganadores").setDescription("Número de ganadores (por defecto 1)").setMinValue(1).setMaxValue(20))
    .addStringOption((o) => o.setName("descripcion").setDescription("Descripción del sorteo").setMaxLength(1500))
    .addAttachmentOption((o) => o.setName("imagen").setDescription("Foto del sorteo"))
    .addStringOption((o) => o.setName("imagen_url").setDescription("URL de la foto"))
    .addRoleOption((o) => o.setName("rol").setDescription("Rol necesario para participar"))
    .addChannelOption((o) => o.setName("canal").setDescription("Canal (por defecto, este)").addChannelTypes(...CH_TYPES)))
  .addSubcommand((s) => s.setName("terminar").setDescription("Termina un sorteo ahora")
    .addStringOption((o) => o.setName("id").setDescription("ID (pie del sorteo)").setRequired(true)))
  .addSubcommand((s) => s.setName("reroll").setDescription("Elige nuevos ganadores")
    .addStringOption((o) => o.setName("id").setDescription("ID (pie del sorteo)").setRequired(true))
    .addIntegerOption((o) => o.setName("cantidad").setDescription("Cuántos nuevos ganadores").setMinValue(1).setMaxValue(20)));

function embedOf(g) {
  const e = U.emb(`${g.ended ? "🏆" : "🎉"} ${g.prize}`,
    [g.description, g.ended ? null : "Pulsa **Participar** para entrar. Si vuelves a pulsar, sales del sorteo."].filter(Boolean).join("\n\n") || null,
    g.ended ? U.COLOR.mute : U.COLOR.main)
    .addFields(
      { name: g.ended ? "Finalizó" : "Termina", value: U.ts(g.endsAt, "R"), inline: true },
      { name: "Ganadores", value: g.ended ? (g.winnerIds.length ? g.winnerIds.map((x) => `<@${x}>`).join(", ") : "Sin participantes") : String(g.winners), inline: true },
      { name: "Participantes", value: String(g.users.length), inline: true }
    )
    .setFooter({ text: `Sorteo ${g.id}` });
  if (g.roleId) e.addFields({ name: "Requisito", value: `<@&${g.roleId}>`, inline: true });
  return e;
}
const rowsOf = (g) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("gw.join|" + g.id).setLabel("Participar").setStyle(ButtonStyle.Success).setEmoji("🎉").setDisabled(g.ended),
  new ButtonBuilder().setCustomId("gw.who|" + g.id).setLabel("Ver participantes").setStyle(ButtonStyle.Secondary)
)];

async function announce(client, g, winnerIds, again) {
  const ch = await U.chan(client, g.channelId);
  if (!ch) return;
  const msg = await ch.messages.fetch(g.messageId).catch(() => null);
  const e = embedOf(g);
  U.img(g.image, e);
  if (msg) await msg.edit({ embeds: [e], components: rowsOf(g) }).catch(() => {});
  const text = winnerIds.length
    ? `🎉 ${again ? "Nuevos ganadores" : "Enhorabuena"} ${winnerIds.map((x) => `<@${x}>`).join(", ")}. ¡${winnerIds.length > 1 ? "Habéis ganado" : "Has ganado"} **${g.prize}**!`
    : `El sorteo de **${g.prize}** ha terminado sin participantes.`;
  await (msg ? msg.reply({ content: text }) : ch.send({ content: text })).catch(() => {});
}
async function endGiveaway(client, g) {
  g.ended = true;
  g.winnerIds = U.shuffle(g.users).slice(0, g.winners);
  db.save();
  await announce(client, g, g.winnerIds, false);
}

async function join(i, [id]) {
  const g = GW()[id];
  if (!g || g.ended) return i.reply({ content: "Este sorteo ya ha terminado.", flags: U.EPH });
  if (g.roleId && !i.member.roles.cache.has(g.roleId)) return i.reply({ content: `Necesitas el rol <@&${g.roleId}> para participar.`, flags: U.EPH, allowedMentions: { parse: [] } });
  const ix = g.users.indexOf(i.user.id);
  let msg;
  if (ix > -1) { g.users.splice(ix, 1); msg = "Has salido del sorteo."; } else { g.users.push(i.user.id); msg = "¡Estás dentro del sorteo! Mucha suerte."; }
  db.save();
  const e = embedOf(g);
  U.img(g.image, e);
  await i.update({ embeds: [e] });
  return i.followUp({ content: msg, flags: U.EPH });
}
async function who(i, [id]) {
  const g = GW()[id];
  if (!g) return i.reply({ content: "Sorteo no encontrado.", flags: U.EPH });
  return i.reply({ embeds: [U.emb(`Participantes (${g.users.length})`, g.users.length ? U.lines(g.users.map((x) => `<@${x}>`)) : "Todavía no participa nadie.")], flags: U.EPH });
}

const run = {
  sorteo: async (i) => {
    if (!(await U.needStaff(i))) return;
    const sub = i.options.getSubcommand();
    if (sub === "crear") {
      const ms = U.parseDuration(i.options.getString("duracion"));
      if (!ms || ms < 6e4 || ms > 60 * 864e5) throw new U.UserError("Duración no válida (entre 1 minuto y 60 días). Ej: 30m, 2h, 1d.");
      const ref = await U.refFrom(i);
      const ch = i.options.getChannel("canal") || i.channel;
      const rol = i.options.getRole("rol");
      await i.deferReply({ flags: U.EPH });
      const g = {
        id: db.uid(), prize: i.options.getString("premio"), description: i.options.getString("descripcion"),
        winners: i.options.getInteger("ganadores") || 1, endsAt: Date.now() + ms, users: [], winnerIds: [],
        ended: false, channelId: ch.id, messageId: null, image: ref, roleId: rol ? rol.id : null, by: i.user.id
      };
      const e = embedOf(g);
      const files = U.img(ref, e);
      const msg = await ch.send({ embeds: [e], components: rowsOf(g), files });
      g.messageId = msg.id;
      GW()[g.id] = g;
      db.save();
      return i.editReply(`Sorteo publicado en ${ch}. ID: \`${g.id}\``);
    }
    const g = GW()[i.options.getString("id").trim()];
    if (!g) throw new U.UserError("No encuentro ese sorteo.");
    await i.deferReply({ flags: U.EPH });
    if (sub === "terminar") {
      if (g.ended) throw new U.UserError("Ese sorteo ya ha terminado.");
      await endGiveaway(i.client, g);
      return i.editReply("Sorteo finalizado.");
    }
    if (!g.ended) throw new U.UserError("El sorteo sigue en marcha. Termínalo antes.");
    const pool = g.users.filter((x) => !g.winnerIds.includes(x));
    const picked = U.shuffle(pool).slice(0, i.options.getInteger("cantidad") || 1);
    if (!picked.length) throw new U.UserError("No quedan participantes para elegir.");
    g.winnerIds = [...g.winnerIds, ...picked];
    db.save();
    await announce(i.client, g, picked, true);
    return i.editReply("Nuevos ganadores elegidos.");
  }
};

module.exports = {
  commands: [cmd], run,
  ui: { "gw.join": join, "gw.who": who },
  tick: async (client) => {
    for (const g of Object.values(GW())) if (!g.ended && g.endsAt <= Date.now()) await endGiveaway(client, g);
  }
};
