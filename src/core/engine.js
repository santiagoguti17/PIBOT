import { getNode } from './registry.js';

// Ejecuta un flujo: {nodes:[{id,type,x,y,config}], edges:[{from,fromPort,to}]}.
// Empieza en el nodo sin conexiones de entrada y sigue el puerto que cada nodo devuelva.
export async function runFlow(flow, { person, robot, workspace = {}, hooks = {}, stepDelay = 0 }) {
  const { nodes, edges } = flow;
  const hasIncoming = new Set(edges.map((e) => e.to));
  let current = nodes.find((n) => !hasIncoming.has(n.id));
  const vars = {};
  const trace = [];
  const log = (msg) => hooks.onLog?.(msg);
  const ctx = { person, robot, workspace, vars, log, notify: (n) => hooks.onNotify?.(n),
    approve: (req) => (hooks.onApprove ? hooks.onApprove(req) : Promise.resolve(true)) };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  if (!current) return { status: 'error', error: 'El flujo no tiene nodo inicial', trace, vars };

  for (let steps = 0; current && steps < 50; steps++) {
    const def = getNode(current.type);
    hooks.onNode?.(current.id, 'running');
    if (stepDelay) await sleep(stepDelay);
    try {
      if (!def) throw new Error(`Tipo de nodo desconocido: ${current.type}`);
      const config = { ...def.defaults, ...current.config };
      const { port = 'out', data = {} } = await def.run(ctx, config);
      Object.assign(vars, data);
      trace.push({ node: current.id, type: current.type, port, data });
      hooks.onNode?.(current.id, 'done', { port, data });
      log(`${def.label} → ${port}`);
      const edge = edges.find((e) => e.from === current.id && e.fromPort === port);
      if (edge) hooks.onEdge?.(edge);
      current = edge ? nodes.find((n) => n.id === edge.to) : null;
    } catch (err) {
      hooks.onNode?.(current.id, 'error', { error: err.message });
      log(`ERROR en ${current.id}: ${err.message}`);
      return { status: 'error', error: err.message, trace, vars };
    }
  }
  return { status: 'ok', trace, vars };
}

export const fillTemplate = (text, vars) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
