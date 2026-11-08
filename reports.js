const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../db");
const U = require("../util");

const RP = () => db.data.reports;
const STATE = {
  nueva: ["Pendiente", U.COLOR.warn],
  rev: ["En revisión", U.COLOR.main],
  acc: ["Aceptada", U.COLOR.ok],
  rej: ["Rechazada", U.COLOR.bad]
};

const cmd = new SlashCommandBuilder().setName("denuncia").setDescription("Presenta una denuncia de rol");

const field = (id, label, style, required = true, max = 200) =>
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max));

function embedOf(r) {
  const [label, color] = STATE[r.status];
  return U.emb(`Denuncia de rol #${r.id}`, null, color)
    .addFields(
      { name: "Denunciante", value: `<@${r.by}>`, inline: true },
      { name: "Denunciado", value: r.accused.slice(0, 1024), inline: true },
      { name: "Estado", value: label + (r.handledBy ? ` · <@${r.handledBy}>` : ""), inline: true },
      { name: "Cuándo y dónde", value: r.where.slice(0, 1024) },
      { name: "Qué ocurrió", value: r.desc.slice(0, 1024) },
      { name: "Pruebas", value: (r.proofs || "Sin pruebas").slice(0, 1024) }
    ).setTimestamp(r.at);
}
const rowOf = (r) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`rp.st|${r.id}|rev`).setLabel("En revisión").setStyle(ButtonStyle.Primary).setDisabled(r.status === "rev"),
  new ButtonBuilder().setCustomId(`rp.st|${r.id}|acc`).setLabel("Aceptar").setStyle(ButtonStyle.Success).setDisabled(r.status === "acc"),
  new ButtonBuilder().setCustomId(`rp.st|${r.id}|rej`).setLabel("Rechazar").setStyle(ButtonStyle.Danger).setDisabled(r.status === "rej")
);

async function submit(i) {
  const ch = await U.chan(i.client, db.data.config.channels.denuncias);
  if (!ch) return i.reply({ content: "El servidor todavía no tiene canal de denuncias configurado. Avisa al staff.", flags: U.EPH });
  await i.deferReply({ flags: U.EPH });
  const r = {
    id: ++RP().counter, by: i.user.id, status: "nueva", at: Date.now(),
    accused: i.fields.getTextInputValue("a"), where: i.fields.getTextInputValue("w"),
    desc: i.fields.getTextInputValue("d"), proofs: i.fields.getTextInputValue("p").trim()
  };
  const msg = await ch.send({ embeds: [embedOf(r)], components: [rowOf(r)] });
  r.channelId = msg.channelId; r.messageId = msg.id;
  RP().items[r.id] = r;
  db.save();
  await msg.startThread({ name: `denuncia-${r.id}`, autoArchiveDuration: 10080 }).catch(() => {});
  return i.editReply(`Tu denuncia **#${r.id}** se ha registrado. Te avisaremos por privado cuando cambie de estado.`);
}

async function setState(i, [id, st]) {
  if (!U.isStaff(i.member)) return i.reply({ content: "Solo el staff puede gestionar denuncias.", flags: U.EPH });
  const r = RP().items[id];
  if (!r || !STATE[st]) return i.reply({ content: "Denuncia no encontrada.", flags: U.EPH });
  r.status = st; r.handledBy = i.user.id;
  db.save();
  await i.update({ embeds: [embedOf(r)], components: [rowOf(r)] });
  const user = await i.client.users.fetch(r.by).catch(() => null);
  if (user) await user.send({ embeds: [U.emb(`Tu denuncia #${r.id} ha cambiado de estado`, `Nuevo estado: **${STATE[st][0]}**`, STATE[st][1])] }).catch(() => {});
}

const run = {
  denuncia: async (i) => i.showModal(new ModalBuilder().setCustomId("rp.new").setTitle("Denuncia de rol").addComponents(
    field("a", "Denunciado (nombre, DNI o ID)", TextInputStyle.Short),
    field("w", "Cuándo y dónde ocurrió", TextInputStyle.Short),
    field("d", "Qué ocurrió", TextInputStyle.Paragraph, true, 1000),
    field("p", "Pruebas (enlaces)", TextInputStyle.Paragraph, false, 800)
  ))
};

module.exports = { commands: [cmd], run, ui: { "rp.new": submit, "rp.st": setState } };
