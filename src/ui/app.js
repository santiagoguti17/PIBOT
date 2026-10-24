import '../nodes/index.js';
import { runFlow } from '../core/engine.js';
import { SimulatorRobot } from '../robot/simulator.js';
import { MujocoBridgeRobot } from '../robot/mujoco-bridge.js';
import { Editor } from './editor.js';
import { openEvents } from './events.js';
import { drawPlan, placeFor } from './map.js';
import { openPlaces } from './places.js';
import { addVisit, recordVisit, renderVisits } from './visits.js';
import { openWizard } from './wizard.js';
import { pickNextStep } from './next-step.js';
import { checkFlow } from '../core/check-flow.js';
import { FaceCamera } from '../robot/face-camera.js';
import { mergeDefaults } from '../core/workspace.js';

const $ = (id) => document.getElementById(id);
document.body.append($('parts').content); // robot, llegada, avisos y registro: se acomodan según la vista

const FLOW_KEY = 'pibot.flow.v4', WS_KEY = 'pibot.workspace.v1', VIEW_KEY = 'pibot.view.v1';
const getJSON = async (url) => (await fetch(url)).json();
const people = await getJSON('data/people.json');
const defaultFlow = await getJSON('flows/recepcion-conversacional.json');
const defaultWorkspace = await getJSON('data/club.json');
const stored = (k) => JSON.parse(localStorage.getItem(k) ?? 'null');

let workspace = stored(WS_KEY) ?? structuredClone(defaultWorkspace);
mergeDefaults(workspace, defaultWorkspace); // datos guardados antes de que existieran lugares, reservas, nuevos eventos...
workspace.faceCategories ??= structuredClone(defaultWorkspace.faceCategories ?? {}); // y antes del reconocimiento facial real
const saveWorkspace = () => localStorage.setItem(WS_KEY, JSON.stringify(workspace));
$('club-name').textContent = workspace.name ?? defaultWorkspace.name ?? '';

const editor = new Editor({ canvas: $('canvas'), svg: $('edges'), palette: $('palette'), inspector: $('inspector') });
editor.workspace = workspace;
const loadFlow = (flow) => { editor.load(flow); $('flow-name').value = editor.flow.name; requestAnimationFrame(() => editor.fit()); };
loadFlow(stored(FLOW_KEY) ?? defaultFlow);
editor.onChange = () => {
  editor.flow.name = $('flow-name').value; localStorage.setItem(FLOW_KEY, JSON.stringify(editor.flow));
  const sel = editor.selected?.kind === 'node' ? editor.selected.ref : null; // el nombre del nodo en la pestaña "Nodo"
  $('node-tab-name').textContent = sel ? $('canvas').querySelector(`.node[data-id="${sel.id}"] .title`)?.textContent ?? '' : '';
  clearTimeout(history.timer); history.timer = setTimeout(snapshot, 350);
  refreshCanvasState();
};

// Deshacer y rehacer: fotos del flujo después de cada cambio (las de escribir se juntan)
const history = { past: [], future: [], last: JSON.stringify(editor.flow), timer: null };
function snapshot() {
  clearTimeout(history.timer); history.timer = null;
  const now = JSON.stringify(editor.flow);
  if (now === history.last) return;
  history.past.push(history.last); history.last = now; history.future = [];
  if (history.past.length > 80) history.past.shift();
  updateUndo();
}
function restore(json) {
  history.last = json;
  editor.load(JSON.parse(json)); $('flow-name').value = editor.flow.name;
  localStorage.setItem(FLOW_KEY, json); refreshCanvasState(); updateUndo();
}
const undo = () => { if (history.timer) snapshot(); if (history.past.length) { history.future.push(history.last); restore(history.past.pop()); } };
const redo = () => { if (history.future.length) { history.past.push(history.last); restore(history.future.pop()); } };
function updateUndo() { $('btn-undo').disabled = !history.past.length && !history.timer; $('btn-redo').disabled = !history.future.length; }
$('btn-undo').onclick = undo; $('btn-redo').onclick = redo;
addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || document.body.dataset.view !== 'flow' || document.querySelector('dialog[open]')) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; // ahí Ctrl+Z deshace lo escrito
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});

