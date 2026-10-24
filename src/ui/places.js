// Diálogo para definir los lugares del club a los que el robot puede guiar: nombre, qué hay ahí y ubicación.
// Sin código: se crean haciendo clic en el plano, se arrastran, o se toma la posición actual del robot
// (llevándolo hasta el sitio, por ejemplo con su control remoto). El nombre es el que se usa en "A dónde lo guía".
import { MujocoBridgeRobot } from '../robot/mujoco-bridge.js';
import { H, W, drawPlan, toWorld } from './map.js';
import { PLACE_KINDS, colorOf, kindOf } from './place-kinds.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// getPose / onSaveToRobot: cuando PIBOT corre en el robot, su posición llega en vivo y guardar es publicar en él
export function openPlaces(dialog, ws, { onChange, onReset, robotUrl, getPose, onSaveToRobot }) {
  ws.places ??= [];
  let robot = null, pose = null, timer = null, dragging = null, message = '';
  let status = getPose ? 'Conectado a este robot: llévelo con el control a cada lugar y pulse "Aquí está el robot".'
    : robotUrl ? 'Conectando con el robot…'
    : 'Sin robot conectado: para ver su posición y usarla, elija "AgiBot X2 en MuJoCo" arriba a la derecha.';

  const render = () => {
    dialog.innerHTML = `
      <form method="dialog" class="dlg">
        <header><h2>Lugares del club</h2><button value="close" aria-label="Cerrar">Cerrar</button></header>
        <p class="hint">A dónde puede guiar el robot. Haga clic en el plano para crear un lugar y arrástrelo para moverlo,
          o lleve el robot hasta el sitio y pulse "Aquí está el robot". El nombre es el que se escribe en
          "A dónde lo guía" de los nodos. En "Qué hay ahí" escriba cómo lo pediría un visitante, para que el robot
          lo entienda ("masajes, sauna"). El tipo y el color deciden cómo se ve en el mapa y cómo se amobla en MuJoCo.
          El robot espera en <b>Recepción</b> y vuelve allí después de guiar.</p>
        <svg class="pl-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Plano del lobby visto desde arriba"></svg>
        <p class="hint pl-status" aria-live="polite"></p>
        <div class="pl-row pl-head"><span>Nombre</span><span>Qué hay ahí</span><span>Tipo y color</span><span>x (m)</span><span>y (m)</span><span></span><span></span></div>
        ${ws.places.map((p, i) => `
          <div class="pl-row" data-i="${i}">
            <input data-f="name" value="${esc(p.name)}" aria-label="Nombre del lugar">
            <input data-f="desc" value="${esc(p.desc)}" aria-label="Qué hay ahí" placeholder="Cómo lo pediría un visitante">
            <span class="pl-kind">
              <input data-f="color" type="color" value="${colorOf(p)}" aria-label="Color en el mapa">
              <select data-f="kind" aria-label="Tipo de lugar">${Object.entries(PLACE_KINDS).map(([k, v]) =>
                `<option value="${k}" ${k === kindOf(p) ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
            </span>
            <input data-f="x" type="number" step="0.1" value="${p.x}" aria-label="x en metros">
            <input data-f="y" type="number" step="0.1" value="${p.y}" aria-label="y en metros">
            <button type="button" data-act="here" ${robot?.can('pose') || (getPose && pose) ? '' : 'disabled'}>Aquí está el robot</button>
            <button type="button" data-act="del" aria-label="Quitar lugar">×</button>
          </div>`).join('')}
        <div class="ev-actions">
          <button type="button" data-act="add" class="primary-lite">Nuevo lugar</button>
          <button type="button" data-act="send" ${robot?.can('places') || onSaveToRobot ? '' : 'disabled'}>Guardar en el robot</button>
          <button type="button" data-act="reset">Restablecer lugares de ejemplo</button>
        </div>
      </form>`;
    drawMap(); showStatus();
  };

  const svg = () => dialog.querySelector('.pl-map');
  const drawMap = () => { if (svg()) drawPlan(svg(), { places: ws.places, robot: pose }); };

  function showStatus() {
    const names = ws.places.map((p) => p.name.trim().toLowerCase());
    const dup = names.filter((n, i) => n && names.indexOf(n) !== i);
    const parts = [status, pose && `Robot en x ${pose.x?.toFixed(1)} · y ${pose.y?.toFixed(1)} m.`, message,
      dup.length && `Hay lugares con el mismo nombre: ${[...new Set(dup)].join(', ')}.`,
      names.includes('') && 'Hay un lugar sin nombre.'];
    const box = dialog.querySelector('.pl-status');
    if (box) box.textContent = parts.filter(Boolean).join(' ');
  }

  const toMap = (e) => {
    const pt = svg().createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg().getScreenCTM().inverse());
  };
  const syncRow = (i) => {
    const row = dialog.querySelector(`.pl-row[data-i="${i}"]`); if (!row) return;
    row.querySelector('[data-f="x"]').value = ws.places[i].x;
    row.querySelector('[data-f="y"]').value = ws.places[i].y;
  };

  dialog.onpointerdown = (e) => {
    if (!e.target.closest('.pl-map')) return;
    if (e.target.dataset.i !== undefined) { dragging = +e.target.dataset.i; e.target.setPointerCapture(e.pointerId); return; }
    const p = toMap(e), w = toWorld(p.x, p.y); // clic en un sitio vacío: lugar nuevo ahí
    ws.places.push({ name: `Lugar ${ws.places.length + 1}`, desc: '', ...w });
    onChange(); render();
    const input = dialog.querySelector(`.pl-row[data-i="${ws.places.length - 1}"] [data-f="name"]`);
    input?.focus(); input?.select();
  };
  dialog.onpointermove = (e) => {
    if (dragging === null) return;
    const p = toMap(e);
    Object.assign(ws.places[dragging], toWorld(p.x, p.y));
    syncRow(dragging); drawMap();
  };
  dialog.onpointerup = () => { if (dragging !== null) { dragging = null; onChange(); } };

  dialog.oninput = (e) => {
    const t = e.target, row = t.closest('.pl-row[data-i]'); if (!row || !t.dataset.f) return;
    const place = ws.places[+row.dataset.i];
    place[t.dataset.f] = ['name', 'desc', 'color', 'kind'].includes(t.dataset.f) ? t.value : (parseFloat(t.value) || 0);
    if (t.dataset.f === 'kind') { // el color sigue al tipo, salvo que el club haya elegido otro
      place.color = PLACE_KINDS[t.value].color;
      row.querySelector('[data-f="color"]').value = place.color;
    }
    message = ''; drawMap(); showStatus(); onChange();
  };
  dialog.onclick = async (e) => {
    const act = e.target.dataset?.act; if (!act) return;
    const i = +e.target.closest('.pl-row')?.dataset.i;
    message = '';
    if (act === 'add') ws.places.push({ name: `Lugar ${ws.places.length + 1}`, desc: '', x: pose ? +pose.x.toFixed(1) : -1, y: pose ? +pose.y.toFixed(1) : 0 });
    if (act === 'del') ws.places.splice(i, 1);
    if (act === 'here' && pose) Object.assign(ws.places[i], { x: +pose.x.toFixed(1), y: +pose.y.toFixed(1) });
    if (act === 'reset') { onReset(); return; }
    if (act === 'send') {
      try {
        if (onSaveToRobot) await onSaveToRobot();
        else await robot.savePlaces(ws.places.map((p) => ({ name: p.name.trim(), x: +p.x, y: +p.y, kind: kindOf(p), color: colorOf(p) })));
        message = 'Lugares guardados en el robot.';
      } catch (err) { message = `No se pudieron guardar: ${err.message}.`; }
      showStatus(); return;
    }
    onChange(); render();
  };

  dialog.addEventListener('close', () => { clearInterval(timer); robot?.close(); }, { once: true });

  if (getPose) {
    timer = setInterval(() => {
      pose = getPose();
      if (dragging === null) drawMap();
      showStatus();
      dialog.querySelectorAll('[data-act="here"]').forEach((b) => { b.disabled = !pose; });
    }, 600);
  } else if (robotUrl) {
    robot = new MujocoBridgeRobot({}, { url: robotUrl });
    robot.connect().then(() => {
      status = robot.can('pose') ? 'Conectado al robot.' : 'Conectado, pero este puente no informa la posición del robot.';
      render();
      if (robot.can('pose')) {
        timer = setInterval(async () => {
          pose = await robot.pose().catch(() => null);
          if (dragging === null) drawMap();
          showStatus();
          dialog.querySelectorAll('[data-act="here"]').forEach((b) => { b.disabled = !pose; });
        }, 600);
      }
    }).catch((err) => { robot = null; status = `${err.message}. Sin la posición del robot.`; showStatus(); });
  }

  render();
  dialog.showModal();
}
