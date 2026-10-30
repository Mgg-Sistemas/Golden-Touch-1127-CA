import { describe, it, expect } from 'vitest';
import { GRUPO_BIDONES, GRUPO_OTROS, opcionesEquipos, type FichaEquipoOpcion } from './opcionesEquipos';
import { CLASES_EQUIPO_BASE } from '@/modules/maquinaria/flota';

const payloader: FichaEquipoOpcion = {
  equipo: 'PAYLOADER VOLVO L220G 2014', combustible_equipo: 'PAYLOADER VOLVO L220G 2014',
  marca: 'VOLVO', modelo: 'L220G', placa: null, serial: 'VCE0001', tipo: 'CARGADOR FRONTAL',
};
const excavadora: FichaEquipoOpcion = {
  equipo: 'EXCAVADORA VOLVO EC240', combustible_equipo: 'Excavadora Volvo EC240',
  alias: 'EC240, LA GRANDE', marca: 'VOLVO', modelo: 'EC240BLC', tipo: 'EXCAVADORA',
};
const hilux: FichaEquipoOpcion = {
  equipo: 'TOYOTA HILUX 05', combustible_equipo: 'TOYOTA HILUX 05', marca: 'TOYOTA', modelo: 'HILUX', placa: 'A12BC3D', tipo: 'CAMIONETA',
};
const moto: FichaEquipoOpcion = { equipo: 'MOTO BERA 01', combustible_equipo: 'MOTO BERA 01', modelo: 'SBR 150', tipo: 'MOTO' };

const catalogo = ['TOYOTA HILUX 05', 'EXCAVADORA VOLVO EC240', 'PAYLOADER VOLVO L220G 2014', 'CISTERNA EXTERNA PDVSA', 'MOTO BERA 01'];
const fichas = [payloader, excavadora, hilux, moto];

describe('opciones del buscador de equipos (teléfono)', () => {
  const ops = opcionesEquipos({ catalogo, fichas, bidones: ['BIDÓN 200 L'], modo: 'telefono', apartados: CLASES_EQUIPO_BASE });

  it('sin alias el label es el NOMBRE principal (no el modelo); el modelo sigue sirviendo para buscar', () => {
    const o = ops.find((x) => x.value === 'PAYLOADER VOLVO L220G 2014')!;
    expect(o.label).toBe('PAYLOADER VOLVO L220G 2014');
    expect(o.hint).toBeUndefined(); // el corto ya es el nombre oficial, no hace falta repetirlo
    expect(o.keywords).toEqual(expect.arrayContaining(['L220G', 'VOLVO']));
    expect(o.group).toBe('Maquinaria y Equipos');
    expect(o.groupIcon).toBe('🚜');
  });

  it('alias con coma: el primero es el label y todos se buscan; el value es el nombre del catálogo', () => {
    const o = ops.find((x) => x.value === 'EXCAVADORA VOLVO EC240')!;
    expect(o.label).toBe('EC240');
    expect(o.keywords).toEqual(expect.arrayContaining(['EC240', 'LA GRANDE', 'VOLVO', 'EC240BLC', 'EXCAVADORA']));
  });

  it('equipo sin ficha va a «Otros equipos de Combustible» con su nombre', () => {
    const o = ops.find((x) => x.value === 'CISTERNA EXTERNA PDVSA')!;
    expect(o.label).toBe('CISTERNA EXTERNA PDVSA');
    expect(o.hint).toBeUndefined();
    expect(o.group).toBe(GRUPO_OTROS);
  });

  it('el bidón va al final en su grupo', () => {
    const ultimo = ops[ops.length - 1];
    expect(ultimo.value).toBe('BIDÓN 200 L');
    expect(ultimo.group).toBe(GRUPO_BIDONES);
  });

  it('orden de grupos: Maquinaria, Vehículos, Motos… luego Otros y Bidones; dentro por label', () => {
    const grupos = ops.map((o) => o.group);
    expect(grupos).toEqual(['Maquinaria y Equipos', 'Maquinaria y Equipos', 'Vehículos', 'Motos', GRUPO_OTROS, GRUPO_BIDONES]);
    expect(ops.slice(0, 2).map((o) => o.label)).toEqual(['EC240', 'PAYLOADER VOLVO L220G 2014']);
  });

  it('la placa sirve para encontrar la camioneta (aunque el label sea el nombre principal)', () => {
    const o = ops.find((x) => x.value === 'TOYOTA HILUX 05')!;
    expect(o.label).toBe('TOYOTA HILUX 05');
    expect(o.keywords).toContain('A12BC3D');
  });
});

describe('opciones del buscador de equipos (PC)', () => {
  const ops = opcionesEquipos({ catalogo, fichas, modo: 'pc', apartados: CLASES_EQUIPO_BASE });
  it('en la PC el label es el nombre oficial y el alias va de hint', () => {
    const o = ops.find((x) => x.value === 'EXCAVADORA VOLVO EC240')!;
    expect(o.label).toBe('EXCAVADORA VOLVO EC240');
    expect(o.hint).toBe('EC240, LA GRANDE');
    expect(o.keywords).toContain('EC240');
    expect(o.group).toBe('Maquinaria y Equipos');
  });
  it('sin bidones no hay grupo Bidones', () => {
    expect(ops.some((o) => o.group === GRUPO_BIDONES)).toBe(false);
  });
});

