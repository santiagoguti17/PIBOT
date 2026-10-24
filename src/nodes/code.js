import { registerNode } from '../core/registry.js';
import { recordsFor, registryNames } from '../core/workspace.js';

// Pide un código al visitante y lo busca en uno o varios registros (eventos, nómina...), en orden.
registerNode({
  type: 'verification.code',
  level: 'advanced',
  help: 'El robot pide un código y lo busca en eventos o listas.',
  icon: 'key',
  label: 'Verificar código',
  group: 'Verificación',
  config: [
    { key: 'prompt', label: 'Qué dice el robot', type: 'textarea' },
    { key: 'registries', label: 'Registros donde buscar (coma, en orden)', type: 'text' },
  ],
  defaults: { prompt: 'Para orientarle, ¿me indica su código de acceso?', registries: 'Eventos' },
  ports: () => ['válido', 'inválido', 'sin código'],
  async run({ robot, workspace }, cfg) {
    const names = cfg.registries.split(',').map((s) => s.trim()).filter(Boolean);
    const code = ((await robot.ask(cfg.prompt)) ?? '').trim().toUpperCase();
    if (!code) return { port: 'sin código' };
    for (const name of names) {
      const rec = recordsFor(workspace, name).find((r) => String(r.code).toUpperCase() === code);
      if (!rec) continue;
      if (rec.active === false) return { port: 'inválido', data: { reason: `${rec.event ?? 'registro'} no está vigente` } };
      const { code: _c, active: _a, ...info } = rec;
      return { port: 'válido', data: { ...info, source: name } };
    }
    return { port: 'inválido', data: { reason: 'código no registrado' } };
  },
});

export { registryNames };
