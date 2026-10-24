// Robot dibujado en la página, de respaldo cuando el puente con el X2 (MuJoCo o real) no responde: emite eventos que la
// UI dibuja (burbujas, ruta, pantalla, campo de respuesta). También lo usan las pruebas.
export class SimulatorRobot {
  constructor(ui = {}, { speed = 18 } = {}) {
    this.ui = ui;
    this.speed = speed; // ms por carácter, para simular la duración del habla
  }
  wait(ms) { return new Promise((r) => setTimeout(r, this.speed ? ms : 0)); }
  async speak(text) {
    // Si la UI lo dice en voz alta, onSpeak devuelve una promesa y el robot espera a que termine la frase
    await Promise.all([this.ui.onSpeak?.(text), this.wait(300 + text.length * this.speed)]);
  }
  async ask(question, opts = {}) {
    await this.speak(question);
    return this.ui.onAsk ? this.ui.onAsk(question, opts) : null;
  }
  async choose(question, options, opts = {}) {
    await this.speak(question);
    return this.ui.onChoose ? this.ui.onChoose(question, options, opts) : null;
  }
  async show(content) { this.ui.onShow?.(content); await this.wait(600); }
  async gesture(name) { this.ui.onGesture?.(name); await this.wait(1000); }
  async navigate(destination) {
    this.ui.onNavigate?.(destination);
    await this.wait(1400);
  }
}