// Revisión en palabras simples, el lienzo vacío y el consejo del +
const TIP_KEY = 'pibot.tip.v1';
function refreshCanvasState() {
  const empty = !editor.flow.nodes.length;
  $('canvas-empty').hidden = !empty;
  $('canvas-tip').hidden = empty || localStorage.getItem(TIP_KEY) === 'off';
  const problems = checkFlow(editor.flow, workspace);
  const errors = problems.filter((p) => p.level === 'error').length;
  $('btn-review').hidden = empty;
  $('btn-review').dataset.state = errors ? 'error' : problems.length ? 'warn' : 'ok';
  $('btn-review').textContent = problems.length ? `${problems.length} ${problems.length === 1 ? 'cosa' : 'cosas'} por revisar` : 'Todo listo';
  $('btn-review').disabled = !problems.length;
  if (!$('review-pop').hidden) showReview(problems);
  if (!problems.length) $('review-pop').hidden = true;
  updateUndo();
}
function showReview(problems = checkFlow(editor.flow, workspace)) {
  const pop = $('review-pop');
  pop.innerHTML = '<p class="review-title">Antes de probar</p><ul></ul>';
  pop.querySelector('ul').append(...problems.map((p) => {
    const li = document.createElement('li'); li.className = p.level;
    li.append(Object.assign(document.createElement('span'), { textContent: p.text }));
    const node = editor.flow.nodes.find((n) => n.id === p.node);
    if (node) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'quiet', textContent: 'Ver' });
      b.onclick = () => { editor.select({ kind: 'node', ref: node }); editor.reveal(node.id); };
      li.append(b);
    }
    return li;
  }));
  pop.hidden = false; $('btn-review').setAttribute('aria-expanded', 'true');
}
$('btn-review').onclick = () => {
  if (!$('review-pop').hidden) { $('review-pop').hidden = true; $('btn-review').setAttribute('aria-expanded', 'false'); }
  else showReview();
};
$('canvas-tip').querySelector('button').onclick = () => { localStorage.setItem(TIP_KEY, 'off'); refreshCanvasState(); };
$('canvas-empty').onclick = (e) => {
  if (e.target.dataset.act === 'wizard') $('btn-wizard').click();
  if (e.target.dataset.act === 'example') openExample('flows/recepcion-conversacional.json');
};

// + de una salida libre: qué hace el robot después
editor.onAddAfter = (node, port, button) => pickNextStep(button, {
  title: port === 'out' ? 'Qué hace el robot después' : `Si: ${port}`,
  onPick: (type) => editor.addNodeAfter(node, port, type),
});
$('btn-arrange').onclick = () => editor.arrange();

// Asistente: arma el flujo completo con tres preguntas
$('btn-wizard').onclick = () => openWizard($('wizard-dialog'), workspace, {
  portsOf: (n) => editor.portsOf(n),
  onCreate: (flow) => {
    loadFlow(flow); editor.onChange(); setPane('test');
    requestAnimationFrame(() => editor.arrange()); // con el alto real de cada nodo
  },
});
$('flow-name').oninput = editor.onChange;
$('z-in').onclick = () => editor.setZoom(editor.zoom + 0.1);
$('z-out').onclick = () => editor.setZoom(editor.zoom - 0.1);
$('z-fit').onclick = () => editor.fit();

// Vistas: Diseñar (el flujo), En vivo (el robot y el mapa) y Visitas. El robot y la llegada son los mismos en las dos primeras.
const SLOTS = {
  flow: { 'slot-flow': ['arrival', 'stage', 'inbox-panel', 'log-panel'] }, // primero quién llega: así se prueba sin bajar
  live: { 'slot-live': ['stage', 'arrival'], 'slot-live-side': ['inbox-panel', 'log-panel'] },
};
function setView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('.views [role=tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.for !== view; });
  for (const [slot, parts] of Object.entries(SLOTS[view] ?? {})) parts.forEach((id) => $(slot).append($(id)));
  if (view === 'visits') renderVisits($('visits'), { onEmpty: () => setView('flow') });
  if (view === 'live') drawLiveMap();
  localStorage.setItem(VIEW_KEY, view);
}
document.querySelectorAll('.views [role=tab]').forEach((b) => (b.onclick = () => setView(b.dataset.view)));

