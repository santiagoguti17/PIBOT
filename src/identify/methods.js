import { categoryOf, recordsFor } from '../core/workspace.js';

// Formas de identificar a un visitante. Cada una intenta dar una categoría con su propia señal;
// el nodo "Identificar visitante" las prueba en el orden y bajo las condiciones que el usuario elija.
//   run(ctx, cfg, state, row) -> { category, name?, via, ...datos } | { reason } | null
//   state: lo que se sabe hasta ahora (qué dijo la cámara, razones de fallos anteriores)
const methods = new Map();
export const registerMethod = (m) => methods.set(m.id, m);
export const getMethod = (id) => methods.get(id);
export const listMethods = () => [...methods.values()];

export const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const norm = (s) => String(s ?? '').trim().toUpperCase();

// El nombre de un evento para decírselo al visitante, sin las notas del club entre paréntesis ("Cena de gala (ya finalizó)")
const spokenName = (name) => String(name ?? '').replace(/\s*\([^)]*\)/g, '').trim();
// Lo que el robot le explica al visitante cuando su código es de un evento que ya no está vigente
const endedEvent = (name) => `Ese código es del evento «${spokenName(name)}», que ya finalizó.`;

// Busca en los registros un valor (código, documento) y devuelve el registro, o una razón si no sirve.
// tell: lo que se le puede explicar al visitante (el robot se lo dice al pasarlo a recepción).
// Los códigos se comparan sin guiones ni espacios: "fiesta 27" es FIESTA-27.
function findRecord(workspace, registries, field, value) {
  for (const name of registries) {
    const rec = recordsFor(workspace, name).find((r) => r[field] != null && alnum(r[field]) === alnum(value));
    if (!rec) continue;
    if (rec.active === false) return { reason: `${rec.event ?? 'registro'} no está vigente`, tell: rec.event ? endedEvent(rec.event) : undefined };
    return { rec, registry: name };
  }
  return null;
}

// Categoría del club para la de Supabase ("member_vip" → "VIP"), según "faceCategories" en la configuración del club
export function clubCategory(workspace, raw) {
  const map = workspace.faceCategories ?? {};
  const hit = Object.keys(map).find((k) => same(k, raw));
  return hit ? map[hit] : raw;
}

// Lo que dijo el reconocimiento facial real (servicio ./x2 rostro). Solo "identified" trae persona; con "unknown" se
// sigue como no miembro (se le pide su código), con "ambiguous" como duda, y si no hubo una cara útil, como sin cámara.
const FACE_STATES = {
  unknown: ['no miembro', 'no reconoce a esta persona'],
  ambiguous: ['duda', 'se parece a más de una persona registrada'],
  no_face: ['sin cámara', 'no ve ninguna cara'],
  multiple_faces: ['sin cámara', 've más de una persona'],
  insufficient_quality: ['sin cámara', 'la foto salió borrosa, oscura o muy lejos'],
  invalid_image: ['sin cámara', 'no pudo leer la foto'],
  not_ready: ['sin cámara', 'el servicio todavía no tiene las personas registradas'],
};
// La cara dice quién es. Si está en la lista de miembros del club, la categoría sale de ahí (cara + lista, como con la
// cámara simulada), aunque en Supabase tenga otra. Si no está (invitado, personal, trabajador), la cara sola no basta,
// igual que en el club: se sigue como con un no miembro y se le pide su código o su carné, pero ya se sabe su nombre.
async function realFace(person, workspace, state, cfg) {
  let r;
  try { r = await person.camera(); } catch (err) {
    state.camera = 'sin cámara'; state.cameraText = 'sin reconocimiento facial';
    return { reason: `reconocimiento facial no disponible: ${err.message}` };
  }
  if (r.status === 'identified' && r.person) {
    // La categoría la decide la lista de miembros del club, no la que tenga la persona en Supabase
    const rec = recordsFor(workspace, cfg.memberRegistry).find((m) => same(m.key, r.person.name));
    state.cameraText = `reconoce a ${r.person.name} (similitud ${r.similarity.toFixed(2)})`;
    state.knownName = r.person.name;
    if (!rec) { state.camera = 'no miembro'; return null; }
    state.camera = 'miembro'; state.cameraSaidMember = true;
    return { category: categoryOf(rec), name: r.person.name, destination: r.person.destination ?? '',
      via: 'reconocimiento facial + lista de miembros', similarity: +r.similarity.toFixed(2) };
  }
  const [camera, text] = FACE_STATES[r.status] ?? ['sin cámara', r.status];
  state.camera = camera; state.cameraText = text;
  return camera === 'no miembro' ? null : { reason: text };
}

