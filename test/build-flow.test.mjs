// El asistente "Crear flujo": el flujo que arma con las respuestas por defecto atiende bien a las 7 personas del dataset.
//   node test/build-flow.test.mjs
import { readFileSync } from 'node:fs';
import '../src/nodes/index.js';
import { runFlow } from '../src/core/engine.js';
import { getNode } from '../src/core/registry.js';
import { buildFlow, defaultPlan, describePlan, knownCategories } from '../src/core/build-flow.js';
import { checkFlow } from '../src/core/check-flow.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const people = read('../data/people.json');
const workspace = read('../data/club.json');
let fails = 0;
const expect = (ok, what) => { if (!ok) fails++; console.log(`${ok ? 'OK   ' : 'FALLA'} ${what}`); };

const cats = knownCategories(workspace).map((c) => c.name);
expect(cats.join(', ') === 'VIP, Regular, Invitado, Trabajador externo, Personal del club', `categorías del club: ${cats.join(', ')}`);

const plan = defaultPlan(workspace);
const portsOf = (n) => getNode(n.type).ports({ ...getNode(n.type).defaults, ...n.config });
const flow = buildFlow(plan, { portsOf });
describePlan(plan).forEach((l) => console.log(`  ${l.who}: ${l.text}`));
const problems = checkFlow(flow, workspace);
expect(!problems.length, `revisión sin avisos${problems.length ? ': ' + problems.map((p) => p.text).join(' | ') : ''}`);
const overlap = flow.nodes.some((a) => flow.nodes.some((b) => a !== b && a.x === b.x && Math.abs(a.y - b.y) < 60));
expect(!overlap, `${flow.nodes.length} nodos ordenados sin encimarse`);

async function visit(person, { approved = true } = {}) {
  const routes = [], notes = [];
  const robot = {
    speak: async () => {}, ask: async (q, { kind = 'code' } = {}) => person[kind] ?? null,
    choose: async (q, options) => person.choice ?? options[0], show: async () => {}, gesture: async () => {},
    navigate: async (d) => routes.push(d),
  };
  const hooks = { onNotify: (n) => notes.push(n.to), onApprove: async () => approved };
  const r = await runFlow(flow, { person, robot, workspace, hooks });
  return r.status !== 'ok' ? `error: ${r.error}` : routes[0] ?? (notes.includes('Recepción') ? 'ESCALA' : '—');
}
const want = { p1: 'Salón VIP', p2: 'Gimnasio', p3: 'Terraza', p4: 'Vestier de personal', p5: 'Acceso de servicio', p6: 'Restaurante', p7: 'ESCALA' };
for (const p of people.filter((x) => want[x.id])) { const got = await visit(p); expect(got.includes(want[p.id]), `${p.name} (${p.truth}) → ${got}`); }
const rejected = await visit(people.find((p) => p.id === 'p5'), { approved: false });
expect(rejected === 'ESCALA', `Trabajador externo no autorizado → ${rejected}`);

// Una categoría desmarcada se trata como alguien que el robot no reconoce
const sinVip = buildFlow({ ...plan, categories: plan.categories.map((c) => ({ ...c, on: c.name !== 'VIP' })) }, { portsOf });
const r = await runFlow(sinVip, { person: people.find((p) => p.id === 'p1'), workspace, robot: { speak: async () => {}, ask: async () => null, choose: async () => null, show: async () => {}, gesture: async () => {}, navigate: async () => {} }, hooks: { onNotify: () => {} } });
expect(r.trace.at(-1).type === 'escalation.assist', 'sin VIP en el flujo, Camila pasa a recepción');

console.log(`\n${fails ? fails + ' fallos' : 'todos correctos'}`);
process.exit(fails ? 1 : 0);
