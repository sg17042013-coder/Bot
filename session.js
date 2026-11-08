const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../db");
const U = require("../util");

const S = () => db.data.session;

const cmd = new SlashCommandBuilder().setName("sesion").setDescription("Votación y estado de apertura del servidor (staff)")
  .addSubcommand((s) => s.setName("votacion").setDescription("Abre una votación para abrir el servidor")
    .addIntegerOption((o) => o.setName("votos").setDescription("Votos necesarios para abrir").setRequired(true).setMinValue(1).setMaxValue(1000)))
  .addSubcommand((s) => s.setName("abrir").setDescription("Abre el servidor sin votación"))
  .addSubcommand((s) => s.setName("cerrar").setDescription("Cierra el servidor"))
  .addSubcommand((s) => s.setName("cancelar").setDescription("Cancela la votación en curso"))
  .addSubcommand((s) => s.setName("estado").setDescription("Muestra el estado actual"))
  .addSubcommand((s) => s.setName("imagen").setDescription("Cambia la foto de un estado")
    .addStringOption((o) => o.setName("estado").setDescription("Estado").setRequired(true).addChoices(
      { name: "Votación abierta", value: "votacion" }, { name: "Servidor abierto", value: "abierto" }, { name: "Servidor cerrado", value: "cerrado" }))
    .addAttachmentOption((o) => o.setName("imagen").setDescription("Imagen"))
    .addStringOption((o) => o.setName("imagen_url").setDescription("URL de la imagen")));

function buildEmbed(extra) {
  const s = S(), st = s.state;
  let e;
  if (st === "votacion") {
    const n = s.vote.voters.length, t = s.vote.needed;
    e = U.emb("🗳️ Votación de apertura", "Pulsa **Votar** para pedir que se abra el servidor.\nSi vuelves a pulsar, tu voto se elimina.", U.COLOR.warn)
      .addFields({ name: "Votos", value: `${U.bar(n, t, 14)}  **${n} / ${t}**` });
  } else if (st === "abierto") {
    e = U.emb("🟢 Servidor abierto", extra || "Ya puedes conectarte. ¡Buen rol!", U.COLOR.ok)
      .addFields({ name: "Abierto", value: U.ts(s.openedAt, "R"), inline: true }, { name: "Por", value: s.openedBy || "Votación", inline: true });
  } else {
    e = U.emb("🔴 Servidor cerrado", extra || "El servidor está cerrado. Atento a la próxima votación.", U.COLOR.bad);
  }
  const files = U.img(db.data.config.images[st], e);
  return { e, files };
}
const voteRow = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("ses.vote").setLabel("Votar").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("ses.voters").setLabel("Ver votos").setStyle(ButtonStyle.Secondary)
);

// Pinta el mensaje de estado: edita el existente o publica uno nuevo.
async function render(client, { fresh = false, extra, ping, channelId } = {}) {
  const s = S();
  const { e, files } = buildEmbed(extra);
  const payload = { embeds: [e], files, components: s.state === "votacion" ? [voteRow()] : [] };
  let msg = null;
  if (!fresh && s.statusMsg) {
    const ch = await U.chan(client, s.statusMsg.channelId);
    msg = ch && (await ch.messages.fetch(s.statusMsg.messageId).catch(() => null));
    if (msg) await msg.edit({ ...payload, attachments: [] });
  }
  if (!msg) {
    const ch = await U.chan(client, channelId || db.data.config.channels.sesion);
    if (!ch) throw new U.UserError("No encuentro el canal de sesión. Configúralo con `/config canal`.");
    msg = await ch.send({ ...payload, content: ping || undefined });
  }
  s.statusMsg = { channelId: msg.channelId, messageId: msg.id };
  db.save();
  return msg;
}
const pingRole = () => (db.data.config.roles.sesion_ping ? `<@&${db.data.config.roles.sesion_ping}>` : "");

