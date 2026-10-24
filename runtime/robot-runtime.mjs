// PIBOT en el robot: corre el flujo publicado cada vez que alguien llega, sin navegador ni portátil.
//
//   node runtime/robot-runtime.mjs        (en el robot: x2_simulation/robot, contenedor nclub-pibot)
//
// - El robot ve llegar a alguien con su cámara (puente: wait_arrival), lo reconoce (identify), le habla y escucha
//   lo que responde (listen, Whisper). Las opciones las interpreta el LLM del puente, como en la web.
// - Sirve la página de PIBOT a quien esté en la red del robot: se edita el flujo, se publica aquí y se ve en vivo
//   lo que pasa (eventos por SSE). Desde ahí, alguien del club aprueba ingresos o responde por el visitante.
//
// Variables: PORT (8000), HOST (0.0.0.0), PIBOT_BRIDGE (ws://127.0.0.1:8765), PIBOT_DATA (carpeta con lo publicado).
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/nodes/index.js';
import { runFlow } from '../src/core/engine.js';
import { MujocoBridgeRobot } from '../src/robot/mujoco-bridge.js';
import { alnum, closestCode, contradicts, joinEs, knownCodes, outsideOptions, sayOption, spokenAnswer } from '../src/core/spoken.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.PIBOT_DATA ?? path.join(ROOT, 'robot-data'));
const PORT = +(process.env.PORT ?? 8000), HOST = process.env.HOST ?? '0.0.0.0';
const BRIDGE = process.env.PIBOT_BRIDGE ?? 'ws://127.0.0.1:8765';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Lo publicado: flujo y configuración del club (lugares, eventos, listas) ----
const readJSON = async (p, fallback) => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; } };
await fs.mkdir(DATA, { recursive: true });
let flow = await readJSON(path.join(DATA, 'flow.json'), await readJSON(path.join(ROOT, 'flows/recepcion-conversacional.json')));
let workspace = await readJSON(path.join(DATA, 'workspace.json'), await readJSON(path.join(ROOT, 'data/club.json')));
const save = (name, value) => fs.writeFile(path.join(DATA, name), JSON.stringify(value, null, 2));

// ---- En vivo: eventos para las páginas de PIBOT abiertas (Server-Sent Events) ----
const clients = new Set();
// La pausa de las llegadas se guarda: al reiniciar no arranca solo un flujo que hace caminar al robot (por defecto, en pausa)
const state = { running: false, connected: false, capabilities: [], llm: false, real: false, lastError: null,
  paused: (await readJSON(path.join(DATA, 'state.json'), { paused: true })).paused !== false };
const log = (...a) => console.log(new Date().toLocaleTimeString('es-CO'), ...a);
function broadcast(event) {
  const data = `data: ${JSON.stringify({ t: Date.now(), ...event })}\n\n`;
  for (const res of clients) res.write(data);
}
const status = () => ({ runtime: true, flow: flow.name, places: workspace.places?.length ?? 0, ...state });

// Preguntas abiertas a las personas del club: aprobar un ingreso, o responder por el visitante si el robot no le entiende
const pending = new Map();
let seq = 0;
function askHuman(type, payload, timeoutMs) {
  const id = `${type}-${++seq}`;
  let done;
  const promise = new Promise((resolve) => {
    done = (v) => { if (!pending.has(id)) return; pending.delete(id); clearTimeout(timer); broadcast({ type: 'answered', id }); resolve(v); };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    pending.set(id, { type, payload, done });
  });
  broadcast({ type, id, ...payload });
  return { promise, cancel: () => done?.(undefined) };
}

// ---- El robot: una conexión para las acciones, otra para esperar llegadas y otra para la posición ----
let robot = null, eyes = null, body = null;
const ui = {
  onSpeak: (text) => broadcast({ type: 'speak', text }),
  onNavigate: (destination) => broadcast({ type: 'navigate', destination }),
  onGesture: (name) => broadcast({ type: 'gesture', name }),
  onShow: ({ title, text }) => broadcast({ type: 'show', title, text }),
  onChoose: (question, options, { interpret, hints, understand } = {}) => voiceChoose(question, options, interpret, hints, understand),
  onAsk: (question, { kind = 'code' } = {}) => voiceAsk(kind),
};

async function connect() {
  for (;;) {
    try {
      const r = new MujocoBridgeRobot(ui, { url: BRIDGE, places: workspace.places });
      await r.connect();
      const e = new MujocoBridgeRobot({}, { url: BRIDGE }), b = new MujocoBridgeRobot({}, { url: BRIDGE });
      await Promise.all([e.connect(), b.connect()]);
      [robot, eyes, body] = [r, e, b];
      Object.assign(state, { connected: true, capabilities: r.capabilities, llm: r.llm, real: !!r.real, lastError: null });
      log(`conectado al puente (${r.capabilities.join(', ')})${r.llm ? ' con LLM' : ''}`);
      broadcast({ type: 'status', ...status() });
      return;
    } catch (err) {
      state.connected = false; state.lastError = err.message;
      await sleep(3000);
    }
  }
}
const alive = () => !!(robot?.ws && eyes?.ws && body?.ws);
async function keepConnected() {
  for (;;) {
    if (!alive()) {
      [robot, eyes, body].forEach((x) => x?.close());
      state.connected = false; broadcast({ type: 'status', ...status() });
      log('sin puente: reconectando');
      await connect();
    }
    await sleep(2000);
  }
}

