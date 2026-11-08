const { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../db");
const U = require("../util");
const jobs = require("./jobs");

const D = () => db.data.dni;
const LET = "TRWAGMYFPDXBNJZSQVHLCKE";

const cmd = new SlashCommandBuilder().setName("dni").setDescription("Documento de identidad")
  .addSubcommand((s) => s.setName("crear").setDescription("Crea tu DNI"))
  .addSubcommand((s) => s.setName("ver").setDescription("Muestra un DNI")
    .addUserOption((o) => o.setName("usuario").setDescription("De quién (por defecto, el tuyo)")))
  .addSubcommand((s) => s.setName("editar").setDescription("Edita tus datos"))
  .addSubcommand((s) => s.setName("eliminar").setDescription("Elimina un DNI (staff)")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true)));

function newNumber() {
  let s;
  do { const n = Math.floor(1e7 + Math.random() * 9e7); s = String(n) + LET[n % 23]; } while (D().numbers[s]);
  return s;
}
function newSupport() {
  const L = "ABCDEFGHJKLMNPRSTVWXYZ";
  return "A" + L[Math.floor(Math.random() * L.length)] + L[Math.floor(Math.random() * L.length)] + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
}
function parseDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getFullYear() !== +m[3] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[1]) return null;
  if (d > new Date() || +m[3] < 1900) return null;
  return d;
}
function ageOf(d) {
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
const field = (id, label, value, max = 60, ph) => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(max);
  if (value) t.setValue(value);
  if (ph) t.setPlaceholder(ph);
  return new ActionRowBuilder().addComponents(t);
};
const modal = (id, title, d = {}) => new ModalBuilder().setCustomId(id).setTitle(title).addComponents(
  field("n", "Nombre", d.nombre, 40),
  field("a", "Apellidos", d.apellidos, 60),
  field("f", "Fecha de nacimiento", d.nac, 10, "DD/MM/AAAA"),
  field("s", "Sexo", d.sexo, 1, "M o F"),
  field("d", "Domicilio", d.dir, 80, "Calle y número, Oviedo")
);

function card(member, d) {
  const born = parseDate(d.nac);
  return U.emb("🪪 DOCUMENTO NACIONAL DE IDENTIDAD", "**OVIEDO RP**", U.COLOR.main)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Nº DNI", value: "`" + d.numero + "`", inline: true },
      { name: "Nº soporte", value: "`" + d.soporte + "`", inline: true },
      { name: "Sexo", value: d.sexo, inline: true },
      { name: "Apellidos", value: d.apellidos, inline: true },
      { name: "Nombre", value: d.nombre, inline: true },
      { name: "Nacionalidad", value: d.nacionalidad, inline: true },
      { name: "Nacimiento", value: `${d.nac}${born ? ` (${ageOf(born)} años)` : ""}`, inline: true },
      { name: "Ocupación", value: jobs.tagFor(member) || "Ciudadano", inline: true },
      { name: "Domicilio", value: d.dir },
      { name: "Expedido", value: U.ts(d.emitido, "d"), inline: true },
      { name: "Válido hasta", value: U.ts(d.valido, "d"), inline: true }
    )
    .setFooter({ text: `Titular: ${member.user.username}` });
}

function readForm(i) {
  const nombre = i.fields.getTextInputValue("n").trim(), apellidos = i.fields.getTextInputValue("a").trim();
  const nac = i.fields.getTextInputValue("f").trim(), sexo = i.fields.getTextInputValue("s").trim().toUpperCase(), dir = i.fields.getTextInputValue("d").trim();
  if (!parseDate(nac)) throw new U.UserError("La fecha de nacimiento no es válida. Usa el formato DD/MM/AAAA.");
  if (!["M", "F"].includes(sexo)) throw new U.UserError("El sexo debe ser M o F.");
  return { nombre, apellidos, nac, sexo, dir };
}

async function createSubmit(i) {
  if (D().users[i.user.id]) throw new U.UserError("Ya tienes un DNI. Usa `/dni ver` o `/dni editar`.");
  const f = readForm(i);
  const numero = newNumber();
  const d = { ...f, nacionalidad: "Española", numero, soporte: newSupport(), emitido: Date.now(), valido: Date.now() + 10 * 365 * 864e5 };
  D().users[i.user.id] = d;
  D().numbers[numero] = i.user.id;
  db.save();
  return i.reply({ content: `<@${i.user.id}> ha sacado su DNI.`, embeds: [card(i.member, d)] });
}
async function editSubmit(i) {
  const d = D().users[i.user.id];
  if (!d) throw new U.UserError("Todavía no tienes DNI. Usa `/dni crear`.");
  Object.assign(d, readForm(i));
  db.save();
  return i.reply({ content: "Datos actualizados.", embeds: [card(i.member, d)], flags: U.EPH });
}

const run = {
  dni: async (i) => {
    const sub = i.options.getSubcommand();
    if (sub === "crear") {
      if (D().users[i.user.id]) throw new U.UserError("Ya tienes un DNI. Usa `/dni ver` o `/dni editar`.");
      return i.showModal(modal("dni.new", "Crear DNI"));
    }
    if (sub === "editar") {
      const d = D().users[i.user.id];
      if (!d) throw new U.UserError("Todavía no tienes DNI. Usa `/dni crear`.");
      return i.showModal(modal("dni.edit", "Editar DNI", d));
    }
    if (sub === "ver") {
      const u = i.options.getUser("usuario") || i.user;
      const d = D().users[u.id];
      if (!d) throw new U.UserError(u.id === i.user.id ? "Todavía no tienes DNI. Usa `/dni crear`." : "Esa persona no tiene DNI.");
      const m = await i.guild.members.fetch(u.id).catch(() => null);
      if (!m) throw new U.UserError("Esa persona no está en el servidor.");
      return i.reply({ embeds: [card(m, d)] });
    }
    if (!(await U.needStaff(i))) return;
    const u = i.options.getUser("usuario");
    const d = D().users[u.id];
    if (!d) throw new U.UserError("Esa persona no tiene DNI.");
    delete D().numbers[d.numero];
    delete D().users[u.id];
    db.save();
    return i.reply({ content: `DNI de ${u} eliminado.`, flags: U.EPH, allowedMentions: { parse: [] } });
  }
};

module.exports = { commands: [cmd], run, ui: { "dni.new": createSubmit, "dni.edit": editSubmit } };
