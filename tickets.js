const {
  SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
} = require("discord.js");
const db = require("../db");
const U = require("../util");

const T = () => db.data.tickets;
const q = (label, style = "s", required = true) => ({ label, style, required });
const mk = (name, emoji, questions) => ({ id: db.uid(), name, emoji, categoryId: null, roleIds: [], questions });

// Apartados de ejemplo la primera vez: se pueden editar con /ticket seccion y /ticket pregunta
if (!T().sections.length) {
  T().sections.push(
    mk("Moderación", "🛡️", [q("Usuario implicado (nombre o ID)"), q("¿Qué ha ocurrido?", "p"), q("Pruebas (enlaces)", "p", false)]),
    mk("Economía", "💰", [q("Tipo de problema"), q("Describe el problema", "p"), q("Pruebas (enlaces)", "p", false)]),
    mk("Roleplay", "🎭", [q("Personaje o usuario implicado"), q("Descripción de la situación", "p"), q("Pruebas (enlaces)", "p", false)])
  );
  db.save();
}

const secOpt = (o) => o.setName("seccion").setDescription("Apartado").setRequired(true).setAutocomplete(true);

const cmd = new SlashCommandBuilder().setName("ticket").setDescription("Tickets y formularios")
  .addSubcommand((s) => s.setName("panel").setDescription("Publica el panel de tickets (admin)")
    .addChannelOption((o) => o.setName("canal").setDescription("Canal del panel").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName("titulo").setDescription("Título").setMaxLength(200))
    .addStringOption((o) => o.setName("descripcion").setDescription("Descripción").setMaxLength(2000))
    .addAttachmentOption((o) => o.setName("imagen").setDescription("Imagen del panel"))
    .addStringOption((o) => o.setName("imagen_url").setDescription("URL de la imagen")))
  .addSubcommandGroup((g) => g.setName("seccion").setDescription("Apartados del ticket (admin)")
    .addSubcommand((s) => s.setName("crear").setDescription("Crea un apartado")
      .addStringOption((o) => o.setName("nombre").setDescription("Nombre").setRequired(true).setMaxLength(40))
      .addStringOption((o) => o.setName("emoji").setDescription("Emoji del botón").setMaxLength(60))
      .addChannelOption((o) => o.setName("categoria").setDescription("Categoría donde se crean").addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption((o) => o.setName("rol").setDescription("Rol extra que atiende este apartado")))
    .addSubcommand((s) => s.setName("eliminar").setDescription("Elimina un apartado").addStringOption(secOpt))
    .addSubcommand((s) => s.setName("lista").setDescription("Lista los apartados y sus preguntas")))
  .addSubcommandGroup((g) => g.setName("pregunta").setDescription("Preguntas del formulario (admin)")
    .addSubcommand((s) => s.setName("agregar").setDescription("Añade una pregunta (máximo 5 por apartado)")
      .addStringOption(secOpt)
      .addStringOption((o) => o.setName("pregunta").setDescription("Texto de la pregunta (máx. 45 caracteres)").setRequired(true).setMaxLength(45))
      .addBooleanOption((o) => o.setName("parrafo").setDescription("Respuesta larga (por defecto, corta)"))
      .addBooleanOption((o) => o.setName("opcional").setDescription("La respuesta no es obligatoria")))
    .addSubcommand((s) => s.setName("quitar").setDescription("Quita una pregunta")
      .addStringOption(secOpt)
      .addIntegerOption((o) => o.setName("numero").setDescription("Número de la pregunta").setRequired(true).setMinValue(1).setMaxValue(5))))
  .addSubcommand((s) => s.setName("agregar").setDescription("Añade a un usuario al ticket (staff)")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true)))
  .addSubcommand((s) => s.setName("quitar").setDescription("Quita a un usuario del ticket (staff)")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true)))
  .addSubcommand((s) => s.setName("cerrar").setDescription("Cierra este ticket")
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo del cierre").setMaxLength(300)));

const citar = new SlashCommandBuilder().setName("citar").setDescription("Cita a un usuario a soporte (staff)")
  .addUserOption((o) => o.setName("usuario").setDescription("Usuario citado").setRequired(true))
  .addStringOption((o) => o.setName("motivo").setDescription("Motivo de la citación").setRequired(true).setMaxLength(900));

function panelRows() {
  const secs = T().sections;
  if (!secs.length) throw new U.UserError("No hay apartados. Crea uno con `/ticket seccion crear`.");
  const rows = [];
  let row = new ActionRowBuilder();
  secs.slice(0, 25).forEach((s, n) => {
    if (n && n % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
    const b = new ButtonBuilder().setCustomId("tk.open|" + s.id).setLabel(s.name.slice(0, 80)).setStyle(ButtonStyle.Primary);
    if (s.emoji) b.setEmoji(s.emoji);
    row.addComponents(b);
  });
  rows.push(row);
  return rows;
}
async function refreshPanels(client) {
  const keep = [];
  for (const p of T().panels) {
    const ch = await U.chan(client, p.channelId);
    const msg = ch && (await ch.messages.fetch(p.messageId).catch(() => null));
    if (!msg) continue;
    keep.push(p);
    await msg.edit({ components: T().sections.length ? panelRows() : [] }).catch(() => {});
  }
  T().panels = keep;
  db.save();
}

const findSec = (id) => T().sections.find((x) => x.id === id);

async function createTicket(guild, user, s, answers, extra = {}) {
  const t = T();
  const num = ++t.counter;
  const staff = [...new Set([...(db.data.config.roles.staff || []), ...(s.roleIds || [])])].filter((id) => guild.roles.cache.has(id));
  const perms = [
    { id: guild.id, deny: [P.ViewChannel] },
    { id: user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] },
    { id: guild.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.ManageChannels] },
    ...staff.map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.ManageMessages] }))
  ];
  const catId = s.categoryId || db.data.config.channels.ticket_categoria;
  const parent = catId && guild.channels.cache.has(catId) ? catId : undefined;
  const ch = await guild.channels.create({
    name: `${U.slug(s.name)}-${String(num).padStart(4, "0")}`,
    type: ChannelType.GuildText,
    parent,
    topic: `Ticket #${num} · ${s.name} · ${user.username}`.slice(0, 1000),
    permissionOverwrites: perms
  });
  t.open[ch.id] = { userId: user.id, sectionId: s.id, sectionName: s.name, num, claimedBy: null, createdAt: Date.now() };
  db.save();
  const e = U.emb(`${s.emoji || "📩"} ${s.name} · #${num}`, extra.description || null)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });
  if (answers.length) e.addFields(answers.map((x) => ({ name: x.q.slice(0, 256), value: String(x.a).slice(0, 1024) })));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("tk.claim").setLabel("Reclamar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tk.close").setLabel("Cerrar").setStyle(ButtonStyle.Danger)
  );
  await ch.send({ content: `<@${user.id}> ${staff.map((r) => `<@&${r}>`).join(" ")}`.trim(), embeds: [e], components: [row] });
  return ch;
}

