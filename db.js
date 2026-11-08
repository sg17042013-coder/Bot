const fs = require("fs");
const path = require("path");

const DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DIR, "db.json");
fs.mkdirSync(DIR, { recursive: true });

const defaults = () => ({
  config: {
    channels: {},
    roles: { staff: [] },
    welcome: {
      enabled: false, channelId: null, image: null,
      title: "Bienvenido/a a {server}",
      message: "Hola {user}, te damos la bienvenida a **{server}**. Ya somos **{count}** miembros. Lee la normativa y disfruta del rol."
    },
    farewell: {
      enabled: false, channelId: null, image: null,
      title: "Hasta pronto",
      message: "**{username}** ha dejado **{server}**. Ahora somos **{count}** miembros."
    },
    jobFormat: "[{tag}] {name}",
    blAction: "alerta",
    images: { votacion: "asset:votacion.jpg", abierto: "asset:abierto.jpg", cerrado: "asset:cerrado.jpg" }
  },
  tickets: { sections: [], open: {}, counter: 0, panels: [] },
  session: { state: "cerrado", vote: null, statusMsg: null, openedAt: null, openedBy: null, lastVoters: [] },
  polls: {},
  giveaways: {},
  sanctions: { list: [], counter: 0 },
  blacklist: {},
  activity: {},
  jobs: { roles: [] },
  ratings: [],
  reports: { counter: 0, items: {} },
  dni: { users: {}, numbers: {} },
  autoroles: {},
  normativas: {}
});

function merge(a, b) {
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) merge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}

let data = defaults();
try { data = merge(defaults(), JSON.parse(fs.readFileSync(FILE, "utf8"))); } catch { /* primera ejecución */ }

let timer = null;
function flush() {
  clearTimeout(timer);
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(data));
  fs.renameSync(FILE + ".tmp", FILE);
}
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => { try { flush(); } catch (e) { console.error("No se pudo guardar", e); } }, 400);
}
const uid = () => Math.random().toString(36).slice(2, 8);

module.exports = { get data() { return data; }, save, flush, uid, DIR };
