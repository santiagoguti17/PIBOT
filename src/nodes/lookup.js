import { registerNode } from '../core/registry.js';
import { recordsFor, registryNames } from '../core/workspace.js';

// Busca el valor de una variable del flujo (p. ej. el nombre que dio el reconocimiento facial) en un registro.
registerNode({
  type: 'verification.lookup',
  level: 'advanced',
  help: 'Busca a la persona en una lista, por ejemplo membresías.',
  icon: 'list',
  label: 'Consultar registro',
  group: 'Verificación',
  config: [
    { key: 'registry', label: 'Registro', type: 'select', options: (ws) => registryNames(ws) },
    { key: 'key', label: 'Variable a buscar', type: 'text' },
  ],
  defaults: { registry: 'Membresías', key: 'name' },
  ports: () => ['encontrado', 'no encontrado'],
  async run({ workspace, vars }, cfg) {
    const key = String(vars[cfg.key] ?? '').trim().toLowerCase();
    const rec = key && recordsFor(workspace, cfg.registry).find((r) => String(r.key ?? '').toLowerCase() === key);
    if (!rec) return { port: 'no encontrado' };
    const { key: _k, ...info } = rec;
    return { port: 'encontrado', data: info };
  },
});