describe('cruce catálogo ↔ ficha', () => {
  it('coincide sin acentos ni mayúsculas, y por el nombre del equipo si no hay vínculo', () => {
    const ops = opcionesEquipos({
      catalogo: ['Camión Volteo 02'],
      fichas: [{ equipo: 'CAMION VOLTEO 02', combustible_equipo: null, alias: 'EL VOLTEO', tipo: 'CAMIÓN VOLTEO' }],
      modo: 'telefono', apartados: CLASES_EQUIPO_BASE,
    });
    expect(ops).toHaveLength(1);
    expect(ops[0].label).toBe('EL VOLTEO');
    expect(ops[0].value).toBe('Camión Volteo 02');
    expect(ops[0].group).toBe('Vehículos');
  });
  it('un bidón que también está en el catálogo se pinta una sola vez, como bidón', () => {
    const ops = opcionesEquipos({ catalogo: ['BIDÓN 200 L', 'X'], fichas: [], bidones: ['Bidón 200 L'], modo: 'telefono', apartados: CLASES_EQUIPO_BASE });
    expect(ops.filter((o) => o.value.toLowerCase().startsWith('bid'))).toHaveLength(1);
    expect(ops[ops.length - 1].group).toBe(GRUPO_BIDONES);
  });
});

describe('filtrado por activo y tanques permitidos (control de surtido)', () => {
  const catalogoConPermisos = [
    { valor: 'PAYLOADER VOLVO L220G 2014', activo: true, tanques_permitidos: null }, // todos los tanques
    { valor: 'EXCAVADORA VOLVO EC240', activo: true, tanques_permitidos: ['tanque-1', 'Tanque #3'] }, // solo tanque 1 y 3
    { valor: 'TOYOTA HILUX 05', activo: false, tanques_permitidos: null }, // inactivo / no puede surtir
    { valor: 'MOTO BERA 01', activo: true, tanques_permitidos: ['tanque-brasileros'] }, // solo brasileros
  ];

  it('excluye los equipos con activo === false (desmarcados del surtido)', () => {
    const ops = opcionesEquipos({
      catalogo: catalogoConPermisos,
      fichas,
      modo: 'pc',
      apartados: CLASES_EQUIPO_BASE,
    });
    expect(ops.some((o) => o.value === 'TOYOTA HILUX 05')).toBe(false);
    expect(ops.some((o) => o.value === 'PAYLOADER VOLVO L220G 2014')).toBe(true);
  });

  it('si se indica tanqueActual, solo muestra equipos autorizados para ese tanque o para todos', () => {
    // Tanque 1: debe mostrar payloader (todos) y excavadora (tanque-1), pero no moto (solo brasileros) ni hilux (inactivo)
    const opsT1 = opcionesEquipos({
      catalogo: catalogoConPermisos,
      fichas,
      modo: 'pc',
      apartados: CLASES_EQUIPO_BASE,
      tanqueActual: { id: 'tanque-1', nombre: 'Tanque #1' },
    });
    const valsT1 = opsT1.map((o) => o.value);
    expect(valsT1).toContain('PAYLOADER VOLVO L220G 2014');
    expect(valsT1).toContain('EXCAVADORA VOLVO EC240');
    expect(valsT1).not.toContain('MOTO BERA 01');
    expect(valsT1).not.toContain('TOYOTA HILUX 05');

    // Tanque Brasileros: debe mostrar payloader (todos) y moto (brasileros), pero no excavadora
    const opsBras = opcionesEquipos({
      catalogo: catalogoConPermisos,
      fichas,
      modo: 'pc',
      apartados: CLASES_EQUIPO_BASE,
      tanqueActual: { id: 'tanque-brasileros', nombre: 'Tanque #2 Brasileros' },
    });
    const valsBras = opsBras.map((o) => o.value);
    expect(valsBras).toContain('PAYLOADER VOLVO L220G 2014');
    expect(valsBras).toContain('MOTO BERA 01');
    expect(valsBras).not.toContain('EXCAVADORA VOLVO EC240');
  });

  it('incluirValor preserva el equipo seleccionado aunque esté inactivo o restringido', () => {
    const ops = opcionesEquipos({
      catalogo: catalogoConPermisos,
      fichas,
      modo: 'pc',
      apartados: CLASES_EQUIPO_BASE,
      tanqueActual: { id: 'tanque-1', nombre: 'Tanque #1' },
      incluirValor: 'TOYOTA HILUX 05', // inactivo, pero en edición
    });
    expect(ops.some((o) => o.value === 'TOYOTA HILUX 05')).toBe(true);
  });
});
