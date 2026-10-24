// Prueba del adaptador MuJoCo con un WebSocket falso que confirma cada comando.
import { MujocoBridgeRobot } from '../src/robot/mujoco-bridge.js';

const sent = [];
globalThis.WebSocket = class {
  constructor() { setTimeout(() => this.onopen?.(), 0); }
  send(raw) {
    const m = JSON.parse(raw); sent.push(m);
    const reply = { id: m.id, ok: m.cmd !== 'navigate' || m.destination !== 'FALLA' };
    if (m.cmd === 'hello') Object.assign(reply, { capabilities: ['interpret', 'places', 'pose'], llm: true });
    if (m.cmd === 'interpret') reply.option = m.text.includes('almorzar') ? 'Restaurante' : 'Inventada';
    if (m.cmd === 'pose') Object.assign(reply, { x: 1.5, y: -2, heading: 90 });
    setTimeout(() => this.onmessage?.({ data: JSON.stringify(reply) }), 5);
  }
  close() {}
};
const spoken = [];
let elegido = null;
const ui = {
  onSpeak: (t) => spoken.push(t),
  // la UI recibe la función para interpretar palabras propias cuando el puente tiene LLM
  onChoose: async (q, options, { interpret } = {}) => (elegido = interpret ? await interpret('quiero almorzar') : null),
};
const robot = new MujocoBridgeRobot(ui, { timeoutMs: 500, places: [{ name: 'Salón VIP', x: -2.9, y: 2.4 }] });
await robot.connect();
await robot.speak('Hola');
await robot.navigate('Salón VIP');
const answer = await robot.ask('¿Código?'); // sin UI de respuesta -> null
let err = null; try { await robot.navigate('FALLA'); } catch (e) { err = e.message; }
const choice = await robot.choose('¿Qué desea?', ['Restaurante', 'Gimnasio'], { hints: { Restaurante: 'comer, cenar' } });
const hintsSent = sent.find((m) => m.cmd === 'interpret')?.hints?.Restaurante === 'comer, cenar';
const inventada = await robot.interpret('¿Qué desea?', ['Restaurante', 'Gimnasio'], 'otra cosa'); // opción fuera de la lista -> null
const pose = await robot.pose();
const acts = sent.filter((m) => !['hello', 'places', 'interpret', 'pose'].includes(m.cmd));
console.log(JSON.stringify(sent));
const ok = acts[0].cmd === 'speak' && acts[1].destination === 'Salón VIP' && sent.some((m) => m.text === '¿Código?')
  && answer === null && err === 'MuJoCo rechazó la acción'
  && sent[0].cmd === 'hello' && sent.some((m) => m.cmd === 'places' && m.places[0].name === 'Salón VIP')
  && robot.llm && choice === 'Restaurante' && elegido === 'Restaurante' && inventada === null && hintsSent
  && pose?.x === 1.5 && spoken.length === 3;
console.log(ok ? 'OK puente MuJoCo' : 'FALLA puente MuJoCo');
process.exit(ok ? 0 : 1);
