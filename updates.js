const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const db = require("../db");
const U = require("../util");

const N = () => db.data.normativas;
const pending = new Map();

const input = (id, label, style, value, max, required = true) => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (value) t.setValue(String(value).slice(0, max));
  return new ActionRowBuilder().addComponents(t);
};
const stamp = () => new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });

const upd = new SlashCommandBuilder().setName("actualizacion").setDescription("Publica una actualización del server (staff)")
  .addAttachmentOption((o) => o.setName("imagen").setDescription("Foto de la actualización"))
  .addStringOption((o) => o.setName("imagen_url").setDescription("URL de la foto"))
  .addRoleOption((o) => o.setName("rol").setDescription("Rol a mencionar"));

const nor = new SlashCommandBuilder().setName("normativa").setDescription("Normativas del servidor (staff)")
  .addSubcommand((s) => s.setName("nueva").setDescription("Escribe y publica una normativa"))
  .addSubcommand((s) => s.setName("editar").setDescription("Edita una normativa publicada")
    .addStringOption((o) => o.setName("normativa").setDescription("Normativa").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName("eliminar").setDescription("Elimina una normativa")
    .addStringOption((o) => o.setName("normativa").setDescription("Normativa").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName("lista").setDescription("Lista las normativas publicadas"));

const normEmbed = (title, text) => U.emb(title, text, U.COLOR.main).setFooter({ text: "Normativa · actualizada el " + stamp() });

async function channelFor(client, key, label) {
  const ch = await U.chan(client, db.data.config.channels[key]);
  if (!ch) throw new U.UserError(`Primero configura el canal de ${label} con \`/config canal\`.`);
  return ch;
}

async function pubSubmit(i, [key]) {
  const p = pending.get(key);
  if (!p) return i.reply({ content: "Esta ventana ha caducado. Vuelve a usar `/actualizacion`.", flags: U.EPH });
  pending.delete(key);
  await i.deferReply({ flags: U.EPH });
  const ch = await channelFor(i.client, "actualizaciones", "actualizaciones");
  let ref = null;
  if (p.att) ref = await U.saveAttachment(p.att);
  else if (p.url) { if (!U.isUrl(p.url)) throw new U.UserError("La URL de la imagen no es válida."); ref = p.url; }
  const e = U.emb("📢 " + i.fields.getTextInputValue("t"), i.fields.getTextInputValue("d"), U.COLOR.main)
    .setFooter({ text: "Actualización · " + stamp() });
  const files = U.img(ref, e);
  await ch.send({ content: p.role ? `<@&${p.role}>` : undefined, embeds: [e], files });
  return i.editReply(`Actualización publicada en ${ch}.`);
}

async function newSubmit(i) {
  await i.deferReply({ flags: U.EPH });
  const ch = await channelFor(i.client, "normativas", "normativas");
  const title = i.fields.getTextInputValue("t"), text = i.fields.getTextInputValue("x");
  const msg = await ch.send({ embeds: [normEmbed(title, text)] });
  const id = db.uid();
  N()[id] = { title, text, channelId: ch.id, messageId: msg.id };
  db.save();
  return i.editReply(`Normativa publicada en ${ch}.`);
}
async function editSubmit(i, [id]) {
  const n = N()[id];
  if (!n) return i.reply({ content: "Esa normativa ya no existe.", flags: U.EPH });
  await i.deferReply({ flags: U.EPH });
  n.title = i.fields.getTextInputValue("t");
  n.text = i.fields.getTextInputValue("x");
  db.save();
  const ch = await U.chan(i.client, n.channelId);
  const msg = ch && (await ch.messages.fetch(n.messageId).catch(() => null));
  if (!msg) throw new U.UserError("No encuentro el mensaje original. Es posible que se haya borrado.");
  await msg.edit({ embeds: [normEmbed(n.title, n.text)] });
  return i.editReply("Normativa actualizada.");
}

const run = {
  actualizacion: async (i) => {
    if (!(await U.needStaff(i))) return;
    await channelFor(i.client, "actualizaciones", "actualizaciones");
    const key = db.uid();
    const rol = i.options.getRole("rol");
    pending.set(key, { att: i.options.getAttachment("imagen"), url: i.options.getString("imagen_url"), role: rol ? rol.id : null });
    setTimeout(() => pending.delete(key), 30 * 60 * 1000);
    return i.showModal(new ModalBuilder().setCustomId("up.pub|" + key).setTitle("Nueva actualización").addComponents(
      input("t", "Título", TextInputStyle.Short, null, 100),
      input("d", "Descripción", TextInputStyle.Paragraph, null, 4000)
    ));
  },
  normativa: async (i) => {
    if (!(await U.needStaff(i))) return;
    const sub = i.options.getSubcommand();
    if (sub === "nueva") {
      await channelFor(i.client, "normativas", "normativas");
      return i.showModal(new ModalBuilder().setCustomId("nv.new").setTitle("Nueva normativa").addComponents(
        input("t", "Título", TextInputStyle.Short, null, 100),
        input("x", "Normativa", TextInputStyle.Paragraph, null, 4000)
      ));
    }
    if (sub === "lista") {
      const rows = Object.values(N()).map((n) => `[${n.title}](https://discord.com/channels/${i.guildId}/${n.channelId}/${n.messageId})`);
      return i.reply({ embeds: [U.emb("Normativas publicadas", rows.length ? U.lines(rows) : "Todavía no hay normativas.")], flags: U.EPH });
    }
    const id = i.options.getString("normativa");
    const n = N()[id];
    if (!n) throw new U.UserError("No encuentro esa normativa.");
    if (sub === "editar") {
      return i.showModal(new ModalBuilder().setCustomId("nv.edit|" + id).setTitle("Editar normativa").addComponents(
        input("t", "Título", TextInputStyle.Short, n.title, 100),
        input("x", "Normativa", TextInputStyle.Paragraph, n.text, 4000)
      ));
    }
    const ch = await U.chan(i.client, n.channelId);
    const msg = ch && (await ch.messages.fetch(n.messageId).catch(() => null));
    if (msg) await msg.delete().catch(() => {});
    delete N()[id];
    db.save();
    return i.reply({ content: "Normativa eliminada.", flags: U.EPH });
  }
};

module.exports = {
  commands: [upd, nor], run,
  auto: {
    normativa: async (i) => {
      const f = i.options.getFocused().toLowerCase();
      await i.respond(Object.entries(N()).filter(([, n]) => n.title.toLowerCase().includes(f)).slice(0, 25).map(([id, n]) => ({ name: n.title.slice(0, 100), value: id })));
    }
  },
  ui: { "up.pub": pubSubmit, "nv.new": newSubmit, "nv.edit": editSubmit }
};
