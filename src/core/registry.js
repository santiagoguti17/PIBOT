// Registro de tipos de nodo. El framework solo conoce definiciones; no sabe nada de ningún lugar concreto.
// Definición: { type, label, group, real, config:[{key,label,type,options?}], defaults,
//               ports(config)->string[], run(ctx, config)->Promise<{port, data?}> }
const nodes = new Map();

export function registerNode(def) {
  nodes.set(def.type, { ports: () => ['out'], defaults: {}, config: [], real: true, ...def });
}
export const getNode = (type) => nodes.get(type);
export const listNodes = () => [...nodes.values()];
