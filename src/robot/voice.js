// Hablar con el robot en la simulación: el X2 de MuJoCo no tiene ni oído ni parlante, así que se usan los de este
// equipo con el servicio de voz (./x2 voz). Piper le da voz a lo que dice el robot y Whisper entiende lo que el
// visitante le dice al micrófono. En el X2 real, el robot usa los suyos (puente --real).
// El audio no se guarda: va del navegador al servicio local y se descarta.
const RATE = 16000; // Whisper espera PCM de 16 bit a 16 kHz, mono
const FRAME = 320; // 20 ms: cada cuánto se mide si alguien está hablando

// Copia lo que entra por el micrófono, ya a 16 kHz, para medirlo y guardarlo aquí
const WORKLET = `registerProcessor('pibot-mic', class extends AudioWorkletProcessor {
  process([input]) { if (input[0]) this.port.postMessage(input[0].slice(0)); return true; }
});`;

export class RobotVoice {
  constructor({ url = 'http://127.0.0.1:8097' } = {}) {
    Object.assign(this, { url, audio: null });
  }

  async status() {
    const r = await fetch(`${this.url}/estado`, { signal: AbortSignal.timeout(3000) });
    return r.json();
  }

  // Dice el texto con la voz del robot y termina cuando acaba de sonar (o cuando se corta con stop)
  async speak(text) {
    const r = await fetch(`${this.url}/hablar`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: text }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'el servicio de voz no habla');
    const src = URL.createObjectURL(await r.blob());
    const audio = this.audio = new Audio(src);
    try {
      await new Promise((resolve, reject) => {
        audio.onended = audio.onpause = resolve;
        audio.onerror = () => reject(new Error('no se pudo reproducir la voz'));
        audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(src);
      if (this.audio === audio) this.audio = null;
    }
  }

  stop() { this.audio?.pause(); }

  // context: lo que se espera oír (las opciones, los códigos del club), para que Whisper lo escriba igual
  async transcribe(pcm, { context = '' } = {}) {
    const query = context ? `?contexto=${encodeURIComponent(context.slice(0, 600))}` : '';
    const r = await fetch(`${this.url}/transcribir${query}`, { method: 'POST', body: pcm, headers: { 'Content-Type': 'application/octet-stream' },
      signal: AbortSignal.timeout(30000) }).catch(() => { throw new Error('el servicio de voz no responde (./x2 voz)'); });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'el servicio de voz no entendió el audio');
    return (await r.json()).texto ?? '';
  }
}

export class Microphone {
  constructor() {
    Object.assign(this, { ctx: null, stream: null, onSamples: null });
  }

  get on() { return !!this.ctx; }

  async start() {
    if (this.ctx) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('este navegador no da acceso al micrófono');
    // Con cancelación de eco: lo que dice el robot por el parlante no vuelve a entrar como si fuera el visitante
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new AudioContext({ sampleRate: RATE });
    const module = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    try { await ctx.audioWorklet.addModule(module); } finally { URL.revokeObjectURL(module); }
    const node = new AudioWorkletNode(ctx, 'pibot-mic');
    node.port.onmessage = (e) => this.onSamples?.(e.data);
    ctx.createMediaStreamSource(this.stream).connect(node);
    this.ctx = ctx;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    Object.assign(this, { ctx: null, stream: null, onSamples: null });
  }

  // La próxima frase que alguien diga, en PCM de 16 bit, o null si nadie habla en `wait` ms. Se detecta por la
  // energía del sonido: el ruido de fondo se mide sobre la marcha y la frase termina tras `silence` ms en silencio.
  // onLevel recibe el volumen (0 a 1) para mostrar que escucha.
  async phrase({ wait = 8000, max = 12000, silence = 800, minSpeech = 300, signal, onLevel } = {}) {
    await this.start();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return new Promise((resolve) => {
      let pending = new Float32Array(0), floor = 0.008, loud = 0, quiet = 0, speech = 0, waited = 0;
      const before = [], frames = []; // before: los 300 ms previos, para no cortar la primera sílaba
      const done = (pcm) => { this.onSamples = null; signal?.removeEventListener('abort', abort); resolve(pcm); };
      const abort = () => done(null);
      signal?.addEventListener('abort', abort);
      if (signal?.aborted) return abort();
      this.onSamples = (samples) => {
        const all = new Float32Array(pending.length + samples.length);
        all.set(pending); all.set(samples, pending.length);
        let i = 0;
        for (; i + FRAME <= all.length; i += FRAME) {
          const frame = all.subarray(i, i + FRAME);
          let sum = 0; for (const s of frame) sum += s * s;
          const rms = Math.sqrt(sum / FRAME);
          onLevel?.(Math.min(1, rms * 12));
          const talking = rms > Math.max(0.02, floor * 3);
          if (!frames.length) { // todavía nadie habla
            waited += 20;
            before.push(frame.slice()); if (before.length > 15) before.shift();
            loud = talking ? loud + 1 : 0;
            if (!talking) floor = floor * 0.95 + rms * 0.05;
            if (loud >= 3) { frames.push(...before); speech = loud * 20; quiet = 0; }
            else if (waited >= wait) return done(null);
            continue;
          }
          frames.push(frame.slice());
          if (rms > Math.max(0.012, floor * 2)) { speech += 20; quiet = 0; } else quiet += 20;
          if (quiet >= silence || frames.length * 20 >= max) {
            if (speech < minSpeech) { frames.length = 0; loud = 0; continue; } // un golpe o un ruido corto, no una frase
            return done(toPcm(frames));
          }
        }
        pending = all.slice(i);
      };
    });
  }
}

function toPcm(frames) {
  const pcm = new Int16Array(frames.length * FRAME);
  frames.forEach((f, k) => f.forEach((s, j) => { pcm[k * FRAME + j] = Math.max(-1, Math.min(1, s)) * 0x7fff; }));
  return pcm;
}
