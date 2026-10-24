import { getNode, listNodes } from '../core/registry.js';
import { icon } from './icons.js';
import { getMethod, WHEN } from '../identify/methods.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const GROUP_COLORS = { 'Percepción': '#0e7490', 'Decisión': '#b45309', 'Acciones del robot': '#15803d', 'Verificación': '#4338ca', 'Escalamiento': '#be123c' };
export const groupColor = (g) => GROUP_COLORS[g] ?? '#64748b';

// Editor visual de flujos: nodos arrastrables, conexiones, inspector de configuración.
export class Editor {
  constructor({ canvas, svg, palette, inspector }) {
    Object.assign(this, { canvas, svg, paletteEl: palette, inspectorEl: inspector });
    this.world = canvas.querySelector('#world');
    this.zoom = 1;
    this.workspace = {};
    this.flow = { name: 'Flujo', nodes: [], edges: [] };
    this.selected = null; // {kind:'node'|'edge', ref}
    this.status = {};
    this.results = {};
    this.taken = new Set();
    this.onChange = () => {};
    this.buildPalette();
    this.bindCanvas();
  }

  load(flow) {
    this.flow = JSON.parse(JSON.stringify(flow));
    this.selected = null; this.clearRun();
    this.render(); this.renderInspector();
  }

  // ---- paleta ----
  buildPalette() {
    this.paletteEl.innerHTML = '';
    const item = (d) => {
      const it = document.createElement('div'); it.className = 'pal-item'; it.title = d.help ?? '';
      it.style.setProperty('--c', groupColor(d.group)); it.classList.toggle('is-sim', d.real === false);
      it.innerHTML = `${icon(d.icon)}<span>${d.label}</span>`; it.tabIndex = 0; it.draggable = true;
      it.ondragstart = (ev) => ev.dataTransfer.setData('text/node-type', d.type);
      const add = () => this.addNode(d.type, 60 + this.flow.nodes.length * 25, 60 + this.flow.nodes.length * 25);
      it.onclick = add; it.onkeydown = (ev) => { if (ev.key === 'Enter') add(); };
      return it;
    };
    const defs = listNodes();
    const basic = {};
    defs.filter((d) => d.level === 'basic').forEach((d) => (basic[d.group] ??= []).push(d));
    const ORDER = ['Verificación', 'Acciones del robot', 'Decisión', 'Escalamiento'];
    for (const [g, ds] of Object.entries(basic).sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))) {
      const box = document.createElement('div'); box.className = 'pal-group'; box.innerHTML = `<b>${g}</b>`;
      ds.forEach((d) => box.append(item(d))); this.paletteEl.append(box);
    }
    const adv = document.createElement('details'); adv.className = 'pal-adv';
    adv.innerHTML = '<summary>Avanzado: nodos sueltos</summary>';
    const groups = {};
    defs.filter((d) => d.level !== 'basic').forEach((d) => (groups[d.group] ??= []).push(d));
    for (const [g, ds] of Object.entries(groups)) {
      const box = document.createElement('div'); box.className = 'pal-group'; box.innerHTML = `<b>${g}</b>`;
      ds.forEach((d) => box.append(item(d))); adv.append(box);
    }
    this.paletteEl.append(adv);
  }

  addNode(type, x, y) {
    const n = Math.max(0, ...this.flow.nodes.map((n) => +n.id.slice(1))) + 1;
    const node = { id: 'n' + n, type, x, y, config: { ...getNode(type).defaults } };
    this.flow.nodes.push(node);
    this.select({ kind: 'node', ref: node });
    this.render(); this.onChange();
  }

  // ---- render ----
  render() {
    this.canvas.querySelectorAll('.node').forEach((n) => n.remove());
    for (const node of this.flow.nodes) this.world.append(this.nodeEl(node));
    this.drawEdges();
  }

  nodeEl(node) {
    const def = getNode(node.type);
    const el = document.createElement('div');
    el.className = 'node'; el.dataset.id = node.id; el.style.setProperty('--c', groupColor(def?.group));
    el.style.left = node.x + 'px'; el.style.top = node.y + 'px';
    if (this.selected?.ref === node) el.classList.add('selected');
    if (this.status[node.id]) el.classList.add(this.status[node.id]);
    const head = document.createElement('div'); head.className = 'node-head';
    const sim = def?.real === false;
    el.classList.toggle('is-sim', sim);
    head.innerHTML = `${icon(def?.icon)}<span class="title">${node.name || def?.label || node.type}</span><span class="mode ${sim ? 'sim' : 'real'}" title="${sim ? 'Simulado: no usa un sistema real' : 'Real: funciona de verdad'}">${sim ? 'Simulado' : 'Real'}</span>`;
    const inPort = document.createElement('span'); inPort.className = 'port in';
    inPort.dataset.node = node.id; inPort.dataset.in = '1';
    head.append(inPort); el.append(head);
    for (const port of def?.ports({ ...def.defaults, ...node.config }) ?? []) {
      const row = document.createElement('div'); row.className = 'out-row';
      row.innerHTML = `${port === 'out' ? 'siguiente' : port}<span class="port out" data-node="${node.id}" data-port="${port}"></span>`;
      el.append(row);
    }
    const res = document.createElement('div'); res.className = 'node-result'; res.textContent = this.results[node.id] ?? '';
    if (!res.textContent) res.hidden = true;
    el.append(res);
    head.onmousedown = (e) => this.startDrag(e, node, el);
    el.onmousedown = () => { if (this.selected?.ref !== node) this.select({ kind: 'node', ref: node }); };
    el.querySelectorAll('.port.out').forEach((p) => (p.onmousedown = (e) => this.startConnect(e, node.id, p.dataset.port)));
    return el;
  }

  portPos(sel) {
    const p = this.canvas.querySelector(sel);
    if (!p) return null;
    const r = p.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
    return { x: (r.left - c.left + this.canvas.scrollLeft + r.width / 2) / this.zoom, y: (r.top - c.top + this.canvas.scrollTop + r.height / 2) / this.zoom };
  }

  curve(a, b) { const dx = Math.max(40, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; }

  drawEdges() {
    this.svg.innerHTML = '';
    for (const edge of this.flow.edges) {
      const a = this.portPos(`.port.out[data-node="${edge.from}"][data-port="${edge.fromPort}"]`);
      const b = this.portPos(`.port.in[data-node="${edge.to}"]`);
      if (!a || !b) continue;
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', this.curve(a, b));
      if (this.taken.has(edge)) path.classList.add('taken');
      if (this.selected?.ref === edge) path.classList.add('sel');
      path.onclick = () => this.select({ kind: 'edge', ref: edge });
      this.svg.append(path);
    }
  }

  // ---- interacción ----
  startDrag(e, node, el) {
    const z = this.zoom, sx = e.clientX / z - node.x, sy = e.clientY / z - node.y;
    const move = (ev) => { node.x = Math.max(0, ev.clientX / z - sx); node.y = Math.max(0, ev.clientY / z - sy); el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; this.drawEdges(); };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); this.onChange(); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  }

  startConnect(e, from, fromPort) {
    e.stopPropagation(); e.preventDefault();
    const a = this.portPos(`.port.out[data-node="${from}"][data-port="${fromPort}"]`);
    const tmp = document.createElementNS(SVGNS, 'path'); this.svg.append(tmp);
    const cr = () => this.canvas.getBoundingClientRect();
    const move = (ev) => tmp.setAttribute('d', this.curve(a, { x: (ev.clientX - cr().left + this.canvas.scrollLeft) / this.zoom, y: (ev.clientY - cr().top + this.canvas.scrollTop) / this.zoom }));
    const up = (ev) => {
      removeEventListener('mousemove', move); removeEventListener('mouseup', up); tmp.remove();
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.port.in');
      if (target && target.dataset.node !== from) {
        this.flow.edges = this.flow.edges.filter((x) => !(x.from === from && x.fromPort === fromPort));
        this.flow.edges.push({ from, fromPort, to: target.dataset.node });
        this.drawEdges(); this.onChange();
      }
    };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  }

  bindCanvas() {
    this.canvas.ondragover = (e) => e.preventDefault();
    this.canvas.ondrop = (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/node-type'); if (!type) return;
      const r = this.canvas.getBoundingClientRect();
      this.addNode(type, (e.clientX - r.left + this.canvas.scrollLeft) / this.zoom - 100, (e.clientY - r.top + this.canvas.scrollTop) / this.zoom - 20);
    };
    this.canvas.addEventListener('mousedown', (e) => { if (e.target === this.canvas || e.target === this.world || e.target === this.svg) this.select(null); });
    addEventListener('keydown', (e) => {
      if (!['Delete', 'Backspace'].includes(e.key) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !this.selected) return;
      const { kind, ref } = this.selected;
      if (kind === 'edge') this.flow.edges = this.flow.edges.filter((x) => x !== ref);
      else {
        this.flow.nodes = this.flow.nodes.filter((x) => x !== ref);
        this.flow.edges = this.flow.edges.filter((x) => x.from !== ref.id && x.to !== ref.id);
      }
      this.select(null); this.render(); this.onChange();
    });
  }

  select(sel) {
    this.selected = sel;
    this.render(); this.renderInspector();
    if (sel?.kind === 'node') this.inspectorEl.scrollIntoView({ block: 'nearest' });
  }

  // ---- zoom ----
  setZoom(z) { this.zoom = Math.min(1.5, Math.max(0.3, z)); this.world.style.transform = `scale(${this.zoom})`; }
  fit() {
    const els = [...this.world.querySelectorAll('.node')];
    if (!els.length) return this.setZoom(1);
    const w = Math.max(...this.flow.nodes.map((n) => n.x)) + 250;
    const h = Math.max(...els.map((el) => el.offsetTop + el.offsetHeight)) + 30;
    this.setZoom(Math.max(0.5, Math.min(1, (this.canvas.clientWidth - 16) / w, (this.canvas.clientHeight - 16) / h)));
    this.canvas.scrollTo(0, 0);
  }

  // ---- inspector ----
  renderInspector() {
    const el = this.inspectorEl;
    if (this.selected?.kind !== 'node') { el.className = 'hint'; el.textContent = 'Haga clic en un nodo para configurarlo. Supr borra el nodo o la conexión seleccionada.'; return; }
    const node = this.selected.ref, def = getNode(node.type);
    el.className = ''; el.innerHTML = `<p class="node-help">${def.help ?? ''}</p>`;
    const nameWrap = document.createElement('div'); nameWrap.className = 'field';
    nameWrap.innerHTML = '<label>Nombre del nodo</label>';
    const nameIn = document.createElement('input'); nameIn.value = node.name ?? ''; nameIn.placeholder = def.label;
    nameIn.oninput = () => { node.name = nameIn.value; this.canvas.querySelector(`.node[data-id="${node.id}"] .title`).textContent = nameIn.value || def.label; this.onChange(); };
    nameWrap.append(nameIn); el.append(nameWrap);
    for (const f of def.config) {
      if (f.type === 'methods') { el.append(this.methodsEditor(node, def)); continue; }
      const wrap = document.createElement('div'); wrap.className = 'field';
      wrap.innerHTML = `<label>${f.label}</label>`;
      const val = node.config[f.key] ?? def.defaults[f.key] ?? '';
      let input;
      if (f.type === 'select') {
        input = document.createElement('select');
        (typeof f.options === 'function' ? f.options(this.workspace) : f.options).forEach((o) => input.add(new Option(o, o, false, o === val)));
      } else {
        input = document.createElement(f.type === 'textarea' ? 'textarea' : 'input'); input.value = val;
      }
      input.oninput = () => { node.config[f.key] = input.value; this.onChange(); };
      input.onchange = () => {
        node.config[f.key] = input.value;
        const ports = def.ports({ ...def.defaults, ...node.config });
        this.flow.edges = this.flow.edges.filter((x) => x.from !== node.id || ports.includes(x.fromPort));
        this.render(); this.onChange();
      };
      wrap.append(input); el.append(wrap);
    }
  }

  // Editor de "formas de identificar": activar, reordenar, cuándo usar cada una y qué dice el robot.
  methodsEditor(node, def) {
    const rows = (node.config.methods ??= structuredClone(def.defaults.methods));
    const wrap = document.createElement('div'); wrap.className = 'field';
    wrap.innerHTML = '<label>Formas de identificar (en orden)</label>';
    const box = document.createElement('div'); wrap.append(box);
    const changed = () => { this.render(); this.onChange(); };
    const draw = () => {
      box.innerHTML = '';
      rows.forEach((row, i) => {
        const m = getMethod(row.id); if (!m) return;
        const div = document.createElement('div'); div.className = 'mrow' + (row.on ? '' : ' off');
        div.innerHTML = `<div class="mhead"><label class="chk"><input type="checkbox" ${row.on ? 'checked' : ''}><b>${m.label}</b></label>
          ${m.real === false ? '<span class="mode sim">Simulado</span>' : ''}
          <span class="mmove"><button type="button" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" aria-label="Bajar" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button></span></div>`;
        div.querySelector('input').onchange = (ev) => { row.on = ev.target.checked; draw(); changed(); };
        const [up, down] = div.querySelectorAll('.mmove button');
        up.onclick = () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); changed(); };
        down.onclick = () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(); changed(); };
        if (row.on && m.id !== 'camera') {
          const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Cuándo usarla');
          WHEN.forEach(([v, l]) => sel.add(new Option(l, v, false, v === row.when)));
          sel.onchange = () => { row.when = sel.value; changed(); };
          div.append(sel);
        }
        if (row.on && m.askable) {
          const inp = document.createElement('input'); inp.value = row.prompt ?? m.defaultPrompt; inp.setAttribute('aria-label', 'Qué dice el robot');
          inp.oninput = () => { row.prompt = inp.value; this.onChange(); };
          div.append(inp);
        }
        if (m.help) { const h = document.createElement('p'); h.className = 'mhelp'; h.textContent = m.help; div.append(h); }
        box.append(div);
      });
    };
    draw();
    return wrap;
  }

  // ---- estado de ejecución ----
  clearRun() { this.status = {}; this.results = {}; this.taken = new Set(); this.render(); }
  setStatus(id, s, info) {
    this.status[id] = s;
    if (s === 'error') this.results[id] = info?.error ?? 'Error';
    if (s === 'done') this.results[id] = this.summarize(info, getNode(this.flow.nodes.find((n) => n.id === id)?.type));
    const el = this.canvas.querySelector(`.node[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('running', 'done', 'error'); el.classList.add(s);
    const res = el.querySelector('.node-result');
    res.textContent = this.results[id] ?? ''; res.hidden = !res.textContent;
  }
  summarize(info = {}, def) {
    if (def?.summary) return def.summary(info);
    const { port, data = {} } = info;
    const parts = Object.entries(data).filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => `${k}: ${k === 'confidence' ? Math.round(v * 100) + ' %' : v}`);
    if (port !== 'out') parts.push(`salida: ${port}`);
    return parts.join(' · ') || 'Completado';
  }
  markEdge(edge) { this.taken.add(this.flow.edges.find((e) => e.from === edge.from && e.fromPort === edge.fromPort)); this.drawEdges(); }
}
