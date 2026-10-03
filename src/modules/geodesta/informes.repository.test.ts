import { describe, expect, it } from 'vitest';
import { apartadoCuadroVacio, apartadoTextoVacio } from './informeModelo';
import type { BorradorInforme } from './informeModelo';
import { filaAGuardar } from './informes.repository';

const base: BorradorInforme = {
  codigo: ' Dpto-Geol-2026-0003-02 ', fecha: '2026-10-02', estado: 'borrador',
  ciudad: 'Puerto Ordaz', para_nombre: 'Ender Mejías', para_cargo: '',
  de_nombre: 'Marco Romero', de_cargo: '', firma_nombre: '', firma_cargo: '',
  direccion_pie: '   ', logo_gt: true, logo_cvm: false, apartados: [],
};

describe('filaAGuardar', () => {
  it('recorta el código y saca de él el año y el número, para poder ordenar', () => {
    const f = filaAGuardar(base);
    expect(f.codigo).toBe('Dpto-Geol-2026-0003-02');
    expect(f.codigo_anio).toBe(2026);
    expect(f.codigo_nro).toBe(3);
  });
  it('un código libre se guarda igual, con año y número vacíos', () => {
    const f = filaAGuardar({ ...base, codigo: 'Informe anual' });
    expect(f.codigo).toBe('Informe anual');
    expect(f.codigo_anio).toBeNull();
    expect(f.codigo_nro).toBeNull();
  });
  it('los textos vacíos se guardan como null, no como cadena vacía', () => {
    const f = filaAGuardar(base);
    expect(f.direccion_pie).toBeNull();
    expect(f.para_cargo).toBeNull();
  });
  it('los interruptores de logo viajan tal cual, incluido el apagado', () => {
    const f = filaAGuardar(base);
    expect(f.logo_gt).toBe(true);
    expect(f.logo_cvm).toBe(false);
  });
  it('descarta los apartados totalmente vacíos y conserva los que tienen algo', () => {
    const vacio = apartadoTextoVacio();
    const lleno = { ...apartadoTextoVacio(), texto: 'Reciba un cordial saludo' };
    const f = filaAGuardar({ ...base, apartados: [vacio, lleno] });
    expect((f.apartados as unknown[])).toHaveLength(1);
  });
  it('un cuadro recién creado y sin tocar NO se guarda: es un apartado fantasma', () => {
    const f = filaAGuardar({ ...base, apartados: [apartadoCuadroVacio()] });
    expect((f.apartados as unknown[])).toHaveLength(0);
  });
  it('un cuadro con una columna renombrada SÍ se guarda, aunque sus filas estén en blanco', () => {
    // En cuanto el geólogo toca la estructura, es trabajo suyo y se respeta.
    const c = apartadoCuadroVacio();
    c.columnas[0].nombre = 'Período';
    const f = filaAGuardar({ ...base, apartados: [c] });
    expect((f.apartados as unknown[])).toHaveLength(1);
  });
  it('incluye el texto de búsqueda ya armado', () => {
    const f = filaAGuardar(base) as { busq: string };
    expect(f.busq).toContain('ender mejias');
  });
  it('el texto de búsqueda no incluye apartados fantasma descartados', () => {
    // Las columnas por defecto de un cuadro sin tocar no deben ensuciar la búsqueda.
    const f = filaAGuardar({ ...base, apartados: [apartadoCuadroVacio()] }) as { busq: string };
    expect(f.busq).not.toContain('actividad');
    expect(f.busq).not.toContain('observaciones');
  });
});
