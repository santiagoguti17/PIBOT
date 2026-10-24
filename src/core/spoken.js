// Entender lo que el visitante le dice al robot, ya pasado a texto (Whisper): qué opción quiso decir y qué código
// dictó. Lo usan el robot real (runtime/robot-runtime.mjs) y la página, cuando se le habla por el micrófono.
import { recordsFor, registryNames } from './workspace.js';

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const joinEs = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} o ${xs.at(-1)}`);

// Opción dicha tal cual ("el gimnasio" → Gimnasio) o con una de las frases que el club escribió para ella en
// "Cómo reconocer cada opción" ("quiero entrenar" → Gimnasio). Una frase calza si cada una de sus palabras aparece en
// lo dicho, en cualquier orden y con otra terminación ("quiero hacer un poco de ejercicio" calza con "hacer
// ejercicio"; "entreno" con "entrenar"). No adivina: si lo dicho calza con dos opciones ("comer en la terraza") o
// tiene un "no" que la frase no tiene ("no quiero el gimnasio"), devuelve null y decide el LLM o se pregunta de nuevo.
const FILLERS = new Set(['a', 'al', 'el', 'la', 'los', 'las', 'lo', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'con', 'para',
  'por', 'favor', 'y', 'o', 'que', 'me', 'mi', 'le', 'se', 'su', 'yo', 'es', 'ir', 'voy', 'vengo', 'quiero', 'quisiera',
  'gustaria', 'puede', 'podria', 'algo', 'poco', 'rato', 'hoy', 'eh', 'pues', 'bueno', 'hola', 'buenas', 'gracias',
  'am', 'pm', 'tarde', 'noche', 'hora']);
const NEGATION = new Set(['no', 'nunca', 'tampoco', 'ni']);
// Los números se comparan en cifras: "a las cinco de la tarde" calza con "5 pm" ("una" y "uno" no: suelen ser artículos)
const NUMBER = { dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9', diez: '10',
  once: '11', doce: '12' };
const asNumber = (w) => (/^\d+$/.test(w) ? String(+w) : NUMBER[w] ?? null);
const words = (s) => norm(s).split(' ').filter((w) => w && !FILLERS.has(w)).map((w) => asNumber(w) ?? w);
// La misma palabra con otra terminación: masaje/masajes, entreno/entrenar, relajarme/relajarse (no comida/comer)
function sameWord(a, b) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  let p = 0;
  while (p < n && a[p] === b[p]) p++;
  return n >= 4 && p >= Math.max(4, n - 2);
}
export function sayOption(text, options, hints = {}) {
  const said = words(text);
  const found = [];
  for (const o of options) {
    for (const phrase of [o, ...String(hints[o] ?? '').split(',')]) {
      const need = words(phrase);
      if (!need.length || !need.every((w) => said.some((s) => sameWord(s, w)))) continue;
      const denied = said.some((s) => NEGATION.has(s) && !need.includes(s));
      found.push({ o, denied });
    }
  }
  const kept = new Set(found.filter((f) => !f.denied).map((f) => f.o));
  return kept.size === 1 ? [...kept][0] : null;
}

// ¿La opción contradice lo dicho? Si lo dicho trae una hora o un número que la opción no tiene ("a las 3" y "6 pm"), no
// vale, la haya elegido quien la haya elegido: un LLM pequeño a veces se queda con la opción más parecida.
const numbersIn = (s) => new Set(norm(s).split(' ').map(asNumber).filter(Boolean));
export function contradicts(text, option) {
  const said = numbersIn(text), has = numbersIn(option);
  return said.size > 0 && has.size > 0 && ![...said].some((n) => has.has(n));
}
// Lo dicho pide un número (una hora) que ninguna opción tiene: se le entendió, pero eso no se ofrece
export const outsideOptions = (text, options) => options.some((o) => numbersIn(o).size) && options.every((o) => !numbersIn(o).size || contradicts(text, o));

// "No tengo", "prefiero no decirlo"...: el visitante no tiene lo que se le pide
export const saysNo = (text) => /^(no|no tengo|no lo tengo|no lo traigo|no traigo|prefiero no|ninguno|nada)( .*)?$/.test(norm(text));

// Códigos dictados: los números en palabras ("veintisiete", "treinta y uno"), las letras por su nombre ("ka" → K) y sin
// las palabras de relleno. Whisper junta a veces letra y número ("siete K dos" → "7 cados"): se separa cada palabra en
// nombres de letras y números cuando se puede ("cados" → ca + dos → K2).
const SPOKEN = { cero: '0', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8',
  nueve: '9', a: 'A', be: 'B', ce: 'C', se: 'C', de: 'D', e: 'E', efe: 'F', ge: 'G', hache: 'H', i: 'I', jota: 'J', ka: 'K',
  ca: 'K', ele: 'L', eme: 'M', ene: 'N', o: 'O', pe: 'P', cu: 'Q', erre: 'R', ere: 'R', ese: 'S', te: 'T', u: 'U', uve: 'V',
  ve: 'V', equis: 'X', ye: 'Y', zeta: 'Z', seta: 'Z' };
const FILLER = new Set(['mi', 'codigo', 'el', 'la', 'es', 'de', 'del', 'tengo', 'este', 'aqui', 'numero', 'cedula', 'documento',
  'mis', 'son', 'pues', 'bueno', 'si', 'claro', 'guion', 'con']);
export const alnum = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function splitSpoken(word) { // "cados" → "K2"; null si no se puede separar en letras y números
  if (!word) return '';
  for (let n = Math.min(5, word.length); n > 0; n--) {
    const head = SPOKEN[word.slice(0, n)];
    const rest = head !== undefined && splitSpoken(word.slice(n));
    if (head !== undefined && rest !== null && rest !== false) return head + rest;
  }
  return null;
}
const TEENS = { diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const TENS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
function numbersToDigits(ws) { // ["treinta", "y", "uno"] → ["31"]
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i], unit = /^\d$/.test(SPOKEN[ws[i + 2]] ?? '') ? +SPOKEN[ws[i + 2]] : null;
    if (TENS[w] !== undefined && ws[i + 1] === 'y' && unit !== null) { out.push(String(TENS[w] + unit)); i += 2; }
    else if (TENS[w] !== undefined || TEENS[w] !== undefined) out.push(String(TENS[w] ?? TEENS[w]));
    else out.push(w);
  }
  return out;
}
export const spokenCode = (text) => numbersToDigits(norm(text).split(' ')).filter((w) => !FILLER.has(w))
  .map((w) => (/^\d+$/.test(w) ? w : SPOKEN[w] ?? (w.length <= 6 ? splitSpoken(w) : null) ?? w.toUpperCase())).join('');
function distance(a, b) { // Levenshtein
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// El código registrado que corresponde a lo dicho. Los números tienen que ser exactamente esos: si no, "fiesta
// veintiocho" pasaría por FIESTA-27. En las letras se perdona una equivocación de Whisper (dos en palabras largas,
// "fiestas" por FIESTA), siempre que no haya empate.
const digitsOf = (s) => s.replace(/\D/g, ''), lettersOf = (s) => s.replace(/\d/g, '');
export function closestCode(said, codes) {
  const ranked = codes.filter((c) => digitsOf(alnum(c)) === digitsOf(said))
    .map((c) => ({ c, d: distance(lettersOf(alnum(c)), lettersOf(said)) })).sort((x, y) => x.d - y.d);
  const best = ranked[0];
  if (!best) return null;
  const ok = best.d === 0 || (best.d <= Math.max(1, Math.floor(lettersOf(alnum(best.c)).length / 4)) && (!ranked[1] || ranked[1].d > best.d));
  return ok ? best.c : null;
}

// Un código fácil de decir para un evento nuevo: una palabra y un número de dos cifras que no tenga ningún otro código
// ("FIESTA-27": "fiesta veintisiete"). Sin letras sueltas, que son lo que más confunde al reconocimiento de voz.
export function sayableCode(word, taken = []) {
  const prefix = norm(word).replace(/[^a-z]/g, '').toUpperCase().slice(0, 8) || 'EVENTO';
  const used = new Set(taken.map((c) => digitsOf(alnum(c))));
  const free = Array.from({ length: 90 }, (_, i) => String(i + 10)).filter((n) => !used.has(n));
  const pick = free.length ? free[Math.floor(Math.random() * free.length)] : String(100 + Math.floor(Math.random() * 900));
  return `${prefix}-${pick}`;
}
// Todos los códigos que el club conoce: los de los eventos y los de cada lista
export const knownCodes = (workspace) => registryNames(workspace).flatMap((r) => recordsFor(workspace, r).map((x) => x.code)).filter(Boolean);

// Lo que respondió el visitante a "¿me indica su código / cédula / nombre / a dónde va?", listo para el nodo que preguntó:
// el código tal como está registrado ("FIESTA-27", aunque Whisper escriba "fiesta veintisiete"), solo los dígitos de una
// cédula, el nombre solo. { value: null } si dijo que no lo tiene; { unknown: true } si no se le entendió.
export function spokenAnswer(heard, kind, workspace) {
  if (saysNo(heard)) return { value: null };
  // A dónde va o qué pide: tal como lo dijo, para el nodo que preguntó
  if (kind === 'destination' || kind === 'request') return { value: heard.replace(/[.,;!?¿¡]/g, '').trim() };
  // El nombre, sin "me llamo" ni "soy" adelante: la lista de miembros tiene solo el nombre
  if (kind === 'name') return { value: heard.replace(/[.,;!?¿¡]/g, '').trim().replace(/^((hola|bueno|eh|pues|claro) )*((me llamo|mi nombre es|soy) )?/i, '') };
  const said = spokenCode(heard);
  if (kind === 'document') return said.replace(/\D/g, '') ? { value: said.replace(/\D/g, '') } : { unknown: true };
  const code = closestCode(said, knownCodes(workspace));
  return code ? { value: code } : { unknown: true };
}
