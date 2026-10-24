import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';
import { list } from '../identify/methods.js';

registerNode({
  type: 'robot.choose',
  level: 'basic',
  icon: 'choose',
  label: 'Preguntar con opciones',
  group: 'Acciones del robot',
  help: 'El robot hace una pregunta y el visitante elige una opción en pantalla. Cada opción es una salida distinta del nodo.',
  config: [
    { key: 'question', label: 'Pregunta', type: 'text' },
    { key: 'options', label: 'Opciones (coma)', type: 'text' },
  ],
  defaults: { question: '¿Qué desea hacer hoy?', options: 'Restaurante, Gimnasio' },
  ports: (cfg) => [...list(cfg.options), 'sin respuesta'],
  summary: ({ port }) => (port === 'sin respuesta' ? 'No eligió' : `Eligió: ${port}`),
  async run({ robot, vars }, cfg) {
    const options = list(cfg.options);
    const answer = await robot.choose(fillTemplate(cfg.question, vars), options);
    return { port: options.includes(answer) ? answer : 'sin respuesta', data: { choice: answer ?? '' } };
  },
});
