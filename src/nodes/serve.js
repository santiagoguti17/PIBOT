import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';

const NOTHING = 'Nada, gracias';
const PERSON = 'Hablar con una persona';
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const joinEs = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} o ${xs.at(-1)}`);

// "{{place}}, Zona social" con place = "Terraza, piso 4" → ["Terraza", "Zona social"]: se quedan solo los lugares
// del club, así un lugar de evento con piso o detalles también sirve.
export function allowedPlaces(text, placeNames) {
  const found = [];
  for (const token of String(text ?? '').split(',')) {
    const name = placeNames.find((p) => norm(p) === norm(token));
    if (name && !found.includes(name)) found.push(name);
  }
  return found;
}

// El robot pregunta qué necesita la persona y la acompaña a donde pida, solo entre los lugares que su categoría
// puede visitar (eso lo decide el club en el nodo, no el robot). Si pide otro lugar, se lo explica y vuelve a ofrecer.
registerNode({
  type: 'robot.serve',
  level: 'basic',
  icon: 'guide',
  label: 'Atender lo que pida',
  group: 'Acciones del robot',
  help: 'El robot pregunta qué necesita la persona y la lleva a donde pida, solo entre los lugares permitidos para esta categoría. Si pide un lugar no permitido, se lo explica y le ofrece los que sí. La persona puede tocar una opción o, si el robot entiende lenguaje natural, decirlo con sus palabras; para eso ayuda describir cada lugar en "Lugares".',
  config: [
    { key: 'question', label: 'Qué pregunta el robot', type: 'textarea' },
    { key: 'allowed', label: 'Lugares permitidos (coma; {{place}} permitido)', type: 'text',
      suggest: (ws) => (ws.places ?? []).map((p) => p.name) },
    { key: 'message', label: 'Qué dice al guiar ({{place}} = lugar elegido)', type: 'textarea' },
    { key: 'denied', label: 'Qué dice si pide un lugar no permitido ({{requested}}, {{allowed}})', type: 'textarea' },
    { key: 'bye', label: 'Qué dice si no necesita nada', type: 'textarea' },
  ],
  defaults: {
    question: '¿En qué le puedo ayudar hoy?',
    allowed: 'Restaurante, Gimnasio, Zona social',
    message: 'Con gusto, le acompaño a {{place}}.',
    denied: 'Lo siento, {{requested}} no está disponible para usted. Puedo llevarle a {{allowed}}.',
    bye: 'Perfecto. Si necesita algo, aquí estoy. Que disfrute su visita.',
  },
  ports: () => ['guiado', 'nada', 'pide una persona', 'sin respuesta'],
  summary: ({ port, data = {} }) => (port === 'guiado' ? `Pidió: ${data.place}` : data.denied ? `${port} (pidió ${data.denied})` : port),

  async run({ robot, vars, workspace }, cfg) {
    const club = (workspace.places ?? []).filter((p) => norm(p.name) !== 'recepcion');
    const allowed = allowedPlaces(fillTemplate(cfg.allowed, vars), club.map((p) => p.name));
    const buttons = [...allowed, NOTHING, PERSON];
    // El robot entiende cualquier lugar del club (para poder decir que no a uno no permitido), pero solo ofrece los permitidos
    const understand = [...new Set([...club.map((p) => p.name), NOTHING, PERSON])];
    const hints = {
      ...Object.fromEntries(club.filter((p) => p.desc).map((p) => [p.name, p.desc])),
      [NOTHING]: 'no necesita nada, solo va de paso o ya sabe a dónde va',
      [PERSON]: 'quiere que le atienda una persona: recepción, un encargado o el gerente',
    };
    let question = fillTemplate(cfg.question, vars), denied = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const answer = await robot.choose(question, buttons, { hints, understand });
      if (!answer) return { port: 'sin respuesta', data: { denied } };
      if (answer === NOTHING) { await robot.speak(fillTemplate(cfg.bye, vars)); return { port: 'nada', data: { denied } }; }
      if (answer === PERSON) return { port: 'pide una persona', data: { denied } };
      if (allowed.includes(answer)) {
        await robot.speak(fillTemplate(cfg.message, { ...vars, place: answer }));
        await robot.navigate(answer);
        return { port: 'guiado', data: { place: answer } };
      }
      denied = answer;
      await robot.speak(fillTemplate(cfg.denied, { ...vars, requested: answer, allowed: joinEs(allowed) }));
      question = '¿A cuál de estos lugares le acompaño?';
    }
    return { port: 'sin respuesta', data: { denied } };
  },
});
