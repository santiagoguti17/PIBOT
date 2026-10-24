import { registerNode } from '../core/registry.js';
import { fillTemplate } from '../core/engine.js';
import { clockNow, findPerson, fmtTime, toMinutes } from '../core/bookings.js';

// La agenda de una persona del club ({ agenda: { time, what, place } } en su registro) frente a la hora actual.
registerNode({
  type: 'schedule.check',
  level: 'basic',
  icon: 'clock',
  label: 'Revisar su agenda',
  group: 'Servicios',
  help: 'Mira si la persona tiene algo agendado hoy (una reunión, un turno) y si llega a tiempo o tarde. Después se pueden usar {{meeting}}, {{meetingPlace}}, {{meetingTime}} y {{minutesLate}}.',
  config: [
    { key: 'registry', label: 'Lista de personas', type: 'text' },
    { key: 'grace', label: 'Minutos de tolerancia', type: 'text' },
  ],
  defaults: { registry: 'Nómina de personal', grace: '5' },
  ports: () => ['a tiempo', 'tarde', 'sin agenda'],
  summary: ({ port, data = {} }) => (data.meeting ? `${data.meeting} ${data.meetingTime}${port === 'tarde' ? ` · ${data.minutesLate} min tarde` : ''}` : port),

  async run({ vars, workspace }, cfg) {
    const agenda = findPerson(workspace, cfg.registry, vars.name)?.agenda;
    if (!agenda) return { port: 'sin agenda' };
    const late = toMinutes(clockNow(workspace)) - toMinutes(agenda.time);
    return {
      port: late > Number(cfg.grace) ? 'tarde' : 'a tiempo',
      data: { meeting: agenda.what, meetingPlace: agenda.place, meetingTime: fmtTime(agenda.time), minutesLate: Math.max(0, late) },
    };
  },
});

// Lo que el club quiere que cada grupo sepa del día ({ briefings: { "Personal del club": ["...", "..."] } }).
registerNode({
  type: 'robot.briefing',
  level: 'basic',
  icon: 'screen',
  label: 'Dar el parte del día',
  group: 'Servicios',
  help: 'El robot cuenta, rápido y también en la pantalla, lo que el club definió para este grupo: eventos grandes, cambios, avisos del día.',
  config: [
    { key: 'audience', label: 'Parte para', type: 'text' },
    { key: 'intro', label: 'Cómo empieza', type: 'text' },
  ],
  defaults: { audience: 'Personal del club', intro: 'Le cuento rápido lo de hoy.' },
  summary: ({ data = {} }) => (data.items ? `${data.items} avisos del día` : 'Sin avisos para hoy'),

  async run({ robot, vars, workspace }, cfg) {
    const items = workspace.briefings?.[cfg.audience] ?? [];
    if (!items.length) return { port: 'out', data: { items: 0 } };
    await robot.show({ title: 'Parte del día', text: items.join('\n') });
    await robot.speak(`${fillTemplate(cfg.intro, vars)} ${items.join(' ')}`);
    return { port: 'out', data: { items: items.length } };
  },
});
