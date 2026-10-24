// Prueba del adaptador MuJoCo con un WebSocket falso que confirma cada comando.
import { MujocoBridgeRobot } from '../src/robot/mujoco-bridge.js';

const sent = [];
globalThis.WebSocket = class {
  constructor() { setTimeout(() => this.onopen?.(), 0); }
  send(raw) { const m = JSON.parse(raw); sent.push(m); setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id: m.id, ok: m.cmd !== 'navigate' || m.destination !== 'FALLA' }) }), 5); }
};
const spoken = [];
const robot = new MujocoBridgeRobot({ onSpeak: (t) => spoken.push(t) }, { timeoutMs: 500 });
await robot.connect();
await robot.speak('Hola');
await robot.navigate('Salón VIP');
const answer = await robot.ask('¿Código?'); // sin UI de respuesta -> null
let err = null; try { await robot.navigate('FALLA'); } catch (e) { err = e.message; }
console.log(JSON.stringify(sent));
const ok = sent[0].cmd === 'speak' && sent[1].destination === 'Salón VIP' && sent.some((m) => m.text === '¿Código?')
  && answer === null && spoken.length === 2 && err === 'MuJoCo rechazó la acción';
console.log(ok ? 'OK puente MuJoCo' : 'FALLA puente MuJoCo');
process.exit(ok ? 0 : 1);