// Panel lateral de Diseñar: Probar el flujo o configurar el nodo elegido
function setPane(pane) {
  document.querySelectorAll('.side-tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.pane === pane));
  document.querySelectorAll('.side-pane').forEach((p) => { p.hidden = p.dataset.pane !== pane; });
}
document.querySelectorAll('.side-tabs [role=tab]').forEach((b) => (b.onclick = () => setPane(b.dataset.pane)));
editor.onSelect = (sel) => {
  const node = sel?.kind === 'node' ? sel.ref : null;
  $('node-tab-name').textContent = node ? $('canvas').querySelector(`.node[data-id="${node.id}"] .title`)?.textContent ?? '' : '';
  if (node) setPane('node');
};

// visitantes: quien esté frente a la cámara (reconocimiento facial real) o una persona del dataset (cámara simulada)
const CAMERA = 'camera';
const faceCam = new FaceCamera({ video: $('face-video') });
const real = document.createElement('optgroup'); real.label = 'Cámara real';
real.append(new Option('Persona frente a la cámara', CAMERA));
const sample = document.createElement('optgroup'); sample.label = 'Visitantes de prueba (cámara simulada)';
people.forEach((p) => sample.append(new Option(p.name, p.id)));
$('person').append(real, sample);
$('person').value = people[0].id;
const cameraPerson = {
  id: CAMERA, name: 'quien está frente a la cámara', truth: 'real',
  camera: async () => { // mientras mira, el robot lo muestra
    $('face-cam').classList.add('is-looking'); show($('gesture'), true); $('gesture').textContent = 'Mirando a la cámara…';
    try { return await faceCam.identify(); } finally { $('face-cam').classList.remove('is-looking'); show($('gesture'), false); }
  },
};
const currentPerson = () => ($('person').value === CAMERA ? cameraPerson : people.find((x) => x.id === $('person').value));
let facePoll = null;
async function showFaceStatus() {
  try {
    const s = await faceCam.status();
    $('face-chip').textContent = s.listo ? `${s.personas} ${s.personas === 1 ? 'persona registrada' : 'personas registradas'}` : `Sin personas: ${s.error}`;
    $('face-chip').dataset.state = s.listo ? 'ok' : 'warn';
  } catch {
    $('face-chip').textContent = 'El reconocimiento facial no está corriendo: ./x2 rostro';
    $('face-chip').dataset.state = 'off';
  }
}
const showPerson = () => {
  const p = currentPerson(), onCamera = p === cameraPerson;
  $('face-cam').hidden = !onCamera; $('truth').hidden = onCamera;
  clearInterval(facePoll);
  if (onCamera) {
    $('avatar').innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>';
    $('face-in').textContent = 'El robot reconoce la cara con la cámara de este equipo y las personas registradas en Supabase.';
    faceCam.start().catch((err) => { $('face-chip').textContent = `Sin cámara: ${err.message}`; $('face-chip').dataset.state = 'off'; });
    showFaceStatus(); facePoll = setInterval(showFaceStatus, 10000);
    editor.previewVars = { ...editor.previewVars, name: 'la persona reconocida' };
    return;
  }
  faceCam.stop();
  $('avatar').textContent = p.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  $('face-in').textContent = `La cámara (simulada) lo ve como ${p.face.isMember ? 'miembro' : 'no miembro'}, con ${Math.round(p.face.confidence * 100)} % de confianza.`;
  $('truth').textContent = `En el dataset es: ${p.truth}.`;
  // Con este visitante se muestra cómo sonará lo que dice el robot
  const ev = (workspace.events ?? []).find((x) => x.active !== false);
  editor.previewVars = { name: p.name, category: p.truth, event: ev?.name ?? 'su evento', place: ev?.place ?? 'Terraza', area: 'Operaciones' };
  if (editor.selected?.kind === 'node') editor.renderInspector();
};
$('person').onchange = showPerson; showPerson();

// eventos
$('btn-events').onclick = () => {
  const dialog = $('events-dialog');
  openEvents(dialog, workspace, {
    onChange: saveWorkspace,
    onReset: () => { workspace = structuredClone(defaultWorkspace); editor.workspace = workspace; saveWorkspace(); dialog.close(); $('btn-events').click(); },
  });
};

// lugares a los que el robot puede guiar
$('btn-places').onclick = () => {
  const dialog = $('places-dialog');
  openPlaces(dialog, workspace, {
    onChange: () => { saveWorkspace(); editor.renderInspector(); drawLiveMap(); },
    onReset: () => { workspace.places = structuredClone(defaultWorkspace.places ?? []); saveWorkspace(); dialog.close(); $('btn-places').click(); },
    robotUrl: $('robot-kind').value === 'mujoco' ? $('robot-url').value : null,
  });
};

// guardar / cargar flujo
$('btn-save').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(editor.flow, null, 2)], { type: 'application/json' }));
  a.download = ($('flow-name').value || 'flujo') + '.json'; a.click();
};
$('btn-load').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  loadFlow(JSON.parse(await f.text())); editor.onChange(); e.target.value = '';
};
async function openExample(url) { loadFlow(await getJSON(url)); editor.onChange(); }
document.querySelector('.file-menu').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.example) openExample(b.dataset.example);
  if (b.id === 'btn-clear') { loadFlow({ name: 'Flujo nuevo', nodes: [], edges: [] }); editor.onChange(); }
  document.querySelector('.file-menu').open = false;
};
addEventListener('pointerdown', (e) => { // el menú Archivo se cierra al hacer clic afuera
  const menu = document.querySelector('.file-menu');
  if (menu.open && !menu.contains(e.target)) menu.open = false;
  if (!$('review-pop').hidden && !$('review-pop').contains(e.target) && e.target !== $('btn-review')) $('review-pop').hidden = true;
});

