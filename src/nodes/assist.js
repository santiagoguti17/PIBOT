import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';

// Escalamiento en un solo paso: el robot avisa al visitante y notifica a una persona. SIMULADO: el aviso sale en el panel de Recepción.
registerNode({
  type: 'escalation.assist',
  level: 'basic',
  icon: 'help',
  label: 'Pasar a recepción',
  group: 'Escalamiento',
  real: false,
  help: 'Cuando el robot no puede resolverlo: se lo dice al visitante y avisa a una persona de recepción con el motivo.',
  config: [
    { key: 'message', label: 'Qué dice el robot', type: 'textarea' },
    { key: 'note', label: 'Aviso para recepción', type: 'textarea' },
  ],
  defaults: {
    message: 'No logro confirmar quién es con certeza. Aviso a recepción para que le atiendan enseguida.',
    note: 'Visitante sin categoría confirmada: {{reason}}. Cámara: {{camera}}.',
  },
  async run({ robot, notify, vars }, cfg) {
    await robot.speak(fillTemplate(cfg.message, vars));
    notify({ to: 'Recepción', message: fillTemplate(cfg.note, vars), at: new Date() });
    return { port: 'out' };
  },
});
