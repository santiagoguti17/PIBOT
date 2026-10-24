import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';
import { list } from '../identify/methods.js';
import {
  book, findPerson, findResource, fmtTime, freeSlots, getResource, joinEs, parseTime, resourcesOf, sentenceNot, slotStatus, whyNot, withArticle,
} from '../core/bookings.js';

const NO = 'No, gracias';

// Lo que el club sabe de la costumbre de un miembro ({ habit: { resource, time } } en su registro): el robot la tiene
// en cuenta, y si el horario no se puede, propone reprogramar.
registerNode({
  type: 'booking.habit',
  level: 'basic',
  icon: 'clock',
  label: 'Su reserva habitual',
  group: 'Servicios',
  help: 'Revisa la costumbre del miembro (por ejemplo, tenis a las 3 pm). Si el horario está libre, lo confirma; si no, le explica por qué y le propone otro horario para reprogramarlo.',
  config: [
    { key: 'registry', label: 'Lista de miembros', type: 'text' },
    { key: 'ask', label: 'Qué pregunta para reprogramar ({{time}} = horario propuesto)', type: 'text' },
  ],
  defaults: { registry: 'Membresías', ask: '¿Le reprogramo a las {{time}}?' },
  ports: () => ['confirmada', 'reprogramada', 'no quiso', 'sin horario', 'sin hábito'],
  summary: ({ port, data = {} }) => (data.resource ? `${port}: ${data.resource} ${data.time}` : port),

  async run({ robot, vars, workspace }, cfg) {
    const habit = findPerson(workspace, cfg.registry, vars.name)?.habit;
    const res = habit && getResource(workspace, habit.resource);
    if (!res) return { port: 'sin hábito' };
    const name = vars.name, first = String(name).split(' ')[0], st = slotStatus(res, habit.time), place = res.place ?? res.name;
    const usual = `${withArticle(res)} a las ${fmtTime(habit.time)}`;

    if (st.state === 'free') {
      book(res, habit.time, name, vars.category);
      await robot.speak(`${first}, ya tengo lista ${usual}, como le gusta.`);
      return { port: 'confirmada', data: { resource: res.name, time: fmtTime(habit.time), place } };
    }
    const alt = freeSlots(res).find((t) => t > habit.time) ?? freeSlots(res)[0];
    if (!alt) {
      await robot.speak(`${first}, sé que le gusta jugar en ${usual}, pero hoy ${whyNot(st)} y ya no quedan más horarios.`);
      return { port: 'sin horario', data: { resource: res.name } };
    }
    const yes = `Sí, a las ${fmtTime(alt)}`;
    await robot.speak(`${first}, sé que le gusta jugar en ${usual}. Lamentablemente hoy no se puede a esa hora: ${whyNot(st)}.`);
    const answer = await robot.choose(fillTemplate(cfg.ask, { time: fmtTime(alt) }), [yes, NO], {
      hints: { [yes]: 'sí, dale, está bien, perfecto, de acuerdo, claro, listo, ok', [NO]: 'no, mejor no, déjelo así, otro día, cancelar' },
    });
    if (answer !== yes) {
      await robot.speak('Entendido, no hay problema.');
      return { port: 'no quiso', data: { resource: res.name } };
    }
    book(res, alt, name, vars.category);
    await robot.speak(`Listo, ${first}: queda reservada ${withArticle(res)} a las ${fmtTime(alt)} a su nombre.`);
    return { port: 'reprogramada', data: { resource: res.name, time: fmtTime(alt), place } };
  },
});