// robot: simulador web o puente a MuJoCo
const setConn = (state) => { $('robot-conn').dataset.state = state; };
$('robot-kind').onchange = () => {
  $('robot-url').hidden = $('robot-kind').value !== 'mujoco';
  $('robot-status').textContent = '';
  startMapMonitor();
};
$('robot-url').onchange = () => startMapMonitor();

// Mapa en vivo: con MuJoCo, la posición real del robot (pedida al puente dos veces por segundo);
// con el simulador web, el robot aparece en el lugar al que guía.
const live = { pose: null, target: null, monitor: null, poll: null, retry: null, fallen: false };
const homePose = () => {
  const r = workspace.places.find((p) => p.name === 'Recepción');
  return { x: +r?.x || 0, y: +r?.y || 0, heading: 0 };
};
function drawLiveMap() { drawPlan($('live-map'), { places: workspace.places, robot: live.pose, target: live.target, fallen: live.fallen }); }
function setMapStatus(real, text) {
  $('map-mode').className = `mode ${real ? 'real' : 'sim'}`;
  $('map-mode').textContent = real ? 'Posición real' : 'Simulado';
  $('map-status').textContent = text;
}
// Aviso arriba de todo cuando el robot está en el suelo (en la simulación además se levanta solo)
function showFall(p, canStandUp) {
  const fallen = p.height != null && p.height < 0.4;
  live.fallen = fallen || !!p.recovering;
  $('fall-alert').hidden = !live.fallen;
  $('fall-alert').classList.toggle('is-recovering', !!(p.recovering || live.standingUp));
  $('fall-text').textContent = p.recovering ? 'El robot se cayó y se está levantando solo.'
    : live.standingUp ? 'Levantando al robot.' : 'El robot está en el suelo.';
  $('btn-standup').hidden = !(fallen && !p.recovering && canStandUp);
  $('btn-standup').disabled = !!live.standingUp;
}
async function startMapMonitor() {
  clearInterval(live.poll); clearTimeout(live.retry); live.monitor?.close(); live.monitor = null;
  $('fall-alert').hidden = true; live.fallen = false;
  if ($('robot-kind').value !== 'mujoco') {
    setConn('sim');
    live.pose = homePose();
    setMapStatus(false, 'Robot simulado en la web: aparece en el lugar al que guía.');
    drawLiveMap(); return;
  }
  setConn('connecting');
  setMapStatus(false, 'Conectando con el robot en MuJoCo.');
  const monitor = new MujocoBridgeRobot({}, { url: $('robot-url').value });
  try { await monitor.connect(); } catch (err) {
    setConn('off');
    setMapStatus(false, `${err.message}. Se vuelve a intentar en 5 s; revise que el puente esté corriendo (./x2 pibot).`);
    live.retry = setTimeout(startMapMonitor, 5000); return;
  }
  setConn('live');
  $('robot-kind').options[1].text = monitor.real ? 'AgiBot X2 real' : 'AgiBot X2 en MuJoCo';
  if (!monitor.can('pose')) { setMapStatus(false, 'Este puente no informa la posición del robot.'); return; }
  live.monitor = monitor;
  live.poll = setInterval(async () => {
    const p = await monitor.pose().catch(() => null);
    if (!p) { if (!monitor.ws) startMapMonitor(); return; } // el puente se reinició: volver a conectar
    live.pose = p;
    showFall(p, monitor.can('stand_up'));
    setMapStatus(true, live.fallen ? $('fall-text').textContent
      : live.target ? `Guiando a ${live.target}.` : whereIs(p));
    drawLiveMap();
  }, 500);
}
// "En Recepción" si está junto a un lugar; si no, su posición
function whereIs(p) {
  const near = workspace.places.map((pl) => ({ pl, d: Math.hypot(+pl.x - p.x, +pl.y - p.y) })).sort((a, b) => a.d - b.d)[0];
  return near && near.d < 0.8 ? `En ${near.pl.name}.` : `Caminando, en x ${p.x.toFixed(1)} m, y ${p.y.toFixed(1)} m.`;
}
$('btn-standup').onclick = async () => {
  if (!live.monitor) return;
  live.standingUp = true; $('btn-standup').disabled = true;
  try { await live.monitor.standUp(); } catch (err) { $('fall-text').textContent = err.message; }
  live.standingUp = false;
};