async function transcript(ch) {
  const msgs = [];
  let before;
  for (let n = 0; n < 10; n++) {
    const b = await ch.messages.fetch({ limit: 100, before });
    if (!b.size) break;
    msgs.push(...b.values());
    before = b.last().id;
  }
  msgs.reverse();
  return msgs.map((m) => {
    const d = new Date(m.createdTimestamp).toISOString().replace("T", " ").slice(0, 16);
    const emb_ = m.embeds.map((e) => [e.title, e.description, ...(e.fields || []).map((f) => `${f.name}: ${f.value}`)].filter(Boolean).join(" | ")).join(" ");
    const att = [...m.attachments.values()].map((a) => a.url).join(" ");
    return `[${d}] ${m.author.username}: ${[m.content, emb_, att].filter(Boolean).join(" ")}`;
  }).join("\n");
}

async function finishClose(ch, closer, reason) {
  const info = T().open[ch.id];
  if (!info) return;
  const txt = (await transcript(ch).catch(() => "")) || "(sin mensajes)";
  const name = `ticket-${info.num}.txt`;
  const e = U.emb(`Ticket #${info.num} cerrado`, null, U.COLOR.mute).addFields(
    { name: "Apartado", value: info.sectionName, inline: true },
    { name: "Abierto por", value: `<@${info.userId}>`, inline: true },
    { name: "Cerrado por", value: `<@${closer.id}>`, inline: true },
    { name: "Atendido por", value: info.claimedBy ? `<@${info.claimedBy}>` : "Nadie", inline: true },
    { name: "Duración", value: U.fmtDur(Date.now() - info.createdAt), inline: true },
    { name: "Motivo", value: reason || "Sin motivo" }
  );
  await U.sendLog(ch.client, "tickets_logs", { embeds: [e], files: [new AttachmentBuilder(Buffer.from(txt), { name })] });
  const user = await ch.client.users.fetch(info.userId).catch(() => null);
  if (user) await user.send({ embeds: [e], files: [new AttachmentBuilder(Buffer.from(txt), { name })] }).catch(() => {});
  delete T().open[ch.id];
  db.save();
  await ch.send("Este ticket se cerrará en 5 segundos.").catch(() => {});
  setTimeout(() => ch.delete("Ticket cerrado").catch(() => {}), 5000);
}

