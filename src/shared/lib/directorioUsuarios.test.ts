import { describe, it, expect } from 'vitest';
import { nombreVisible, nombreYApellido, type Directorio } from './directorioUsuarios';

const dir: Directorio = new Map([
  ['lozadawendy2511@gmail.com', 'WENDY LOZADA'],
  ['rrhhmgg001@gmail.com', 'María Pérez'],
]);

describe('nombreVisible', () => {
  it('con solo el correo muestra nombre y apellido (sin importar mayúsculas)', () => {
    expect(nombreVisible(null, 'LozadaWendy2511@gmail.com', dir)).toBe('WENDY LOZADA');
    expect(nombreVisible(undefined, 'rrhhmgg001@gmail.com', dir)).toBe('María Pérez');
  });

  it('si el nombre guardado es solo el de pila, completa con el apellido del directorio', () => {
    expect(nombreVisible('WENDY', 'lozadawendy2511@gmail.com', dir)).toBe('WENDY LOZADA');
    expect(nombreVisible('maria', 'rrhhmgg001@gmail.com', dir)).toBe('María Pérez');
  });

  it('si el nombre guardado es otro (la persona cambió de nombre) se respeta el de entonces', () => {
    expect(nombreVisible('LAURA GOMEZ', 'lozadawendy2511@gmail.com', dir)).toBe('LAURA GOMEZ');
  });

  it('un correo que no está en el directorio se muestra tal cual', () => {
    expect(nombreVisible(null, 'otro@correo.com', dir)).toBe('otro@correo.com');
  });

  it('si el «nombre guardado» en realidad es un correo, también se resuelve', () => {
    expect(nombreVisible('lozadawendy2511@gmail.com', null, dir)).toBe('WENDY LOZADA');
  });

  it('valores que no son correo (sistema, vacío) quedan como están', () => {
    expect(nombreVisible(null, 'sistema', dir)).toBe('sistema');
    expect(nombreVisible('', '', dir)).toBe('');
    expect(nombreVisible(null, null, dir)).toBe('');
  });

  it('un nombre guardado sin correo se respeta', () => {
    expect(nombreVisible('Pedro Ruiz', null, dir)).toBe('Pedro Ruiz');
  });
});

describe('nombreYApellido', () => {
  it('une nombre y apellido sin espacios sobrantes', () => {
    expect(nombreYApellido(' Ana ', ' Díaz ')).toBe('Ana Díaz');
    expect(nombreYApellido('Ana', null)).toBe('Ana');
  });
});
