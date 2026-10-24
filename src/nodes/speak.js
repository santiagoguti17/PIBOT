import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';

registerNode({
  type: 'robot.speak',
  level: 'advanced',
  help: 'El robot dice un texto.',
  icon: 'speak',
  label: 'Robot: hablar',
  group: 'Acciones del robot',
  config: [{ key: 'text', label: 'Texto ({{variable}} permitido)', type: 'textarea' }],
  defaults: { text: 'Hola' },
  async run({ robot, vars }, cfg) {
    await robot.speak(fillTemplate(cfg.text, vars));
    return { port: 'out' };
  },
});
