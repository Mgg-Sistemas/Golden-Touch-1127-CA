import { describe, it, expect } from 'vitest';
import type { Personal, PersonalFamiliar } from '@/shared/lib/types';
import {
  agruparPersonal, antiguedad, edad, esPadre, filtrarPersonal, FILTROS_VACIOS,
  hayFiltros, hijosDe, labelEstadoCivil, labelGenero, opcionesDe, resumenPersonal,
} from './fichaPersonal';

const HOY = '2026-09-22';

function gente(p: Partial<Personal> & { id: string }): Personal {
  return {
    nombre: 'N', apellido: 'A', sueldo_base: 0, activo: true, created_at: '2026-01-01T00:00:00Z',
    ...p,
  } as Personal;
}

function fam(personalId: string, parentesco: PersonalFamiliar['parentesco']): PersonalFamiliar {
  return {
    id: `${personalId}-${parentesco}`, personal_id: personalId, nombre: 'X',
    parentesco, estudia: false, discapacidad: false, created_at: '2026-01-01T00:00:00Z',
  } as PersonalFamiliar;
}

describe('edad', () => {
  it('cuenta los años cumplidos', () => {
    expect(edad('1973-10-21', '2026-09-22')).toBe(52);
  });

  it('el día del cumpleaños ya suma', () => {
    expect(edad('1973-10-21', '2026-10-21')).toBe(53);
  });

  it('el día anterior todavía no', () => {
    expect(edad('1973-10-21', '2026-10-20')).toBe(52);
  });

  it('sin fecha no inventa un número', () => {
    expect(edad(null, HOY)).toBeNull();
    expect(edad('', HOY)).toBeNull();
    expect(edad('no es fecha', HOY)).toBeNull();
  });

  it('una fecha futura no da una edad negativa', () => {
    expect(edad('2030-01-01', HOY)).toBeNull();
  });

  it('acepta una marca de tiempo completa', () => {
    expect(edad('2000-01-15T10:00:00Z', HOY)).toBe(26);
  });
});

describe('antiguedad', () => {
  it('años y meses, escritos para mostrar', () => {
    expect(antiguedad('2020-07-12', HOY)?.texto).toBe('6 años y 2 meses');
  });

  it('menos de un año se dice en meses', () => {
    expect(antiguedad('2026-07-12', HOY)?.texto).toBe('2 meses');
  });

  it('un mes justo va en singular', () => {
    expect(antiguedad('2026-08-22', HOY)?.texto).toBe('1 mes');
  });

  it('un año redondo no arrastra "y 0 meses"', () => {
    expect(antiguedad('2025-09-22', HOY)?.texto).toBe('1 año');
  });

  it('el mismo día de ingreso da 0 meses', () => {
    expect(antiguedad(HOY, HOY)).toEqual({ anios: 0, meses: 0, texto: '0 meses' });
  });

  it('sin fecha de ingreso no hay antigüedad', () => {
    expect(antiguedad(null, HOY)).toBeNull();
  });
});

describe('carga familiar', () => {
  it('hijosDe deja solo los hijos', () => {
    const lista = [fam('p1', 'hijo'), fam('p1', 'conyuge'), fam('p1', 'madre')];
    expect(hijosDe(lista)).toHaveLength(1);
  });

  it('es padre quien tiene al menos un hijo cargado', () => {
    expect(esPadre([fam('p1', 'hijo')])).toBe(true);
    expect(esPadre([fam('p1', 'conyuge')])).toBe(false);
    expect(esPadre([])).toBe(false);
    expect(esPadre(undefined)).toBe(false);
  });
});

describe('resumenPersonal (las tarjetas)', () => {
  const lista = [
    gente({ id: 'a', genero: 'M', estado_civil: 'soltero' }),
    gente({ id: 'b', genero: 'F', estado_civil: 'casado' }),
    gente({ id: 'c', genero: 'F', activo: false }),
    gente({ id: 'd' }),
  ];
  const familiares = new Map([['b', [fam('b', 'hijo')]]]);

  it('cuenta hombres, mujeres y a quien no tiene el dato', () => {
    const r = resumenPersonal(lista, familiares);
    expect(r.total).toBe(4);
    expect(r.hombres).toBe(1);
    expect(r.mujeres).toBe(2);
    expect(r.sinGenero).toBe(1);
  });

  it('cuenta activos e inactivos', () => {
    const r = resumenPersonal(lista);
    expect(r.activos).toBe(3);
    expect(r.inactivos).toBe(1);
  });

  it('cuenta padres y solteros', () => {
    const r = resumenPersonal(lista, familiares);
    expect(r.conHijos).toBe(1);
    expect(r.solteros).toBe(1);
  });

  it('una lista vacía da todo en cero, no rompe', () => {
    expect(resumenPersonal([]).total).toBe(0);
  });
});

