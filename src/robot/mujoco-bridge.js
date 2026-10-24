import { SimulatorRobot } from './simulator.js';

// Adaptador hacia la simulación MuJoCo por WebSocket. La UI web sigue mostrando burbujas y ruta;
// además cada acción se envía al simulador y se espera su confirmación.
//
// Protocolo (JSON, un mensaje por línea de acción):
//   web -> mujoco : { "id": 1, "cmd": "speak",    "text": "Hola" }
//                   { "id": 2, "cmd": "navigate", "destination": "Salón VIP" }
//                   { "id": 3, "cmd": "gesture",  "name": "saludar" }   (saludar | asentir | señalar)
//                   { "id": 4, "cmd": "show",     "title": "...", "text": "..." }
//   mujoco -> web : { "id": 1, "ok": true }                       (al TERMINAR la acción)
//                   { "id": 2, "ok": false, "error": "sin ruta" }
// `ask` y `choose` no viajan al simulador: la respuesta del visitante se captura en la UI web.
export class MujocoBridgeRobot extends SimulatorRobot {
  constructor(ui, { url = 'ws://localhost:8765', timeoutMs = 20000 } = {}) {
    super(ui, { speed: 0 }); // el tiempo lo marca MuJoCo, no el simulador web
    Object.assign(this, { url, timeoutMs, ws: null, seq: 0, pending: new Map() });
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.onopen = () => { this.ws = ws; resolve(); };
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

  send(cmd, args) {
    if (!this.ws) return Promise.resolve(null); // conexión caída: el flujo sigue solo con la UI
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`MuJoCo no respondió a "${cmd}"`)); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, cmd, ...args }));
    });
  }

  async speak(text) { this.ui.onSpeak?.(text); await this.send('speak', { text }); }
  async navigate(destination) { this.ui.onNavigate?.(destination); await this.send('navigate', { destination }); }
  async gesture(name) { this.ui.onGesture?.(name); await this.send('gesture', { name }); }
  async show(content) { this.ui.onShow?.(content); await this.send('show', content); }
}
