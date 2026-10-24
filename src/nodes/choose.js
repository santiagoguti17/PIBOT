import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';
import { list } from '../identify/methods.js';

registerNode({
  type: 'robot.choose',
  level: 'basic',
  icon: 'choose',
  label: 'Preguntar con opciones',
  group: 'Acciones del robot',
  help: 'El robot hace una pregunta y el visitante elige una opción en pantalla. Cada opción es una salida distinta del nodo. Si el robot entiende lenguaje natural, también puede responder con sus palabras: escriba cómo suele decirse cada opción para que la reconozca mejor.',
  config: [
    { key: 'question', label: 'Pregunta', type: 'text' },
    { key: 'options', label: 'Opciones (coma)', type: 'text' },
    { key: 'hints', label: 'Cómo reconocer cada opción (opcional; una por línea, "Opción: cómo la diría un visitante")', type: 'textarea' },
  ],
  defaults: { question: '¿Qué desea hacer hoy?', options: 'Restaurante, Gimnasio', hints: '' },
  ports: (cfg) => [...list(cfg.options), 'sin respuesta'],
  summary: ({ port }) => (port === 'sin respuesta' ? 'No eligió' : `Eligió: ${port}`),
  async run({ robot, vars }, cfg) {
    const options = list(cfg.options);
    const answer = await robot.choose(fillTemplate(cfg.question, vars), options, { hints: parseHints(cfg.hints, options) });
    return { port: options.includes(answer) ? answer : 'sin respuesta', data: { choice: answer ?? '' } };
  },
});

// "Gimnasio: entrenar, pesas" → { Gimnasio: 'entrenar, pesas' }. Las líneas de opciones que no existen se ignoran.
export function parseHints(text, options) {
  const hints = {};
  for (const line of String(text ?? '').split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const option = options.find((o) => o.toLowerCase() === line.slice(0, i).trim().toLowerCase());
    const hint = line.slice(i + 1).trim();
    if (option && hint) hints[option] = hint;
  }
  return hints;
}
