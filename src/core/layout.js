// Ordena un flujo en columnas de izquierda a derecha: cada paso queda a la derecha del anterior y a la altura
// de la salida que lo lleva. Los pasos a los que se llega por varios caminos quedan a la altura media de esas salidas.
export const COL = 310, GAP = 26, X0 = 24, Y0 = 20;

// Alto aproximado de un nodo en el lienzo (cabecera + una fila por salida), si no se puede medir
export const estimateHeight = (ports) => 52 + 27 * ports.length + 8;

export function layoutFlow(flow, { heightOf, portsOf } = {}) {
  const { nodes, edges } = flow;
  const out = (id) => edges.filter((e) => e.from === id);
  const parents = (id) => edges.filter((e) => e.to === id);
  const height = (n) => heightOf?.(n) ?? estimateHeight(portsOf?.(n) ?? [...new Set(out(n.id).map((e) => e.fromPort))]);

  // Columna: el camino más largo desde el inicio (con tope, por si hay ciclos)
  const depth = new Map(nodes.filter((n) => !parents(n.id).length).map((n) => [n.id, 0]));
  for (let i = 0; i < nodes.length; i++) {
    for (const e of edges) {
      if (!depth.has(e.from)) continue;
      const d = depth.get(e.from) + 1;
      if (d > (depth.get(e.to) ?? -1) && d < nodes.length) depth.set(e.to, d);
    }
  }
  nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, 0); });

  // Fila: se recorre desde el inicio siguiendo las salidas en orden; cada paso intenta quedar a la altura de su salida
  const portOrder = (n, port) => {
    const ports = portsOf?.(n) ?? [...new Set(out(n.id).map((e) => e.fromPort))];
    return Math.max(0, ports.indexOf(port));
  };
  const bottom = new Map(), placed = new Set(), shared = [];
  const place = (n, wantY) => {
    const col = depth.get(n.id), y = Math.max(wantY, (bottom.get(col) ?? Y0 - GAP) + GAP);
    Object.assign(n, { x: X0 + col * COL, y });
    bottom.set(col, y + height(n)); placed.add(n.id);
  };
  const visit = (n, wantY) => {
    if (placed.has(n.id)) return;
    place(n, wantY);
    for (const e of out(n.id).sort((a, b) => portOrder(n, a.fromPort) - portOrder(n, b.fromPort))) {
      const next = nodes.find((m) => m.id === e.to);
      if (!next || placed.has(next.id)) continue;
      if (parents(next.id).length > 1) { if (!shared.includes(next)) shared.push(next); continue; }
      visit(next, portY(n, e.fromPort));
    }
  };
  const portY = (n, port) => n.y + 44 + portOrder(n, port) * 27;
  nodes.filter((n) => !parents(n.id).length).forEach((n) => visit(n, Y0));
  for (let i = 0; i < shared.length; i++) { // a la altura media de las salidas que llegan a él
    const from = parents(shared[i].id).map((e) => [nodes.find((m) => m.id === e.from), e.fromPort]).filter(([m]) => m && placed.has(m.id));
    visit(shared[i], from.length ? Math.round(from.reduce((s, [m, port]) => s + portY(m, port), 0) / from.length) - 30 : Y0);
  }
  nodes.filter((n) => !placed.has(n.id)).forEach((n) => visit(n, Y0));

  // La primera columna (el inicio) se centra respecto a lo que sale de ella
  const first = nodes.filter((n) => depth.get(n.id) === 0 && out(n.id).length);
  const total = Math.max(...[...bottom.values()]);
  if (first.length === 1 && nodes.length > 1) first[0].y = Math.max(Y0, Math.round((total - height(first[0])) / 2 - 80));
  return flow;
}
