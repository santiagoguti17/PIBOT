import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';

// Aviso a una persona con un rol concreto (recepción, concierge, anfitrión...). SIMULADO: sale en el panel de avisos.
registerNode({
  type: 'escalation.notify',
  level: 'basic',
  icon: 'bell',
  label: 'Avisar a alguien',
  group: 'Escalamiento',
  real: false,
  help: 'Envía un aviso a un rol (concierge, anfitrión, supervisor...) sin detener al robot. Puede usar {{name}}, {{event}}, {{place}}.',
  config: [
    { key: 'to', label: 'A quién', type: 'text' },
    { key: 'message', label: 'Mensaje ({{variable}} permitido)', type: 'textarea' },
  ],
  defaults: { to: 'Recepción', message: 'Un visitante necesita atención.' },
  async run({ notify, vars }, cfg) {
    notify({ to: cfg.to, message: fillTemplate(cfg.message, vars), at: new Date() });
    return { port: 'out' };
  },
});