// Cómo se simula cada forma de respuesta del visitante: qué se le muestra y qué "trae" cada persona del dataset.
const KINDS = {
  code: { label: 'Código de acceso o QR (simulado: teclado o lector)', skip: 'No tengo código', value: (p) => p.code },
  document: { label: 'Cédula o carné (simulado: lector)', skip: 'No lo traigo', value: (p) => p.document },
  name: { label: 'Nombre (simulado: voz)', skip: 'Prefiero no decirlo', value: (p) => p.name },
  destination: { label: 'A dónde se dirige o área de trabajo (simulado: voz)', skip: 'Prefiero no decirlo', value: (p) => p.destination },
  request: { label: 'Lo que pide el visitante (simulado: voz)', skip: 'No quiero nada', value: (p) => p.request },
};
const show = (el, on) => { el.hidden = !on; };

// Voz del robot en voz alta con el navegador (simulada: el robot real usa su propia voz)
const VOICE_KEY = 'pibot.voice.v1';
$('voice').checked = localStorage.getItem(VOICE_KEY) !== 'off';
$('voice').onchange = () => {
  localStorage.setItem(VOICE_KEY, $('voice').checked ? 'on' : 'off');
  if (!$('voice').checked) window.speechSynthesis?.cancel();
};
function say(text) {
  if (!$('voice').checked || !window.speechSynthesis) return null;
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('es'));
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'es-ES';
    // Algunos navegadores no avisan cuándo termina una frase larga: se sigue igual tras un tiempo prudente
    const timer = setTimeout(resolve, 1500 + text.length * 90);
    u.onend = u.onerror = () => { clearTimeout(timer); resolve(); };
    speechSynthesis.speak(u);
  });
}

// La conversación: lo último que dijo el robot se ve grande; lo que responde el visitante, a la derecha
function addBubble(text, { visitor = false } = {}) {
  $('bubbles').querySelector('.stage-empty')?.remove();
  if (!visitor) $('bubbles').querySelectorAll('.is-last').forEach((b) => b.classList.remove('is-last'));
  const b = document.createElement('div');
  b.className = visitor ? 'bubble visitor-says' : 'bubble is-last';
  b.textContent = text; $('bubbles').append(b);
  $('bubbles').scrollTop = 1e6;
}

// visit: lo que se anota de cada llegada para el registro de visitas (a dónde se guió)
const robotUI = (visit = null) => ({
  onSpeak: (t) => {
    $('robot').classList.add('speaking'); setTimeout(() => $('robot').classList.remove('speaking'), 300 + t.length * 18);
    addBubble(t);
    return say(t); // el robot espera a terminar la frase antes de seguir
  },
  onNavigate: (dest) => {
    visit?.routes.push(dest); show($('route'), true); $('route').textContent = `Guiando a ${dest}`;
    $('robot').classList.add('guiding');
    const place = placeFor(dest, workspace.places);
    live.target = place?.name ?? null;
    if (place && $('robot-kind').value !== 'mujoco') live.pose = { x: +place.x, y: +place.y, heading: 0 };
    drawLiveMap();
  },
  onGesture: (name) => {
    show($('gesture'), true); $('gesture').textContent = `Gesto: ${name}`;
    $('robot').classList.add('gesturing'); setTimeout(() => { $('robot').classList.remove('gesturing'); show($('gesture'), false); }, 1000);
  },
  onShow: ({ title, text }) => {
    show($('screen'), true); $('screen').querySelector('strong').textContent = title; $('screen').querySelector('span').textContent = text;
  },
  // interpret (solo si el puente tiene LLM): el visitante también puede responder con sus palabras
  onChoose: (q, options, { interpret } = {}) => new Promise((resolve) => {
    const box = $('choices').querySelector('.choice-list'), free = $('choose-free'), note = $('choose-note');
    const finish = (o, said = o) => { show($('choices'), false); addBubble(said, { visitor: true }); resolve(o); };
    box.innerHTML = ''; note.textContent = '';
    options.forEach((o) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = o; b.onclick = () => finish(o); box.append(b); });
    show(free, !!interpret);
    if (interpret) {
      $('choose-text').value = '';
      free.onsubmit = async (e) => {
        e.preventDefault();
        const text = $('choose-text').value.trim(); if (!text) return;
        note.textContent = 'Interpretando…';
        const o = await interpret(text).catch(() => null);
        if (o) finish(o, `«${text}» (entendido: ${o})`);
        else note.textContent = `No le entendí "${text}". Dígalo de otra forma o toque una opción.`;
      };
    }
    show($('choices'), true);
    box.querySelector('button')?.focus({ preventScroll: true });
  }),
  onAsk: (q, { kind = 'code' } = {}) => new Promise((resolve) => {
    const k = KINDS[kind], form = $('ask'), input = $('ask-input');
    $('ask-label').textContent = k.label; $('ask-skip').textContent = k.skip;
    show(form, true); input.value = k.value(currentPerson()) ?? ''; input.focus();
    const done = (v) => { show(form, false); addBubble(v ? v : k.skip, { visitor: true }); resolve(v); };
    form.onsubmit = (e) => { e.preventDefault(); done(input.value); };
    $('ask-skip').onclick = () => done(null);
  }),
});

