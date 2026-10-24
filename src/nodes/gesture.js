import { registerNode } from '../core/registry.js';

registerNode({
  type: 'robot.gesture',
  level: 'basic',
  icon: 'hand',
  label: 'Gesto del robot',
  group: 'Acciones del robot',
  help: 'El robot hace un gesto: saludar, asentir o señalar.',
  config: [{ key: 'gesture', label: 'Gesto', type: 'select', options: ['saludar', 'asentir', 'señalar'] }],
  defaults: { gesture: 'saludar' },
  async run({ robot }, cfg) {
    await robot.gesture(cfg.gesture);
    return { port: 'out' };
  },
});
