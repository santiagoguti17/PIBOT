// Revisión del flujo en palabras simples: lo que haría que el robot se quede callado, se pierda o diga algo raro.
// Cada aviso señala el nodo para poder ir a arreglarlo.
import { getNode } from './registry.js';
import { placeFor } from './places.js';

// Datos que el flujo conoce de quien llega (los pone "Identificar visitante" o el paso que pregunta)
export const KNOWN_VARS = ['name', 'category', 'event', 'place', 'area', 'via', 'camera', 'reason', 'choice', 'requested', 'allowed',
  'destination', 'similarity', // del reconocimiento facial real (destino registrado en Supabase)
  'holder', 'role', 'code', 'type', 'tier', 'confidence', 'isMember']; // los últimos, de los nodos sueltos de "Avanzado"
const TEXT_KEYS = ['message', 'text', 'question', 'title', 'note', 'bye', 'denied', 'destination', 'allowed'];

export function checkFlow(flow, workspace = {}) {
  const { nodes = [], edges = [] } = flow;
  const places = workspace.places ?? [];
  const problems = [];
  const label = (n) => `«${n.name || getNode(n.type)?.label || n.type}»`;
  const add = (node, text, level = 'warn') => problems.push({ node: node?.id ?? null, text, level });
  if (!nodes.length) return problems;

  const hasIncoming = new Set(edges.map((e) => e.to));
  const start = nodes.find((n) => !hasIncoming.has(n.id));
  if (!start) { add(null, 'El flujo no tiene por dónde empezar: todos los pasos tienen una flecha que llega.', 'error'); return problems; }

  // Lo que nunca se ejecuta: el robot empieza en el primer paso sin flechas que lleguen
  const seen = new Set([start.id]), queue = [start.id];
  while (queue.length) {
    const id = queue.shift();
    edges.filter((e) => e.from === id).forEach((e) => { if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); } });
  }
  nodes.filter((n) => !seen.has(n.id)).forEach((n) => add(n, `${label(n)} nunca se ejecuta: conéctelo a un paso anterior o bórrelo.`));

  for (const n of nodes) {
    const def = getNode(n.type);
    if (!def) { add(n, `${label(n)} es de un tipo que esta versión no conoce (${n.type}).`, 'error'); continue; }
    const cfg = { ...def.defaults, ...n.config };
    const ports = def.ports(cfg), linked = new Set(edges.filter((e) => e.from === n.id).map((e) => e.fromPort));

    if (n.type === 'visitor.identify') {
      ports.filter((p) => !linked.has(p)).forEach((p) => add(n, p === 'Necesita ayuda'
        ? 'Si el robot no reconoce a alguien, no hace nada: conecte "Necesita ayuda" a "Pasar a recepción".'
        : `Si llega alguien ${p}, el robot no hace nada: use el + de "${p}" para decir qué hace.`));
    }
    if (n.type === 'robot.orient' && !String(cfg.message).trim()) add(n, `${label(n)} no dice nada: escriba qué dice el robot.`);
    for (const key of ['destination']) {
      const dest = String(cfg[key] ?? '').trim();
      if (dest && !dest.includes('{{') && !placeFor(dest, places)) {
        add(n, `${label(n)} lleva a "${dest}", que no está en Lugares: el robot no sabría llegar.`);
      }
    }
    if (n.type === 'robot.serve') {
      const allowed = String(cfg.allowed).split(',').map((s) => s.trim()).filter(Boolean);
      if (!allowed.some((p) => p.includes('{{') || placeFor(p, places))) add(n, `${label(n)} no tiene ningún lugar del club permitido.`, 'error');
    }
    if (n.type === 'robot.choose' && ports.length < 3) add(n, `${label(n)} tiene una sola opción: agregue otra o use "Orientar al visitante".`);
    for (const key of TEXT_KEYS) {
      for (const [, v] of String(cfg[key] ?? '').matchAll(/\{\{(\w+)\}\}/g)) {
        if (!KNOWN_VARS.includes(v)) add(n, `${label(n)} usa {{${v}}}, un dato que el robot no conoce: dirá un espacio vacío.`);
      }
    }
  }
  return problems;
}
