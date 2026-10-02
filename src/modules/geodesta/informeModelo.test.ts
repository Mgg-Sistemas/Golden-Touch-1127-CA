import { describe, expect, it } from 'vitest';
import {
  apartadoCuadroVacio, apartadoTieneContenido, apartadoTextoVacio, codigoGeodesta, columnaVacia,
  componerBusqInforme, errorInforme, filaVaciaDe, hoyVE, partesCodigo,
  type BorradorInforme,
} from './informeModelo';

const base: BorradorInforme = {
  codigo: 'Dpto-Geol-2026-0001-02',
  fecha: '2026-10-02',
  estado: 'borrador',
  ciudad: 'Puerto Ordaz',
  para_nombre: 'Ender Mejías', para_cargo: 'Representante Legal',
  de_nombre: 'Marco Romero', de_cargo: 'Departamento de Geología',
  firma_nombre: 'Ing. Marco Romero', firma_cargo: 'Geólogo',
  direccion_pie: 'Sector La Esperanza',
  logo_gt: true, logo_cvm: true,
  apartados: [],
};

describe('apartados vacíos', () => {
  it('un cuadro nuevo trae tres columnas y una fila, listo para escribir', () => {
    const c = apartadoCuadroVacio();
    expect(c.tipo).toBe('cuadro');
    expect(c.titulo).toBe('');
    expect(c.columnas).toHaveLength(3);
    expect(c.filas).toHaveLength(1);
    // la fila nueva tiene una celda por columna, todas vacías
    expect(Object.keys(c.filas[0].celdas).sort()).toEqual(c.columnas.map((x) => x.id).sort());
  });
  it('las tres columnas por defecto son las del formato en papel', () => {
    expect(apartadoCuadroVacio().columnas.map((c) => c.nombre)).toEqual(['Fecha', 'Actividad', 'Observaciones']);
  });
  it('un texto nuevo viene vacío y sin imágenes', () => {
    const t = apartadoTextoVacio();
    expect(t.tipo).toBe('texto');
    expect(t.texto).toBe('');
    expect(t.imagenes).toEqual([]);
  });
  it('cada apartado nace con un id propio', () => {
    expect(apartadoCuadroVacio().id).not.toBe(apartadoCuadroVacio().id);
  });
  it('una columna nueva es de texto salvo que se diga otra cosa', () => {
    expect(columnaVacia().tipo).toBe('texto');
    expect(columnaVacia('Plano').nombre).toBe('Plano');
  });
  it('una fila nueva tiene una celda vacía por cada columna que exista', () => {
    const cols = [columnaVacia('A'), columnaVacia('B')];
    const f = filaVaciaDe(cols);
    expect(Object.keys(f.celdas).sort()).toEqual(cols.map((c) => c.id).sort());
    expect(Object.values(f.celdas)).toEqual(['', '']);
  });
});

describe('codigoGeodesta', () => {
  it('arma el formato del papel con cuatro dígitos', () => {
    expect(codigoGeodesta(2026, 1)).toBe('Dpto-Geol-2026-0001-02');
    expect(codigoGeodesta(2025, 4)).toBe('Dpto-Geol-2025-0004-02');
    expect(codigoGeodesta(2026, 1234)).toBe('Dpto-Geol-2026-1234-02');
  });
});

describe('partesCodigo', () => {
  it('reconoce un código con el formato de la casa', () => {
    expect(partesCodigo('Dpto-Geol-2025-0004-02')).toEqual({ anio: 2025, nro: 4 });
  });
  it('un código escrito a mano que no sigue el formato NO rompe: devuelve null', () => {
    // El geólogo puede escribir lo que quiera; el histórico se ordena por fecha.
    expect(partesCodigo('Informe anual')).toBeNull();
    expect(partesCodigo('')).toBeNull();
    expect(partesCodigo('Dpto-Geol-abcd-0001-02')).toBeNull();
    expect(partesCodigo('Dpto-Geol-2025-0004')).toBeNull();
  });
  it('tolera espacios de los bordes', () => {
    expect(partesCodigo('  Dpto-Geol-2026-0007-02  ')).toEqual({ anio: 2026, nro: 7 });
  });
});

