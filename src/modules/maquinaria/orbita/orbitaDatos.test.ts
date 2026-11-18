import { describe, expect, it } from 'vitest';
import type { MaquinariaEquipo } from '../maquinariaEquipos.repository';
import { armarOrbita, ID_OTROS, ID_SIN, idPropietario } from './orbitaDatos';
import { datosDemoOrbita } from './demo/datosDemoOrbita';

let n = 0;
const eq = (p: Partial<MaquinariaEquipo>): MaquinariaEquipo =>
  ({ id: `e${++n}`, equipo: `EQUIPO ${n}`, status: 'ACTIVO', activo: true, ...p } as MaquinariaEquipo);

/** `k` equipos de la empresa `nombre`. */
const de = (nombre: string | null, k: number, extra: Partial<MaquinariaEquipo> = {}) =>
  Array.from({ length: k }, () => eq({ propietario: nombre, ...extra }));

describe('orbitaDatos · lo que corrige de la maqueta original', () => {
  it('usa solo los equipos que recibe: sin equipos, sin propietarios ni flota', () => {
    const m = armarOrbita({ equipos: [] });
    expect(m.propietarios).toEqual([]);
    expect(m.flota).toEqual([]);
    expect(m.general.total).toBe(0);
  });

  it('el estado es estadoEfectivo, no el texto de status', () => {
    const m = armarOrbita({ equipos: [eq({ propietario: 'EMPRESA A', status: 'ACTIVO', estado_operativo: 'averiada' } as Partial<MaquinariaEquipo>)] });
    expect(m.flota[0].estado).toBe('averiada');
    expect(m.general.averiados).toBe(1);
    expect(m.general.operativos).toBe(0);
  });

  it('el horómetro es la lectura vigente, no la base del último servicio', () => {
    const e = eq({ propietario: 'EMPRESA A', mantenimiento_base_hrs: 1000 });
    const m = armarOrbita({ equipos: [e], lecturas: new Map([[e.id, { horometro: 1234, kilometraje: null }]]) });
    expect(m.flota[0].horometro).toBe(1234);
    expect(armarOrbita({ equipos: [e] }).flota[0].horometro).toBeNull();
  });
});

