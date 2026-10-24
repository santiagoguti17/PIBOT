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

registerMethod({
  id: 'camera',
  label: 'Reconocimiento facial',
  real: false,
  help: 'Simulada: la cámara dice miembro / no miembro con una confianza.',
  async run({ person, workspace }, cfg, state) {
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