registerMethod({
  id: 'camera',
  label: 'Reconocimiento facial',
  real: false,
  help: 'Con "Persona frente a la cámara", reconocimiento facial real con las personas registradas en Supabase; con un visitante del dataset, simulado (miembro / no miembro con una confianza).',
  async run({ person, workspace }, cfg, state) {
    if (person.camera) return realFace(person, workspace, state, cfg);
    const { isMember, confidence } = person.face;
    state.cameraText = `${isMember ? 'miembro' : 'no miembro'} ${Math.round(confidence * 100)} %`;
    state.cameraSaidMember = isMember;
    if (confidence < Number(cfg.minConfidence)) { state.camera = 'duda'; return { reason: 'confianza facial baja' }; }
    if (!isMember) { state.camera = 'no miembro'; return null; }
    const rec = recordsFor(workspace, cfg.memberRegistry).find((r) => same(r.key, person.name));
    if (!rec) { state.camera = 'duda'; return { reason: 'la cámara dice miembro, pero no figura en la lista' }; }
    state.camera = 'miembro';
    return { category: categoryOf(rec), name: person.name, via: 'cámara + lista de miembros' };
  },
});

registerMethod({
  id: 'code',
  label: 'Código de acceso',
  askable: true,
  defaultPrompt: 'Bienvenido. Para orientarle, ¿me indica su código de acceso?',
  async run({ robot, workspace }, cfg, state, row) {
    const code = norm(await robot.ask(row.prompt, { kind: 'code' }));
    if (!code) return { reason: 'sin código' };
    const hit = findRecord(workspace, list(cfg.codeRegistries), 'code', code);
    if (!hit) return { reason: 'código no registrado', tell: 'No encuentro ese código.' };
    if (hit.reason) return hit;
    const { code: _c, active: _a, holder, ...info } = hit.rec;
    return { ...info, category: categoryOf(hit.rec), name: holder || state.knownName, via: hit.registry === 'Eventos' ? `evento ${hit.rec.event}` : hit.registry };
  },
});

registerMethod({
  id: 'document',
  label: 'Cédula o carné',
  askable: true,
  defaultPrompt: '¿Me muestra su cédula o carné?',
  async run({ robot, workspace }, cfg, state, row) {
    const doc = norm(await robot.ask(row.prompt, { kind: 'document' }));
    if (!doc) return { reason: 'sin documento' };
    const hit = findRecord(workspace, [cfg.memberRegistry, ...list(cfg.codeRegistries)], 'document', doc);
    if (!hit) return { reason: 'documento no registrado' };
    if (hit.reason) return hit;
    return { category: categoryOf(hit.rec), name: hit.rec.key ?? hit.rec.holder, via: `documento (${hit.registry})` };
  },
});

registerMethod({
  id: 'name',
  label: 'Nombre dicho al robot',
  askable: true,
  help: 'Solo se acepta si la cámara apunta a miembro: nombre y cámara deben coincidir (dos señales débiles).',
  defaultPrompt: 'Para estar seguro, ¿me confirma su nombre?',
  async run({ robot, workspace }, cfg, state, row) {
    if (!state.cameraSaidMember) return { reason: 'el nombre solo no basta: la cámara no lo respalda' };
    const said = await robot.ask(row.prompt, { kind: 'name' });
    if (!said?.trim()) return { reason: 'no dio su nombre' };
    const rec = recordsFor(workspace, cfg.memberRegistry).find((r) => same(r.key, said));
    if (!rec) return { reason: 'el nombre no figura en la lista de miembros' };
    return { category: categoryOf(rec), name: rec.key, via: 'cámara dudosa + nombre' };
  },
});

const PURPOSES = [
  ['Soy del personal del club', 'personal', 'trabajo aquí, soy empleado, soy del personal, vengo a mi turno'],
  ['Vengo a un evento', 'evento', 'soy invitado, vengo a una fiesta, un cumpleaños, un evento, me invitaron'],
  ['Vengo a realizar un trabajo', 'trabajo', 'vengo a reparar, mantenimiento, una obra, soy proveedor, vengo a trabajar'],
];

