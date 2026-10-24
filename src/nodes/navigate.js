import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';

registerNode({
  type: 'robot.navigate',
  level: 'advanced',
  help: 'El robot guía al visitante a un destino.',
  icon: 'route',
  label: 'Robot: guiar a destino',
  group: 'Acciones del robot',
  config: [{ key: 'destination', label: 'Destino ({{variable}} permitido)', type: 'text' }],
  defaults: { destination: 'Recepción' },
  async run({ robot, vars }, cfg) {
    await robot.navigate(fillTemplate(cfg.destination, vars));
    return { port: 'out' };
  },
});
