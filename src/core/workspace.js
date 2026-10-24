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
