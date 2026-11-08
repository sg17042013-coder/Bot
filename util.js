const { EmbedBuilder, PermissionFlagsBits: P, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const IMG = path.join(db.DIR, "images");
const ASSETS = path.join(__dirname, "..", "assets");
fs.mkdirSync(IMG, { recursive: true });

class UserError extends Error {}

const EPH = 64; // MessageFlags.Ephemeral
const COLOR = { main: 0x1c47c9, ok: 0x2e9e6b, warn: 0xe0a21b, bad: 0xd9433f, mute: 0x6b7488 };

function emb(title, desc, color = COLOR.main) {
  const e = new EmbedBuilder().setColor(color);
  if (title) e.setTitle(String(title).slice(0, 256));
  if (desc) e.setDescription(String(desc).slice(0, 4096));
  return e;
}

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";

function isStaff(m) {
  if (!m || !m.permissions) return false;
  if (m.permissions.has(P.Administrator)) return true;
  return (db.data.config.roles.staff || []).some((id) => m.roles.cache.has(id));
}
async function needStaff(i) {
  if (isStaff(i.member)) return true;
  await i.reply({ content: "No tienes permiso para usar este comando.", flags: EPH });
  return false;
}
async function needAdmin(i) {
  if (i.memberPermissions && i.memberPermissions.has(P.ManageGuild)) return true;
  await i.reply({ content: "Solo los administradores pueden usar este comando.", flags: EPH });
  return false;
}

function parseDuration(s) {
  if (!s || !/^\s*(\d+\s*[smhdw]\s*)+$/i.test(s)) return null;
  const U_ = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  const re = /(\d+)\s*([smhdw])/gi;
  let t = 0, m;
  while ((m = re.exec(s))) t += Number(m[1]) * U_[m[2].toLowerCase()];
  return t > 0 ? t : null;
}
function fmtDur(ms) {
  const out = [];
  for (const [n, v] of [["d", 864e5], ["h", 36e5], ["m", 6e4]]) {
    const q = Math.floor(ms / v);
    if (q) { out.push(q + n); ms -= q * v; }
  }
  return out.join(" ") || "menos de 1m";
}
const ts = (ms, f = "f") => `<t:${Math.floor(ms / 1000)}:${f}>`;
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s || "");

async function saveAttachment(att) {
  if (!(att.contentType || "").startsWith("image/")) throw new UserError("El archivo adjunto debe ser una imagen.");
  const r = await fetch(att.url);
  if (!r.ok) throw new UserError("No he podido descargar la imagen.");
  const name = db.uid() + (path.extname(att.name || "").slice(0, 6) || ".png");
  fs.writeFileSync(path.join(IMG, name), Buffer.from(await r.arrayBuffer()));
  return "local:" + name;
}
async function refFrom(i, a = "imagen", u = "imagen_url") {
  const att = i.options.getAttachment(a);
  if (att) return saveAttachment(att);
  const url = i.options.getString(u);
  if (url) {
    if (!isUrl(url)) throw new UserError("La URL de la imagen no es válida.");
    return url;
  }
  return null;
}
// Pone la imagen en el embed y devuelve los archivos que hay que adjuntar al enviar.
function img(ref, e) {
  if (!ref) return [];
  if (ref.startsWith("local:") || ref.startsWith("asset:")) {
    const name = ref.slice(6);
    const p = path.join(ref.startsWith("asset:") ? ASSETS : IMG, name);
    if (!fs.existsSync(p)) return [];
    e.setImage("attachment://" + name);
    return [new AttachmentBuilder(p, { name })];
  }
  e.setImage(ref);
  return [];
}

function fill(t, member) {
  const g = member.guild;
  return String(t || "")
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", g.name)
    .replaceAll("{count}", String(g.memberCount));
}

async function chan(client, id) {
  if (!id) return null;
  return client.channels.fetch(id).catch(() => null);
}
async function sendLog(client, key, payload) {
  const ch = await chan(client, db.data.config.channels[key]);
  if (!ch) return null;
  return ch.send(payload).catch((e) => { console.error("[log " + key + "]", e.message); return null; });
}
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const bar = (n, t, len = 12) => { const f = t ? Math.round((n / t) * len) : 0; return "█".repeat(f) + "░".repeat(len - f); };
const lines = (arr, max = 3900) => { let s = ""; for (const l of arr) { if (s.length + l.length + 1 > max) { s += "\n…"; break; } s += (s ? "\n" : "") + l; } return s; };

module.exports = { UserError, EPH, COLOR, emb, slug, isStaff, needStaff, needAdmin, parseDuration, fmtDur, ts, isUrl, saveAttachment, refFrom, img, fill, chan, sendLog, shuffle, bar, lines };
