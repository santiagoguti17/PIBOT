import '../nodes/index.js';
import { runFlow } from '../core/engine.js';
import { SimulatorRobot } from '../robot/simulator.js';
import { MujocoBridgeRobot } from '../robot/mujoco-bridge.js';
import { Editor } from './editor.js';
import { openEvents } from './events.js';

const $ = (id) => document.getElementById(id);
const FLOW_KEY = 'pibot.flow.v4', WS_KEY = 'pibot.workspace.v1';
const getJSON = async (url) => (await fetch(url)).json();
const people = await getJSON('data/people.json');
const defaultFlow = await getJSON('flows/recepcion-personalizada.json');
const defaultWorkspace = await getJSON('data/club.json');
const stored = (k) => JSON.parse(localStorage.getItem(k) ?? 'null');

let workspace = stored(WS_KEY) ?? structuredClone(defaultWorkspace);
const saveWorkspace = () => localStorage.setItem(WS_KEY, JSON.stringify(workspace));

const editor = new Editor({ canvas: $('canvas'), svg: $('edges'), palette: $('palette'), inspector: $('inspector') });
editor.workspace = workspace;
const loadFlow = (flow) => { editor.load(flow); $('flow-name').value = editor.flow.name; requestAnimationFrame(() => editor.fit()); };
loadFlow(stored(FLOW_KEY) ?? defaultFlow);
editor.onChange = () => { editor.flow.name = $('flow-name').value; localStorage.setItem(FLOW_KEY, JSON.stringify(editor.flow)); };
$('flow-name').oninput = editor.onChange;
$('z-in').onclick = () => editor.setZoom(editor.zoom + 0.1);
$('z-out').onclick = () => editor.setZoom(editor.zoom - 0.1);
$('z-fit').onclick = () => editor.fit();

// visitantes
people.forEach((p) => $('person').add(new Option(p.name, p.id)));
const currentPerson = () => people.find((x) => x.id === $('person').value);
const showPerson = () => {
  const p = currentPerson();
  $('avatar').textContent = p.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  $('face-in').textContent = `Entrada simulada de la cámara: ${p.face.isMember ? 'miembro' : 'no miembro'}, confianza ${Math.round(p.face.confidence * 100)} %`;
  $('truth').textContent = `Categoría real (solo demostrador): ${p.truth}`;
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
$('example').onchange = async () => {
  if (!$('example').value) return;
  loadFlow(await getJSON($('example').value)); editor.onChange(); $('example').value = '';
};

// robot: simulador web o puente a MuJoCo
$('robot-kind').onchange = () => {
  $('robot-url').hidden = $('robot-kind').value !== 'mujoco';
  $('robot-status').textContent = '';
};

// Cómo se simula cada forma de respuesta del visitante: qué se le muestra y qué "trae" cada persona del dataset.
const KINDS = {
  code: { label: 'Código de acceso o QR (simulado: teclado o lector)', skip: 'No tengo código', value: (p) => p.code },
  document: { label: 'Cédula o carné (simulado: lector)', skip: 'No lo traigo', value: (p) => p.document },
  name: { label: 'Nombre (simulado: voz)', skip: 'Prefiero no decirlo', value: (p) => p.name },
};
const show = (el, on) => { el.hidden = !on; };

const robotUI = () => ({
  onSpeak: (t) => {
    $('robot').classList.add('speaking'); setTimeout(() => $('robot').classList.remove('speaking'), 300 + t.length * 18);
    $('bubbles').querySelector('.stage-empty')?.remove();
    const b = document.createElement('div'); b.className = 'bubble'; b.textContent = t; $('bubbles').append(b);
  },
  onNavigate: (dest) => { show($('route'), true); $('route').textContent = `Guiando a: ${dest}`; },
  onGesture: (name) => {
    show($('gesture'), true); $('gesture').textContent = `Gesto: ${name}`;
    $('robot').classList.add('gesturing'); setTimeout(() => { $('robot').classList.remove('gesturing'); show($('gesture'), false); }, 1000);
  },
  onShow: ({ title, text }) => {
    show($('screen'), true); $('screen').querySelector('strong').textContent = title; $('screen').querySelector('span').textContent = text;
  },
  onChoose: (q, options) => new Promise((resolve) => {
    const box = $('choices').querySelector('div'); box.innerHTML = '';
    options.forEach((o) => { const b = document.createElement('button'); b.textContent = o; b.onclick = () => { show($('choices'), false); resolve(o); }; box.append(b); });
    show($('choices'), true);
  }),
  onAsk: (q, { kind = 'code' } = {}) => new Promise((resolve) => {
    const k = KINDS[kind], form = $('ask'), input = $('ask-input');
    $('ask-label').textContent = k.label; $('ask-skip').textContent = k.skip;
    show(form, true); input.value = k.value(currentPerson()) ?? ''; input.focus();
    const done = (v) => { show(form, false); resolve(v); };
    form.onsubmit = (e) => { e.preventDefault(); done(input.value); };
    $('ask-skip').onclick = () => done(null);
  }),
});

async function makeRobot() {
  if ($('robot-kind').value !== 'mujoco') return new SimulatorRobot(robotUI());
  const robot = new MujocoBridgeRobot(robotUI(), { url: $('robot-url').value });
  try { await robot.connect(); $('robot-status').textContent = 'Conectado a MuJoCo.'; }
  catch (err) { $('robot-status').textContent = `${err.message}. Usando solo el simulador web.`; }
  return robot;
}

// ejecutar llegada
let running = false;
$('btn-run').onclick = async () => {
  if (running) return;
  running = true; $('btn-run').disabled = true;
  editor.clearRun();
  $('bubbles').innerHTML = ''; $('log').innerHTML = '';
  ['route', 'ask', 'screen', 'choices', 'gesture'].forEach((id) => show($(id), false));
  $('inbox').innerHTML = '<li class="hint">Sin avisos.</li>';
  const person = currentPerson();
  const t0 = performance.now();
  const log = (m) => {
    const li = document.createElement('li');
    li.innerHTML = `<time>${((performance.now() - t0) / 1000).toFixed(1)} s</time><span></span>`;
    li.lastChild.textContent = m; $('log').append(li); $('log').scrollTop = 1e6;
  };
  log(`Llega: ${person.name}`);
  const robot = await makeRobot();
  const res = await runFlow(editor.flow, {
    person, robot, workspace, stepDelay: 500,
    hooks: {
      onLog: log,
      onNode: (id, s, info) => editor.setStatus(id, s, info),
      onEdge: (e) => editor.markEdge(e),
      onNotify: (n) => {
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
  log(res.status === 'ok' ? 'Llegada atendida' : `El flujo falló: ${res.error}`);
  running = false; $('btn-run').disabled = false;
};