async function makeRobot(visit) {
  if ($('robot-kind').value !== 'mujoco') return new SimulatorRobot(robotUI(visit));
  const robot = new MujocoBridgeRobot(robotUI(visit), { url: $('robot-url').value, places: workspace.places });
  try {
    await robot.connect();
    $('robot-status').textContent = robot.llm ? 'Conectado a MuJoCo. Entiende respuestas con palabras propias.' : 'Conectado a MuJoCo.';
  }
  catch (err) { $('robot-status').textContent = `${err.message}. Se usa solo el robot simulado en la web.`; }
  return robot;
}

// Reiniciar el día: las reservas y la hora vuelven a como empezó la demostración
$('btn-reset-day').onclick = () => {
  workspace.resources = structuredClone(defaultWorkspace.resources ?? []);
  if (defaultWorkspace.clock) workspace.clock = structuredClone(defaultWorkspace.clock);
  saveWorkspace(); $('robot-status').textContent = 'Las reservas del día volvieron a empezar.';
};

// Recibir al visitante: ejecuta el flujo con la persona elegida
let running = false;
$('btn-run').onclick = async () => {
  if (running) return;
  running = true; $('btn-run').disabled = true; $('btn-run').querySelector('span').textContent = 'Atendiendo…';
  if (document.body.dataset.view === 'flow') setPane('test');
  editor.clearRun();
  window.speechSynthesis?.cancel();
  live.target = null;
  if ($('robot-kind').value !== 'mujoco') live.pose = homePose();
  drawLiveMap();
  $('bubbles').innerHTML = ''; $('log').innerHTML = '';
  ['route', 'ask', 'screen', 'choices', 'gesture'].forEach((id) => show($(id), false));
  $('robot').classList.remove('guiding');
  $('inbox').innerHTML = '<li class="hint">Nadie ha pedido ayuda.</li>';
  const person = currentPerson();
  $('stage-name').textContent = `Atendiendo a ${person.name}`;
  const t0 = performance.now();
  const log = (m) => {
    const li = document.createElement('li');
    li.innerHTML = `<time>${((performance.now() - t0) / 1000).toFixed(1)} s</time><span></span>`;
    li.lastChild.textContent = m.replace(/ → out$/, ''); // "out" es la salida única del nodo: no dice nada
    $('log').append(li); $('log').scrollTop = 1e6;
  };
  log(`Llega ${person.name}`);
  const visit = { routes: [], notified: [] };
  const robot = await makeRobot(visit);
  const res = await runFlow(editor.flow, {
    person, robot, workspace, stepDelay: 500,
    hooks: {
      onLog: log,
      onNode: (id, s, info) => { editor.setStatus(id, s, info); if (s === 'running') editor.reveal(id); },
      onEdge: (e) => editor.markEdge(e),
      onNotify: (n) => {
        visit.notified.push(n.to ?? 'Recepción');
        $('inbox').querySelector('.hint')?.remove();
        const li = document.createElement('li'); li.innerHTML = '<b></b><span></span>';
        li.querySelector('b').textContent = n.to ?? 'Recepción'; li.querySelector('span').textContent = n.message; $('inbox').append(li);
      },
      onApprove: (req) => new Promise((resolve) => {
        $('inbox').querySelector('.hint')?.remove();
        const li = document.createElement('li'); li.className = 'approval';
        li.innerHTML = '<b></b><span></span><div><button data-ok="1">Aprobar</button><button>Rechazar</button></div>';
        li.querySelector('b').textContent = `${req.to} debe decidir`; li.querySelector('span').textContent = req.message;
        li.querySelectorAll('button').forEach((btn) => btn.onclick = () => { li.querySelector('div').textContent = btn.dataset.ok ? 'Aprobado' : 'Rechazado'; resolve(!!btn.dataset.ok); });
        $('inbox').append(li);
      }),
    },
  });
  saveWorkspace(); // las reservas de esta llegada las ven las siguientes
  log(res.status === 'ok' ? 'Llegada atendida' : `El flujo falló: ${res.error}`);
  robot.close?.(); // cada llegada abre su propia conexión con el puente
  recordVisit({ person: { ...person, name: res.vars?.name || person.name }, res, ...visit, seconds: (performance.now() - t0) / 1000 });
  if (document.body.dataset.view === 'visits') renderVisits($('visits'));
  live.target = null; drawLiveMap(); // el robot vuelve solo a su puesto
  $('robot').classList.remove('guiding');
  $('stage-name').textContent = 'Robot de recepción';
  running = false; $('btn-run').disabled = false; $('btn-run').querySelector('span').textContent = 'Recibir al visitante';
};

