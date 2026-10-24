// Datos de quien llega que se pueden poner en lo que dice el robot, con el nombre que ve el club
import { fillTemplate } from '../core/engine.js';

export const VARS = [['{{name}}', 'Nombre'], ['{{event}}', 'Evento'], ['{{place}}', 'Lugar'], ['{{area}}', 'Área de trabajo'], ['{{category}}', 'Categoría'],
  ['{{resource}}', 'Espacio reservado'], ['{{time}}', 'Hora reservada'], ['{{meeting}}', 'Reunión'], ['{{meetingPlace}}', 'Lugar de la reunión']];

// Ejemplo con el que se muestra cómo sonará un texto (el visitante elegido en "Quién llega")
export const preview = (text, vars) => fillTemplate(String(text ?? ''), vars);
