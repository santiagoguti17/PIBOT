import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';

// Aprobación humana. SIMULADO: en la demo la persona de recepción aprueba o rechaza con un botón.
registerNode({
  type: 'escalation.approve',
  level: 'basic',
  icon: 'shield',
  label: 'Pedir aprobación',
  group: 'Escalamiento',
  real: false,
  help: 'El flujo se detiene hasta que una persona apruebe o rechace. Sirve para casos que exigen criterio humano.',
  config: [
    { key: 'to', label: 'Quién aprueba', type: 'text' },
    { key: 'message', label: 'Qué se le pregunta ({{variable}} permitido)', type: 'textarea' },
  ],
  defaults: { to: 'Supervisor', message: '¿Autoriza el ingreso de {{name}}?' },
  ports: () => ['aprobado', 'rechazado'],
  summary: ({ port }) => (port === 'aprobado' ? 'Aprobado por una persona' : 'Rechazado por una persona'),
  async run({ approve, vars }, cfg) {
    const ok = await approve({ to: cfg.to, message: fillTemplate(cfg.message, vars) });
    return { port: ok ? 'aprobado' : 'rechazado' };
  },
});
