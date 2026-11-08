const { SlashCommandBuilder, ChannelType, PermissionFlagsBits: P } = require("discord.js");
const db = require("../db");
const U = require("../util");

function build(name, desc) {
  return new SlashCommandBuilder().setName(name).setDescription(desc).setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName("configurar").setDescription("Configura el mensaje")
      .addChannelOption((o) => o.setName("canal").setDescription("Canal donde se envía").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((o) => o.setName("titulo").setDescription("Título. Variables: {user} {username} {server} {count}").setMaxLength(200))
      .addStringOption((o) => o.setName("mensaje").setDescription("Texto. Variables: {user} {username} {server} {count}").setMaxLength(1500))
      .addAttachmentOption((o) => o.setName("imagen").setDescription("Imagen del mensaje"))
      .addStringOption((o) => o.setName("imagen_url").setDescription("URL de la imagen"))
      .addBooleanOption((o) => o.setName("activo").setDescription("Activar o desactivar")))
    .addSubcommand((s) => s.setName("probar").setDescription("Envía una prueba con tu usuario"));
}

async function post(kind, member) {
  const c = db.data.config[kind];
  if (!c.enabled || !c.channelId) return;
  const ch = await member.guild.channels.fetch(c.channelId).catch(() => null);
  if (!ch) return;
  const e = U.emb(U.fill(c.title, member), U.fill(c.message, member), kind === "welcome" ? U.COLOR.ok : U.COLOR.mute)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  const files = U.img(c.image, e);
  await ch.send({ content: kind === "welcome" ? `<@${member.id}>` : undefined, embeds: [e], files });
}

function handler(kind) {
  return async (i) => {
    if (!(await U.needAdmin(i))) return;
    const c = db.data.config[kind];
    if (i.options.getSubcommand() === "configurar") {
      const ch = i.options.getChannel("canal");
      const msg = i.options.getString("mensaje");
      const title = i.options.getString("titulo");
      const act = i.options.getBoolean("activo");
      const ref = await U.refFrom(i);
      if (ch) c.channelId = ch.id;
      if (msg) c.message = msg;
      if (title) c.title = title;
      if (ref) c.image = ref;
      c.enabled = act !== null ? act : (c.channelId ? true : c.enabled);
      db.save();
      return i.reply({ content: `Guardado. Estado: **${c.enabled ? "activado" : "desactivado"}**.`, flags: U.EPH });
    }
    if (!c.channelId) throw new U.UserError("Primero configura un canal con `configurar`.");
    const was = c.enabled;
    c.enabled = true;
    try { await post(kind, i.member); } finally { c.enabled = was; }
    return i.reply({ content: "Prueba enviada.", flags: U.EPH });
  };
}

module.exports = {
  commands: [build("bienvenida", "Sistema de bienvenida"), build("despedida", "Sistema de despedida")],
  run: { bienvenida: handler("welcome"), despedida: handler("farewell") },
  events: {
    guildMemberAdd: async (m) => {
      const r = db.data.config.roles.inicial;
      if (r && !m.user.bot) await m.roles.add(r, "Rol inicial").catch(() => {});
      await post("welcome", m);
    },
    guildMemberRemove: async (m) => { await post("farewell", m); }
  }
};
