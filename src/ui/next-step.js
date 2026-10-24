// Menú del + de una salida: qué hace el robot después, en palabras del club. Elegir uno crea el paso ya conectado.
import { getNode } from '../core/registry.js';
import { groupColor } from './editor.js';
import { icon } from './icons.js';

const STEPS = [
  ['robot.orient', 'Decir algo y llevarlo', 'Lo saluda y, si quiere, lo acompaña a un lugar.'],
  ['robot.serve', 'Preguntarle qué necesita', 'Lo lleva a donde pida, entre los lugares permitidos.'],
  ['robot.choose', 'Preguntarle con opciones', 'Cada respuesta sigue su propio camino.'],
  ['robot.show', 'Mostrar en la pantalla', 'Una tarjeta con un título y un texto.'],
  ['robot.gesture', 'Hacer un gesto', 'Saludar, asentir o señalar.'],
  ['escalation.notify', 'Avisar a alguien', 'Un aviso a recepción, al concierge…, sin detener al robot.'],
  ['escalation.approve', 'Pedir aprobación', 'Espera a que una persona autorice o rechace.'],
  ['escalation.assist', 'Pasar a recepción', 'Se lo dice al visitante y avisa a recepción.'],
  ['decision.switch', 'Decidir según un dato', 'Un camino distinto según, por ejemplo, la categoría.'],
];

let open = null;
const close = () => { open?.remove(); open = null; removeEventListener('pointerdown', outside, true); removeEventListener('keydown', onKey, true); };
const outside = (e) => { if (open && !open.contains(e.target)) close(); };
const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

// anchor: el botón +; title: qué salida es ("Si: VIP"); onPick(type)
export function pickNextStep(anchor, { title, onPick }) {
  close();
  const menu = document.createElement('div');
  menu.className = 'next-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', title);
  menu.innerHTML = `<p class="next-title"></p>`;
  menu.querySelector('.next-title').textContent = title;
  for (const [type, label, help] of STEPS) {
    const def = getNode(type); if (!def) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitem'); b.style.setProperty('--c', groupColor(def.group));
    b.innerHTML = `${icon(def.icon)}<span><b></b><small></small></span>`;
    b.querySelector('b').textContent = label; b.querySelector('small').textContent = help;
    b.onclick = () => { close(); onPick(type); };
    menu.append(b);
  }
  const tip = document.createElement('p'); tip.className = 'next-tip';
  tip.textContent = 'Para seguir con un paso que ya existe, arrastre desde el punto de la salida hasta ese paso.';
  menu.append(tip);
  document.body.append(menu);
  // Al lado del +, sin salirse de la ventana
  const r = anchor.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.min(innerWidth - w - 12, r.right + 8)}px`;
  menu.style.top = `${Math.max(12, Math.min(innerHeight - h - 12, r.top - 40))}px`;
  open = menu;
  addEventListener('pointerdown', outside, true); addEventListener('keydown', onKey, true);
  menu.querySelector('button').focus();
  // Flechas arriba/abajo entre las opciones
  menu.onkeydown = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); e.preventDefault();
  };
}
