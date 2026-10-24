// Espacio de trabajo del framework: eventos y registros (listas) que los nodos de verificación consultan.
// Es configuración, no lógica: cada lobby trae el suyo (clubes, hoteles, oficinas, clínicas...).
export const EVENTS = 'Eventos';

export const registryNames = (ws) => [EVENTS, ...Object.keys(ws.registries ?? {})];

// Los eventos se aplanan a registros {code, role, holder, event, type, place, active}.
export function recordsFor(ws, name) {
  if (name !== EVENTS) return ws.registries?.[name] ?? [];
  return (ws.events ?? []).flatMap((ev) =>
    (ev.codes ?? []).map((c) => ({
      code: c.code, role: c.role, holder: c.holder ?? '',
      event: ev.name, type: ev.type, place: ev.place, active: ev.active !== false,
    })));
}

// Categoría que un registro asigna a quien aparece en él.
export const categoryOf = (r) => r.category ?? r.role ?? r.tier;

// Agrega a un espacio guardado lo que trae la configuración por defecto y todavía no tiene (lugares, eventos, personas,
// reservas, partes del día), sin tocar lo que el club ya editó. Sirve cuando se actualiza PIBOT con datos nuevos.
export function mergeDefaults(ws, defaults) {
  const missing = (list, extra, same) => extra.filter((x) => !list.some((y) => same(x, y)));
  const fill = (mine, theirs) => { for (const [k, v] of Object.entries(theirs)) if (!(k in mine)) mine[k] = structuredClone(v); };
  const merge = (key, same) => { ws[key] ??= []; for (const x of missing(ws[key], defaults[key] ?? [], same)) ws[key].push(structuredClone(x));
    for (const mine of ws[key]) { const theirs = (defaults[key] ?? []).find((t) => same(t, mine)); if (theirs) fill(mine, theirs); } };
  merge('places', (a, b) => a.name === b.name);
  merge('events', (a, b) => a.id === b.id);
  merge('resources', (a, b) => a.name === b.name);
  ws.registries ??= {};
  for (const [name, rows] of Object.entries(defaults.registries ?? {})) {
    ws.registries[name] ??= [];
    const same = (a, b) => (a.key ?? a.code) === (b.key ?? b.code);
    for (const x of missing(ws.registries[name], rows, same)) ws.registries[name].push(structuredClone(x));
    for (const mine of ws.registries[name]) { const theirs = rows.find((t) => same(t, mine)); if (theirs) fill(mine, theirs); }
  }
  for (const key of ['briefings', 'clock', 'faceCategories']) if (defaults[key]) { ws[key] ??= {}; fill(ws[key], defaults[key]); }
  return ws;
}
