const { SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../db");
const U = require("../util");

const PL = () => db.data.polls;

const cmd = new SlashCommandBuilder().setName("encuesta").setDescription("Encuestas (staff)")
  .addSubcommand((s) => s.setName("crear").setDescription("Crea una encuesta")
    .addStringOption((o) => o.setName("pregunta").setDescription("Pregunta").setRequired(true).setMaxLength(250))
    .addStringOption((o) => o.setName("opciones").setDescription("Opciones separadas por | (de 2 a 10)").setRequired(true).setMaxLength(900))
    .addStringOption((o) => o.setName("duracion").setDescription("Duración. Ej: 30m, 2h, 1d").setRequired(true).setMaxLength(20))
    .addChannelOption((o) => o.setName("canal").setDescription("Canal (por defecto, este)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((s) => s.setName("terminar").setDescription("Finaliza una encuesta ahora")
    .addStringOption((o) => o.setName("id").setDescription("ID (aparece en el pie de la encuesta)").setRequired(true)));

function counts(p) {
  const c = p.options.map(() => 0);
  Object.values(p.votes).forEach((v) => { c[v]++; });
  return c;
}
function embedOf(p) {
  const c = counts(p), total = Object.keys(p.votes).length;
  const desc = p.options.map((o, n) => `**${n + 1}. ${o}**\n${U.bar(c[n], total)} ${c[n]} (${total ? Math.round((c[n] / total) * 100) : 0}%)`).join("\n\n");
  return U.emb("📊 " + p.question, desc, p.ended ? U.COLOR.mute : U.COLOR.main)
    .addFields({ name: p.ended ? "Finalizó" : "Finaliza", value: U.ts(p.endsAt, "R"), inline: true }, { name: "Votos", value: String(total), inline: true })
    .setFooter({ text: `Encuesta ${p.id}` });
}
function rowsOf(p) {
  const rows = [];
  let row = new ActionRowBuilder();
  p.options.forEach((o, n) => {
    if (n && n % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
    row.addComponents(new ButtonBuilder().setCustomId(`poll.vote|${p.id}|${n}`).setLabel(`${n + 1}. ${o}`.slice(0, 80)).setStyle(ButtonStyle.Secondary).setDisabled(p.ended));
  });
  rows.push(row);
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`poll.who|${p.id}`).setLabel("Ver participantes").setStyle(ButtonStyle.Primary)));
  return rows;
}

async function endPoll(client, p) {
  p.ended = true;
  db.save();
  const ch = await U.chan(client, p.channelId);
  if (!ch) return;
  const msg = await ch.messages.fetch(p.messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [embedOf(p)], components: rowsOf(p) }).catch(() => {});
  const c = counts(p), max = Math.max(...c), total = Object.keys(p.votes).length;
  const text = total === 0
    ? `📊 La encuesta **${p.question}** ha terminado sin votos.`
    : `📊 La encuesta **${p.question}** ha terminado. Resultado: ${c.map((x, n) => x === max ? `**${p.options[n]}**` : null).filter(Boolean).join(" y ")} con ${max} ${max === 1 ? "voto" : "votos"}.`;
  await (msg ? msg.reply({ content: text }) : ch.send({ content: text })).catch(() => {});
}

async function voteBtn(i, [id, idx]) {
  const p = PL()[id];
  if (!p || p.ended) return i.reply({ content: "Esta encuesta ya ha terminado.", flags: U.EPH });
  const n = Number(idx);
  if (p.votes[i.user.id] === n) delete p.votes[i.user.id]; else p.votes[i.user.id] = n;
  db.save();
  return i.update({ embeds: [embedOf(p)], components: rowsOf(p) });
}
async function whoBtn(i, [id]) {
  const p = PL()[id];
  if (!p) return i.reply({ content: "Encuesta no encontrada.", flags: U.EPH });
  const total = Object.keys(p.votes).length;
  if (!total) return i.reply({ content: "Todavía no ha votado nadie.", flags: U.EPH });
  const e = U.emb(`Participantes (${total})`, null);
  p.options.forEach((o, n) => {
    const ids = Object.entries(p.votes).filter(([, v]) => v === n).map(([u]) => `<@${u}>`);
    e.addFields({ name: `${n + 1}. ${o} (${ids.length})`.slice(0, 256), value: (ids.length ? U.lines(ids, 1000) : "Nadie").slice(0, 1024) });
  });
  return i.reply({ embeds: [e], flags: U.EPH });
}

const run = {
  encuesta: async (i) => {
    if (!(await U.needStaff(i))) return;
    if (i.options.getSubcommand() === "terminar") {
      const p = PL()[i.options.getString("id").trim()];
      if (!p) throw new U.UserError("No encuentro esa encuesta.");
      if (p.ended) throw new U.UserError("Esa encuesta ya ha terminado.");
      await i.deferReply({ flags: U.EPH });
      await endPoll(i.client, p);
      return i.editReply("Encuesta finalizada.");
    }
    const options = i.options.getString("opciones").split("|").map((x) => x.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 10) throw new U.UserError("Pon entre 2 y 10 opciones separadas por |.");
    if (options.some((o) => o.length > 70)) throw new U.UserError("Cada opción puede tener 70 caracteres como máximo.");
    const ms = U.parseDuration(i.options.getString("duracion"));
    if (!ms || ms < 6e4 || ms > 30 * 864e5) throw new U.UserError("Duración no válida (entre 1 minuto y 30 días). Ej: 30m, 2h, 1d.");
    const ch = i.options.getChannel("canal") || i.channel;
    await i.deferReply({ flags: U.EPH });
    const p = { id: db.uid(), question: i.options.getString("pregunta"), options, votes: {}, endsAt: Date.now() + ms, ended: false, channelId: ch.id, messageId: null, by: i.user.id };
    const msg = await ch.send({ embeds: [embedOf(p)], components: rowsOf(p) });
    p.messageId = msg.id;
    PL()[p.id] = p;
    db.save();
    return i.editReply(`Encuesta publicada en ${ch}. ID: \`${p.id}\``);
  }
};

module.exports = {
  commands: [cmd], run,
  ui: { "poll.vote": voteBtn, "poll.who": whoBtn },
  tick: async (client) => {
    for (const p of Object.values(PL())) if (!p.ended && p.endsAt <= Date.now()) await endPoll(client, p);
  }
};
