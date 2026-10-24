// Prueba de lo que el robot le explica al visitante cuando no puede dejarlo pasar: si su código es de un evento que ya
// finalizó, si el código no existe o si su nombre no está en la lista del evento. Después lo pasa a recepción.
import { readFileSync } from 'node:fs';
import '../src/nodes/index.js';
import { runFlow } from '../src/core/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const workspace = read('../data/club.json');
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${msg}`); if (!ok) fails++; };

async function visit(flowPath, person) {
  const said = [], notes = [], routes = [];
  const robot = {
    speak: async (t) => said.push(t),
    ask: async (q, { kind = 'code' } = {}) => person[kind] ?? null,
    choose: async (q, options) => options.find((o) => /evento/i.test(o)) ?? options[0],
    show: async () => {}, gesture: async () => {}, navigate: async (d) => routes.push(d),
  };
  await runFlow(read(`../${flowPath}`), { person, robot, workspace: structuredClone(workspace),
    hooks: { onNotify: (n) => notes.push(n.message), onApprove: async () => true } });
  return { said: said.join(' '), notes: notes.join(' '), routes };
}
const guest = (name, code) => ({ id: 'x', name, face: { isMember: false, confidence: 0.92 }, code, destination: 'la terraza', request: 'vengo a la fiesta' });

let v = await visit('flows/recepcion-conversacional.json', guest('Sofía Gómez', 'GALA-15'));
check(v.said.includes('Ese código es del evento «Cena de gala», que ya finalizó.') && v.notes.includes('no está vigente'),
  'evento que ya finalizó: se lo dice al visitante y avisa a recepción');
v = await visit('flows/recepcion-conversacional.json', guest('Nadia Torres', 'FIESTA-99'));
check(v.said.includes('No encuentro ese código.') && !v.routes.length, 'código que no existe: se lo dice y no lo guía');
v = await visit('flows/recepcion-conversacional.json', guest('Laura Giraldo', 'fiesta 27'));
check(v.routes.some((r) => r.startsWith('Terraza')), 'el código escrito con espacio en vez de guion también vale');
v = await visit('flows/demostracion.json', guest('Sofía Gómez', 'GALA-15'));
check(v.said.includes('Su invitación es del evento «Cena de gala», que ya finalizó.'), 'demostración: la cara reconoce a una invitada de un evento que ya finalizó');
v = await visit('flows/demostracion.json', guest('Pedro Páramo', 'FIESTA-27'));
check(v.said.includes('No le encuentro en las listas del club.'), 'demostración: una cara que no está en ninguna lista');
v = await visit('flows/recepcion-conversacional.json', guest('Sara Nieto', null));
check(v.said.includes('No le encuentro en las listas del club.') && !v.said.includes('No encuentro ese código') && v.notes, 'una cara que no está en ninguna lista y sin código: se lo dice y lo pasa a recepción');

console.log(fails ? `${fails} fallos` : 'todos correctos');
process.exit(fails ? 1 : 0);