// ---- Escuchar al visitante ----
// context: lo que se espera oír (las opciones o los códigos del club), para que Whisper lo escriba igual
async function listen(seconds, context = '') {
  if (!robot?.can('listen')) { await sleep(seconds * 1000); return ''; }
  const r = await robot.send('listen', { timeout: seconds, context }, (seconds + 40) * 1000).catch(() => null);
  const text = r?.text ?? '';
  if (text) broadcast({ type: 'heard', text });
  return text;
}

// La opción dicha tal cual o con una frase del club; si no, la interpreta el LLM entre todas las que entiende
async function voiceChoose(question, options, interpret, hints = {}, understand = options) {
  const human = askHuman('choose', { question, options }, 60000);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const heard = await Promise.race([listen(10, `Opciones: ${joinEs(understand)}.`), human.promise.then((v) => ({ human: v }))]);
      if (heard?.human !== undefined) return heard.human;
      if (heard) {
        let option = sayOption(heard, understand, hints) ?? (interpret ? await interpret(heard).catch(() => null) : null);
        if (option && contradicts(heard, option)) option = null; // "a las 3" no es "6 pm", aunque el LLM lo elija
        if (option) { broadcast({ type: 'understood', option }); return option; }
      }
      if (attempt < 2) await robot.speak(`${!heard ? '¿Perdón?' : outsideOptions(heard, options) ? 'Eso no lo tengo disponible.' : 'No le entendí bien.'} Puede decirme: ${joinEs(options)}.`);
    }
    return null;
  } finally { human.cancel(); }
}

// El código también puede mostrarse como QR a la cámara: gana lo que llegue primero, voz o QR
async function hearOrScan(seconds, kind) {
  const context = kind === 'code' ? `Códigos de acceso: ${knownCodes(workspace).join(', ')}.` : '';
  if (kind !== 'code' || !eyes?.can('scan_code')) return { heard: await listen(seconds, context) };
  const scan = eyes.send('scan_code', { timeout: seconds }, (seconds + 10) * 1000).then((r) => r?.text || '').catch(() => '');
  const voice = listen(seconds, context);
  const first = await Promise.race([scan.then((qr) => (qr ? { qr } : scan.then(() => null))), voice.then((heard) => (heard ? { heard } : null))])
    ?? await Promise.all([scan, voice]).then(([qr, heard]) => (qr ? { qr } : { heard }));
  await body.send('stop_listening', {}).catch(() => {}); // que la otra búsqueda no siga ocupando al robot
  await Promise.allSettled([scan, voice]);
  return first;
}

async function voiceAsk(kind) {
  const human = askHuman('ask', { kind }, 45000);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const got = await Promise.race([hearOrScan(10, kind), human.promise.then((v) => ({ human: v }))]);
      if (got?.human !== undefined) return got.human || null;
      if (got?.qr) { broadcast({ type: 'heard', text: `QR: ${got.qr}` }); return closestCode(alnum(got.qr), knownCodes(workspace)) ?? got.qr; }
      const heard = got?.heard;
      if (!heard) { if (attempt === 0) await robot.speak('¿Perdón? No le escuché.'); continue; }
      const answer = spokenAnswer(heard, kind, workspace);
      if (!answer.unknown) return answer.value;
      if (attempt === 0) await robot.speak(kind === 'code' ? 'No encontré ese código. ¿Me lo repite, o me muestra el código QR?' : '¿Me lo repite, por favor?');
    }
    return null;
  } finally { human.cancel(); }
}

