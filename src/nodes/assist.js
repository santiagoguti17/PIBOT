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
  help: 'Cuando el robot no puede resolverlo: se lo dice al visitante y avisa a una persona de recepción con el motivo. Si se sabe por qué no pudo pasar (el evento de su código ya finalizó, su nombre no está en la lista), se lo explica.',
  config: [
    { key: 'message', label: 'Qué dice el robot', type: 'textarea' },
    { key: 'explained', label: 'Qué dice si se sabe por qué no pudo pasar ({{tell}} es esa explicación)', type: 'textarea' },
    { key: 'note', label: 'Aviso para recepción', type: 'textarea' },
  ],
  defaults: {
    message: 'No logro confirmar quién es con certeza. Aviso a recepción para que le atiendan enseguida.',
    explained: '{{tell}} Aviso a recepción para que le atiendan enseguida.',
    note: 'Visitante sin categoría confirmada: {{reason}}. Cámara: {{camera}}.',
  },
  async run({ robot, notify, vars }, cfg) {
    // "Ese código es del evento «Cena de gala», que ya finalizó." en vez de "no logro confirmar quién es"
    await robot.speak(fillTemplate(vars.tell && cfg.explained ? cfg.explained : cfg.message, vars));
    notify({ to: 'Recepción', message: fillTemplate(cfg.note, vars), at: new Date() });
    return { port: 'out' };
  },
});
