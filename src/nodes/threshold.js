import { registerNode } from '../core/registry.js';

registerNode({
  type: 'decision.threshold',
  level: 'advanced',
  help: 'Separa resultados de confianza alta y baja.',
  icon: 'gauge',
  label: 'Umbral de confianza',
  group: 'Decisión',
  config: [
    { key: 'field', label: 'Variable numérica', type: 'text' },
    { key: 'min', label: 'Mínimo para confiar (0-1)', type: 'text' },
  ],
  defaults: { field: 'confidence', min: '0.8' },
  ports: () => ['alta', 'baja'],
  async run({ vars }, cfg) {
    const ok = Number(vars[cfg.field]) >= Number(cfg.min);
    return ok ? { port: 'alta' } : { port: 'baja', data: { reason: 'confianza facial baja' } };
  },
});
