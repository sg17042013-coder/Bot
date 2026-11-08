const { SlashCommandBuilder, ChannelType, PermissionFlagsBits: P } = require("discord.js");
const db = require("../db");
const U = require("../util");

const CH = [
  ["Registro general (logs)", "logs"],
  ["Sanciones", "sanciones"],
  ["Logs de tickets", "tickets_logs"],
  ["Denuncias de rol", "denuncias"],
  ["Valoraciones de staff", "valoraciones"],
  ["Actualizaciones del server", "actualizaciones"],
  ["Normativas", "normativas"],
  ["Sesión (apertura del servidor)", "sesion"]
];
const RO = [
  ["Rol al entrar (ciudadano)", "inicial"],
  ["Rol a mencionar en las sesiones", "sesion_ping"]
];

const cmd = new SlashCommandBuilder().setName("config").setDescription("Configuración general del bot")
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) => s.setName("canal").setDescription("Asigna un canal a una función")
    .addStringOption((o) => o.setName("tipo").setDescription("Función").setRequired(true).addChoices(...CH.map(([name, value]) => ({ name, value }))))
    .addChannelOption((o) => o.setName("canal").setDescription("Canal").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((s) => s.setName("categoria").setDescription("Categoría donde se crean los tickets")
    .addChannelOption((o) => o.setName("categoria").setDescription("Categoría").setRequired(true).addChannelTypes(ChannelType.GuildCategory)))
  .addSubcommand((s) => s.setName("rol").setDescription("Asigna un rol a una función")
    .addStringOption((o) => o.setName("tipo").setDescription("Función").setRequired(true).addChoices(...RO.map(([name, value]) => ({ name, value }))))
    .addRoleOption((o) => o.setName("rol").setDescription("Rol").setRequired(true)))
  .addSubcommand((s) => s.setName("staff").setDescription("Añade o quita un rol de staff")
    .addRoleOption((o) => o.setName("rol").setDescription("Rol de staff").setRequired(true))
    .addStringOption((o) => o.setName("accion").setDescription("Acción").setRequired(true).addChoices({ name: "Añadir", value: "add" }, { name: "Quitar", value: "del" })))
  .addSubcommand((s) => s.setName("ver").setDescription("Muestra la configuración actual"));

const run = {
  config: async (i) => {
    const s = i.options.getSubcommand();
    const c = db.data.config;
    if (s === "canal") {
      c.channels[i.options.getString("tipo")] = i.options.getChannel("canal").id;
      db.save();
      return i.reply({ content: "Canal guardado.", flags: U.EPH });
    }
    if (s === "categoria") {
      c.channels.ticket_categoria = i.options.getChannel("categoria").id;
      db.save();
      return i.reply({ content: "Categoría de tickets guardada.", flags: U.EPH });
    }
    if (s === "rol") {
      c.roles[i.options.getString("tipo")] = i.options.getRole("rol").id;
      db.save();
      return i.reply({ content: "Rol guardado.", flags: U.EPH });
    }
    if (s === "staff") {
      const id = i.options.getRole("rol").id;
      if (i.options.getString("accion") === "add") { if (!c.roles.staff.includes(id)) c.roles.staff.push(id); }
      else c.roles.staff = c.roles.staff.filter((x) => x !== id);
      db.save();
      return i.reply({ content: "Roles de staff actualizados.", flags: U.EPH });
    }
    const ch = (k) => (c.channels[k] ? `<#${c.channels[k]}>` : "sin configurar");
    const ro = (k) => (c.roles[k] ? `<@&${c.roles[k]}>` : "sin configurar");
    const e = U.emb("Configuración de Oviedo RP", null)
      .addFields(
        { name: "Canales", value: CH.map(([n, k]) => `**${n}:** ${ch(k)}`).join("\n") + `\n**Categoría de tickets:** ${ch("ticket_categoria")}` },
        { name: "Roles", value: RO.map(([n, k]) => `**${n}:** ${ro(k)}`).join("\n") },
        { name: "Staff", value: c.roles.staff.length ? c.roles.staff.map((r) => `<@&${r}>`).join(" ") : "Sin roles de staff (solo administradores)" },
        { name: "Bienvenida / despedida", value: `Bienvenida: ${c.welcome.enabled ? "activa" : "desactivada"} · Despedida: ${c.farewell.enabled ? "activa" : "desactivada"}` }
      );
    return i.reply({ embeds: [e], flags: U.EPH });
  }
};

module.exports = { commands: [cmd], run };
