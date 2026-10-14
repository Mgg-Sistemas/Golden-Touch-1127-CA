import { describe, it, expect } from 'vitest';
import type { Personal } from '@/shared/lib/types';
import { htmlDirectorioImpresion, personasDirectorio } from './directorioFotos';

const p = (x: Partial<Personal>) => ({ id: x.id ?? 'x', nombre: 'Ana', apellido: null, cargo: null, departamento: null, ficha_nro: null, cedula: null, ...x }) as Personal;

describe('directorio de fotos (14/10/2026)', () => {
  it('ordena por nombre y completa lo que falta', () => {
    const r = personasDirectorio([p({ id: '1', nombre: 'Zoila', apellido: 'Paz', cargo: 'Chofer' }), p({ id: '2', nombre: 'Ángel', apellido: 'Ruiz' })]);
    expect(r.map((x) => x.nombre)).toEqual(['Ángel Ruiz', 'Zoila Paz']);
    expect(r[0].cargo).toBe('Sin cargo');
  });

  it('la hoja de impresión lleva una fila por persona y escapa el texto', () => {
    const html = htmlDirectorioImpresion([
      { id: '1', nombre: 'Ana <b>', cargo: 'Chofer', departamento: 'Flota', ficha: '12', cedula: 'V-1', foto: null },
      { id: '2', nombre: 'Luis', cargo: 'Mecánico', departamento: null, ficha: null, cedula: null, foto: 'data:image/jpeg;base64,AA' },
    ], { empresa: 'GOLDEN TOUCH', rif: 'J-1', logoUrl: '/LOGO.jpg', fecha: 'hoy' });
    expect(html.match(/class="fila"/g)?.length).toBe(2);
    expect(html).toContain('Ana &lt;b&gt;');
    expect(html).toContain('Sin foto');
    expect(html).toContain('2 personas');
  });
});