// ---- PIBOT servido por el robot (runtime/robot-runtime.mjs): el flujo corre allá; aquí se publica y se ve en vivo ----
const onRobot = await fetch('api/robot', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null), () => null);
if (onRobot?.runtime) {
  // Lo que está publicado en el robot es lo que se edita
  const published = await fetch('api/flow', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  if (published?.flow) { workspace = published.workspace ?? workspace; editor.workspace = workspace; loadFlow(published.flow); history.last = JSON.stringify(editor.flow); }
}
refreshCanvasState();
setView(['flow', 'live', 'visits'].includes(localStorage.getItem(VIEW_KEY)) ? localStorage.getItem(VIEW_KEY) : 'flow');
if (onRobot?.runtime) watchRobot(onRobot); else startMapMonitor();

function watchRobot(first) {
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const answer = (id, value) => post('api/answer', { id, value });
  $('robot-kind').innerHTML = '<option value="robot">Este robot</option>';
  $('robot-url').hidden = true;
  $('person').closest('.visitor').hidden = true; $('truth').hidden = true; $('face-cam').hidden = true;
  $('face-in').textContent = 'El robot recibe solo a quien se acerque a su cámara. Con el botón, lo hace ahora mismo.';
  $('bubbles').querySelector('.stage-empty').textContent = 'Esperando a que alguien se acerque al robot.';
  $('btn-publish').hidden = false; $('btn-reset-day').hidden = true;
  // Lugares del robot real: su posición llega en vivo; "Guardar en el robot" publica solo los lugares
  $('btn-places').onclick = () => {
    const dialog = $('places-dialog');
    openPlaces(dialog, workspace, {
      onChange: () => { saveWorkspace(); editor.renderInspector(); drawLiveMap(); },
      onReset: () => { workspace.places = structuredClone(defaultWorkspace.places ?? []); saveWorkspace(); dialog.close(); $('btn-places').click(); },
      getPose: () => live.pose,
      onSaveToRobot: async () => {
        const r = await post('api/publish', { workspace }); // solo los lugares: el flujo publicado no cambia
        if (!r.ok) throw new Error('el robot no aceptó los lugares');
      },
    });
  };
  $('btn-publish').onclick = async () => {
    const r = await post('api/publish', { flow: editor.flow, workspace }).catch(() => null);
    $('robot-status').textContent = r?.ok ? `«${editor.flow.name}» quedó publicado: el robot lo usa con la próxima persona.` : 'No se pudo publicar en el robot.';
    setPane('test');
  };
  $('btn-run').onclick = async () => {
    const r = await post('api/arrival').catch(() => null);
    if (!r?.ok) $('robot-status').textContent = r ? (await r.json()).error : 'El robot no responde.';
  };
  const setStatus = (s) => {
    setConn(s.connected ? 'live' : 'off');
    $('robot-status').textContent = !s.connected ? 'PIBOT está en el robot, pero el puente con su cuerpo no está encendido (./nclub.sh puente).'
      : s.running ? 'Atendiendo a alguien.' : s.paused ? 'En pausa: no recibe a nadie.' : `Esperando a que alguien se acerque. Flujo publicado: «${s.flow}».`;
  };
  setStatus(first);
  let t0 = Date.now();
  const logLine = (m) => {
    $('log').querySelector('.hint')?.remove();
    const li = document.createElement('li');
    li.innerHTML = `<time>${((Date.now() - t0) / 1000).toFixed(1)} s</time><span></span>`;
    li.lastChild.textContent = m.replace(/ → out$/, ''); $('log').append(li); $('log').scrollTop = 1e6;
  };
  const inboxItem = (cls) => {
    $('inbox').querySelector('.hint')?.remove();
    const li = document.createElement('li'); if (cls) li.className = cls; $('inbox').append(li); return li;
  };
  const events = new EventSource('api/events');
  events.onerror = () => setConn('connecting');
  events.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.type === 'status') setStatus(e);
    else if (e.type === 'start') {
      t0 = e.t; editor.clearRun(); $('bubbles').innerHTML = ''; $('log').innerHTML = '';
      ['route', 'ask', 'screen', 'choices', 'gesture'].forEach((id) => show($(id), false));
      $('inbox').innerHTML = '<li class="hint">Nadie ha pedido ayuda.</li>';
      $('stage-name').textContent = 'Atendiendo a quien llegó'; $('robot-status').textContent = 'Atendiendo a alguien.';
      logLine(e.source === 'PIBOT' ? 'Llegada pedida desde PIBOT' : 'Llegó alguien');
      if (document.body.dataset.view === 'flow') setPane('test');
    } else if (e.type === 'speak') {
      addBubble(e.text); $('robot').classList.add('speaking'); setTimeout(() => $('robot').classList.remove('speaking'), 300 + e.text.length * 18);
    } else if (e.type === 'heard') addBubble(e.text, { visitor: true });
    else if (e.type === 'log') logLine(e.text);
    else if (e.type === 'node') { editor.setStatus(e.id, e.status, e.info); if (e.status === 'running') editor.reveal(e.id); }
    else if (e.type === 'edge') editor.markEdge(e.edge);
    else if (e.type === 'navigate') {
      show($('route'), true); $('route').textContent = `Guiando a ${e.destination}`; $('robot').classList.add('guiding');
      live.target = placeFor(e.destination, workspace.places)?.name ?? null; drawLiveMap();
    } else if (e.type === 'gesture') { show($('gesture'), true); $('gesture').textContent = `Gesto: ${e.name}`; setTimeout(() => show($('gesture'), false), 1500); }
    else if (e.type === 'show') { show($('screen'), true); $('screen').querySelector('strong').textContent = e.title; $('screen').querySelector('span').textContent = e.text; }
    else if (e.type === 'notify') { const li = inboxItem(); li.innerHTML = '<b></b><span></span>'; li.querySelector('b').textContent = e.to; li.querySelector('span').textContent = e.message; }
    else if (e.type === 'approve') { // una persona del club decide desde aquí
      const li = inboxItem('approval'); li.dataset.id = e.id;
      li.innerHTML = '<b></b><span></span><div><button data-ok="1">Aprobar</button><button>Rechazar</button></div>';
      li.querySelector('b').textContent = `${e.to} debe decidir`; li.querySelector('span').textContent = e.message;
      li.querySelectorAll('button').forEach((b) => (b.onclick = () => answer(e.id, !!b.dataset.ok)));
    } else if (e.type === 'choose') { // el robot escucha; si no le entiende, alguien toca la opción por el visitante
      const box = $('choices').querySelector('.choice-list'); box.innerHTML = '';
      $('choices').dataset.id = e.id; $('choices').querySelector('small').textContent = 'El robot escucha la respuesta. Si no le entiende, toque la opción por el visitante.';
      e.options.forEach((o) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = o; b.onclick = () => answer(e.id, o); box.append(b); });
      show($('choose-free'), false); show($('choices'), true); $('robot').scrollTop = 1e6;
    } else if (e.type === 'ask') {
      const k = KINDS[e.kind] ?? KINDS.code; $('ask').dataset.id = e.id;
      $('ask-label').textContent = `${k.label.replace(/ \(simulado[^)]*\)/, '')}: el robot escucha; o escríbalo aquí`; $('ask-skip').textContent = k.skip;
      $('ask-input').value = ''; show($('ask'), true); $('robot').scrollTop = 1e6;
      $('ask').onsubmit = (ev) => { ev.preventDefault(); answer(e.id, $('ask-input').value.trim()); };
      $('ask-skip').onclick = () => answer(e.id, '');
    } else if (e.type === 'answered') {
      if ($('choices').dataset.id === e.id) show($('choices'), false);
      if ($('ask').dataset.id === e.id) show($('ask'), false);
      const li = $('inbox').querySelector(`li[data-id="${e.id}"] div`); if (li) li.textContent = 'Respondido';
    } else if (e.type === 'pose') {
      live.pose = { x: e.x, y: e.y, heading: e.heading };
      setMapStatus(true, live.target ? `Guiando a ${live.target}.` : whereIs(e)); drawLiveMap();
    } else if (e.type === 'end') {
      logLine(e.status === 'ok' ? 'Llegada atendida' : `El flujo falló: ${e.error}`);
      if (e.visit) { addVisit(e.visit); if (document.body.dataset.view === 'visits') renderVisits($('visits')); }
      live.target = null; show($('route'), false); $('robot').classList.remove('guiding');
      $('stage-name').textContent = 'Robot de recepción'; drawLiveMap();
      fetch('api/robot').then((r) => r.json()).then(setStatus, () => {});
    }
  };
}