describe('filtrarPersonal', () => {
  const lista = [
    gente({ id: 'a', nombre: 'JOSÉ', apellido: 'PÉREZ', departamento: 'MINA', cargo: 'OPERADOR', genero: 'M', estado_civil: 'soltero', fecha_nacimiento: '1990-01-01' }),
    gente({ id: 'b', nombre: 'MARÍA', apellido: 'GÓMEZ', departamento: 'OFICINA', cargo: 'ANALISTA', genero: 'F', estado_civil: 'casado', fecha_nacimiento: '1970-01-01', foto_path: 'x.jpg' }),
    gente({ id: 'c', nombre: 'LUIS', apellido: 'ROA', departamento: 'MINA', activo: false }),
  ];
  const familiares = new Map([['b', [fam('b', 'hijo')]]]);

  it('sin filtros devuelve todo', () => {
    expect(filtrarPersonal(lista, FILTROS_VACIOS, familiares, HOY)).toHaveLength(3);
  });

  it('busca sin acentos', () => {
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, texto: 'jose' }, familiares, HOY)).toHaveLength(1);
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, texto: 'GOMEZ' }, familiares, HOY)).toHaveLength(1);
  });

  it('filtra por departamento y por cargo', () => {
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, departamento: 'MINA' }, familiares, HOY)).toHaveLength(2);
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, cargo: 'ANALISTA' }, familiares, HOY)).toHaveLength(1);
  });

  it('filtra por estado', () => {
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, estado: 'inactivos' }, familiares, HOY)).toHaveLength(1);
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, estado: 'activos' }, familiares, HOY)).toHaveLength(2);
  });

  it('filtra por género y estado civil', () => {
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, genero: 'F' }, familiares, HOY)).toHaveLength(1);
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, estadoCivil: 'soltero' }, familiares, HOY)).toHaveLength(1);
  });

  it('filtra por tener hijos o no', () => {
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, conHijos: 'si' }, familiares, HOY)).toHaveLength(1);
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, conHijos: 'no' }, familiares, HOY)).toHaveLength(2);
  });

  it('filtra por foto cargada', () => {
    expect(filtrarPersonal(lista, { ...FILTROS_VACIOS, conFoto: 'si' }, familiares, HOY)).toHaveLength(1);
  });

  it('filtra por rango de edad', () => {
    const r = filtrarPersonal(lista, { ...FILTROS_VACIOS, edadMin: 50 }, familiares, HOY);
    expect(r.map((p) => p.id)).toEqual(['b']);
  });

  it('quien no tiene fecha de nacimiento queda afuera del rango de edad', () => {
    // No se puede afirmar que entra: dejarlo pasar seria mentir sobre el filtro.
    const r = filtrarPersonal(lista, { ...FILTROS_VACIOS, edadMin: 0, edadMax: 99 }, familiares, HOY);
    expect(r.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('los filtros se acumulan', () => {
    const r = filtrarPersonal(lista, { ...FILTROS_VACIOS, departamento: 'MINA', estado: 'activos' }, familiares, HOY);
    expect(r.map((p) => p.id)).toEqual(['a']);
  });
});

describe('hayFiltros', () => {
  it('reconoce cuando no hay ninguno', () => {
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false);
  });

  it('un texto en blanco no cuenta como filtro', () => {
    expect(hayFiltros({ ...FILTROS_VACIOS, texto: '   ' })).toBe(false);
  });

  it('reconoce cualquiera puesto', () => {
    expect(hayFiltros({ ...FILTROS_VACIOS, genero: 'F' })).toBe(true);
    expect(hayFiltros({ ...FILTROS_VACIOS, edadMax: 60 })).toBe(true);
    expect(hayFiltros({ ...FILTROS_VACIOS, estado: 'activos' })).toBe(true);
  });
});

describe('agruparPersonal', () => {
  const lista = [
    gente({ id: 'a', departamento: 'MINA', genero: 'M', estado_civil: 'soltero' }),
    gente({ id: 'b', departamento: 'OFICINA', genero: 'F', estado_civil: 'casado' }),
    gente({ id: 'c', genero: 'M' }),
  ];
  const familiares = new Map([['b', [fam('b', 'hijo')]]]);

  it('sin agrupar devuelve un solo grupo con todo', () => {
    const g = agruparPersonal(lista, 'ninguno');
    expect(g).toHaveLength(1);
    expect(g[0].gente).toHaveLength(3);
  });

  it('agrupa por departamento y manda "Sin departamento" al final', () => {
    const g = agruparPersonal(lista, 'departamento');
    expect(g.map((x) => x.titulo)).toEqual(['MINA', 'OFICINA', 'Sin departamento']);
  });

  it('agrupa por género con la etiqueta legible', () => {
    const g = agruparPersonal(lista, 'genero');
    expect(g.map((x) => x.titulo)).toEqual(['Femenino', 'Masculino']);
  });

  it('agrupa por padres / sin hijos', () => {
    const g = agruparPersonal(lista, 'paternidad', familiares);
    expect(g.map((x) => x.titulo)).toEqual(['Con hijos', 'Sin hijos']);
    expect(g[0].gente.map((p) => p.id)).toEqual(['b']);
  });

  it('agrupa por estado civil', () => {
    const g = agruparPersonal(lista, 'estado_civil');
    expect(g.map((x) => x.titulo)).toEqual(['Casado/a', 'Soltero/a', 'Sin estado civil']);
  });

  it('no pierde a nadie', () => {
    for (const c of ['departamento', 'cargo', 'genero', 'estado_civil', 'paternidad'] as const) {
      const total = agruparPersonal(lista, c, familiares).reduce((a, g) => a + g.gente.length, 0);
      expect(total).toBe(3);
    }
  });
});

describe('opcionesDe', () => {
  it('trae los valores distintos, ordenados y sin vacíos', () => {
    const lista = [
      gente({ id: 'a', departamento: 'OFICINA' }),
      gente({ id: 'b', departamento: 'MINA' }),
      gente({ id: 'c', departamento: 'MINA' }),
      gente({ id: 'd', departamento: '  ' }),
    ];
    expect(opcionesDe(lista, 'departamento')).toEqual(['MINA', 'OFICINA']);
  });
});

describe('etiquetas', () => {
  it('traducen el código guardado', () => {
    expect(labelGenero('M')).toBe('Masculino');
    expect(labelEstadoCivil('concubinato')).toBe('Concubinato');
  });

  it('un valor que no existe no rompe la pantalla', () => {
    expect(labelGenero(null)).toBe('—');
    expect(labelEstadoCivil('marciano')).toBe('—');
  });
});
