// Reservas de espacios (canchas, salas, mesas...) y la hora del día. Son funciones puras sobre el espacio de trabajo:
//   workspace.resources = [{ name, article, place, aliases, slots: ["15:00"], blocks: [{time, reason}], bookings: [{time, holder, category}] }]
//   workspace.clock = { now: "11:30" }  (hora simulada para la demostración; sin ella se usa la hora real)
import { norm } from './places.js';

const pad = (n) => String(n).padStart(2, '0');
const words = (s) => ` ${norm(s).replace(/[^a-z0-9]+/g, ' ').trim()} `;

export const resourcesOf = (ws) => ws.resources ?? [];
export const getResource = (ws, name) => resourcesOf(ws).find((r) => norm(r.name) === norm(name));

// "la cancha de tenis"
export const withArticle = (r) => `${r.article ?? 'la'} ${r.name.toLowerCase()}`;

// "17:00" → "5 pm", "09:30" → "9:30 am"
export function fmtTime(t) {
  const [h, m] = String(t).split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + pad(m) : ''} ${h < 12 ? 'am' : 'pm'}`;
}
export const toMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export const clockNow = (ws) => ws.clock?.now ?? (() => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; })();

// Hora que dijo la persona ("a las 5 pm", "5:30", "a las 5 de la tarde", "17:00"). Si no dice am/pm, se busca entre los
// horarios del recurso el que tenga esa hora ("las 5" → 17:00). Devuelve "HH:MM" o null.
export function parseTime(text, slots = []) {
  const s = norm(text).replace(/\./g, '');
  for (const m of s.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|de la manana|de la tarde|de la noche)?/g)) {
    let h = +m[1]; const min = +(m[2] ?? 0), mer = m[3];
    if (h > 24 || min > 59) continue;
    if (mer) {
      if (/pm|tarde|noche/.test(mer) && h < 12) h += 12;
      if (/am|manana/.test(mer) && h === 12) h = 0;
    } else if (h < 13 && !m[2]) {
      const hit = slots.find((t) => toMinutes(t) % 720 === (h % 12) * 60 + min);
      if (!hit) continue;
      return hit;
    }
    return `${pad(h)}:${pad(min)}`;
  }
  return null;
}

// Qué recurso quiso decir ("quiero reservar tenis" → Cancha de tenis), por su nombre o sus alias
export function findResource(ws, text) {
  const said = words(text);
  return resourcesOf(ws).find((r) => [r.name, ...(r.aliases ?? [])].some((t) => said.includes(words(t))));
}

// free | blocked (mantenimiento...) | booked (por alguien) | closed (no hay ese horario hoy)
export function slotStatus(res, time) {
  const block = (res.blocks ?? []).find((b) => b.time === time);
  if (block) return { state: 'blocked', reason: block.reason };
  const booking = (res.bookings ?? []).find((b) => b.time === time);
  if (booking) return { state: 'booked', by: booking };
  return { state: (res.slots ?? []).includes(time) ? 'free' : 'closed' };
}
export const freeSlots = (res) => (res.slots ?? []).filter((t) => slotStatus(res, t).state === 'free');
export function book(res, time, holder, category) { (res.bookings ??= []).push({ time, holder, category }); }

// Por qué no se puede, en palabras del robot: `whyNot` sigue a "no se puede a esa hora:", `sentenceNot` es una frase sola
export function whyNot(st) {
  if (st.state === 'blocked') return `hay ${st.reason}`;
  if (st.state === 'booked') return `ya está reservada por un miembro ${st.by.category}`;
  return 'a esa hora no hay horario';
}
export function sentenceNot(st) {
  if (st.state === 'blocked') return `A esa hora hay ${st.reason}`;
  if (st.state === 'booked') return `Esa hora ya la reservó un miembro ${st.by.category}`;
  return 'A esa hora no hay horario';
}

// Registro de personas (membresías, nómina): la entrada de quien se llama así, por su nombre (key) o titular (holder)
export function findPerson(ws, registry, name) {
  const n = norm(name);
  return n && (ws.registries?.[registry] ?? []).find((r) => norm(r.key) === n || norm(r.holder) === n);
}

export const joinEs = (xs, last = 'o') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${last} ${xs.at(-1)}`);
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
