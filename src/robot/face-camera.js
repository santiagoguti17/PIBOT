// Cámara real para "Identificar visitante": toma fotos con la cámara de este equipo (en la demo, la del portátil; en el
// X2 sería la de su cabeza) y se las pasa al servicio de reconocimiento facial (./x2 rostro, FaceRecognition Lite).
// Las fotos no se guardan: van del navegador al servicio local y se descartan.
const RANK = ['identified', 'ambiguous', 'unknown', 'insufficient_quality', 'multiple_faces', 'no_face', 'invalid_image', 'not_ready'];

export class FaceCamera {
  constructor({ url = 'http://127.0.0.1:8096', video }) {
    Object.assign(this, { url, video, stream: null });
  }

  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no da acceso a la cámara');
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.video.srcObject = null;
  }

  async status() {
    const r = await fetch(`${this.url}/estado`, { signal: AbortSignal.timeout(3000) });
    return r.json();
  }

  // Una foto del video, en JPEG
  frame() {
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!w || !h) throw new Error('la cámara todavía no da imagen');
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    canvas.getContext('2d').drawImage(this.video, 0, 0, w, h);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  }

  // Hasta tres fotos en un segundo: la primera que reconoce gana; si ninguna, la respuesta más informativa
  async identify({ tries = 3, gapMs = 300 } = {}) {
    await this.start();
    let best = null;
    for (let i = 0; i < tries; i++) {
      const body = await this.frame();
      const r = await fetch(`${this.url}/identificar`, { method: 'POST', body, headers: { 'Content-Type': 'image/jpeg' },
        signal: AbortSignal.timeout(5000) }).then((res) => res.json(), () => { throw new Error('el servicio no responde (./x2 rostro)'); });
      if (r.status === 'identified') return r;
      if (!best || RANK.indexOf(r.status) < RANK.indexOf(best.status)) best = r;
      if (i < tries - 1) await new Promise((ok) => setTimeout(ok, gapMs));
    }
    return best;
  }
}
