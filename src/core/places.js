// Lugares del club: a cuál se refiere un destino escrito en un nodo.
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// "Acceso de servicio → Spa, piso 2" → el lugar "Spa": el último tramo, ignorando lo que va tras la coma
export function placeFor(destination, places) {
  const last = norm(String(destination ?? '').split('→').at(-1).split(',')[0]);
  return places.find((p) => norm(p.name) === last) ?? places.find((p) => last.startsWith(norm(p.name)));
}
