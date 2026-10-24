import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';

registerNode({
  type: 'robot.show',
  level: 'basic',
  icon: 'screen',
  label: 'Mostrar en pantalla',
  group: 'Acciones del robot',
  help: 'Muestra una tarjeta en la pantalla del robot (bienvenida, lugar, instrucciones). Puede usar {{name}}, {{event}}, {{place}}.',
  config: [
    { key: 'title', label: 'Título', type: 'text' },
    { key: 'text', label: 'Texto', type: 'textarea' },
  ],
  defaults: { title: 'Bienvenido', text: '' },
  async run({ robot, vars }, cfg) {
    await robot.show({ title: fillTemplate(cfg.title, vars), text: fillTemplate(cfg.text, vars) });
    return { port: 'out' };
  },
});
