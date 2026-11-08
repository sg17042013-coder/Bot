# Oviedo RP · Bot de Discord

Bot completo para el servidor: bienvenida y despedida, tickets con formularios, votación de apertura, encuestas, sorteos, sanciones, lista negra, activity check, nombre por trabajo, actualizaciones, normativas, valoración de staff, denuncias de rol, DNI, autoroles y citaciones a soporte.

## 1. Token (importante)
Un token que se ha pegado en un chat ya no es privado. En https://discord.com/developers/applications → tu aplicación → **Bot** → **Reset Token**, y copia el nuevo. Nunca lo compartas.
En esa misma página activa **Server Members Intent** y **Message Content Intent**.

## 2. Invitar al bot
En **OAuth2 → URL Generator** marca `bot` y `applications.commands`. Permisos: Administrador (lo más sencillo) o Gestionar roles, canales y apodos, Expulsar, Banear, Moderar miembros, Gestionar mensajes, Enviar mensajes, Insertar enlaces, Adjuntar archivos, Ver historial y Crear hilos.
Pon el rol del bot **por encima** de los roles que debe gestionar (ciudadano, trabajos, autoroles).

## 3. Arrancar
Necesita Node 18.17 o superior.
```
npm install
cp .env.example .env     # pega el token nuevo en DISCORD_TOKEN
npm start
```
Pon también `GUILD_ID` (ID de tu servidor) para que los comandos salgan al instante.
Los datos se guardan en `data/`. Si tu hosting borra el disco al reiniciar, usa un volumen persistente y apunta `DATA_DIR` a él.

## 4. Configuración inicial (admin)
1. `/config canal` para cada función: logs, sanciones, tickets_logs, denuncias, valoraciones, actualizaciones, normativas y sesión.
2. `/config categoria` para los tickets y `/config staff` con los roles de staff.
3. `/config rol` para el rol inicial (ciudadano) y el rol a mencionar en las sesiones.
4. `/bienvenida configurar` y `/despedida configurar`.
5. `/ticket panel` en el canal de soporte.
6. `/trabajo agregar` por cada rol (Ciudadano, Policía…) y `/trabajo sincronizar`.

Las fotos de **votación abierta**, **servidor abierto** y **servidor cerrado** ya vienen en `assets/`. Para cambiarlas: `/sesion imagen`.

## 5. Comandos
| Sistema | Comandos |
|---|---|
| Sesión | `/sesion votacion votos:N` · `abrir` · `cerrar` · `cancelar` · `estado` · `imagen` |
| Tickets | `/ticket panel` · `seccion crear/eliminar/lista` · `pregunta agregar/quitar` · `agregar` · `quitar` · `cerrar` |
| Citaciones | `/citar usuario motivo` |
| Sanciones | `/sancion aplicar` · `historial` · `ver` · `quitar` |
| Lista negra | `/blacklist agregar` · `quitar` · `ver` · `lista` · `accion` |
| Activity check | `/activity crear` · `activos` · `inactivos` · `reiniciar` |
| Trabajos | `/trabajo agregar` · `quitar` · `lista` · `formato` · `sincronizar` |
| Encuestas | `/encuesta crear` · `terminar` |
| Sorteos | `/sorteo crear` · `terminar` · `reroll` |
| Actualizaciones | `/actualizacion` (título, descripción y foto) |
| Normativas | `/normativa nueva` · `editar` · `eliminar` · `lista` |
| Staff | `/valorar` · `/valoraciones ver` · `ranking` |
| Roleplay | `/denuncia` · `/dni crear` · `ver` · `editar` · `eliminar` |
| Autoroles | `/autoroles panel` |
| Mensajes | `/bienvenida` · `/despedida` |

Los comandos de staff se comprueban con los roles de `/config staff`. Los de administración exigen **Gestionar servidor**.