// ---- Atender una llegada ----
async function attend(source) {
  if (state.running || !robot) return false;
  state.running = true;
  const t0 = Date.now();
  broadcast({ type: 'start', source, flow: flow.name });
  log(`llegada (${source}): ${flow.name}`);
  const person = { id: 'camera', name: 'quien llegó',
    camera: () => (robot.can('identify') ? robot.send('identify', {}, 20000) : Promise.resolve({ status: 'not_ready' })) };
  const notified = [];
  const res = await runFlow(flow, {
    person, robot, workspace, stepDelay: 0,
    hooks: {
      onLog: (text) => broadcast({ type: 'log', text }),
      onNode: (id, s, info) => broadcast({ type: 'node', id, status: s, info: s === 'error' ? { error: info?.error } : info }),
      onEdge: (edge) => broadcast({ type: 'edge', edge }),
      onNotify: (n) => { notified.push(n.to ?? 'Recepción'); broadcast({ type: 'notify', to: n.to ?? 'Recepción', message: n.message }); },
      onApprove: async (req) => (await askHuman('approve', { to: req.to, message: req.message }, 90000).promise) === true,
    },
  }).catch((err) => ({ status: 'error', error: err.message, trace: [], vars: {} }));
  const identify = res.trace.find((t) => t.type === 'visitor.identify');
  const visit = {
    at: new Date().toISOString(), visitor: res.vars?.name || 'Sin identificar', category: identify?.port ?? '—',
    via: identify?.data?.via ?? '', ok: res.status === 'ok', seconds: Math.round((Date.now() - t0) / 1000),
    escalated: res.trace.some((t) => t.type === 'escalation.assist') || notified.includes('Recepción'),
    result: res.status !== 'ok' ? `Error: ${res.error}` : res.trace.some((t) => t.type === 'escalation.assist') ? 'Pasó a recepción' : 'Atendido',
  };
  const visits = await readJSON(path.join(DATA, 'visits.json'), []);
  await save('visits.json', [...visits, visit].slice(-500));
  broadcast({ type: 'end', status: res.status, error: res.error, visit });
  log(`fin de la llegada: ${res.status}${res.error ? ` (${res.error})` : ''} en ${visit.seconds} s`);
  state.running = false;
  return true;
}

async function arrivals() {
  for (;;) {
    if (!alive() || state.running || state.paused || !eyes.can('arrivals')) { await sleep(1000); continue; }
    const r = await eyes.send('wait_arrival', { timeout: 15 }, 30000).catch(() => null);
    if (r?.arrived && !state.paused) await attend('cámara');
    else if (!r) await sleep(1000);
  }
}

async function poses() {
  for (;;) {
    if (alive() && clients.size) {
      const p = await body.pose().catch(() => null);
      if (p) broadcast({ type: 'pose', ...p });
    }
    await sleep(500);
  }
}

// ---- Servidor: la página de PIBOT y su API ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const PUBLIC = ['index.html', 'styles.css', 'src/', 'data/', 'flows/'];
const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req, max = 2_000_000) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > max) { reject(new Error('demasiado grande')); req.destroy(); } });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://robot');
  try {
    if (url.pathname === '/api/robot') return send(res, 200, status());
    if (url.pathname === '/api/flow') return send(res, 200, { flow, workspace });
    if (url.pathname === '/api/visits') return send(res, 200, await readJSON(path.join(DATA, 'visits.json'), []));
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ type: 'status', ...status() })}\n\n`);
      for (const [id, p] of pending) res.write(`data: ${JSON.stringify({ type: p.type, id, ...p.payload })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/publish') {
      const body = await readBody(req);
      // Se puede publicar el flujo, la configuración del club (lugares, eventos) o ambos
      if (body.flow && (!Array.isArray(body.flow.nodes) || !Array.isArray(body.flow.edges))) return send(res, 400, { error: 'flujo inválido' });
      if (!body.flow && !body.workspace) return send(res, 400, { error: 'no hay nada que publicar' });
      if (body.flow) { flow = body.flow; await save('flow.json', flow); }
      if (body.workspace) { workspace = body.workspace; await save('workspace.json', workspace); }
      if (robot?.ws && robot.can('places')) await robot.send('places', { places: workspace.places ?? [] }).catch(() => {});
      log(body.flow ? `flujo publicado: ${flow.name} (${flow.nodes.length} pasos)` : `lugares publicados: ${(workspace.places ?? []).length}`);
      broadcast({ type: 'status', ...status() });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/answer') {
      const { id, value } = await readBody(req);
      pending.get(id)?.done(value);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/arrival') {
      if (state.running) return send(res, 409, { error: 'el robot ya está atendiendo a alguien' });
      if (!robot) return send(res, 503, { error: 'el robot no está conectado' });
      attend('PIBOT');
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/pause') {
      state.paused = !!(await readBody(req)).paused;
      await save('state.json', { paused: state.paused });
      broadcast({ type: 'status', ...status() });
      return send(res, 200, status());
    }
    // Archivos de la página (solo los de PIBOT, nunca fuera de su carpeta)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !PUBLIC.some((p) => rel === p || rel.startsWith(p))) return send(res, 404, 'no existe', 'text/plain');
    return send(res, 200, await fs.readFile(file), TYPES[path.extname(file)] ?? 'application/octet-stream');
  } catch (err) {
    return send(res, err.code === 'ENOENT' ? 404 : 500, { error: err.code === 'ENOENT' ? 'no existe' : err.message });
  }
});

server.listen(PORT, HOST, () => log(`PIBOT en el robot: http://${HOST}:${PORT} (puente ${BRIDGE}, datos en ${DATA})`));
keepConnected(); arrivals(); poses();
