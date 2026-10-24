// Prueba del nodo "Atender lo que pida": guía a donde se pide, dice que no a un lugar no permitido y ofrece los permitidos.
import { readFileSync } from 'node:fs';
import '../src/nodes/index.js';
import { getNode } from '../src/core/registry.js';
import { allowedPlaces } from '../src/nodes/serve.js';

const workspace = JSON.parse(readFileSync(new URL('../data/club.json', import.meta.url)));
const def = getNode('robot.serve');
const cfg = (over) => ({ ...def.defaults, allowed: 'Restaurante, Gimnasio, Terraza, Zona social', ...over });

function robotQueResponde(respuestas) {
  const out = { said: [], routes: [], asked: [] };
  return {
    out,
    speak: async (t) => out.said.push(t),
    navigate: async (d) => out.routes.push(d),
    choose: async (q, options, { understand, hints }) => { out.asked.push({ q, options, understand, hints }); return respuestas.shift() ?? null; },
  };
}
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${msg}`); if (!ok) fails++; };

// 1. Pide un lugar permitido: lo guía
let r = robotQueResponde(['Gimnasio']);
let res = await def.run({ robot: r, vars: { name: 'Andrés' }, workspace }, cfg());
check(res.port === 'guiado' && r.out.routes[0] === 'Gimnasio', 'pide el gimnasio y lo guía');
check(r.out.asked[0].options.join('|') === 'Restaurante|Gimnasio|Terraza|Zona social|Nada, gracias|Hablar con una persona',
  'solo ofrece los lugares permitidos (y nada / hablar con una persona)');
check(r.out.asked[0].understand.includes('Spa') && r.out.asked[0].hints.Spa?.includes('masajes'),
  'entiende también los no permitidos, con la descripción de cada lugar');

// 2. Pide el Spa (no permitido para esta categoría): se lo explica y vuelve a preguntar
r = robotQueResponde(['Spa', 'Restaurante']);
res = await def.run({ robot: r, vars: {}, workspace }, cfg());
check(res.port === 'guiado' && r.out.routes[0] === 'Restaurante' && r.out.said.some((t) => t.includes('Spa no está disponible')),
  'el spa no está permitido: lo dice y luego lo guía al restaurante');
check(r.out.said.some((t) => t.includes('Restaurante, Gimnasio, Terraza o Zona social')), 'ofrece los permitidos en una lista natural');

// 3. Insiste dos veces en lugares no permitidos: termina sin guiar
r = robotQueResponde(['Spa', 'Salón VIP']);
res = await def.run({ robot: r, vars: {}, workspace }, cfg());
check(res.port === 'sin respuesta' && !r.out.routes.length, 'dos lugares no permitidos seguidos: no guía');

// 4. No necesita nada / pide una persona / no responde
r = robotQueResponde(['Nada, gracias']);
check((await def.run({ robot: r, vars: {}, workspace }, cfg())).port === 'nada' && !r.out.routes.length, 'no necesita nada');
r = robotQueResponde(['Hablar con una persona']);
check((await def.run({ robot: r, vars: {}, workspace }, cfg())).port === 'pide una persona', 'pide hablar con una persona');
r = robotQueResponde([]);
check((await def.run({ robot: r, vars: {}, workspace }, cfg())).port === 'sin respuesta', 'no responde');

// 5. Lugar de un evento con piso ("Terraza, piso 4") en la lista de permitidos
check(allowedPlaces('Terraza, piso 4, Zona social', workspace.places.map((p) => p.name)).join('|') === 'Terraza|Zona social',
  '{{place}} con piso: se queda solo con los lugares del club');

console.log(fails ? `${fails} fallos` : 'todos correctos');
process.exit(fails ? 1 : 0);
