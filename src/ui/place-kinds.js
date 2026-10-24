// Tipos de lugar: cómo se ve cada lugar en el mapa (icono y color) y cómo se amobla en MuJoCo.
// El puente guarda `kind` como "ambiente" en destinos.json; los nombres de los tipos son los mismos allá.
export const PLACE_KINDS = {
  recepcion: { label: 'Recepción', color: '#6b7570', words: /recepcion|lobby|entrada/,
    glyph: 'M5 14h14v5H5zM8 14v-3h8v3M12 8v3' },
  vip: { label: 'Salón VIP', color: '#8e2b3a', words: /vip/,
    glyph: 'M12 4l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 15.8 7.4 18.3l.9-5.2L4.5 9.5l5.2-.7z' },
  social: { label: 'Sala social', color: '#4e8a5e', words: /social|lounge|sala|espera/,
    glyph: 'M4 11a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0v6H4zM7 11V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3M6 17v2M18 17v2' },
  terraza: { label: 'Terraza', color: '#2a8c88', words: /terraza|jardin|patio|bar/,
    glyph: 'M3 10a9 6 0 0 1 18 0zM12 10v10M8 20h8' },
  restaurante: { label: 'Restaurante', color: '#c4472f', words: /restaurante|comedor|cafeteria|cafe/,
    glyph: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10' },
  gimnasio: { label: 'Gimnasio', color: '#3462b8', words: /gimnasio|gym|fitness/,
    glyph: 'M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12' },
  spa: { label: 'Spa', color: '#b4507e', words: /spa|sauna|masaje/,
    glyph: 'M12 20c-4 0-7-3-7-7 3 0 5 1.5 7 4 2-2.5 4-4 7-4 0 4-3 7-7 7zM12 17c-2-2-2-7 0-11 2 4 2 9 0 11z' },
  servicio: { label: 'Servicio', color: '#c8611e', words: /servicio|proveedor|carga|bodega/,
    glyph: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8' },
  vestier: { label: 'Vestier', color: '#6e4fb8', words: /vestier|casillero|locker/,
    glyph: 'M5 3h6v18H5zM13 3h6v18h-6zM9 9v2M15 9v2' },
  otro: { label: 'Otro', color: '#7a6a52', words: null,
    glyph: 'M12 21s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
};

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Tipo de un lugar: el elegido en "Lugares" o, si no tiene, el que sugiere su nombre
export const kindOf = (place) => PLACE_KINDS[place?.kind] ? place.kind
  : Object.keys(PLACE_KINDS).find((k) => PLACE_KINDS[k].words?.test(norm(place?.name))) ?? 'otro';

export const colorOf = (place) => /^#[0-9a-f]{6}$/i.test(place?.color ?? '') ? place.color : PLACE_KINDS[kindOf(place)].color;
