// Las cinco personas de la demostración registradas en Supabase (2026-10-24), con la categoría que tienen allí, frente a la cámara real del robot
// en la demostración. Allí las categorías no coinciden con la historia (Adriana figura como invitada, Fermín como VIP):
// la cara dice quién es y la categoría la decide la lista del club, así que cada una sigue su camino de la demostración.
import { readFileSync } from 'node:fs';
import '../src/nodes/index.js';
import { runFlow } from '../src/core/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const workspace = read('../data/club.json');
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${msg}`); if (!ok) fails++; };

// Lo que contesta cada persona, como lo diría frente al robot
async function frenteALaCamara(flowPath, face, answers = {}, ws = structuredClone(workspace)) {
  const said = [], asked = [], routes = [];
  const choices = [...(answers.choices ?? [])];
  const person = { id: 'camera', name: 'quien está frente a la cámara',
    camera: async () => ({ status: 'identified', similarity: 0.62, person: face }) };
  const robot = {
    speak: async (t) => said.push(t),
    ask: async (q, { kind = 'code' } = {}) => { asked.push(kind); return answers[kind] ?? null; },
    choose: async (q, options) => { said.push(q); const c = choices.shift(); return options.includes(c) ? c : null; },
    show: async () => {}, gesture: async () => {}, navigate: async (d) => routes.push(d),
  };
  const r = await runFlow(read(`../${flowPath}`), { person, robot, workspace: ws, hooks: { onNotify: () => {}, onApprove: async () => true } });
  return { port: r.trace[0].port, said: said.join(' | '), asked, routes, name: r.vars.name, ws };
}

const demo = 'flows/demostracion.json';
const ws = structuredClone(workspace); // las reservas del día se comparten entre visitas, como en la demo
let v = await frenteALaCamara(demo, { name: 'Adriana Galbán', category: 'guest' }, { choices: ['Sí, a las 5 pm'] }, ws);
check(v.port === 'VIP' && !v.asked.length && /entrenar en el gimnasio a las 3 pm/.test(v.said) && v.routes.at(-1) === 'Salón VIP',
  'Adriana (invitada en Supabase): VIP por la lista del club, sin preguntarle nada; reprograma y va al Salón VIP');
v = await frenteALaCamara(demo, { name: 'Santiago Urrego', category: 'member_regular' },
  { request: 'Quiero reservar el gimnasio para hoy a las 5 pm', choices: ['Clase de yoga'] }, ws);
check(v.port === 'Regular' && /ya la reservó un miembro VIP/.test(v.said), 'Santiago Urrego: regular; la hora del gimnasio ya la tomó la VIP');
v = await frenteALaCamara(demo, { name: 'Fermín Escalona', category: 'member_vip' },
  { choices: ['Soy del personal del club'], document: '5050505050' }, ws);
check(v.port === 'Personal del club' && v.name === 'Fermín Escalona' && /Reunión de coordinación/.test(v.said),
  'Fermín (VIP en Supabase): no está en Membresías; con su carné queda como personal y recibe su agenda');
v = await frenteALaCamara(demo, { name: 'Rafael Salcedo', category: 'staff' }, { choices: ['Vengo a un evento'], code: 'FIESTA-27' }, ws);
check(v.port === 'Invitado' && !v.asked.includes('name') && v.routes.at(-1)?.startsWith('Terraza'),
  'Rafael (personal en Supabase): invitado con el código; el nombre ya lo sabe por la cara');
v = await frenteALaCamara(demo, { name: 'Santiago Gutiérrez', category: 'member_regular' },
  { choices: ['Vengo a realizar un trabajo'], code: 'OBRA-54', destination: 'el gimnasio' }, ws);
check(v.port === 'Trabajador externo' && v.routes.at(-1) === 'Acceso de servicio → Gimnasio',
  'Santiago Gutiérrez (regular en Supabase): no está en Membresías; con el código y el área entra como trabajador');

// El flujo conversacional, con las mismas personas: nadie se queda sin camino
const conv = 'flows/recepcion-conversacional.json';
for (const [name, category, port] of [['Adriana Galbán', 'guest', 'VIP'], ['Santiago Urrego', 'member_regular', 'Regular'],
  ['Fermín Escalona', 'member_vip', 'Personal del club']]) {
  v = await frenteALaCamara(conv, { name, category }, { code: 'PERSONAL-57', choices: ['Restaurante'] });
  check(v.port === port, `flujo conversacional: ${name} → ${port}`);
}

console.log(fails ? `${fails} fallos` : 'todos correctos');
process.exit(fails ? 1 : 0);