async function openBtn(i, [sid]) {
  const s = findSec(sid);
  if (!s) return i.reply({ content: "Ese apartado ya no existe.", flags: U.EPH });
  if (Object.values(T().open).filter((t) => t.userId === i.user.id).length >= 3) {
    return i.reply({ content: "Ya tienes 3 tickets abiertos. Cierra alguno antes de abrir otro.", flags: U.EPH });
  }
  if (!s.questions.length) {
    await i.deferReply({ flags: U.EPH });
    const ch = await createTicket(i.guild, i.user, s, []);
    return i.editReply(`Tu ticket está listo: ${ch}`);
  }
  const m = new ModalBuilder().setCustomId("tk.form|" + s.id).setTitle(s.name.slice(0, 45));
  s.questions.forEach((x, n) => m.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId("q" + n).setLabel(x.label.slice(0, 45))
      .setStyle(x.style === "p" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(x.required !== false).setMaxLength(x.style === "p" ? 1000 : 200)
  )));
  return i.showModal(m);
}
async function formSubmit(i, [sid]) {
  const s = findSec(sid);
  if (!s) return i.reply({ content: "Ese apartado ya no existe.", flags: U.EPH });
  await i.deferReply({ flags: U.EPH });
  const answers = s.questions.map((x, n) => ({ q: x.label, a: i.fields.getTextInputValue("q" + n) || "—" }));
  const ch = await createTicket(i.guild, i.user, s, answers);
  return i.editReply(`Tu ticket está listo: ${ch}`);
}
async function claim(i) {
  const info = T().open[i.channelId];
  if (!info) return i.reply({ content: "Esto no es un ticket.", flags: U.EPH });
  if (!U.isStaff(i.member)) return i.reply({ content: "Solo el staff puede reclamar tickets.", flags: U.EPH });
  if (info.claimedBy) return i.reply({ content: `Ya lo ha reclamado <@${info.claimedBy}>.`, flags: U.EPH });
  info.claimedBy = i.user.id;
  db.save();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("tk.claim").setLabel("Reclamado").setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId("tk.close").setLabel("Cerrar").setStyle(ButtonStyle.Danger)
  );
  await i.update({ components: [row] });
  return i.channel.send(`<@${i.user.id}> se encarga de este ticket.`);
}
async function closeAsk(i) {
  const info = T().open[i.channelId];
  if (!info) return i.reply({ content: "Esto no es un ticket.", flags: U.EPH });
  if (!(U.isStaff(i.member) || i.user.id === info.userId)) return i.reply({ content: "No puedes cerrar este ticket.", flags: U.EPH });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("tk.closeok").setLabel("Confirmar cierre").setStyle(ButtonStyle.Danger));
  return i.reply({ content: "¿Seguro que quieres cerrar el ticket? Se guardará una transcripción.", components: [row], flags: U.EPH });
}
async function closeOk(i) {
  const info = T().open[i.channelId];
  if (!info) return i.update({ content: "Este ticket ya está cerrado.", components: [] });
  if (!(U.isStaff(i.member) || i.user.id === info.userId)) return i.update({ content: "No puedes cerrar este ticket.", components: [] });
  await i.update({ content: "Cerrando el ticket…", components: [] });
  return finishClose(i.channel, i.user, null);
}

