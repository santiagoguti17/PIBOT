import { registerNode } from '../core/registry.js';

// Enrutador: lee una variable del flujo y sale por el puerto cuyo nombre coincide con su valor.
const casesOf = (cfg) => cfg.cases.split(',').map((s) => s.trim()).filter(Boolean);

registerNode({
  type: 'decision.switch',
  level: 'basic',
  help: 'Elige un camino según un dato del visitante (por ejemplo category, role o place). Escriba los valores posibles separados por coma.',
  icon: 'split',
  label: 'Según un dato',
  group: 'Decisión',
  config: [
    { key: 'field', label: 'Variable', type: 'text' },
    { key: 'cases', label: 'Casos (separados por coma)', type: 'text' },
  ],
  defaults: { field: 'category', cases: 'VIP,Regular' },
  ports: (cfg) => [...casesOf({ cases: '', ...cfg }), 'otro'],
  async run({ vars }, cfg) {
    const value = String(vars[cfg.field]);
    return { port: casesOf(cfg).includes(value) ? value : 'otro' };
  },
});