// No identifica a nadie: pregunta qué lo trae, y eso decide qué verificación sigue (carné, lista de un evento...)
registerMethod({
  id: 'purpose',
  label: 'Preguntar qué lo trae',
  askable: true,
  help: 'No da una categoría por sí sola: la respuesta decide qué forma de identificar se usa después (por ejemplo, carné si es del personal, lista del evento si viene a un evento o a un trabajo).',
  defaultPrompt: 'Bienvenido. ¿Qué lo trae por aquí?',
  async run({ robot }, cfg, state, row) {
    const answer = await robot.choose(row.prompt, PURPOSES.map(([label]) => label), {
      hints: Object.fromEntries(PURPOSES.map(([label, , hint]) => [label, hint])),
    });
    state.purpose = PURPOSES.find(([label]) => label === answer)?.[1];
    return state.purpose ? null : { reason: 'no dijo qué lo trae' };
  },
});

const alnum = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const words = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'al', 'a', 'zona', 'area']);
// "gimnasio" y "el gimnasio" son el mismo lugar: todas las palabras que dijo están en el nombre del lugar
const sameArea = (said, place) => {
  const have = new Set(words(place)), mine = words(said).filter((w) => !STOP.has(w));
  return mine.length > 0 && mine.every((w) => have.has(w));
};

// Evento con lista de invitados o de trabajadores y un código para todos: para pasar tienen que coincidir el nombre
// (en la lista) y el código (el del evento). Si el evento lo pide ("requireArea"), también el área a la que dice ir.
registerMethod({
  id: 'guest',
  label: 'Código y nombre (lista del evento)',
  help: 'El robot pide el código de entrada y, con él, sabe de qué evento es. Si el evento tiene lista, pregunta el nombre (si la cámara ya lo reconoció, no) y pasa solo si está en la lista; en los trabajos que lo piden, pregunta también el área, que debe coincidir. Así no pregunta nada que no vaya a usar.',
  async run({ robot, workspace }, cfg, state, row) {
    const code = alnum(await robot.ask('¿Cuál es su código de entrada?', { kind: 'code' }));
    if (!code) return { reason: 'faltó el código' };
    const event = (workspace.events ?? []).find((ev) => (ev.codes ?? []).some((c) => alnum(c.code) === code));
    if (!event) return { reason: 'el código no es de ningún evento', tell: 'No encuentro ese código.' };
    if (event.active === false) return { reason: `${event.name} no está vigente`, tell: endedEvent(event.name) };
    const entry = event.codes.find((c) => alnum(c.code) === code);
    const name = state.knownName || (event.guests || !entry.holder ? (await robot.ask('¿Me dice su nombre, por favor?', { kind: 'name' }))?.trim() : entry.holder);
    if (!name) return { reason: 'faltó el nombre' };
    const listed = event.guests ? event.guests.find((g) => same(g, name)) : name;
    if (!listed) return { reason: `su nombre no está en la lista de ${event.name}`, tell: `No encuentro su nombre en la lista de «${spokenName(event.name)}».` };
    if (event.requireArea) {
      const where = (await robot.ask('¿En qué área va a trabajar?', { kind: 'destination' }))?.trim();
      if (!sameArea(where, event.place)) return { reason: `dijo ir a «${where}», pero el trabajo es en ${event.place}` };
    }
    const role = entry.role;
    return { category: role, name: listed, event: event.name, place: event.place, area: event.requireArea ? event.place : undefined,
      via: `${event.name}: código${event.guests ? ' y nombre en la lista' : ''}${event.requireArea ? ' y área' : ''}` };
  },
});

// Cuándo se usa un método, según lo que dijo la cámara ('sin cámara' = no se ha usado o está desactivada).
export const WHEN = [
  ['siempre', 'Siempre'],
  ['no miembro', 'Si la cámara dice que no es miembro'],
  ['duda', 'Si la cámara duda'],
  ['no miembro o duda', 'Si no es miembro o la cámara duda'],
  ['personal', 'Si dice que es del personal'],
  ['evento o trabajo', 'Si dice que viene a un evento o a trabajar'],
];
const WHEN_STATES = {
  'siempre': null,
  'no miembro': ['no miembro', 'sin cámara'],
  'duda': ['duda', 'sin cámara'],
  'no miembro o duda': ['no miembro', 'duda', 'sin cámara'],
};
export const whenOk = (when, camera, purpose) => {
  if (when === 'personal') return purpose === 'personal';
  if (when === 'evento o trabajo') return purpose === 'evento' || purpose === 'trabajo';
  return !WHEN_STATES[when] || WHEN_STATES[when].includes(camera);
};
