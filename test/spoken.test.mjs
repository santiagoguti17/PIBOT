// Prueba de lo que el robot entiende de una respuesta hablada (ya en texto, como la escribe Whisper): la opción que
// quiso decir y el código, la cédula o el nombre que dictó. Lo usan el robot real y la página con "Micrófono".
import { readFileSync } from 'node:fs';
import { closestCode, contradicts, outsideOptions, sayableCode, sayOption, spokenAnswer } from '../src/core/spoken.js';

const workspace = JSON.parse(readFileSync(new URL('../data/club.json', import.meta.url)));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${msg}`); if (!ok) fails++; };

const places = ['Restaurante', 'Gimnasio', 'Terraza', 'Zona social', 'Spa'];
const hints = { Gimnasio: 'entrenar, pesas, hacer ejercicio', Spa: 'masajes, sauna', Restaurante: 'comer, almorzar' };
check(sayOption('Al gimnasio, por favor.', places, hints) === 'Gimnasio', 'la opción dicha tal cual');
check(sayOption('Vengo a entrenar un rato', places, hints) === 'Gimnasio', 'con una frase del club');
check(sayOption('Quisiera un masaje', places, hints) === 'Spa', 'singular o plural: "un masaje" calza con "masajes"');
check(sayOption('Nada, gracias', ['Gimnasio', 'Nada, gracias'], {}) === 'Nada, gracias', 'una opción de varias palabras');
check(sayOption('Buenas tardes', places, hints) === null, 'nada que se parezca: no adivina');
check(sayOption('Quiero hacer un poco de ejercicio', places, hints) === 'Gimnasio', 'las palabras de la frase, aunque haya otras en medio');
check(sayOption('Entreno todos los días', places, hints) === 'Gimnasio', 'otra forma del verbo: entreno / entrenar');
check(sayOption('Necesito relajarme', places, { Spa: 'relajarse, masajes' }) === 'Spa', 'relajarme / relajarse');
check(sayOption('No quiero ir al gimnasio', places, hints) === null, 'con un "no": no adivina');
check(sayOption('Quiero comer en la terraza', places, { Restaurante: 'comer' }) === null, 'calza con dos opciones: no adivina');
const walk = { 'Acompáñeme': 'sí, por favor, no sé dónde queda, guíeme', 'Conozco el camino': 'no hace falta, ya he venido, sé dónde es' };
check(sayOption('Sí, por favor', Object.keys(walk), walk) === 'Acompáñeme', 'un "sí" corto');
check(sayOption('No, no hace falta, gracias', Object.keys(walk), walk) === 'Conozco el camino', 'un "no" que es parte de la frase');
check(sayOption('No sé dónde queda', Object.keys(walk), walk) === 'Acompáñeme', '"no sé dónde queda" no es "sé dónde es"');

const hours = ['4 pm', '5 pm', '6 pm', 'No, gracias'];
check(sayOption('A las cinco de la tarde', hours, {}) === '5 pm', 'una hora dicha en palabras: "a las cinco de la tarde" → 5 pm');
check(sayOption('A las tres de la tarde', hours, {}) === null, 'una hora que no está entre las opciones: no adivina');
check(contradicts('A las 3 de la tarde, por favor', '6 pm'), 'si el LLM elige otra hora ("a las 3" → "6 pm"), no vale');
check(!contradicts('Sí, perfecto, a las cinco me queda bien', 'Sí, a las 5 pm'), 'la misma hora, dicha distinto, sí vale');
check(!contradicts('Quiero hacer ejercicio', 'Gimnasio'), 'sin números, no hay nada que contradecir');
check(outsideOptions('A las tres, por favor', hours) && !outsideOptions('A las cinco', hours), 'una hora que no se ofrece: se le dice que no está disponible');

const code = (heard) => spokenAnswer(heard, 'code', workspace);
check(code('Mi código es fiesta veintisiete.').value === 'FIESTA-27', 'código con el número en palabras');
check(code('FIESTA-27').value === 'FIESTA-27', 'código como lo escribe Whisper cuando sabe qué códigos hay');
check(code('obra treinta y uno').value === 'OBRA-31', 'un número de dos palabras: "treinta y uno"');
check(code('fiestas 27').value === 'FIESTA-27', 'una letra de más en la palabra: se perdona');
check(code('fiesta veintiocho').unknown === true, 'otro número: no pasa por FIESTA-27 aunque se parezca');
check(code('fiesta').unknown === true, 'sin el número: pide que lo repita');
check(code('personal cuarenta y uno').value === 'PERSONAL-41', 'código de la nómina de personal');
check(code('No tengo código').value === null, '"no tengo": sigue sin código');
check(spokenAnswer('Eh, me llamo Mateo Vargas.', 'name', workspace).value === 'Mateo Vargas', 'nombre solo, sin "me llamo"');
check(spokenAnswer('Mateo Vargas', 'name', workspace).value === 'Mateo Vargas', 'nombre dicho tal cual');
check(spokenAnswer('cuatro cero cuatro cero 4040', 'document', workspace).value === '40404040', 'cédula: solo los dígitos');
check(spokenAnswer('Voy a la reunión de mantenimiento.', 'destination', workspace).value === 'Voy a la reunión de mantenimiento', 'a dónde va: tal como lo dijo');

check(closestCode('FIESTA7K2', ['FIESTA-7K2']) === 'FIESTA-7K2', 'los códigos viejos con letras siguen sirviendo');
const nuevo = sayableCode('Reunión', ['FIESTA-27', 'OBRA-31']);
check(/^REUNION-\d\d$/.test(nuevo) && !['27', '31'].includes(nuevo.slice(-2)), `código nuevo fácil de decir, con número libre (${nuevo})`);

console.log(fails ? `${fails} fallos` : 'todos correctos');
process.exit(fails ? 1 : 0);
