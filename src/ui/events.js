// Diálogo para gestionar eventos (fiestas, obras, reuniones...) y los códigos de acceso que cada uno reparte.
const TYPES = ['Fiesta', 'Trabajo', 'Reunión', 'Otro'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const randCode = (type) => `${(type || 'EVT').slice(0, 5).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

export function openEvents(dialog, ws, { onChange, onReset }) {
  const render = () => {
    dialog.innerHTML = `
      <form method="dialog" class="dlg">
        <header><h2>Eventos y códigos de acceso</h2><button value="close" aria-label="Cerrar">Cerrar</button></header>
        <p class="hint">Quien llega a un evento no es reconocido por la cámara: el robot le pide el código que recibió. Un evento desactivado invalida sus códigos.</p>
        <datalist id="roles"><option>Invitado</option><option>Trabajador externo</option></datalist>
        <datalist id="event-places">${(ws.places ?? []).map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
        ${(ws.events ?? []).map((ev, i) => `
          <fieldset data-ev="${i}">
            <div class="ev-row">
              <input data-f="name" value="${esc(ev.name)}" aria-label="Nombre del evento" placeholder="Nombre del evento">
              <select data-f="type" aria-label="Tipo">${TYPES.map((t) => `<option ${t === ev.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
            </div>
            <div class="ev-row">
              <input data-f="place" list="event-places" value="${esc(ev.place)}" aria-label="Lugar" placeholder="Lugar al que se guía">
              <label class="chk"><input type="checkbox" data-f="active" ${ev.active !== false ? 'checked' : ''}> Vigente</label>
            </div>
            ${(ev.codes ?? []).map((c, j) => `
              <div class="code-row" data-code="${j}">
                <input data-c="code" value="${esc(c.code)}" aria-label="Código">
                <input data-c="role" list="roles" value="${esc(c.role)}" aria-label="Rol">
                <input data-c="holder" value="${esc(c.holder)}" aria-label="Titular (opcional)" placeholder="Titular (opcional)">
                <button type="button" data-act="del-code" aria-label="Quitar código">×</button>
              </div>`).join('')}
            <div class="ev-actions"><button type="button" data-act="add-code">Añadir código</button><button type="button" data-act="del-ev">Eliminar evento</button></div>
          </fieldset>`).join('')}
        <div class="ev-actions">
          <button type="button" data-act="add-ev" class="primary-lite">Nuevo evento</button>
          <button type="button" data-act="reset">Restablecer datos de ejemplo</button>
        </div>
        <p class="hint">Las listas de membresías y nómina se editan por ahora en <code>data/club.json</code>.</p>
      </form>`;
  };

  dialog.oninput = dialog.onchange = (e) => {
    const t = e.target, fs = t.closest('fieldset'); if (!fs) return;
    const ev = ws.events[+fs.dataset.ev];
    if (t.dataset.f) ev[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.c) ev.codes[+t.closest('.code-row').dataset.code][t.dataset.c] = t.value;
    onChange();
  };
  dialog.onclick = (e) => {
    const act = e.target.dataset?.act; if (!act) return;
    const fs = e.target.closest('fieldset'), ev = fs && ws.events[+fs.dataset.ev];
    if (act === 'add-ev') ws.events.push({ id: 'e' + Date.now(), name: 'Nuevo evento', type: 'Fiesta', place: '', active: true, codes: [{ code: randCode('Fiesta'), role: 'Invitado', holder: '' }] });
    if (act === 'del-ev') ws.events.splice(+fs.dataset.ev, 1);
    if (act === 'add-code') ev.codes.push({ code: randCode(ev.type), role: ev.type === 'Trabajo' ? 'Trabajador externo' : 'Invitado', holder: '' });
    if (act === 'del-code') ev.codes.splice(+e.target.closest('.code-row').dataset.code, 1);
    if (act === 'reset') { onReset(); return; }
    onChange(); render();
  };
  render();
  dialog.showModal();
  return render;
}
