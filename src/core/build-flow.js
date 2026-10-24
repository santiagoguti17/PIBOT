// Arma un flujo completo a partir de las respuestas del asistente "Crear flujo": a quién recibe el robot y qué hace
// con cada uno. Así un club tiene un flujo que funciona sin arrastrar ni conectar nodos; después lo puede afinar en el lienzo.
import { EVENTS, recordsFor, registryNames, categoryOf } from './workspace.js';
import { layoutFlow } from './layout.js';

export const EVENT_PLACE = '{{place}}'; // "el lugar de su evento", según el código con que entró
export const HELP_PORT = 'Necesita ayuda';

// Categorías que el club ya sabe reconocer, según sus listas: membresías, códigos de eventos y nómina
export function knownCategories(ws) {
  const found = new Map();
  for (const name of registryNames(ws)) {
    for (const rec of recordsFor(ws, name)) {
      const cat = categoryOf(rec);
      if (!cat || found.has(cat)) continue;
      const how = name === EVENTS ? 'trae un código de un evento'
        : rec.tier ? `la cámara lo reconoce como miembro (lista ${name})` : `trae un código de la lista ${name}`;
      found.set(cat, { name: cat, how, event: name === EVENTS, rank: rec.tier ? 0 : name === EVENTS ? 1 : 2 });
    }
  }
  return [...found.values()].sort((a, b) => a.rank - b.rank); // primero los miembros, luego eventos y luego el resto
}

const DEFAULTS = {
  VIP: { greeting: 'Es un gusto recibirle, {{name}}.', action: 'serve', wave: true,
    places: ['Salón VIP', 'Restaurante', 'Spa', 'Gimnasio', 'Terraza', 'Zona social'],
    notify: { on: true, to: 'Concierge', message: 'Llegó {{name}} (VIP). Prepare su mesa.' } },
  Regular: { greeting: 'Bienvenido de nuevo, {{name}}.', action: 'serve', places: ['Restaurante', 'Gimnasio', 'Terraza', 'Zona social'] },
  Invitado: { greeting: 'Bienvenido a {{event}}.', action: 'guide', place: EVENT_PLACE },
  'Trabajador externo': { greeting: 'Hola, {{name}}.', action: 'approve', approver: 'Supervisor de obra', place: 'Acceso de servicio' },
  'Personal del club': { greeting: 'Buen turno, {{name}}.', action: 'guide', place: 'Vestier de personal' },
};

// Respuestas iniciales del asistente para el club: una por categoría que sabe reconocer
export function defaultPlan(ws) {
  const placeNames = (ws.places ?? []).map((p) => p.name).filter((n) => n !== 'Recepción');
  return {
    name: 'Mi recepción',
    categories: knownCategories(ws).map((c) => {
      const d = DEFAULTS[c.name] ?? { greeting: 'Bienvenido, {{name}}.', action: 'serve' };
      return {
        name: c.name, on: true, wave: false, ask: '¿En qué le puedo ayudar hoy?',
        approver: 'Recepción', notify: { on: false, to: 'Recepción', message: `Llegó {{name}} (${c.name}).` },
        ...d,
        places: (d.places ?? placeNames.slice(0, 4)).filter((p) => placeNames.includes(p)),
        place: d.place ?? (c.event ? EVENT_PLACE : placeNames[0] ?? ''),
      };
    }),
    unknown: 'No logro confirmar quién es. Aviso a recepción para que le atiendan enseguida.',
  };
}

const toPlace = (p) => (p === EVENT_PLACE ? 'al lugar de su evento' : `a ${p}`);
const joinEs = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

// Lo que hará el robot con cada categoría, en palabras: el resumen del último paso del asistente
export function describePlan(plan) {
  const lines = plan.categories.filter((c) => c.on).map((c) => {
    const steps = [];
    if (c.wave) steps.push('saluda con la mano');
    steps.push(`dice «${c.greeting}»`);
    if (c.notify?.on) steps.push(`avisa a ${c.notify.to}`);
    if (c.action === 'serve') steps.push(`pregunta qué necesita y lo lleva a ${joinEs(c.places) || 'ningún lugar (elija al menos uno)'}`);
    if (c.action === 'guide') steps.push(`lo lleva ${toPlace(c.place)}`);
    if (c.action === 'approve') steps.push(`pide a ${c.approver} que apruebe su ingreso; si aprueba, lo lleva ${toPlace(c.place)}, y si no, lo pasa a recepción`);
    if (c.action === 'reception') steps.push('lo pasa a recepción');
    return { who: c.name, text: steps.join(', ') + '.' };
  });
  const off = plan.categories.filter((c) => !c.on).map((c) => c.name);
  lines.push({ who: off.length ? `Si no lo reconoce (o es ${joinEs(off)})` : 'Si no lo reconoce', text: `dice «${plan.unknown}» y avisa a recepción.` });
  return lines;
}

