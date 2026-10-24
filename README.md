# PIBOT

Framework visual (tipo n8n) para orquestar la recepción de personas con un robot en cualquier lobby: clubes, hoteles, oficinas, clínicas. Se construyó para el reto **N Club** de Sabana Hack, que sirve como caso de uso.

El framework no contiene lógica de ningún lugar concreto: esa lógica vive solo en los flujos (`flows/`) y en la configuración (`data/`).

## Cómo correrlo

No necesita instalar nada. Sirva la carpeta con cualquier servidor estático y abra el navegador:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Pruebas por consola (Node 18+):

```bash
node test/run-cases.mjs                                 # flujo personalizado con las 7 personas del dataset
node test/run-cases.mjs flows/recepcion.json            # flujo simple
node test/run-cases.mjs flows/recepcion-avanzada.json   # flujo con nodos sueltos
node test/run-cases.mjs flows/recepcion-conversacional.json   # flujo conversacional
node test/serve.test.mjs                                # nodo "Atender lo que pida" (lugares no permitidos)
node test/mujoco-bridge.test.mjs                        # adaptador MuJoCo contra un WebSocket falso
node test/build-flow.test.mjs                           # asistente "Crear flujo": el flujo que arma atiende a las 7 personas
```

## Qué incluye

La página tiene tres vistas:
- **Diseñar:** el editor del flujo, con un panel para probarlo con una llegada simulada o para configurar el nodo elegido. Durante la prueba, el lienzo sigue al nodo que se está ejecutando.
- **En vivo:** el robot conversando, el mapa del club y los avisos a recepción, para mostrarlo funcionando.
- **Visitas:** cuántas llegadas resolvió el robot, quién llegó y las últimas visitas.

- **Crear un flujo sin saber de nodos:**
  - **Asistente:** tres preguntas en palabras simples (a quién recibe el robot, qué hace con cada uno y un resumen para revisar) y arma el flujo completo, ya conectado y ordenado. Las categorías salen de las listas del club.
  - **El + de cada salida:** abre un menú de qué hace el robot después y crea ese paso ya conectado, sin arrastrar flechas.
  - **Revisión en palabras simples:** avisa lo que dejaría al robot callado o perdido (una categoría sin camino, un lugar que no existe, un paso que nunca se ejecuta) y lleva al paso.
  - **Datos del visitante con botones:** "Nombre", "Evento"…, y una vista previa de cómo sonaría con el visitante elegido. Los lugares se eligen con botones.
  - **Ordenar, Deshacer y Rehacer** (Ctrl+Z / Ctrl+Y), y un botón visible para borrar un paso o una flecha.
- **Editor de flujos:** lienzo con nodos arrastrables, conexiones, zoom, guardar y abrir en JSON, y ejecución en tiempo real con el resultado de cada nodo.
- **Nodos esenciales:** Identificar visitante, Orientar, Preguntar con opciones, Mostrar en pantalla, Gesto, Según un dato, Avisar a alguien, Pedir aprobación, Pasar a recepción. Más nodos sueltos en "Avanzado".
- **Identificación personalizable:** cámara, código o QR, cédula o carné, nombre dicho al robot. Se activan, se reordenan y se condicionan a lo que dijo la cámara.
- **Reconocimiento facial real:** en "Quién llega", **Persona frente a la cámara** usa la cámara de este equipo y el servicio `./x2 rostro`. Ese servicio corre FaceRecognition Lite de Fermín contra las personas registradas en Supabase. La categoría de Supabase se traduce a la del club con `faceCategories` en `data/club.json`. Si no lo reconoce, el flujo sigue como con un no miembro y le pide su código. Los visitantes del dataset siguen con la cámara simulada.
- **Eventos:** fiestas, obras o reuniones con códigos de acceso para quienes la cámara no reconoce.
- **Atender lo que pida:** el robot pregunta qué necesita la persona y la acompaña a donde pida, solo entre los lugares permitidos para su categoría. Si pide otro ("quiero un masaje" de un miembro regular), le explica que no está disponible y le ofrece los permitidos. El flujo de ejemplo **Recepción conversacional**, que es el que viene por defecto, lo usa para que las 5 categorías conversen con el robot.
- **Mapa en vivo:** el plano del club con los lugares, la posición del robot (real con MuJoCo, dos veces por segundo) y la ruta al destino. Si el robot está en el suelo, lo avisa y muestra el botón **Levantar robot**; en la simulación además se levanta solo a los pocos segundos.
- **Lugares:** a dónde puede guiar el robot, sin código. Se definen en un plano del lobby: clic para crear, arrastrar para mover, o "Aquí está el robot" para usar su posición actual. Sus nombres se sugieren en "A dónde lo guía" de los nodos y en el lugar de los eventos. Cada lugar tiene un tipo (Salón VIP, Restaurante, Gimnasio…) y un color: con ellos se dibuja en el mapa y se amobla en MuJoCo.
- **Lenguaje natural:** si el robot tiene un LLM, "Preguntar con opciones" también acepta respuestas con palabras propias ("vengo a entrenar" → Gimnasio). El LLM solo puede elegir una de las opciones del nodo; si no entiende, el visitante lo dice de otra forma o toca una opción. En el campo "Cómo reconocer cada opción" el club escribe cómo suele decirse cada una, y eso sube los aciertos del 79 % al 95 % en las pruebas.
- **Voz en voz alta:** el navegador dice lo que dice el robot, en español (interruptor "Voz" en el robot). En el robot real hablaría su propia voz.
- **Visitas atendidas:** registro de cada llegada (categoría, cómo se confirmó, resultado, duración) con un resumen: cuántas resolvió el robot, cuántas pasaron a recepción y la duración promedio. Se puede exportar a CSV. Sirve para saber si el robot está orientando bien.
- **Capa del robot:** interfaz genérica (`src/robot/interface.js`) con un simulador web y un puente WebSocket a MuJoCo, ya conectado al AgiBot X2 simulado.