async function openNow(client, by, channelId) {
  const s = S();
  const wasVote = s.state === "votacion" && !!s.statusMsg;
  if (s.vote) s.lastVoters = s.vote.voters;
  s.state = "abierto"; s.vote = null; s.openedAt = Date.now(); s.openedBy = by;
  db.save();
  const msg = await render(client, { fresh: !wasVote, channelId });
  const p = pingRole();
  await msg.channel.send({ content: `${p} 🟢 **¡El servidor está abierto!** Ya podéis conectaros.`.trim() }).catch(() => {});
}

async function vote(i) {
  const s = S();
  if (s.state !== "votacion" || !s.vote || i.message.id !== s.statusMsg?.messageId) {
    return i.reply({ content: "Esta votación ya no está activa.", flags: U.EPH });
  }
  const v = s.vote.voters, ix = v.indexOf(i.user.id);
  let msg;
  if (ix > -1) { v.splice(ix, 1); msg = "Tu voto ha sido eliminado."; } else { v.push(i.user.id); msg = "¡Voto registrado!"; }
  db.save();
  if (v.length >= s.vote.needed) {
    await i.deferUpdate();
    await openNow(i.client, "Votación completada");
    return i.followUp({ content: "¡Voto registrado! Se ha alcanzado el objetivo y el servidor se abre.", flags: U.EPH });
  }
  await i.update({ embeds: [buildEmbed().e] });
  return i.followUp({ content: msg, flags: U.EPH });
}
async function voters(i) {
  const s = S();
  const list = s.state === "votacion" && s.vote ? s.vote.voters : s.lastVoters;
  const title = s.state === "votacion" ? "Votos de esta votación" : "Votos de la última votación";
  return i.reply({ embeds: [U.emb(`${title} (${list.length})`, list.length ? U.lines(list.map((id) => `<@${id}>`)) : "Todavía no ha votado nadie.")], flags: U.EPH });
}

const run = {
  sesion: async (i) => {
    if (!(await U.needStaff(i))) return;
    const sub = i.options.getSubcommand();
    const s = S();
    const channelId = db.data.config.channels.sesion || i.channelId;

    if (sub === "imagen") {
      const ref = await U.refFrom(i);
      if (!ref) throw new U.UserError("Adjunta una imagen o pon una URL.");
      db.data.config.images[i.options.getString("estado")] = ref;
      db.save();
      return i.reply({ content: "Imagen guardada. Se verá la próxima vez que cambie ese estado.", flags: U.EPH });
    }
    if (sub === "estado") {
      const txt = { votacion: `Votación en curso (${s.vote ? s.vote.voters.length + "/" + s.vote.needed : ""})`, abierto: "Servidor abierto", cerrado: "Servidor cerrado" }[s.state];
      return i.reply({ content: txt, flags: U.EPH });
    }
    await i.deferReply({ flags: U.EPH });
    if (sub === "votacion") {
      if (s.state === "votacion") throw new U.UserError("Ya hay una votación en curso.");
      if (s.state === "abierto") throw new U.UserError("El servidor ya está abierto. Ciérralo antes de abrir otra votación.");
      const prev = { ...s };
      s.state = "votacion"; s.vote = { needed: i.options.getInteger("votos"), voters: [] };
      try { await render(i.client, { fresh: true, ping: pingRole(), channelId }); }
      catch (e) { Object.assign(s, prev); throw e; }
      return i.editReply("Votación publicada.");
    }
    if (sub === "abrir") {
      if (s.state === "abierto") throw new U.UserError("El servidor ya está abierto.");
      await openNow(i.client, `<@${i.user.id}>`, channelId);
      return i.editReply("Servidor abierto.");
    }
    if (sub === "cerrar") {
      if (s.state === "cerrado") throw new U.UserError("El servidor ya está cerrado.");
      s.state = "cerrado"; s.vote = null;
      await render(i.client, { fresh: !s.statusMsg, channelId });
      return i.editReply("Servidor cerrado.");
    }
    if (s.state !== "votacion") throw new U.UserError("No hay ninguna votación en curso.");
    s.state = "cerrado"; s.vote = null;
    await render(i.client, { extra: "La votación ha sido cancelada." });
    return i.editReply("Votación cancelada.");
  }
};

module.exports = { commands: [cmd], run, ui: { "ses.vote": vote, "ses.voters": voters } };