const run = {
  ticket: async (i) => {
    const g = i.options.getSubcommandGroup(false);
    const s = i.options.getSubcommand();
    if (g || s === "panel") { if (!(await U.needAdmin(i))) return; }
    else if (s !== "cerrar") { if (!(await U.needStaff(i))) return; }

    if (s === "panel") {
      const ch = i.options.getChannel("canal");
      const ref = await U.refFrom(i);
      const e = U.emb(i.options.getString("titulo") || "Centro de soporte", i.options.getString("descripcion") || "Elige el apartado que corresponda y rellena el formulario. Un miembro del staff te atenderá lo antes posible.");
      const files = U.img(ref, e);
      const msg = await ch.send({ embeds: [e], components: panelRows(), files });
      T().panels.push({ channelId: ch.id, messageId: msg.id });
      db.save();
      return i.reply({ content: `Panel publicado en ${ch}.`, flags: U.EPH });
    }

    if (g === "seccion") {
      if (s === "crear") {
        const emoji = i.options.getString("emoji");
        if (emoji) { try { new ButtonBuilder().setEmoji(emoji); } catch { throw new U.UserError("Ese emoji no es válido."); } }
        if (T().sections.length >= 25) throw new U.UserError("Máximo 25 apartados.");
        const cat = i.options.getChannel("categoria");
        const rol = i.options.getRole("rol");
        const sec = mk(i.options.getString("nombre"), emoji || "📩", []);
        sec.categoryId = cat ? cat.id : null;
        sec.roleIds = rol ? [rol.id] : [];
        T().sections.push(sec);
        db.save();
        await refreshPanels(i.client);
        return i.reply({ content: `Apartado **${sec.name}** creado. Añade sus preguntas con \`/ticket pregunta agregar\`.`, flags: U.EPH });
      }
      if (s === "eliminar") {
        const sec = findSec(i.options.getString("seccion"));
        if (!sec) throw new U.UserError("Apartado no encontrado.");
        T().sections = T().sections.filter((x) => x.id !== sec.id);
        db.save();
        await refreshPanels(i.client);
        return i.reply({ content: `Apartado **${sec.name}** eliminado.`, flags: U.EPH });
      }
      const e = U.emb("Apartados de tickets", null);
      for (const sec of T().sections) {
        e.addFields({ name: `${sec.emoji || ""} ${sec.name}`, value: sec.questions.length ? sec.questions.map((x, n) => `${n + 1}. ${x.label}${x.style === "p" ? " (largo)" : ""}${x.required === false ? " (opcional)" : ""}`).join("\n") : "Sin preguntas: el ticket se abre directamente." });
      }
      return i.reply({ embeds: [e], flags: U.EPH });
    }

    if (g === "pregunta") {
      const sec = findSec(i.options.getString("seccion"));
      if (!sec) throw new U.UserError("Apartado no encontrado.");
      if (s === "agregar") {
        if (sec.questions.length >= 5) throw new U.UserError("Un formulario admite 5 preguntas como máximo.");
        sec.questions.push(q(i.options.getString("pregunta"), i.options.getBoolean("parrafo") ? "p" : "s", !i.options.getBoolean("opcional")));
        db.save();
        return i.reply({ content: `Pregunta añadida a **${sec.name}** (${sec.questions.length}/5).`, flags: U.EPH });
      }
      const n = i.options.getInteger("numero") - 1;
      if (!sec.questions[n]) throw new U.UserError("Esa pregunta no existe.");
      sec.questions.splice(n, 1);
      db.save();
      return i.reply({ content: "Pregunta eliminada.", flags: U.EPH });
    }

    // agregar / quitar / cerrar dentro de un ticket
    const info = T().open[i.channelId];
    if (!info) throw new U.UserError("Este comando solo funciona dentro de un ticket.");
    if (s === "agregar") {
      const u = i.options.getUser("usuario");
      await i.channel.permissionOverwrites.edit(u.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
      return i.reply(`<@${u.id}> ha sido añadido al ticket.`);
    }
    if (s === "quitar") {
      const u = i.options.getUser("usuario");
      if (u.id === info.userId) throw new U.UserError("No puedes quitar al creador del ticket.");
      await i.channel.permissionOverwrites.delete(u.id);
      return i.reply(`<@${u.id}> ha sido quitado del ticket.`);
    }
    if (!(U.isStaff(i.member) || i.user.id === info.userId)) throw new U.UserError("No puedes cerrar este ticket.");
    await i.reply({ content: "Cerrando el ticket…", flags: U.EPH });
    return finishClose(i.channel, i.user, i.options.getString("motivo"));
  },

  citar: async (i) => {
    if (!(await U.needStaff(i))) return;
    const u = i.options.getUser("usuario");
    if (u.bot) throw new U.UserError("No puedes citar a un bot.");
    await i.deferReply({ flags: U.EPH });
    const sec = { id: "citacion", name: "Citación a soporte", emoji: "📢", roleIds: [], categoryId: null };
    const ch = await createTicket(i.guild, u, sec, [
      { q: "Motivo de la citación", a: i.options.getString("motivo") },
      { q: "Citado por", a: `<@${i.user.id}>` }
    ], { description: "Has sido citado/a por el equipo de soporte. Responde en este canal lo antes posible." });
    await u.send({ embeds: [U.emb("Citación a soporte", `Has sido citado/a en **${i.guild.name}**.\nMotivo: ${i.options.getString("motivo")}\nCanal: ${ch}`, U.COLOR.warn)] }).catch(() => {});
    return i.editReply(`Citación creada: ${ch}`);
  }
};

module.exports = {
  commands: [cmd, citar],
  run,
  auto: {
    ticket: async (i) => {
      const f = i.options.getFocused().toLowerCase();
      await i.respond(T().sections.filter((x) => x.name.toLowerCase().includes(f)).slice(0, 25).map((x) => ({ name: x.name, value: x.id })));
    }
  },
  ui: { "tk.open": openBtn, "tk.form": formSubmit, "tk.claim": claim, "tk.close": closeAsk, "tk.closeok": closeOk }
};