// El visitante dice qué quiere reservar y a qué hora ("quiero tenis hoy a las 5 pm"). El robot revisa las reservas del día:
// si está libre, reserva; si no, explica por qué y ofrece otros horarios u otras opciones.
registerNode({
  type: 'booking.request',
  level: 'basic',
  icon: 'calendar',
  label: 'Tomar una reserva',
  group: 'Servicios',
  help: 'El visitante dice qué quiere reservar y a qué hora. El robot revisa las reservas del día: si está libre, la hace; si no, explica por qué (mantenimiento, reservada por otro miembro...) y ofrece otros horarios o las alternativas que el club elija.',
  config: [
    { key: 'question', label: 'Qué pregunta el robot', type: 'text' },
    { key: 'alternatives', label: 'Otras opciones que ofrece si no hay cupo (coma)', type: 'text',
      suggest: (ws) => resourcesOf(ws).map((r) => r.name) },
  ],
  defaults: { question: '¿Qué le gustaría reservar hoy?', alternatives: '' },
  ports: () => ['reservado', 'alternativa', 'sin reserva', 'no entendí', 'sin respuesta'],
  summary: ({ port, data = {} }) => (data.resource ? `${port}: ${data.resource} ${data.time}` : port),

  async run({ robot, vars, workspace }, cfg) {
    const name = vars.name || 'visitante', all = resourcesOf(workspace);
    const done = (port, res, time) => ({ port, data: { resource: res.name, time: fmtTime(time), place: res.place ?? res.name } });
    const confirm = async (res, time) => {
      book(res, time, name, vars.category);
      await robot.speak(`Listo: ${withArticle(res)} queda reservada hoy a las ${fmtTime(time)} a nombre de ${name}.`);
    };
    const pickTime = async (res, times) => {
      const labels = times.map(fmtTime), a = await robot.choose('¿A qué hora le sirve?', [...labels, NO]);
      return times[labels.indexOf(a)] ?? null;
    };

    // 1. Qué quiere reservar
    let question = fillTemplate(cfg.question, vars), res = null, time = null;
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
      const said = await robot.ask(question, { kind: 'request' });
      if (!said) return { port: 'sin respuesta' };
      res = findResource(workspace, said);
      if (res) time = parseTime(said, res.slots);
      else { await robot.speak(`No le entendí qué desea reservar. Puedo reservar ${joinEs(all.map(withArticle), 'o')}.`); question = '¿Qué le gustaría reservar?'; }
    }
    if (!res) return { port: 'no entendí' };

    // 2. Sin hora: se ofrecen las libres. Con hora: si está libre se reserva; si no, se explica por qué y se ofrecen las demás
    if (!time) {
      const times = freeSlots(res);
      if (!times.length) await robot.speak(`Para hoy ya no quedan horarios de ${res.name.toLowerCase()}.`);
      else {
        const t = await pickTime(res, times);
        if (t) { await confirm(res, t); return done('reservado', res, t); }
      }
    } else {
      const st = slotStatus(res, time), others = freeSlots(res);
      if (st.state === 'free') { await confirm(res, time); return done('reservado', res, time); }
      await robot.speak(`${sentenceNot(st)}${others.length ? `. Para hoy todavía quedan ${joinEs(others.map(fmtTime), 'y')}` : `, y para hoy no quedan más horarios de ${res.name.toLowerCase()}`}.`);
      if (others.length) {
        const t = await pickTime(res, others);
        if (t) { await confirm(res, t); return done('reservado', res, t); }
      }
    }

    // 3. Otras opciones del club con horario libre
    const options = list(cfg.alternatives).map((n) => getResource(workspace, n)).filter((r) => r && r !== res && freeSlots(r).length);
    if (!options.length) { await robot.speak('Lo siento, hoy no tengo más opciones para ofrecerle.'); return { port: 'sin reserva' }; }
    await robot.speak(`Pero tiene más opciones: ${joinEs(options.map(withArticle), 'o')}.`);
    const pick = await robot.choose('¿Le reservo alguna?', [...options.map((r) => r.name), NO], {
      hints: Object.fromEntries(options.map((r) => [r.name, (r.aliases ?? []).join(', ')])),
    });
    const chosen = options.find((r) => r.name === pick);
    if (!chosen) { await robot.speak('Está bien. Si cambia de opinión, aquí estoy.'); return { port: 'sin reserva' }; }
    const first = freeSlots(chosen)[0];
    await confirm(chosen, first);
    return done('alternativa', chosen, first);
  },
});
