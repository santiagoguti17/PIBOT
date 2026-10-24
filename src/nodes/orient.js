import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';

registerNode({
  type: 'robot.orient',
  level: 'basic',
  icon: 'guide',
  label: 'Orientar al visitante',
  group: 'Acciones del robot',
  help: 'El robot saluda con un mensaje y, si hay destino, lo acompaña hasta allí. Puede usar {{name}}, {{event}}, {{place}}, {{area}}.',
  config: [
    { key: 'message', label: 'Qué dice el robot', type: 'textarea' },
    { key: 'destination', label: 'A dónde lo guía (opcional)', type: 'text',
      suggest: (ws) => (ws.places ?? []).map((p) => p.name) },
  ],
  defaults: { message: 'Bienvenido.', destination: '' },
  async run({ robot, vars }, cfg) {
    await robot.speak(fillTemplate(cfg.message, vars));
    if (cfg.destination.trim()) await robot.navigate(fillTemplate(cfg.destination, vars));
    return { port: 'out' };
  },
});
