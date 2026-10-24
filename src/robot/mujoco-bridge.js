import { SimulatorRobot } from './simulator.js';

// Adaptador hacia la simulación MuJoCo (o el robot real) por WebSocket. La UI web sigue mostrando burbujas y ruta;
// además cada acción se envía al puente y se espera su confirmación. Puente para el AgiBot X2:
// x2_simulation/scripts/pibot/puente.py (./x2 pibot).
//
// Protocolo (JSON, un mensaje por línea de acción):
//   web -> puente : { "id": 1, "cmd": "speak",    "text": "Hola" }
//                   { "id": 2, "cmd": "navigate", "destination": "Salón VIP" }
//                   { "id": 3, "cmd": "gesture",  "name": "saludar" }   (saludar | asentir | señalar)
//                   { "id": 4, "cmd": "show",     "title": "...", "text": "..." }
//                   { "id": 5, "cmd": "hello" }                          al conectar: qué sabe hacer el puente
//                   { "id": 6, "cmd": "places", "places": [{ "name", "x", "y", "kind", "color" }], "save": false }
//                                                                       lugares del club (save: guardarlos en el puente)
//                   { "id": 7, "cmd": "interpret", "question": "...", "options": ["..."], "text": "...",
//                     "hints": { "Gimnasio": "entrenar, pesas" } }      qué opción quiso decir el visitante (LLM)
//                   { "id": 8, "cmd": "pose" }                           posición actual del robot
//                   { "id": 9, "cmd": "stand_up" }                       si está en el suelo, que se levante
//   puente -> web : { "id": 1, "ok": true }                       (al TERMINAR la acción)
//                   { "id": 2, "ok": false, "error": "sin ruta" }
//                   { "id": 5, "ok": true, "capabilities": ["interpret", "places", "pose"], "llm": true }
//                   { "id": 7, "ok": true, "option": "Restaurante" }      (option: null si no se entendió)
//                   { "id": 8, "ok": true, "x": 0.1, "y": -0.2, "heading": 3, "height": 0.65, "recovering": false }
//                                                         (height: altura de la pelvis en m; recovering: levantándose)
// `ask` y `choose` no viajan al puente: la respuesta del visitante se captura en la UI web. Si el puente
// tiene un LLM, `choose` además acepta respuestas con palabras propias y las interpreta con `interpret`.
// Un puente que no conozca hello/places/interpret/pose sigue funcionando: solo no se usan esas funciones.
export class MujocoBridgeRobot extends SimulatorRobot {
  constructor(ui, { url = 'ws://localhost:8765', timeoutMs = 20000, navigateTimeoutMs = 120000, places = null } = {}) {
    super(ui, { speed: 0 }); // el tiempo lo marca MuJoCo, no el simulador web
    // Guiar a alguien tarda más que las demás acciones (caminar y girar): tiene su propio límite
    Object.assign(this, { url, timeoutMs, navigateTimeoutMs, places, ws: null, seq: 0, pending: new Map(),
      capabilities: [], llm: false });
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.onopen = async () => {
        this.ws = ws;
        try {
          const hi = await this.send('hello', {}, 3000);
          this.capabilities = hi?.capabilities ?? [];
          this.llm = !!hi?.llm;
          this.real = !!hi?.real; // el puente está conectado al X2 de verdad, no a MuJoCo
          if (this.places && this.can('places')) await this.send('places', { places: this.places });
        } catch { /* puente antiguo: solo acciones básicas */ }
        resolve();
      };
      ws.onerror = () => reject(new Error(`No se pudo conectar a ${this.url}`));
      ws.onclose = () => { this.ws = null; };
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer); this.pending.delete(msg.id);
        msg.ok === false ? p.reject(new Error(msg.error ?? 'MuJoCo rechazó la acción')) : p.resolve(msg);
      };
    });
  }

  close() { this.ws?.close(); }
  can(capability) { return this.capabilities.includes(capability); }

  send(cmd, args, timeoutMs = this.timeoutMs) {
    if (!this.ws) return Promise.resolve(null); // conexión caída: el flujo sigue solo con la UI
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`MuJoCo no respondió a "${cmd}"`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, cmd, ...args }));
    });
  }

  async speak(text) { await Promise.all([this.ui.onSpeak?.(text), this.send('speak', { text })]); }
  async navigate(destination) { this.ui.onNavigate?.(destination); await this.send('navigate', { destination }, this.navigateTimeoutMs); }
  async gesture(name) { this.ui.onGesture?.(name); await this.send('gesture', { name }); }
  async show(content) { this.ui.onShow?.(content); await this.send('show', content); }

  // understand: opciones que el LLM puede reconocer aunque no haya botón para ellas (p. ej. un lugar no permitido,
  // para que el flujo pueda decir que no); por defecto, las mismas opciones de los botones
  async choose(question, options, { hints = {}, understand = options } = {}) {
    await this.speak(question);
    // Con LLM, la UI ofrece además "responder con sus palabras"; la opción la elige el LLM, nunca otra cosa
    const interpret = this.llm && this.can('interpret') ? (text) => this.interpret(question, understand, text, hints) : null;
    return this.ui.onChoose ? this.ui.onChoose(question, options, { interpret, hints, understand }) : null;
  }

  // hints: { opción: cómo la diría un visitante }, escrito por el club en el nodo; mejora mucho los aciertos
  async interpret(question, options, text, hints = {}) {
    const r = await this.send('interpret', { question, options, text, hints });
    return options.includes(r?.option) ? r.option : null;
  }

  async pose() {
    if (!this.can('pose')) return null;
    const r = await this.send('pose', {});
    return r && typeof r.x === 'number'
      ? { x: r.x, y: r.y, heading: r.heading, height: r.height ?? null, recovering: !!r.recovering } : null;
  }

  // Si el robot está en el suelo, se levanta solo (rutinas de su control de movimiento) y vuelve a su puesto
  async standUp() {
    if (!this.can('stand_up')) throw new Error('Este puente no sabe levantar al robot');
    await this.send('stand_up', {}, 90000);
  }

  async savePlaces(places) {
    if (!this.can('places')) throw new Error('El puente no recibe lugares');
    await this.send('places', { places, save: true });
  }
}