// Genera {name, nodes, edges}. Cada categoría es una fila de pasos; los pedidos de hablar con una persona van a un
// solo nodo compartido.
export function buildFlow(plan, { heightOf } = {}) {
  const nodes = [], edges = [];
  let seq = 0;
  const add = (type, name, config) => { const n = { id: `n${++seq}`, type, name, x: 0, y: 0, config }; nodes.push(n); return n; };
  const link = (from, fromPort, to) => edges.push({ from: from.id, fromPort, to: to.id });
  const on = plan.categories.filter((c) => c.on);

  const identify = add('visitor.identify', 'Identificar visitante', { categories: on.map((c) => c.name).join(', ') });
  let person = null; // "Una persona le atiende": se crea solo si algún camino lo necesita
  const toPerson = () => (person ??= add('escalation.assist', 'Una persona le atiende', {
    message: 'Claro, aviso a recepción para que alguien le atienda enseguida.',
    note: '{{name}} ({{category}}) necesita que le atiendan.',
  }));

  for (const c of on) {
    const chain = [];
    if (c.wave) chain.push(add('robot.gesture', `${c.name}: saludo`, { gesture: 'saludar' }));
    if (c.notify?.on) chain.push(add('escalation.notify', `${c.name}: avisar a ${c.notify.to}`, { to: c.notify.to, message: c.notify.message }));
    if (c.action === 'serve') {
      chain.push(add('robot.serve', `${c.name}: ¿qué necesita?`, {
        question: `${c.greeting} ${c.ask}`.trim(), allowed: c.places.join(', '), message: 'Con gusto, le acompaño a {{place}}.',
      }));
    } else if (c.action === 'approve') {
      chain.push(add('robot.orient', `${c.name}: saludo`, { message: `${c.greeting} Un momento, por favor: pido autorización para su ingreso.`, destination: '' }));
      chain.push(add('escalation.approve', `${c.name}: aprobación`, { to: c.approver, message: '{{name}} está en recepción. ¿Autoriza su ingreso?' }));
    } else if (c.action === 'reception') {
      chain.push(add('escalation.assist', `${c.name}: a recepción`, {
        message: `${c.greeting} Aviso a recepción para que le atiendan.`, note: '{{name}} ({{category}}) llegó y necesita atención.',
      }));
    } else {
      const guide = c.action === 'guide' && c.place;
      chain.push(add('robot.orient', `${c.name}: ${guide ? 'guiar' : 'saludo'}`, {
        message: guide ? `${c.greeting} Le acompaño a ${c.place === EVENT_PLACE ? '{{place}}' : c.place}.` : c.greeting,
        destination: guide ? c.place : '',
      }));
    }
    link(identify, c.name, chain[0]);
    chain.slice(1).forEach((n, i) => link(chain[i], 'out', n));
    const last = chain.at(-1);
    if (c.action === 'serve') { link(last, 'pide una persona', toPerson()); link(last, 'sin respuesta', toPerson()); }
    if (c.action === 'approve') {
      const ok = add('robot.orient', `${c.name}: guiar`, {
        message: `Autorizado. Le acompaño a ${c.place === EVENT_PLACE ? '{{place}}' : c.place}.`, destination: c.place,
      });
      const no = add('escalation.assist', `${c.name}: no autorizado`, {
        message: 'Su ingreso no fue autorizado. Aviso a recepción para que le atiendan.', note: 'No se autorizó el ingreso de {{name}}.',
      });
      link(last, 'aprobado', ok); link(last, 'rechazado', no);
    }
  }
  const unknown = add('escalation.assist', 'Pasar a recepción', {
    message: plan.unknown, note: 'Visitante sin categoría confirmada: {{reason}}. Cámara: {{camera}}.',
  });
  link(identify, HELP_PORT, unknown);
  return layoutFlow({ name: plan.name || 'Mi recepción', nodes, edges }, { heightOf });
}
