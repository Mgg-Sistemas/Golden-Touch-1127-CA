import { describe, expect, it } from 'vitest';
import { mensajeClaveEnEspanol } from './mensajesClave';

describe('mensajeClaveEnEspanol', () => {
  it('traduce el rechazo por clave filtrada', () => {
    expect(mensajeClaveEnEspanol('Password is known to be weak and easy to guess, please choose a different one.'))
      .toMatch(/demasiado conocida/);
  });
  it('traduce el largo mínimo con su número', () => {
    expect(mensajeClaveEnEspanol('Password should be at least 8 characters.')).toBe('La clave es muy corta: debe tener al menos 8 caracteres.');
  });
  it('traduce la clave igual a la anterior', () => {
    expect(mensajeClaveEnEspanol('New password should be different from the old password.')).toMatch(/distinta/);
  });
  it('deja pasar los mensajes que ya están en español', () => {
    expect(mensajeClaveEnEspanol('Solo admin puede resetear claves')).toBe('Solo admin puede resetear claves');
  });
});
