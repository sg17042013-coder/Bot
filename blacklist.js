const { SlashCommandBuilder } = require("discord.js");
const db = require("../db");
const U = require("../util");

const BL = () => db.data.blacklist;

const cmd = new SlashCommandBuilder().setName("blacklist").setDescription("Lista negra del servidor (staff)")
  .addSubcommand((s) => s.setName("agregar").setDescription("Añade un usuario a la lista negra")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(500)))
  .addSubcommand((s) => s.setName("quitar").setDescription("Quita un usuario de la lista negra")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true)))
  .addSubcommand((s) => s.setName("ver").setDescription("Consulta un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true)))
  .addSubcommand((s) => s.setName("lista").setDescription("Muestra toda la lista negra"))
  .addSubcommand((s) => s.setName("accion").setDescription("Qué hacer cuando un usuario de la lista entra (admin)")
    .addStringOption((o) => o.setName("accion").setDescription("Acción").setRequired(true).addChoices(
      { name: "Solo avisar al staff", value: "alerta" }, { name: "Expulsar", value: "expulsar" }, { name: "Banear", value: "banear" })));

const run = {
  blacklist: async (i) => {
    const sub = i.options.getSubcommand();
    if (sub === "accion") { if (!(await U.needAdmin(i))) return; } else if (!(await U.needStaff(i))) return;

    if (sub === "accion") {
      db.data.config.blAction = i.options.getString("accion");
      db.save();
      return i.reply({ content: `Acción al entrar: **${db.data.config.blAction}**.`, flags: U.EPH });
    }
    if (sub === "lista") {
      const rows = Object.entries(BL()).map(([id, b]) => `<@${id}> · ${b.reason.slice(0, 100)} · ${U.ts(b.at, "d")}`);
      return i.reply({ embeds: [U.emb(`Lista negra (${rows.length})`, rows.length ? U.lines(rows) : "La lista está vacía.")], flags: U.EPH });
    }
    const user = i.options.getUser("usuario");
    if (sub === "agregar") {
      if (user.bot || user.id === i.user.id) throw new U.UserError("No puedes añadir a ese usuario.");
      BL()[user.id] = { reason: i.options.getString("motivo"), by: i.user.id, at: Date.now() };
      db.save();
      await U.sendLog(i.client, "logs", { embeds: [U.emb("Lista negra: usuario añadido", `${user} (${user.id})\nMotivo: ${BL()[user.id].reason}\nPor: <@${i.user.id}>`, U.COLOR.bad)] });
      return i.reply({ content: `${user} añadido a la lista negra.`, flags: U.EPH });
    }
    if (sub === "quitar") {
      if (!BL()[user.id]) throw new U.UserError("Ese usuario no está en la lista negra.");
      delete BL()[user.id];
      db.save();
      await U.sendLog(i.client, "logs", { embeds: [U.emb("Lista negra: usuario retirado", `${user} (${user.id})\nPor: <@${i.user.id}>`, U.COLOR.ok)] });
      return i.reply({ content: `${user} retirado de la lista negra.`, flags: U.EPH });
    }
    const b = BL()[user.id];
    return i.reply({ embeds: [b ? U.emb("En la lista negra", `${user}\n**Motivo:** ${b.reason}\n**Añadido por:** <@${b.by}> ${U.ts(b.at, "R")}`, U.COLOR.bad) : U.emb("Sin registros", `${user} no está en la lista negra.`, U.COLOR.ok)], flags: U.EPH });
  }
};

module.exports = {
  commands: [cmd], run,
  events: {
    guildMemberAdd: async (m) => {
      const b = BL()[m.id];
      if (!b) return;
      const action = db.data.config.blAction;
      let result = "Solo aviso";
      try {
        if (action === "expulsar") { await m.kick("Lista negra: " + b.reason); result = "Expulsado"; }
        if (action === "banear") { await m.ban({ reason: "Lista negra: " + b.reason }); result = "Baneado"; }
      } catch (e) { result = "No se pudo aplicar la acción: " + e.message; }
      await U.sendLog(m.client, "logs", { embeds: [U.emb("⚠️ Usuario de la lista negra ha entrado", `${m.user} (${m.id})\n**Motivo:** ${b.reason}\n**Acción:** ${result}`, U.COLOR.bad)] });
    }
  }
};
