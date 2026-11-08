const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../db");
const U = require("../util");

const R = () => db.data.ratings;
const stars = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
const avg = (list) => list.reduce((a, x) => a + x.stars, 0) / (list.length || 1);

const valorar = new SlashCommandBuilder().setName("valorar").setDescription("Valora la atención de un miembro del staff")
  .addUserOption((o) => o.setName("staff").setDescription("Miembro del staff").setRequired(true));

const valoraciones = new SlashCommandBuilder().setName("valoraciones").setDescription("Consulta las valoraciones del staff (staff)")
  .addSubcommand((s) => s.setName("ver").setDescription("Valoraciones de un miembro del staff")
    .addUserOption((o) => o.setName("staff").setDescription("Miembro del staff").setRequired(true)))
  .addSubcommand((s) => s.setName("ranking").setDescription("Ranking de valoraciones"));

async function starBtn(i, [staffId, n]) {
  return i.showModal(new ModalBuilder().setCustomId(`rt.save|${staffId}|${n}`).setTitle(`Valoración: ${n} de 5`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("c").setLabel("Comentario (opcional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500))
  ));
}
async function save(i, [staffId, n]) {
  const m = await i.guild.members.fetch(staffId).catch(() => null);
  if (!m || !U.isStaff(m)) return i.reply({ content: "Ese usuario ya no pertenece al staff.", flags: U.EPH });
  const comment = i.fields.getTextInputValue("c").trim();
  const list = R();
  const prev = list.findIndex((x) => x.staffId === staffId && x.raterId === i.user.id);
  const r = { staffId, raterId: i.user.id, stars: Number(n), comment, at: Date.now() };
  if (prev > -1) list[prev] = r; else list.push(r);
  db.save();
  const e = U.emb("Nueva valoración de staff", null, r.stars >= 4 ? U.COLOR.ok : r.stars === 3 ? U.COLOR.warn : U.COLOR.bad)
    .addFields(
      { name: "Staff", value: `<@${staffId}>`, inline: true },
      { name: "Nota", value: `${stars(r.stars)} (${r.stars}/5)`, inline: true },
      { name: "Usuario", value: `<@${i.user.id}>`, inline: true },
      { name: "Comentario", value: comment || "Sin comentario" }
    ).setTimestamp();
  await U.sendLog(i.client, "valoraciones", { embeds: [e] });
  return i.reply({ content: prev > -1 ? "Tu valoración anterior se ha actualizado. ¡Gracias!" : "¡Gracias por tu valoración!", flags: U.EPH });
}

const run = {
  valorar: async (i) => {
    const target = i.options.getUser("staff");
    if (target.id === i.user.id) throw new U.UserError("No puedes valorarte a ti mismo.");
    const m = await i.guild.members.fetch(target.id).catch(() => null);
    if (!m || !U.isStaff(m)) throw new U.UserError("Ese usuario no pertenece al staff.");
    const row = new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder().setCustomId(`rt.star|${target.id}|${n}`).setLabel(`${n} ★`).setStyle(n >= 4 ? ButtonStyle.Success : n === 3 ? ButtonStyle.Secondary : ButtonStyle.Danger)));
    return i.reply({ content: `¿Qué nota le das a ${m}? Elige de 1 a 5 estrellas.`, components: [row], flags: U.EPH, allowedMentions: { parse: [] } });
  },
  valoraciones: async (i) => {
    if (!(await U.needStaff(i))) return;
    if (i.options.getSubcommand() === "ver") {
      const u = i.options.getUser("staff");
      const list = R().filter((x) => x.staffId === u.id);
      if (!list.length) return i.reply({ content: "Todavía no tiene valoraciones.", flags: U.EPH });
      const dist = [5, 4, 3, 2, 1].map((n) => `${n}★ ${U.bar(list.filter((x) => x.stars === n).length, list.length, 10)} ${list.filter((x) => x.stars === n).length}`).join("\n");
      const last = list.filter((x) => x.comment).sort((a, b) => b.at - a.at).slice(0, 5).map((x) => `${stars(x.stars)} ${x.comment.slice(0, 150)}`);
      const e = U.emb(`Valoraciones de ${u.username}`, `${stars(avg(list))} **${avg(list).toFixed(2)}** de 5 · ${list.length} valoraciones`)
        .addFields({ name: "Distribución", value: "```\n" + dist + "\n```" }, { name: "Últimos comentarios", value: last.length ? last.join("\n").slice(0, 1024) : "Sin comentarios" });
      return i.reply({ embeds: [e], flags: U.EPH });
    }
    const by = {};
    R().forEach((x) => { (by[x.staffId] = by[x.staffId] || []).push(x); });
    const rows = Object.entries(by).sort((a, b) => avg(b[1]) - avg(a[1]) || b[1].length - a[1].length).slice(0, 15)
      .map(([id, l], n) => `**${n + 1}.** <@${id}> · ${avg(l).toFixed(2)} ★ (${l.length})`);
    return i.reply({ embeds: [U.emb("Ranking de staff", rows.length ? rows.join("\n") : "Todavía no hay valoraciones.")], flags: U.EPH });
  }
};

module.exports = { commands: [valorar, valoraciones], run, ui: { "rt.star": starBtn, "rt.save": save } };
