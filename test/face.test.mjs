// Prueba del reconocimiento facial real ("Persona frente a la cámara") dentro de los flujos: la cara dice quién es,
// pero la categoría sin segunda señal solo la da a un miembro. A un invitado, al personal o a un trabajador registrado
// en Supabase igual se le pide su código o su carné, como en el club, y el robot ya sabe su nombre.
import { readFileSync } from 'node:fs';
import '../src/nodes/index.js';
import { runFlow } from '../src/core/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const workspace = read('../data/club.json');
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${msg}`); if (!ok) fails++; };

async function visit(flowPath, face, answers = {}) {
  const said = [], asked = [], routes = [];
  const person = { id: 'camera', name: 'quien está frente a la cámara',
    camera: async () => ({ status: 'identified', similarity: 0.71, person: face }) };
  const robot = {
    speak: async (t) => said.push(t),
    ask: async (q, { kind = 'code' } = {}) => { asked.push(kind); return answers[kind] ?? null; },
    choose: async (q, options) => options.find((o) => o === answers.choice) ?? options[0],
    show: async (c) => said.push(`${c.title} ${c.text}`), gesture: async () => {}, navigate: async (d) => routes.push(d),
  };
  const r = await runFlow(read(`../${flowPath}`), { person, robot, workspace: structuredClone(workspace),
    hooks: { onNotify: () => {}, onApprove: async () => true } });
  return { port: r.trace[0].port, said: said.join(' | '), asked, routes, name: r.vars.name };
}

const conv = 'flows/recepcion-conversacional.json', demo = 'flows/demostracion.json';
let v = await visit(conv, { name: 'Camila Restrepo', category: 'member_vip' });
check(v.port === 'VIP' && !v.asked.length && /Camila Restrepo/.test(v.said), 'miembro VIP: la cara y la lista bastan, no le pregunta nada');
v = await visit(conv, { name: 'Laura Giraldo', category: 'guest' });
check(v.port === 'Necesita ayuda' && v.asked.includes('code'), 'invitado sin código: la cara sola no basta');
v = await visit(conv, { name: 'Laura Giraldo', category: 'guest' }, { code: 'FIESTA-27' });
check(v.port === 'Invitado' && v.name === 'Laura Giraldo' && /Cumpleaños de Valeria/.test(v.said) && !/ a \. /.test(v.said),
  'invitado con código: lo saluda por el nombre que dio la cara y conoce su evento');
v = await visit(conv, { name: 'Jorge Pineda', category: 'staff' }, { code: 'PERSONAL-41' });
check(v.port === 'Personal del club' && v.name === 'Jorge Pineda' && /Hoy le esperan en \w/.test(v.said), 'personal: con su código, el robot sabe su área');
v = await visit(demo, { name: 'Rafael Salcedo', category: 'guest' }, { choice: 'Vengo a un evento', code: 'FIESTA-27' });
check(v.port === 'Invitado' && !v.asked.includes('name') && v.routes.at(-1)?.startsWith('Terraza'),
  'demostración: con la cara ya no le pregunta el nombre, solo el código de la lista');
v = await visit(demo, { name: 'Pedro Colado', category: 'guest' }, { choice: 'Vengo a un evento', code: 'FIESTA-27' });
check(v.port === 'Necesita ayuda' && /No encuentro su nombre en la lista/.test(v.said), 'demostración: reconocido, pero no está en la lista del evento');

v = await visit(demo, { name: 'Adriana Galbán', category: 'guest' }, { choice: 'Sí, a las 5 pm' });
check(v.port === 'VIP' && /entrenar en el gimnasio/.test(v.said), 'la lista del club manda: en Supabase dice invitada, en Membresías es VIP');
v = await visit(demo, { name: 'Fermín Escalona', category: 'member_vip' }, { choice: 'Soy del personal del club', document: '5050505050' });
check(v.port === 'Personal del club', 'VIP en Supabase pero no en Membresías: sigue con su carné y queda como personal');

console.log(fails ? `${fails} fallos` : 'todos correctos');
process.exit(fails ? 1 : 0);
