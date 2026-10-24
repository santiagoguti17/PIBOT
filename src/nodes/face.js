import { registerNode } from '../core/registry.js';

// Reconocimiento facial SIMULADO. Entrega solo lo que entregaría el sistema real: miembro / no miembro + confianza.
registerNode({
  type: 'perception.face',
  level: 'advanced',
  help: 'Simula la cámara: devuelve miembro / no miembro y la confianza.',
  icon: 'face',
  label: 'Reconocimiento facial',
  group: 'Percepción',
  real: false,
  config: [
    { key: 'force', label: 'Resultado', type: 'select', options: ['auto (desde dataset)', 'miembro', 'no miembro'] },
    { key: 'confidence', label: 'Confianza forzada (0-1, vacío = dataset)', type: 'text' },
  ],
  defaults: { force: 'auto (desde dataset)', confidence: '' },
  async run({ person }, cfg) {
    let { isMember, confidence } = person.face;
    if (cfg.force === 'miembro') isMember = true;
    if (cfg.force === 'no miembro') isMember = false;
    if (cfg.confidence !== '' && !isNaN(+cfg.confidence)) confidence = +cfg.confidence;
    return { port: 'out', data: { isMember, confidence, name: isMember ? person.name : '' } };
  },
});
