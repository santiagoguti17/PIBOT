import { registerNode } from '../core/registry.js';
import { registryNames } from '../core/workspace.js';
import { getMethod, list, whenOk } from '../identify/methods.js';

const HELP = 'Necesita ayuda';

// Bloque de identificación personalizable: prueba las formas activadas, en orden y según su condición,
// hasta que una dé categoría. Si ninguna la da, sale por "Necesita ayuda".
registerNode({
  type: 'visitor.identify',
  level: 'basic',
  icon: 'scan',
  label: 'Identificar visitante',
  group: 'Verificación',
  real: false, // incluye la cámara simulada
  help: 'Reconoce quién llega y lo clasifica. Elija qué formas usar (cámara, código, cédula, nombre), su orden y cuándo. Lo que no se confirme sale por "Necesita ayuda".',
  config: [
    { key: 'categories', label: 'Categorías de visitante (coma)', type: 'text' },
    { key: 'methods', label: 'Formas de identificar (en orden)', type: 'methods' },
    { key: 'minConfidence', label: 'Confianza mínima de la cámara (0-1)', type: 'text' },
    { key: 'memberRegistry', label: 'Lista de miembros', type: 'select', options: (ws) => registryNames(ws) },
    { key: 'codeRegistries', label: 'Listas de códigos (coma, en orden)', type: 'text' },
  ],
  defaults: {
    categories: 'VIP, Regular, Invitado, Trabajador externo, Personal del club',
    minConfidence: '0.8',
    memberRegistry: 'Membresías',
    codeRegistries: 'Eventos, Nómina de personal',
    methods: [
      { id: 'camera', on: true, when: 'siempre' },
      { id: 'code', on: true, when: 'no miembro', prompt: 'Bienvenido. Para orientarle, ¿me indica su código de acceso?' },
      { id: 'document', on: false, when: 'no miembro o duda', prompt: '¿Me muestra su cédula o carné?' },
      { id: 'name', on: true, when: 'duda', prompt: 'Para estar seguro, ¿me confirma su nombre?' },
      { id: 'purpose', on: false, when: 'no miembro o duda', prompt: 'Bienvenido. ¿Qué lo trae por aquí?' },
      { id: 'guest', on: false, when: 'evento o trabajo' },
    ],
  },
  ports: (cfg) => [...list(cfg.categories), HELP],
  summary: ({ port, data = {} }) =>
    [data.camera && `Cámara: ${data.camera}`, data.via && `vía ${data.via}`, port !== HELP ? `→ ${port}` : `→ ${data.reason}`].filter(Boolean).join(' · '),

  async run({ person, robot, workspace }, cfg) {
    const cats = list(cfg.categories);
    const state = { camera: 'sin cámara', reasons: [] };
    const ctx = { person, robot, workspace };
    for (const row of cfg.methods.filter((m) => m.on)) {
      const method = getMethod(row.id);
      if (!method || !whenOk(row.when, state.camera, state.purpose)) continue;
      const r = await method.run(ctx, cfg, state, { ...row, prompt: row.prompt || method.defaultPrompt });
      if (r?.reason) state.reasons.push(r.reason);
      if (r?.tell) state.tell = r.tell; // lo que se le puede explicar al visitante si al final no pasa
      if (!r?.category) continue;
      if (!cats.includes(r.category)) { state.reasons.push(`categoría desconocida: ${r.category}`); continue; }
      return { port: r.category, data: { camera: state.cameraText, ...r } };
    }
    return { port: HELP, data: { camera: state.cameraText, reason: state.reasons.at(-1) ?? 'ninguna forma de identificar activa', tell: state.tell ?? '' } };
  },
});
