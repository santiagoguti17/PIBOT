// Asistente "Crear flujo": tres preguntas en palabras simples (a quién recibe el robot, qué hace con cada uno y
// un resumen para revisar) y arma el flujo completo, ya conectado y ordenado. No hace falta arrastrar ni conectar nada.
import { EVENT_PLACE, buildFlow, defaultPlan, describePlan, knownCategories } from '../core/build-flow.js';
import { VARS, preview } from './vars.js';

const KEY = 'pibot.wizard.v1';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STEPS = ['Quién llega', 'Qué hace el robot', 'Revisar y crear'];
const ACTIONS = [
  ['serve', 'Le pregunta qué necesita y lo lleva', 'Ofrece los lugares que usted elija; entiende si lo pide con sus palabras.'],
  ['guide', 'Lo lleva a un lugar', 'Siempre al mismo sitio, sin preguntar.'],
  ['approve', 'Pide aprobación antes', 'Una persona autoriza el ingreso; si no, pasa a recepción.'],
  ['greet', 'Solo lo saluda', 'Ya sabe a dónde va.'],
  ['reception', 'Lo pasa a recepción', 'Una persona lo atiende.'],
];

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };

// onCreate(flow): el flujo armado; el lienzo lo carga en lugar del actual
export function openWizard(dialog, ws, { onCreate, portsOf }) {
  const fresh = defaultPlan(ws);
  let plan = load() ?? fresh;
  // Si el club cambió sus listas, aparecen las categorías nuevas y se quitan las que ya no existen
  const known = knownCategories(ws);
  plan.categories = known.map((k) => plan.categories.find((c) => c.name === k.name) ?? fresh.categories.find((c) => c.name === k.name));
  let step = 0, openCat = 0;
  const save = () => localStorage.setItem(KEY, JSON.stringify(plan));
  const places = (ws.places ?? []).map((p) => p.name).filter((n) => n !== 'Recepción');
  const isEvent = (c) => known.find((k) => k.name === c.name)?.event;
  const placeLabel = (p) => (p === EVENT_PLACE ? 'El lugar de su evento' : p);

  const chips = (target, c) => `<span class="var-chips" role="group" aria-label="Insertar un dato">${VARS
    .filter(([v]) => (isEvent(c) || !['{{event}}', '{{place}}'].includes(v)) && !['{{area}}', '{{category}}'].includes(v))
    .map(([v, l]) => `<button type="button" class="var-chip" data-var="${v}" data-target="${target}">${l}</button>`).join('')}</span>`;

  const stepWho = () => `
    <p class="wz-lead">El robot reconoce a estas personas con las listas del club. Marque a quiénes atiende con su propio camino.</p>
    <div class="wz-who">${plan.categories.map((c, i) => `
      <label class="wz-cat ${c.on ? 'is-on' : ''}">
        <input type="checkbox" data-cat="${i}" data-f="on" ${c.on ? 'checked' : ''}>
        <span><b>${esc(c.name)}</b><small>${esc(known[i].how)}</small></span>
      </label>`).join('')}</div>
    <div class="field wz-unknown">
      <label for="wz-unknown">Si no reconoce a alguien${plan.categories.some((c) => !c.on) ? ' (o es de una categoría sin marcar)' : ''}, dice esto y avisa a recepción</label>
      <textarea id="wz-unknown" data-f="unknown" rows="2">${esc(plan.unknown)}</textarea>
    </div>`;

  const placeSelect = (c, i) => `<select data-cat="${i}" data-f="place" aria-label="A dónde lo lleva">${[...(isEvent(c) ? [EVENT_PLACE] : []), ...places]
    .map((p) => `<option value="${esc(p)}" ${p === c.place ? 'selected' : ''}>${esc(placeLabel(p))}</option>`).join('')}</select>`;

  // Una categoría abierta a la vez; las demás muestran en una línea lo que hará el robot
  const summaryOf = (c) => describePlan({ ...plan, categories: [c] })[0].text;
  const sample = (() => { const ev = (ws.events ?? []).find((e) => e.active !== false); return { name: 'Camila Restrepo', event: ev?.name ?? 'su evento', place: ev?.place ?? 'Terraza', area: 'Operaciones' }; })();
  const sayLike = (text) => `Así sonaría: «${preview(text, sample)}»`;
  const stepWhat = () => {
    const on = plan.categories.map((c, i) => [c, i]).filter(([c]) => c.on);
    if (!on.some(([, i]) => i === openCat)) openCat = on[0]?.[1] ?? 0;
    return `
    <p class="wz-lead">Para cada uno, cómo lo saluda y qué hace después. Puede cambiar todo luego en el lienzo.</p>
    ${on.map(([c, i], k) => i !== openCat ? `
      <section class="wz-card is-closed">
        <button type="button" class="wz-open" data-open="${i}"><b>${esc(c.name)}</b><span>${pretty(summaryOf(c))}</span><em>Cambiar</em></button>
      </section>` : `
      <fieldset class="wz-card">
        <legend>${esc(c.name)}</legend>
        <div class="field">
          <label for="wz-g${i}">Cómo lo saluda</label>
          <input id="wz-g${i}" data-cat="${i}" data-f="greeting" value="${esc(c.greeting)}">
          ${chips(`wz-g${i}`, c)}
          <p class="say-preview" data-preview="wz-g${i}" ${c.greeting.includes('{{') ? '' : 'hidden'}>${esc(sayLike(c.greeting))}</p>
        </div>
        <div class="field"><span class="wz-label" id="wz-a${i}">Y después</span>
          <div class="wz-actions" role="radiogroup" aria-labelledby="wz-a${i}">${ACTIONS.map(([v, l, h]) => `
            <label class="wz-action ${c.action === v ? 'is-on' : ''}"><input type="radio" name="wz-act${i}" data-cat="${i}" data-f="action" value="${v}" ${c.action === v ? 'checked' : ''}>
              <b>${l}</b><small>${h}</small></label>`).join('')}</div>
        </div>
        ${c.action === 'serve' ? `<div class="field"><span class="wz-label">A dónde lo puede llevar</span>
          <div class="wz-places">${[...(isEvent(c) ? [EVENT_PLACE] : []), ...places].map((p) => `
            <button type="button" class="wz-place" data-cat="${i}" data-place="${esc(p)}" aria-pressed="${c.places.includes(p)}">${esc(placeLabel(p))}</button>`).join('')}</div>
          ${c.places.length ? '' : '<p class="wz-warn">Elija al menos un lugar.</p>'}</div>` : ''}
        ${c.action === 'guide' ? `<div class="field"><span class="wz-label">A dónde lo lleva</span>${placeSelect(c, i)}</div>` : ''}
        ${c.action === 'approve' ? `<div class="wz-row">
          <div class="field"><label for="wz-ap${i}">Quién aprueba</label><input id="wz-ap${i}" data-cat="${i}" data-f="approver" value="${esc(c.approver)}"></div>
          <div class="field"><span class="wz-label">Si aprueba, lo lleva a</span>${placeSelect(c, i)}</div></div>` : ''}
        <div class="wz-extras">
          <label class="chk"><input type="checkbox" data-cat="${i}" data-f="wave" ${c.wave ? 'checked' : ''}> Saluda con la mano</label>
          <label class="chk"><input type="checkbox" data-cat="${i}" data-f="notify.on" ${c.notify.on ? 'checked' : ''}> Avisa a alguien cuando llega</label>
        </div>
        ${c.notify.on ? `<div class="wz-row">
          <div class="field"><label for="wz-nt${i}">A quién</label><input id="wz-nt${i}" data-cat="${i}" data-f="notify.to" value="${esc(c.notify.to)}"></div>
          <div class="field"><label for="wz-nm${i}">Qué le avisa</label><input id="wz-nm${i}" data-cat="${i}" data-f="notify.message" value="${esc(c.notify.message)}"></div></div>` : ''}
        ${on[k + 1] ? `<button type="button" class="wz-next-cat" data-open="${on[k + 1][1]}">Seguir con ${esc(on[k + 1][0].name)}</button>` : ''}
      </fieldset>`).join('')}`;
  };

  const pretty = (t) => esc(t).replace(/\{\{(\w+)\}\}/g, (_, v) => `<span class="var-pill">${esc(VARS.find(([x]) => x === `{{${v}}}`)?.[1] ?? v)}</span>`);
  const stepReview = () => `
    <p class="wz-lead">Así recibirá el robot a cada persona.</p>
    <ol class="wz-story">${describePlan(plan).map((l) => `<li><b>${esc(l.who)}</b><span>${pretty(l.text)}</span></li>`).join('')}</ol>
    <div class="field"><label for="wz-name">Nombre del flujo</label><input id="wz-name" data-f="name" value="${esc(plan.name)}"></div>
    <p class="hint">Reemplaza el flujo que está en el lienzo. Si se arrepiente, use Deshacer.</p>`;

  const ready = () => plan.categories.every((c) => !c.on || c.action !== 'serve' || c.places.length);
  const render = () => {
    dialog.innerHTML = `
      <form method="dialog" class="dlg wz">
        <header><h2>Crear un flujo</h2><button value="close" class="quiet">Cerrar</button></header>
        <ol class="wz-steps">${STEPS.map((s, i) => `<li ${i === step ? 'aria-current="step"' : ''} class="${i < step ? 'is-done' : ''}">${s}</li>`).join('')}</ol>
        <div class="wz-body">${[stepWho, stepWhat, stepReview][step]()}</div>
        <footer class="wz-foot">
          ${step ? '<button type="button" data-act="back">Atrás</button>' : '<button type="button" class="quiet" data-act="reset">Empezar de cero</button>'}
          <span class="spacer"></span>
          ${step < 2 ? `<button type="button" class="primary" data-act="next" ${step === 1 && !ready() ? 'disabled' : ''}>Siguiente</button>`
            : '<button type="button" class="primary" data-act="create">Crear flujo</button>'}
        </footer>
      </form>`;
    dialog.querySelector('.wz-body').scrollTop = 0;
  };

  const setField = (t) => {
    const c = t.dataset.cat !== undefined ? plan.categories[+t.dataset.cat] : null;
    const value = t.type === 'checkbox' ? t.checked : t.value;
    if (!c) { plan[t.dataset.f] = value; return false; }
    const [a, b] = t.dataset.f.split('.');
    if (b) c[a][b] = value; else c[a] = value;
    return t.type === 'checkbox' || t.type === 'radio'; // cambian lo que se muestra
  };
  dialog.oninput = (e) => {
    if (!e.target.dataset.f || ['checkbox', 'radio'].includes(e.target.type)) return;
    setField(e.target); save();
    const say = dialog.querySelector(`[data-preview="${e.target.id}"]`); // cómo sonará el saludo
    if (say) { say.hidden = !e.target.value.includes('{{'); say.textContent = sayLike(e.target.value); }
  };
  dialog.onchange = (e) => {
    if (!e.target.dataset.f) return;
    const scroll = dialog.querySelector('.wz-body').scrollTop;
    if (setField(e.target)) { save(); render(); dialog.querySelector('.wz-body').scrollTop = scroll; } else save();
  };
  dialog.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.var) { // inserta el dato donde está el cursor
      const input = dialog.querySelector(`#${b.dataset.target}`), at = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, at) + b.dataset.var + input.value.slice(input.selectionEnd ?? at);
      input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
      input.setSelectionRange(at + b.dataset.var.length, at + b.dataset.var.length);
      return;
    }
    if (b.dataset.open) { openCat = +b.dataset.open; render(); dialog.querySelector('fieldset.wz-card')?.scrollIntoView({ block: 'nearest' }); return; }
    if (b.dataset.place) {
      const c = plan.categories[+b.dataset.cat], p = b.dataset.place;
      c.places = c.places.includes(p) ? c.places.filter((x) => x !== p) : [...c.places, p];
      save(); const scroll = dialog.querySelector('.wz-body').scrollTop; render(); dialog.querySelector('.wz-body').scrollTop = scroll; return;
    }
    const act = b.dataset.act; if (!act) return;
    if (act === 'next') step++;
    if (act === 'back') step--;
    if (act === 'reset') plan = structuredClone(fresh);
    if (act === 'create') { onCreate(buildFlow(plan, { portsOf })); dialog.close(); return; }
    save(); render();
  };
  render();
  dialog.showModal();
}
