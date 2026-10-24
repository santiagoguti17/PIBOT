// Ejecuta un flujo con todas las personas del dataset, sin navegador, y verifica el destino esperado.
//   node test/run-cases.mjs [flows/archivo.json]
import { readFileSync } from 'node:fs';
import '../src/nodes/index.js';
import { runFlow } from '../src/core/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const flowPath = process.argv[2] ?? 'flows/recepcion-personalizada.json';
const people = read('../data/people.json');
const workspace = read('../data/club.json');
const flow = read(`../${flowPath}`);

// Destino esperado por persona ('ESCALA' = termina avisando a recepción). El flujo avanzado usa un umbral de
// confianza y escala al ambiguo; los demás lo resuelven con el nombre dicho (cámara dudosa + nombre).
const base = { p1: 'Salón VIP', p3: 'Terraza', p4: 'Vestier', p5: 'Acceso de servicio', p7: 'ESCALA' };
const expected = flowPath.includes('avanzada') ? { ...base, p2: 'Zona social', p6: 'ESCALA' }
  : /personalizada|conversacional/.test(flowPath) ? { ...base, p2: 'Gimnasio', p6: 'Restaurante' }
  : { ...base, p2: 'Zona social', p6: 'Zona social' };

function harness(person, { approved = true } = {}) {
  const out = { said: [], routes: [], notes: [], extras: [] };
  const robot = {
    speak: async (t) => out.said.push(t),
    ask: async (q, { kind = 'code' } = {}) => { out.said.push(q); return person[kind] ?? null; },
    choose: async (q, options) => { out.said.push(q); return person.choice ?? options[0]; },
    show: async (c) => out.extras.push(`pantalla: ${c.title} / ${c.text}`),
    gesture: async (g) => out.extras.push(`gesto: ${g}`),
    navigate: async (d) => out.routes.push(d),
  };
  const hooks = {
    onNotify: (n) => out.notes.push(`${n.to}: ${n.message}`),
    onApprove: async (r) => { out.extras.push(`aprobación (${r.to}): ${r.message} → ${approved ? 'sí' : 'no'}`); return approved; },
  };
  return { out, run: () => runFlow(flow, { person, robot, workspace, hooks }) };
}

let fails = 0;
const check = async (person, want, opts) => {
  const { out, run } = harness(person, opts);
  const r = await run();
  const got = out.routes[0] ?? (out.notes.length ? 'ESCALA' : '—');
  const ok = r.status === 'ok' && got.includes(want);
  if (!ok) fails++;
  console.log(`\n${ok ? 'OK  ' : 'FALLA'} [${person.truth}${opts ? ' / ' + JSON.stringify(opts) : ''}] ${person.name}`);
  console.log(`  ruta: ${r.trace.map((t) => t.node + (t.port !== 'out' ? `(${t.port})` : '')).join(' → ')}`);
  [...out.said.map((t) => `robot: "${t}"`), ...out.extras, ...out.routes.map((d) => `guía a: ${d}`), ...out.notes.map((m) => `aviso → ${m}`)]
    .forEach((l) => console.log('  ' + l));
};

for (const p of people) await check(p, expected[p.id]);
if (/personalizada|conversacional/.test(flowPath)) await check(people.find((p) => p.id === 'p5'), 'ESCALA', { approved: false });
console.log(`\n${fails ? fails + ' fallos' : 'todos correctos'}`);
process.exit(fails ? 1 : 0);
