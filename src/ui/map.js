// Plano del lobby visto desde arriba: lo usan el mapa en vivo y la pantalla de Lugares.
// La entrada (+x del robot) queda arriba y +y a la izquierda; 50 px por metro.
// Paredes, entrada y mostrador siguen el lobby que arma `./x2 escena` en MuJoCo.
import { PLACE_KINDS, colorOf, kindOf } from './place-kinds.js';

export const W = 500, H = 460;
const PX = 50, X_TOP = 3.6, Y_LEFT = 5;
const NS = 'http://www.w3.org/2000/svg';

// Qué parte del mundo se ve. Por defecto, el lobby de ejemplo (el de MuJoCo); con el robot real, cuyas coordenadas
// pueden estar en cualquier lado, el plano se centra en el robot y sus lugares (sin las paredes de la simulación)
let view = { top: X_TOP, left: Y_LEFT, px: PX, lobby: true };
export const toPx = (x, y) => [(view.left - y) * view.px, (view.top - x) * view.px];
export const toWorld = (sx, sy) => ({ x: +(view.top - sy / view.px).toFixed(1), y: +(view.left - sx / view.px).toFixed(1) });

function chooseView(points) {
  const inLobby = ({ x, y }) => x <= 3.6 && x >= -5.6 && y <= 5 && y >= -5;
  if (points.every(inLobby)) { view = { top: X_TOP, left: Y_LEFT, px: PX, lobby: true }; return; }
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  // Un margen de 1.5 m y al menos 4 m de lado, para poder marcar lugares cerca del robot
  const spanX = Math.max(4, Math.max(...xs) - Math.min(...xs) + 3), spanY = Math.max(4, Math.max(...ys) - Math.min(...ys) + 3);
  const px = Math.min(H / spanX, W / spanY, 120);
  view = { top: cx + H / px / 2, left: cy + W / px / 2, px, lobby: false };
}

export { placeFor } from '../core/places.js';

const el = (tag, attrs, text) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (text) e.textContent = text;
  return e;
};

// Rectángulo en metros (x de arriba a abajo, y de izquierda a derecha) → atributos SVG
const box = (x1, y1, x2, y2) => {
  const [ax, ay] = toPx(x1, y1), [bx, by] = toPx(x2, y2);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
};

function lobby() {
  const items = [el('rect', { ...box(3.4, 4.8, -5.4, -4.8), rx: 10, class: 'pl-floor' })];
  for (let m = -5; m <= 4; m++) { // cuadrícula de 1 m sobre el piso
    const [gx] = toPx(0, m), [, gy] = toPx(m, 0);
    items.push(el('line', { x1: gx, y1: toPx(3.4, 0)[1], x2: gx, y2: H, class: 'pl-grid' }));
    if (m <= 3) items.push(el('line', { x1: toPx(0, 4.8)[0], y1: gy, x2: toPx(0, -4.8)[0], y2: gy, class: 'pl-grid' }));
  }
  const [lx, top] = toPx(3.4, 4.8), [rx] = toPx(3.4, -4.8), [dl] = toPx(3.4, 1.1), [dr] = toPx(3.4, -1.1);
  const [, back] = toPx(-5.4, 0);
  const wall = `M${dl} ${top} H${lx} V${back} H${rx} V${top} H${dr}`; // paredes, con la entrada al frente
  items.push(el('path', { d: wall, class: 'pl-wall' }));
  items.push(el('line', { x1: dl, y1: top, x2: dr, y2: top, class: 'pl-door' }));
  items.push(el('text', { x: (dl + dr) / 2, y: top - 7, 'text-anchor': 'middle', class: 'pl-door-label' }, 'Entrada'));
  items.push(el('rect', { ...box(0.85, 2.3, 0.25, 0.8), rx: 4, class: 'pl-desk' })); // mostrador de recepción
  return items;
}

// Cuadrícula de 1 m para el plano del robot real (sin el lobby de ejemplo)
function grid() {
  const items = [el('rect', { x: 0, y: 0, width: W, height: H, rx: 10, class: 'pl-floor' })];
  const [x0, y0] = [view.top - H / view.px, view.left - W / view.px];
  for (let m = Math.ceil(y0); m <= view.left; m++) { const [gx] = toPx(0, m); items.push(el('line', { x1: gx, y1: 0, x2: gx, y2: H, class: 'pl-grid' })); }
  for (let m = Math.ceil(x0); m <= view.top; m++) { const [, gy] = toPx(m, 0); items.push(el('line', { x1: 0, y1: gy, x2: W, y2: gy, class: 'pl-grid' })); }
  return items;
}

function marker(p, i, { target }) {
  const [sx, sy] = toPx(+p.x || 0, +p.y || 0), color = colorOf(p), on = p.name === target;
  const g = el('g', { class: `pl-place${on ? ' pl-target' : ''}`, style: `--pc:${color}` });
  g.append(el('circle', { cx: sx, cy: sy, r: 24, class: 'pl-zone' }));
  if (on) g.append(el('circle', { cx: sx, cy: sy, r: 16, class: 'pl-pulse' }));
  g.append(el('circle', { cx: sx, cy: sy, r: 13, class: 'pl-pin', 'data-i': i }));
  g.append(el('path', { d: PLACE_KINDS[kindOf(p)].glyph, class: 'pl-glyph',
    transform: `translate(${sx - 7.5} ${sy - 7.5}) scale(0.625)` }));
  g.append(el('text', { x: sx, y: sy + 28, 'text-anchor': 'middle', class: 'pl-label' }, p.name || '(sin nombre)'));
  return g;
}

// robot: {x, y, heading} o null; target: nombre del lugar al que se está guiando (se resalta)
export function drawPlan(svg, { places = [], robot = null, target = null, fallen = false }) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  chooseView([...places.map((p) => ({ x: +p.x || 0, y: +p.y || 0 })), ...(robot ? [robot] : [])]);
  const items = view.lobby ? lobby() : grid();
  const goal = places.find((p) => p.name === target);
  if (goal && robot) { // ruta en línea recta hacia el destino
    const [ax, ay] = toPx(robot.x, robot.y), [bx, by] = toPx(+goal.x || 0, +goal.y || 0);
    items.push(el('line', { x1: ax, y1: ay, x2: bx, y2: by, class: 'pl-route' }));
  }
  places.forEach((p, i) => items.push(marker(p, i, { target })));
  if (robot) { // el robot, mirando hacia su orientación (0° = hacia la entrada)
    const [rx, ry] = toPx(robot.x, robot.y);
    const g = el('g', { transform: `translate(${rx} ${ry}) rotate(${-(robot.heading ?? 0)})`, class: `pl-robot${fallen ? ' is-fallen' : ''}` });
    g.append(el('path', { d: 'M -7 -9 L 0 -21 L 7 -9 Z', class: 'pl-heading' }), el('circle', { r: 10 }),
      el('circle', { cx: -3.6, cy: -1.5, r: 1.9, class: 'pl-eye' }), el('circle', { cx: 3.6, cy: -1.5, r: 1.9, class: 'pl-eye' }));
    items.push(g);
  }
  svg.replaceChildren(...items);
}