describe('orbitaDatos · las tarjetas (D22: 7 mayores + «Otros»)', () => {
  const flota = () => {
    n = 0;
    return [
      ...de('EMPRESA A', 9), ...de('EMPRESA B', 8), ...de('EMPRESA C', 7), ...de('EMPRESA D', 6),
      ...de('EMPRESA E', 5), ...de('EMPRESA F', 4), ...de('EMPRESA G', 3),
      ...de('EMPRESA H', 2), ...de('EMPRESA I', 1), ...de(null, 1),
    ];
  };

  it('las 7 con más equipos tienen tarjeta; el resto va a «Otros (n)» con a quién junta', () => {
    const m = armarOrbita({ equipos: flota() });
    expect(m.propietarios.map((p) => p.nombre).slice(0, 7)).toEqual(['EMPRESA A', 'EMPRESA B', 'EMPRESA C', 'EMPRESA D', 'EMPRESA E', 'EMPRESA F', 'EMPRESA G']);
    const otros = m.propietarios[7];
    expect(otros.id).toBe(ID_OTROS);
    expect(otros.nombre).toBe('Otros propietarios (3)');
    expect(otros.total).toBe(4);
    expect(otros.agrupa?.map((a) => a.id).sort()).toEqual([idPropietario('EMPRESA H'), idPropietario('EMPRESA I'), ID_SIN].sort());
    // La flota de «Otros» son exactamente los equipos que junta.
    expect(m.flota.filter((f) => f.tarjetaId === ID_OTROS)).toHaveLength(4);
  });

  it('el puesto sigue el tamaño y «Otros» va al final', () => {
    const m = armarOrbita({ equipos: flota() });
    expect(m.propietarios.map((p) => p.puesto)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('si sobra uno solo, va con su nombre: no hay «Otros (1)»', () => {
    n = 0;
    const m = armarOrbita({ equipos: [...de('EMPRESA A', 3), ...de('EMPRESA B', 2), ...de('EMPRESA C', 1)], maxTarjetas: 2 });
    expect(m.propietarios.some((p) => p.id === ID_OTROS)).toBe(false);
    expect(m.propietarios).toHaveLength(3);
  });

  it('las formas de escribir el mismo dueño (espacios) cuentan juntas, con la forma más usada', () => {
    n = 0;
    const m = armarOrbita({ equipos: [...de('EMPRESA A', 2), ...de('Empresa  A', 1)] });
    expect(m.propietarios).toHaveLength(1);
    expect(m.propietarios[0].nombre).toBe('EMPRESA A');
    expect(m.propietarios[0].total).toBe(3);
  });

  it('sin propietario cuenta como «Sin propietario»', () => {
    n = 0;
    const m = armarOrbita({ equipos: [...de(null, 1), ...de('   ', 1)] });
    expect(m.propietarios[0]).toMatchObject({ id: ID_SIN, nombre: 'Sin propietario', total: 2 });
  });

  it('el orden es estable: dos llamadas dan lo mismo', () => {
    const e = flota();
    expect(armarOrbita({ equipos: e })).toEqual(armarOrbita({ equipos: e }));
  });
});

describe('orbitaDatos · categoría por equipo y traspasos', () => {
  it('sin asignar es «Por asignar»; la tarjeta muestra la mezcla y la dominante', () => {
    n = 0;
    const [a, b, c] = de('EMPRESA A', 3);
    const m = armarOrbita({ equipos: [a, b, c], categorias: { [a.id]: 'propio', [b.id]: 'propio' } });
    expect(m.propietarios[0].mezcla).toEqual([{ id: 'propio', cantidad: 2 }, { id: 'por_asignar', cantidad: 1 }]);
    expect(m.propietarios[0].dominante).toBe('propio');
    expect(m.flota.find((f) => f.id === c.id)?.categoria).toBe('por_asignar');
  });

  it('el último traspaso de un equipo manda; la fila queda marcada', () => {
    n = 0;
    const [a] = de('EMPRESA A', 1);
    const m = armarOrbita({ equipos: [a], traspasos: [{ equipoId: a.id, destino: 'EMPRESA B' }, { equipoId: a.id, destino: 'EMPRESA C' }] });
    expect(m.flota[0]).toMatchObject({ propietarioNombre: 'EMPRESA C', traspasado: true });
  });

  it('salud: operativos sobre los no retirados; un retirado no suma alertas', () => {
    n = 0;
    const m = armarOrbita({ equipos: [
      eq({ propietario: 'EMPRESA A' }),
      eq({ propietario: 'EMPRESA A', estado_operativo: 'taller' } as Partial<MaquinariaEquipo>),
      eq({ propietario: 'EMPRESA A', estado_operativo: 'retirada' } as Partial<MaquinariaEquipo>),
    ] });
    expect(m.propietarios[0]).toMatchObject({ total: 3, operativos: 1, enTaller: 1, retirados: 1, pctSalud: 50 });
  });
});

describe('la demo genérica', () => {
  it('89 equipos, solo «EMPRESA …» y sin teléfonos, operadores ni placas', () => {
    const d = datosDemoOrbita();
    expect(d.equipos).toHaveLength(89);
    for (const e of d.equipos) {
      expect(e.propietario == null || /^(EMPRESA [A-J]|Empresa {2}A|)$/.test(e.propietario)).toBe(true);
      expect(e.placa).toBeNull();
      expect(e.encargado_responsable).toBeNull();
    }
    const m = armarOrbita({ equipos: d.equipos, lecturas: d.lecturas, avisos: d.avisos, categorias: d.categorias });
    expect(m.propietarios).toHaveLength(8);
    expect(m.propietarios[7].id).toBe(ID_OTROS);
  });
});
