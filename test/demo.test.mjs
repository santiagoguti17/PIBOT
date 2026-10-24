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
  const out = { said: [], routes: [], notes: [], shown: [], gestures: [] };
  const choices = [...(p.choices ?? [])];
  const robot = {
    speak: async (t) => out.said.push(t),
    ask: async (q, { kind = 'code' } = {}) => { out.said.push(q); return p[kind] ?? null; },
    choose: async (q, options) => { out.said.push(q); const c = choices.shift(); return options.includes(c) ? c : null; },
    show: async (c) => out.shown.push(c), gesture: async (g) => out.gestures.push(g), navigate: async (d) => out.routes.push(d),
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
check(r.res.trace.find((t) => t.type === 'visitor.identify').port === 'VIP', '1. Adriana se reconoce como VIP');
check(/le gusta entrenar en el gimnasio a las 3 pm/.test(r.said) && /mantenimiento de las máquinas/.test(r.said), '1. el robot conoce su hábito y le dice que hay mantenimiento');
check(/¿Le reprogramo a las 5 pm\?/.test(r.said), '1. le propone reprogramar a las 5 pm');
check(gym(ws).bookings.some((b) => b.time === '17:00' && b.holder === 'Adriana Galbán' && b.category === 'VIP') && /queda reservado el gimnasio a las 5 pm/.test(r.said), '1. queda reservado a las 5 pm a su nombre');
check(r.routes.at(-1) === 'Salón VIP', '1. mientras espera la acompaña al Salón VIP');

// 2. Regular: pide el gimnasio a las 5 pm; ya lo tiene la VIP y no hay más horarios; elige la clase de yoga
r = await receive(ws, person('Santiago Urrego'));
check(r.res.trace.find((t) => t.type === 'visitor.identify').port === 'Regular', '2. Santiago Urrego se reconoce como regular');
check(/ya la reservó un miembro VIP/.test(r.said) && /no quedan más horarios de gimnasio/.test(r.said), '2. le dice que la reservó un miembro VIP y que no hay más gimnasio hoy');
check(/más opciones: la clase de yoga o la mesa en el restaurante/.test(r.said), '2. le ofrece dos opciones más (yoga en la terraza y una mesa en el restaurante)');
check(!/Adriana/.test(r.said), '2. no revela el nombre del miembro VIP');
check(gym(ws).bookings.length === 1 && ws.resources.find((x) => x.name === 'Clase de yoga').bookings[0]?.holder === 'Santiago Urrego', '2. reserva el yoga a su nombre y el gimnasio sigue siendo de Adriana');

// 3. Invitado: nombre + código del evento
r = await receive(ws, person('Rafael Salcedo'));
check(r.res.trace.find((t) => t.type === 'visitor.identify').port === 'Invitado' && /código de entrada.*su nombre/.test(r.said) && !/área/.test(r.said), '3. pide el código y el nombre, nada más (el área es solo para los trabajos)');
check(r.routes.at(-1) === 'Terraza, piso 4' && /coinciden con la lista de Cumpleaños de Valeria/.test(r.said), '3. nombre y código coinciden: lo lleva a su evento');
let bad = person('Rafael Salcedo'); bad.name = 'Pedro Colado';
r = await receive(ws, bad);
check(r.res.trace.find((t) => t.type === 'visitor.identify').port === 'Necesita ayuda' && /no está en la lista de Cumpleaños/.test(r.res.trace.find((t) => t.type === 'visitor.identify').data.reason) && r.notes.length === 1, '3. código bueno con un nombre que no está en la lista: pasa a recepción');
bad = person('Rafael Salcedo'); bad.code = 'FIESTA-000';
check((await receive(ws, bad)).res.trace.find((t) => t.type === 'visitor.identify').port === 'Necesita ayuda', '3. nombre en la lista con un código que no es: pasa a recepción');

// 4. Personal: reunión en el restaurante, llega tarde, parte del día
r = await receive(ws, person('Fermín Escalona'));
check(r.res.trace.find((t) => t.type === 'visitor.identify').port === 'Personal del club' && r.res.trace.find((t) => t.type === 'visitor.identify').data.via.includes('documento'), '4. Fermín se confirma con su carné');
check(/ya van 30 minutos/.test(r.said) && /Reunión de coordinación en Restaurante/.test(r.said), '4. sabe de su reunión y que va 30 minutos tarde');
check(/grupo grande a la hora del almuerzo/.test(r.said) && /mantenimiento de las máquinas del gimnasio/.test(r.said) && /cumpleaños de Valeria/.test(r.said), '4. le da el parte del día, con el mantenimiento y la fiesta');
check(r.routes.at(-1) === 'Restaurante', '4. lo acompaña al restaurante');

// 5. Trabajador externo: nombre + área + código
r = await receive(ws, person('Santiago Gutiérrez'));
check(r.res.trace.find((t) => t.type === 'visitor.identify').port === 'Trabajador externo' && r.routes.at(-1) === 'Acceso de servicio → Gimnasio' && /código de entrada.*su nombre.*área/.test(r.said), '5. código, nombre y área coinciden: entra por el acceso de servicio al gimnasio');
bad = person('Santiago Gutiérrez'); bad.destination = 'Spa';
r = await receive(ws, bad);
check(r.res.trace.find((t) => t.type === 'visitor.identify').port === 'Necesita ayuda' && /el trabajo es en Gimnasio/.test(r.res.trace.find((t) => t.type === 'visitor.identify').data.reason), '5. dice ir a otra área: no entra');
bad = person('Santiago Gutiérrez'); bad.name = 'Rafael Salcedo';
check((await receive(ws, bad)).res.trace.find((t) => t.type === 'visitor.identify').port === 'Necesita ayuda', '5. un nombre que no es de los trabajadores: no entra');
bad = person('Santiago Gutiérrez'); bad.destination = 'el gimnasio';
check((await receive(ws, bad)).res.trace.find((t) => t.type === 'visitor.identify').port === 'Trabajador externo', '5. «el gimnasio» y «Gimnasio» son la misma área');

// Saluda con la mano a todos al llegar, antes de identificarlos (y una sola vez)
for (const name of ['Adriana Galbán', 'Santiago Urrego', 'Rafael Salcedo', 'Fermín Escalona', 'Santiago Gutiérrez', 'Nadia Torres']) {
  const g = await receive(fresh(), person(name));
  check(g.res.trace[0].type === 'robot.gesture' && g.gestures.join() === 'saludar', `saluda a ${name} al llegar, una vez`);
}

// Si se vuelve a empezar el día, Santiago Urrego sí consigue su hora... con otra persona que la tenga libre
const day2 = fresh();
r = await receive(day2, person('Santiago Urrego'));
check(gym(day2).bookings[0]?.holder === 'Santiago Urrego' && gym(day2).bookings[0].time === '17:00', 'sin la reprogramación del VIP, Santiago Urrego consigue el gimnasio a las 5 pm');

console.log(fails ? `\n${fails} fallos` : '\ntodos correctos');
process.exit(fails ? 1 : 0);
