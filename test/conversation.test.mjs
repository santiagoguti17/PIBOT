// Prueba de la conversación con el visitante (src/core/conversation.js), la misma en la simulación y en el robot real:
// escuchar, entender, pedir que repita y esperar a que alguien responda por el visitante.
import { readFileSync } from 'node:fs';
import { askByVoice, chooseByVoice } from '../src/core/conversation.js';

const workspace = JSON.parse(readFileSync(new URL('../data/club.json', import.meta.url)));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${msg}`); if (!ok) fails++; };

// Un visitante que dice, en orden, lo de la lista ('' = se queda callado); una persona que toca la opción si se le pide
function visitante(dichos, { toca, tocaAlEscuchar } = {}) {
  const said = [], heard = [], abortados = [];
  let tocar;
  const human = new Promise((r) => { tocar = r; });
  if (toca !== undefined) setTimeout(() => tocar(toca), 50); // cuando el robot ya terminó de escuchar
  const io = {
    listen: async (context, signal) => {
      signal.addEventListener('abort', () => abortados.push(true));
      if (tocaAlEscuchar !== undefined) { setTimeout(() => tocar(tocaAlEscuchar), 10); return new Promise(() => {}); }
      return dichos.shift() ?? '';
    },
    say: async (t) => said.push(t),
    human,
    heard: (t, entendido) => heard.push(`${entendido ? '✓' : '✗'} ${t}`),
  };
  return { io, said, heard, abortados };
}
const opciones = ['Restaurante', 'Gimnasio', 'Terraza'];

let v = visitante(['Quiero ir al gimnasio']);
check(await chooseByVoice({ options: opciones, io: v.io }) === 'Gimnasio' && !v.said.length && v.heard[0] === '✓ «Quiero ir al gimnasio» (entendido: Gimnasio)',
  'entiende a la primera: no repite nada y muestra lo que entendió');

v = visitante(['Buenas tardes', 'Qué bonito día', 'La terraza, por favor']);
check(await chooseByVoice({ options: opciones, io: v.io }) === 'Terraza' && v.said.length === 2
  && v.said.every((s) => s === 'No le entendí bien. Puede decirme: Restaurante, Gimnasio o Terraza.'), 'no entiende dos veces: lo pide de nuevo, igual las dos veces');

v = visitante(['', '', ''], { toca: 'Restaurante' });
const silencio = await chooseByVoice({ options: opciones, io: v.io });
check(silencio === 'Restaurante' && v.said.length === 2 && v.said[0].startsWith('¿Perdón?'),
  'tres silencios: dice «¿Perdón?» y después espera a que alguien toque la opción');

v = visitante([], { tocaAlEscuchar: 'Gimnasio' });
check(await chooseByVoice({ options: opciones, io: v.io }) === 'Gimnasio' && v.abortados.length === 1 && !v.said.length,
  'alguien toca la opción mientras escucha: corta la escucha y sigue con esa');

const horas = ['4 pm', '5 pm', '6 pm', 'No, gracias'];
v = visitante(['A las 3 de la tarde', 'A las cinco de la tarde']);
check(await chooseByVoice({ options: horas, interpret: async () => '6 pm', io: v.io }) === '5 pm'
  && v.said[0] === 'Eso no lo tengo disponible. Puede decirme: 4 pm, 5 pm, 6 pm o No, gracias.', 'una hora que no se ofrece no vale aunque el LLM la elija');

v = visitante([], { toca: 'Terraza' });
v.io.listen = null;
check(await chooseByVoice({ options: opciones, io: v.io }) === 'Terraza' && !v.said.length, 'sin micrófono: responde la persona, como en la página');

v = visitante(['Mi código es fiesta veintisiete']);
check(await askByVoice({ kind: 'code', workspace, io: v.io }) === 'FIESTA-27', 'código dictado: FIESTA-27');
v = visitante(['fiesta veintiocho', 'no tengo código']);
check(await askByVoice({ kind: 'code', workspace, io: v.io }) === null && v.said[0] === 'No encontré ese código. ¿Me lo repite?',
  'código que no existe: pide que lo repita; «no tengo» sigue sin código');

console.log(fails ? `${fails} fallos` : 'todos correctos');
process.exit(fails ? 1 : 0);
