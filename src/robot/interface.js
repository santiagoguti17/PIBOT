// Contrato genérico del robot. Los nodos de acción solo usan estos métodos.
//
//   speak(text)                -> Promise                 habla
//   ask(question, {kind})      -> Promise<string|null>    pregunta y devuelve lo que responde el visitante
//                                                         (kind: 'code' | 'document' | 'name'; null = no respondió)
//   choose(question, options)  -> Promise<string|null>    el visitante elige una opción en pantalla
//   show({title, text})        -> Promise                 tarjeta en la pantalla del robot
//   gesture(name)              -> Promise                 gesto: 'saludar' | 'asentir' | 'señalar'
//   navigate(destination)      -> Promise                 guía a un destino
//
// Adaptadores: SimulatorRobot (web) y MujocoBridgeRobot (puente WebSocket a MuJoCo). Pendiente: AgiBot X2 real.
export const ROBOT_CAPABILITIES = ['speak', 'ask', 'choose', 'show', 'gesture', 'navigate'];
