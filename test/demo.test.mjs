// Demostración N Club: los cinco visitantes en orden, con las reservas del día compartidas entre ellos.
//   node test/demo.test.mjs [-v]   (-v muestra lo que dice el robot)
import { readFileSync } from 'node:fs';
import '../src/nodes/index.js';
import { runFlow } from '../src/core/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const people = read('../data/people.json');
const flow = read('../flows/demostracion.json');
const verbose = process.argv.includes('-v');
const person = (name) => structuredClone(people.find((p) => p.name === name));

// Robot de prueba: responde con lo que "trae" la persona (código, documento, nombre, lo que pide) y con sus opciones en orden
async function receive(workspace, p) {
  const out = { said: [], routes: [], notes: [], shown: [] };
  const choices = [...(p.choices ?? [])];
  const robot = {
    speak: async (t) => out.said.push(t),
    ask: async (q, { kind = 'code' } = {}) => { out.said.push(q); return p[kind] ?? null; },
    choose: async (q, options) => { out.said.push(q); const c = choices.shift(); return options.includes(c) ? c : null; },
    show: async (c) => out.shown.push(c), gesture: async () => {}, navigate: async (d) => out.routes.push(d),
  };
  const res = await runFlow(flow, { person: p, robot, workspace, hooks: { onNotify: (n) => out.notes.push(n.message) } });
  if (verbose) { console.log(`\n== ${p.name}: ${res.trace.map((t) => t.node + (t.port !== 'out' ? `(${t.port})` : '')).join(' → ')}`); out.said.forEach((t) => console.log(`   robot: ${t}`)); out.routes.forEach((d) => console.log(`   guía a: ${d}`)); }
  return { res, ...out, said: out.said.join(' | ') };
}

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${msg}`); if (!ok) fails++; };
const fresh = () => read('../data/club.json');
const gym = (ws) => ws.resources.find((r) => r.name === 'Gimnasio');

const ws = fresh();

// 0. Todo pasa en los lugares del lobby de MuJoCo, y las historias se cruzan: el mantenimiento que mueve a la VIP es el
//    trabajo del técnico, y el parte del día habla de él y de la fiesta del invitado
const places = ws.places.map((p) => p.name);
check(ws.resources.every((r) => places.includes(r.place)) && ws.events.every((e) => places.some((p) => e.place.startsWith(p))),
  '0. las reservas y los eventos son en lugares que ya existen en el lobby de MuJoCo');
const work = ws.events.find((e) => e.codes.some((c) => c.code === person('Santiago Gutiérrez').code));
check(work.place === gym(ws).place && gym(ws).blocks.some((b) => /mantenimiento/.test(b.reason)), '0. el técnico viene a arreglar lo que la VIP no puede usar');

// 1. VIP: su gimnasio de las 3 pm no se puede (mantenimiento de las máquinas); acepta las 5 pm
let r = await receive(ws, person('Adriana Galbán'));
check(r.res.trace[0].port === 'VIP', '1. Adriana se reconoce como VIP');
check(/le gusta entrenar en el gimnasio a las 3 pm/.test(r.said) && /mantenimiento de las máquinas/.test(r.said), '1. el robot conoce su hábito y le dice que hay mantenimiento');
check(/¿Le reprogramo a las 5 pm\?/.test(r.said), '1. le propone reprogramar a las 5 pm');
check(gym(ws).bookings.some((b) => b.time === '17:00' && b.holder === 'Adriana Galbán' && b.category === 'VIP') && /queda reservado el gimnasio a las 5 pm/.test(r.said), '1. queda reservado a las 5 pm a su nombre');
check(r.routes.at(-1) === 'Salón VIP', '1. mientras espera la acompaña al Salón VIP');

// 2. Regular: pide el gimnasio a las 5 pm; ya lo tiene la VIP y no hay más horarios; elige la clase de yoga
r = await receive(ws, person('Santiago Urrego'));
check(r.res.trace[0].port === 'Regular', '2. Santiago Urrego se reconoce como regular');
check(/ya la reservó un miembro VIP/.test(r.said) && /no quedan más horarios de gimnasio/.test(r.said), '2. le dice que la reservó un miembro VIP y que no hay más gimnasio hoy');
check(/más opciones: la clase de yoga o la mesa en el restaurante/.test(r.said), '2. le ofrece dos opciones más (yoga en la terraza y una mesa en el restaurante)');
check(!/Adriana/.test(r.said), '2. no revela el nombre del miembro VIP');
check(gym(ws).bookings.length === 1 && ws.resources.find((x) => x.name === 'Clase de yoga').bookings[0]?.holder === 'Santiago Urrego', '2. reserva el yoga a su nombre y el gimnasio sigue siendo de Adriana');

// 3. Invitado: la cara lo reconoce y está en la lista del evento; no se le pide nada
const asked = (r) => r.res.trace[0].data.via && !/código|carné|nombre|área/.test(r.said.split(' | ').filter((s) => s.includes('?')).join(' '));
r = await receive(ws, person('Rafael Salcedo'));
check(r.res.trace[0].port === 'Invitado' && asked(r), '3. Rafael: la cara basta, no le pide código, carné ni nombre');
check(r.routes.at(-1) === 'Terraza, piso 4' && /está en la lista de Cumpleaños de Valeria/i.test(r.said), '3. está en la lista: lo lleva a su evento');
let bad = person('Rafael Salcedo'); bad.name = 'Pedro Colado';
r = await receive(ws, bad);
check(r.res.trace[0].port === 'Necesita ayuda' && /no está en las listas del club/.test(r.res.trace[0].data.reason) && r.notes.length === 1, '3. una cara que no está en ninguna lista: pasa a recepción');
bad = person('Rafael Salcedo'); bad.face.confidence = 0.5;
check((await receive(ws, bad)).res.trace[0].port === 'Necesita ayuda', '3. la cámara duda: pasa a recepción sin pedirle credenciales');

// 4. Personal: reunión en el restaurante, llega tarde, parte del día
r = await receive(ws, person('Fermín Escalona'));
check(r.res.trace[0].port === 'Personal del club' && r.res.trace[0].data.via.includes('Nómina de personal') && asked(r), '4. Fermín: la cara y la nómina del personal, sin carné');
check(/ya van 30 minutos/.test(r.said) && /Reunión de coordinación en Restaurante/.test(r.said), '4. sabe de su reunión y que va 30 minutos tarde');
check(/grupo grande a la hora del almuerzo/.test(r.said) && /mantenimiento de las máquinas del gimnasio/.test(r.said) && /cumpleaños de Valeria/.test(r.said), '4. le da el parte del día, con el mantenimiento y la fiesta');
check(r.routes.at(-1) === 'Restaurante', '4. lo acompaña al restaurante');

// 5. Trabajador externo: la cara y la orden de trabajo del mantenimiento del gimnasio
r = await receive(ws, person('Santiago Gutiérrez'));
check(r.res.trace[0].port === 'Trabajador externo' && r.routes.at(-1) === 'Acceso de servicio → Gimnasio' && asked(r), '5. Santiago Gutiérrez: la cara y la orden de trabajo; entra por el acceso de servicio al gimnasio');
r = await receive(ws, person('Diego Salazar'));
check(r.res.trace[0].port === 'Necesita ayuda', '5. un trabajador que no figura con su nombre en ninguna orden: no entra');

// Si se vuelve a empezar el día, Santiago Urrego sí consigue su hora... con otra persona que la tenga libre
const day2 = fresh();
r = await receive(day2, person('Santiago Urrego'));
check(gym(day2).bookings[0]?.holder === 'Santiago Urrego' && gym(day2).bookings[0].time === '17:00', 'sin la reprogramación del VIP, Santiago Urrego consigue el gimnasio a las 5 pm');

console.log(fails ? `\n${fails} fallos` : '\ntodos correctos');
process.exit(fails ? 1 : 0);
