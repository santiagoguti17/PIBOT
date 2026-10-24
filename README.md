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
node test/mujoco-bridge.test.mjs                        # adaptador MuJoCo contra un WebSocket falso
```

## Qué incluye

- **Editor de flujos:** lienzo con nodos arrastrables, conexiones, zoom, guardar y abrir en JSON, y ejecución en tiempo real con el resultado de cada nodo.
- **Nodos esenciales:** Identificar visitante, Orientar, Preguntar con opciones, Mostrar en pantalla, Gesto, Según un dato, Avisar a alguien, Pedir aprobación, Pasar a recepción. Más nodos sueltos en "Avanzado".
- **Identificación personalizable:** cámara, código o QR, cédula o carné, nombre dicho al robot. Se activan, se reordenan y se condicionan a lo que dijo la cámara.
- **Eventos:** fiestas, obras o reuniones con códigos de acceso para quienes la cámara no reconoce.
- **Capa del robot:** interfaz genérica (`src/robot/interface.js`) con un simulador web y un puente WebSocket a MuJoCo.

## Qué es real y qué es simulado

| Real | Simulado |
| --- | --- |
| Editor, motor de ejecución, enrutamiento | Reconocimiento facial (lee `data/people.json`) |
| Consultas a listas y validación de códigos | Respuestas del visitante (código, cédula, nombre, opciones) |
| Eventos y registros editables | Avisos y aprobaciones de recepción |
| | Robot: simulador web; el puente MuJoCo solo se probó contra un servidor falso |

Los nodos simulados se ven con borde punteado en el editor.

## Estructura

```
src/core/       motor, registro de nodos, eventos y registros
src/nodes/      nodos del framework
src/identify/   formas de identificar (cámara, código, cédula, nombre)
src/robot/      interfaz del robot, simulador, puente MuJoCo
src/ui/         editor y aplicación web
data/           configuración del club y personas de ejemplo
flows/          flujos de ejemplo
test/           pruebas por consola
```

## Puente con MuJoCo

El protocolo (JSON por WebSocket, `ws://localhost:8765` por defecto) está documentado al inicio de `src/robot/mujoco-bridge.js`. Comandos: `speak`, `navigate`, `gesture`, `show`; el simulador responde `{ "id": n, "ok": true }` al terminar cada acción.

## Supuestos del club de ejemplo

Los espacios, destinos y reglas por categoría (por ejemplo "Salón VIP, piso 3", el acceso de servicio para trabajadores externos, el personal verificado con un código de nómina) son supuestos del ejemplo y se pueden cambiar en los flujos y en `data/club.json`.
