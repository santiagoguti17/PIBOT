// Registro de visitas atendidas: una fila por llegada y un resumen para saber si el robot está orientando bien
// (cuántas resolvió solo, cuántas pasó a recepción, cuánto tardó). Se guarda en el navegador.
const KEY = 'pibot.visits.v1';
const MAX = 500;

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const save = (visits) => localStorage.setItem(KEY, JSON.stringify(visits.slice(-MAX)));

// Resume una ejecución del flujo: categoría que dio "Identificar visitante", cómo se confirmó y cómo terminó.
export function recordVisit({ person, res, routes, notified, seconds }) {
  const identify = res.trace.find((t) => t.type === 'visitor.identify');
  const escalated = res.trace.some((t) => t.type === 'escalation.assist') || notified.includes('Recepción');
  const result = res.status !== 'ok' ? `Error: ${res.error}`
    : escalated ? 'Pasó a recepción'
    : routes.length ? `Guiado a ${routes.at(-1)}` : 'Orientado sin guiar';
  const visit = {
    at: new Date().toISOString(), visitor: person.name, category: identify?.port ?? '—',
    via: identify?.data?.via ?? '', result, escalated, ok: res.status === 'ok', seconds: Math.round(seconds),
  };
  save([...load(), visit]);
  return visit;
}

const cell = (tag, text, cls) => { const c = document.createElement(tag); c.textContent = text; if (cls) c.className = cls; return c; };

// Una visita que atendió el robot por su cuenta (PIBOT en el robot): se anota igual que las de aquí
export function addVisit(visit) { save([...load(), visit]); }

// onEmpty: a dónde lleva el botón cuando todavía no hay visitas (a probar el flujo)
export function renderVisits(el, { onEmpty } = {}) {
  const visits = load();
  if (!visits.length) {
    el.innerHTML = '<div class="vs-empty"><p>Todavía no hay visitas. Reciba a alguien desde Diseñar o En vivo y aparecerá aquí.</p><button type="button" class="primary-lite">Probar el flujo</button></div>';
    el.querySelector('button').onclick = () => onEmpty?.();
    return;
  }
  const solved = visits.filter((v) => v.ok && !v.escalated).length;
  const escalated = visits.filter((v) => v.escalated).length;
  const avg = Math.round(visits.reduce((s, v) => s + v.seconds, 0) / visits.length);
  const pct = (n) => `${Math.round((100 * n) / visits.length)} %`;
  const byCat = Object.entries(visits.reduce((m, v) => ({ ...m, [v.category]: (m[v.category] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]);
  const top = byCat[0][1];
  el.innerHTML = `
    <dl class="vs-sum">
      <div><dt>Visitas</dt><dd>${visits.length}</dd></div>
      <div><dt>Resueltas por el robot</dt><dd>${solved}<small>${pct(solved)}</small></dd></div>
      <div><dt>Pasaron a recepción</dt><dd>${escalated}<small>${pct(escalated)}</small></dd></div>
      <div><dt>Duración promedio</dt><dd>${avg}<small>s</small></dd></div>
    </dl>
    <div class="vs-cols">
      <section class="panel"><div class="panel-head"><h2>Quién llegó</h2></div><ul class="vs-cats"></ul></section>
      <section class="panel">
        <div class="panel-head"><h2>Últimas visitas</h2>
          <div class="ev-actions"><button type="button" class="quiet" data-vs="csv">Exportar CSV</button><button type="button" class="quiet" data-vs="clear">Borrar registro</button></div>
        </div>
        <table class="vs-table"><thead><tr><th>Hora</th><th>Visitante</th><th>Categoría</th><th>Resultado</th><th>Duración</th></tr></thead><tbody></tbody></table>
      </section>
    </div>`;
  el.querySelector('.vs-cats').append(...byCat.map(([c, n]) => {
    const li = document.createElement('li');
    li.title = `${c}: ${n} de ${visits.length} visitas`;
    li.append(cell('b', c), cell('em', String(n)), document.createElement('span'));
    const bar = document.createElement('i'); bar.style.width = `${(100 * n) / top}%`;
    li.querySelector('span').append(bar);
    return li;
  }));
  el.querySelector('tbody').append(...visits.slice(-12).reverse().map((v) => {
    const tr = document.createElement('tr');
    const who = cell('td', v.visitor);
    if (v.via) who.append(cell('div', `Confirmado por ${v.via}`, 'hint'));
    const cat = document.createElement('td'); cat.append(cell('span', v.category, 'vs-tag'));
    tr.append(cell('td', new Date(v.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), who, cat,
      cell('td', v.result), cell('td', `${v.seconds} s`));
    if (v.escalated || !v.ok) tr.className = 'vs-flag';
    return tr;
  }));
  el.querySelector('[data-vs="csv"]').onclick = () => {
    const rows = [['hora', 'visitante', 'categoría', 'cómo se confirmó', 'resultado', 'duración_s'],
      ...visits.map((v) => [v.at, v.visitor, v.category, v.via, v.result, v.seconds])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'visitas.csv'; a.click();
  };
  el.querySelector('[data-vs="clear"]').onclick = () => { localStorage.removeItem(KEY); renderVisits(el, { onEmpty }); };
}
