// La conversación con el visitante, la misma en la simulación (la página, src/ui/app.js) y en el robot real
// (runtime/robot-runtime.mjs): el robot escucha la respuesta, la entiende y, si no la entiende, pide que la repita.
// Mientras tanto, una persona puede responder por el visitante (tocar la opción o escribir en la página); si al final
// el robot no entendió, la espera. Cada lado pone solo cómo escucha (el micrófono del portátil o el del robot), cómo
// habla y cómo muestra lo que oyó.
//
//   io = { listen(context, signal) → Promise<texto> ('' si nadie habló; null si no hay micrófono),
//          say(texto) → Promise, human: Promise<valor> (lo que responde una persona), heard(dicho, entendido) }
import { contradicts, joinEs, knownCodes, norm, outsideOptions, sayOption, spokenAnswer } from './spoken.js';

export const LISTEN_S = 10;      // cuánto espera a que el visitante empiece a hablar
export const HUMAN_WAIT_S = 90;  // cuánto espera, desde la pregunta, a que alguien responda por él
export const CHOOSE_TRIES = 3;
export const ASK_TRIES = 2;

export const heardAs = (heard, value) => (norm(heard) === norm(value) ? `«${heard}»` : `«${heard}» (entendido: ${value})`);

// Qué opción quiso decir: tal cual o con una frase del club ("quiero entrenar"); si no, el LLM (interpret), si lo hay.
// Nunca una opción con otra hora u otro número que el dicho ("a las 3" no es "6 pm"), aunque el LLM la elija.
export async function meaningOf(text, { understand, hints = {}, interpret }) {
  const o = sayOption(text, understand, hints) ?? (interpret ? await interpret(text).catch(() => null) : null);
  return o && !contradicts(text, o) ? o : null;
}

async function converse({ tries, context, understand, again, io }) {
  let answered = false, value = null, timer;
  const timeout = new Promise((r) => { timer = setTimeout(() => r(null), HUMAN_WAIT_S * 1000); });
  const human = Promise.race([io.human, timeout]).then((v) => { answered = true; value = v ?? null; });
  try {
    for (let i = 0; io.listen && i < tries && !answered; i++) {
      const listening = new AbortController();
      const heard = await Promise.race([io.listen(context, listening.signal).catch(() => ''), human.then(() => '')]);
      if (answered) { listening.abort(); break; } // alguien respondió por el visitante: deja de escuchar
      const r = heard ? await understand(heard) : null;
      if (answered) break;
      if (heard) io.heard?.(r ? r.said : `«${heard}»`, !!r);
      if (r) return r.value;
      if (i < tries - 1) await io.say(again(heard));
    }
    await human; // no entendió (o no hay micrófono): espera a que alguien responda por el visitante
    return value;
  } finally {
    clearTimeout(timer);
  }
}

// "Preguntar con opciones" y "Atender lo que pida": la opción, dicha o tocada
export function chooseByVoice({ options, understand = options, hints = {}, interpret, io }) {
  return converse({
    tries: CHOOSE_TRIES, io, context: `Opciones: ${joinEs(understand)}.`,
    understand: async (heard) => {
      const o = await meaningOf(heard, { understand, hints, interpret });
      return o ? { value: o, said: heardAs(heard, o) } : null;
    },
    again: (heard) => `${!heard ? '¿Perdón?' : outsideOptions(heard, options) ? 'Eso no lo tengo disponible.' : 'No le entendí bien.'} Puede decirme: ${joinEs(options)}.`,
  });
}

// "¿Me indica su código / cédula / nombre / a dónde va?": el dato como lo necesita el nodo que preguntó
export function askByVoice({ kind, workspace, io }) {
  return converse({
    tries: ASK_TRIES, io, context: kind === 'code' ? `Códigos de acceso: ${knownCodes(workspace).join(', ')}.` : '',
    understand: async (heard) => {
      const a = spokenAnswer(heard, kind, workspace);
      return a.unknown ? null : { value: a.value, said: a.value ? heardAs(heard, a.value) : `«${heard}»` };
    },
    again: (heard) => (!heard ? '¿Perdón? No le escuché.' : kind === 'code' ? 'No encontré ese código. ¿Me lo repite?' : '¿Me lo repite, por favor?'),
  });
}