## Qué es real y qué es simulado

| Real | Simulado |
| --- | --- |
| Editor, motor de ejecución, enrutamiento | Reconocimiento facial de los visitantes de prueba (lee `data/people.json`) |
| Reconocimiento facial con "Persona frente a la cámara" (`./x2 rostro`, calibración preliminar) | |
| Consultas a listas y validación de códigos | Respuestas del visitante (código, cédula, nombre, opciones) |
| Eventos y registros editables | Avisos y aprobaciones de recepción |
| Robot AgiBot X2 en MuJoCo: camina con el control de movimiento oficial | Voz, pantalla y gestos del robot (se ven en la web; el MuJoCo del X2 no los tiene) |

Los nodos simulados se ven con borde punteado en el editor.

## Estructura

```
src/core/       motor, registro de nodos, eventos y registros; armar (build-flow), ordenar (layout) y revisar (check-flow) flujos
src/nodes/      nodos del framework
src/identify/   formas de identificar (cámara, código, cédula, nombre)
src/robot/      interfaz del robot, simulador, puente MuJoCo
src/ui/         editor y aplicación web
data/           configuración del club y personas de ejemplo
flows/          flujos de ejemplo
test/           pruebas por consola
```

## Puente con MuJoCo (AgiBot X2)

El protocolo (JSON por WebSocket, `ws://localhost:8765` por defecto) está documentado al inicio de `src/robot/mujoco-bridge.js`.

- **Acciones:** `speak`, `navigate`, `gesture` y `show`. El puente responde `{ "id": n, "ok": true }` al terminar cada una.
- **Órdenes de apoyo:** `hello`, `places` (con el tipo `kind` y el color de cada lugar), `interpret`, `pose` y `stand_up`, para lugares, lenguaje natural, posición del robot y levantarlo si se cae. Un puente que no las conozca sigue funcionando.
- **Tiempo de espera:** `navigate` espera hasta 120 s, porque guiar a alguien tarda más; las demás acciones esperan 20 s.

El puente para el AgiBot X2 está en el proyecto `x2_simulation` (`scripts/pibot/`). Para usarlo:

1. Arranque la simulación: `./x2 sim`, `./x2 mc`, `./x2 pie`.
2. Arranque el puente con `./x2 pibot`. Con `./x2 llm` antes, entiende lenguaje natural.
3. En PIBOT, arriba a la derecha, elija "AgiBot X2 en MuJoCo".

Se probó con las 7 personas del dataset y el robot caminando en MuJoCo: todas llegan a su destino en 7 a 16 s.

## Supuestos del club de ejemplo

Los espacios, destinos y reglas por categoría (por ejemplo "Salón VIP, piso 3", el acceso de servicio para trabajadores externos, el personal verificado con un código de nómina) son supuestos del ejemplo y se pueden cambiar en los flujos y en `data/club.json`.