describe('errorInforme', () => {
  it('el informe base se puede guardar', () => {
    expect(errorInforme(base)).toBeNull();
  });
  it('sin fecha no se guarda: la base la exige', () => {
    expect(errorInforme({ ...base, fecha: '' })).toMatch(/fecha/i);
  });
  it('sin código no se guarda: la base lo exige', () => {
    expect(errorInforme({ ...base, codigo: '   ' })).toMatch(/c[óo]digo/i);
  });
  it('un código raro NO es error: el geólogo manda sobre su numeración', () => {
    expect(errorInforme({ ...base, codigo: 'Informe anual' })).toBeNull();
  });
  it('un cuadro sin ninguna columna no se puede guardar', () => {
    const c = { ...apartadoCuadroVacio(), columnas: [], filas: [] };
    expect(errorInforme({ ...base, apartados: [c] })).toMatch(/columna/i);
  });
});

describe('componerBusqInforme', () => {
  it('junta código, destinatario y el texto de los apartados, sin acentos ni mayúsculas', () => {
    const t = { ...apartadoTextoVacio(), texto: 'Recolección de MUESTRAS' };
    const b = componerBusqInforme({ ...base, apartados: [t] });
    expect(b).toContain('dpto-geol-2026-0001-02');
    expect(b).toContain('ender mejias');
    expect(b).toContain('recoleccion de muestras');
  });
  it('también entra el contenido de las celdas y los títulos de los cuadros', () => {
    const c = apartadoCuadroVacio();
    c.titulo = 'Exploración';
    c.filas[0].celdas[c.columnas[1].id] = 'Calicatas del bloque 3';
    const b = componerBusqInforme({ ...base, apartados: [c] });
    expect(b).toContain('exploracion');
    expect(b).toContain('calicatas del bloque 3');
  });
  it('no mete los identificadores internos en la búsqueda', () => {
    const c = apartadoCuadroVacio();
    const b = componerBusqInforme({ ...base, apartados: [c] });
    expect(b).not.toContain(c.id);
    expect(b).not.toContain(c.columnas[0].id);
  });
});

describe('hoyVE', () => {
  it('da la fecha de Caracas, no la del equipo', () => {
    // 2027-01-01T03:00Z son las 23:00 del 31/12/2026 en Venezuela
    expect(hoyVE(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12-31');
  });
});

describe('apartadoTieneContenido', () => {
  it('un apartado de texto recién creado está vacío', () => {
    expect(apartadoTieneContenido(apartadoTextoVacio())).toBe(false);
  });
  it('un cuadro recién creado, con sus columnas por defecto y sin datos, está vacío', () => {
    expect(apartadoTieneContenido(apartadoCuadroVacio())).toBe(false);
  });
  it('un texto con título cuenta como lleno', () => {
    expect(apartadoTieneContenido({ ...apartadoTextoVacio(), titulo: 'Exploración' })).toBe(true);
  });
  it('un texto con una imagen cuenta como lleno aunque no tenga palabras', () => {
    const t = { ...apartadoTextoVacio(), imagenes: [{ imagen_id: 'x', pie: '' }] };
    expect(apartadoTieneContenido(t)).toBe(true);
  });
  it('un cuadro con una celda escrita cuenta como lleno', () => {
    const c = apartadoCuadroVacio();
    c.filas[0].celdas[c.columnas[0].id] = 'enero';
    expect(apartadoTieneContenido(c)).toBe(true);
  });
  it('un cuadro con una columna renombrada cuenta como lleno: es trabajo del usuario', () => {
    const c = apartadoCuadroVacio();
    c.columnas[0].nombre = 'Período';
    expect(apartadoTieneContenido(c)).toBe(true);
  });
  it('un cuadro con una columna de más cuenta como lleno', () => {
    const c = apartadoCuadroVacio();
    c.columnas = [...c.columnas, columnaVacia('Plano', 'imagen')];
    expect(apartadoTieneContenido(c)).toBe(true);
  });
  it('un cuadro con una columna de menos cuenta como lleno', () => {
    const c = apartadoCuadroVacio();
    c.columnas = c.columnas.slice(0, 2);
    expect(apartadoTieneContenido(c)).toBe(true);
  });
  it('sólo espacios en blanco no cuentan como contenido', () => {
    expect(apartadoTieneContenido({ ...apartadoTextoVacio(), titulo: '   ', texto: '  ' })).toBe(false);
  });
});
