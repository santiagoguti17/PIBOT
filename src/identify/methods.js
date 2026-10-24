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

// Busca en los registros un valor (código, documento) y devuelve el registro, o una razón si no sirve.
function findRecord(workspace, registries, field, value) {
  for (const name of registries) {
    const rec = recordsFor(workspace, name).find((r) => r[field] != null && norm(r[field]) === value);
    if (!rec) continue;
    if (rec.active === false) return { reason: `${rec.event ?? 'registro'} no está vigente` };
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
async function realFace(person, workspace, state) {
  let r;
  try { r = await person.camera(); } catch (err) {
    state.camera = 'sin cámara'; state.cameraText = 'sin reconocimiento facial';
    return { reason: `reconocimiento facial no disponible: ${err.message}` };
  }
  if (r.status === 'identified' && r.person) {
    state.camera = 'miembro'; state.cameraSaidMember = true;
    state.cameraText = `reconoce a ${r.person.name} (similitud ${r.similarity.toFixed(2)})`;
    return { category: clubCategory(workspace, r.person.category), name: r.person.name, destination: r.person.destination ?? '',
      via: 'reconocimiento facial', similarity: +r.similarity.toFixed(2) };
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
    if (person.camera) return realFace(person, workspace, state);
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
  label: 'Código de acceso o QR',
  askable: true,
  defaultPrompt: 'Bienvenido. Para orientarle, ¿me indica su código de acceso?',
  async run({ robot, workspace }, cfg, state, row) {
    const code = norm(await robot.ask(row.prompt, { kind: 'code' }));
    if (!code) return { reason: 'sin código' };
    const hit = findRecord(workspace, list(cfg.codeRegistries), 'code', code);
    if (!hit) return { reason: 'código no registrado' };
    if (hit.reason) return hit;
    const { code: _c, active: _a, holder, ...info } = hit.rec;
    return { ...info, category: categoryOf(hit.rec), name: holder, via: hit.registry === 'Eventos' ? `evento ${hit.rec.event}` : hit.registry };
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

// Cuándo se usa un método, según lo que dijo la cámara ('sin cámara' = no se ha usado o está desactivada).
export const WHEN = [
  ['siempre', 'Siempre'],
  ['no miembro', 'Si la cámara dice que no es miembro'],
  ['duda', 'Si la cámara duda'],
  ['no miembro o duda', 'Si no es miembro o la cámara duda'],
];
const WHEN_STATES = {
  'siempre': null,
  'no miembro': ['no miembro', 'sin cámara'],
  'duda': ['duda', 'sin cámara'],
  'no miembro o duda': ['no miembro', 'duda', 'sin cámara'],
};
export const whenOk = (when, camera) => !WHEN_STATES[when] || WHEN_STATES[when].includes(camera);
