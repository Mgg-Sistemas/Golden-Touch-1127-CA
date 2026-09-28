import { describe, it, expect } from 'vitest';
import {
  CONFIG_POR_DEFECTO, capacidadRotacion, cargaPorDia, diasConChoque, diasDe, difDias, fechasEntre,
  fueraEl, generarPlan, minimoSimultaneo, seCruzan, sumarDias, type DescansoRango,
} from './descansosPlan';

const cfg = CONFIG_POR_DEFECTO;

describe('fechas', () => {
  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-09-28', 7)).toBe('2026-10-05');
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('diferencia y duración con extremos incluidos', () => {
    expect(difDias('2026-09-01', '2026-09-03')).toBe(2);
    expect(diasDe({ desde: '2026-09-01', hasta: '2026-09-07' })).toBe(7);
    expect(fechasEntre('2026-09-29', '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(fechasEntre('2026-10-02', '2026-10-01')).toEqual([]);
  });
  it('cruce de rangos', () => {
    expect(seCruzan({ desde: '2026-09-01', hasta: '2026-09-07' }, { desde: '2026-09-07', hasta: '2026-09-10' })).toBe(true);
    expect(seCruzan({ desde: '2026-09-01', hasta: '2026-09-07' }, { desde: '2026-09-08', hasta: '2026-09-10' })).toBe(false);
  });
});

describe('carga y choques', () => {
  const ds: DescansoRango[] = [
    { personal_id: 'a', desde: '2026-10-01', hasta: '2026-10-07' },
    { personal_id: 'b', desde: '2026-10-05', hasta: '2026-10-11' },
    { personal_id: 'c', desde: '2026-10-06', hasta: '2026-10-06' },
  ];
  it('cuenta quién está fuera cada día', () => {
    const c = cargaPorDia(ds, '2026-10-01', '2026-10-12');
    expect(c.get('2026-10-01')).toBe(1);
    expect(c.get('2026-10-06')).toBe(3);
    expect(c.get('2026-10-12')).toBe(0);
    expect(diasConChoque(c, 2)).toEqual(['2026-10-06']);
    expect(fueraEl(ds, '2026-10-05').sort()).toEqual(['a', 'b']);
  });
  it('mínimo posible y capacidad de la rotación 21×7 con tope 4', () => {
    expect(minimoSimultaneo(16, cfg)).toBe(4);
    expect(minimoSimultaneo(17, cfg)).toBe(5);
    expect(minimoSimultaneo(0, cfg)).toBe(0);
    expect(capacidadRotacion(cfg)).toBe(16);
  });
});

describe('generarPlan', () => {
  const personas = (n: number) => Array.from({ length: n }, (_, i) => ({ personal_id: `p${String(i).padStart(2, '0')}` }));

  it('16 personas en 21×7 nunca pasan de 4 afuera', () => {
    const r = generarPlan({ personas: personas(16), desde: '2026-10-01', hasta: '2026-12-31', cfg, fijos: [] });
    expect(r.choques).toEqual([]);
    expect(r.pico).toBeLessThanOrEqual(4);
    // Cada persona sale cada 28 días, 7 días seguidos.
    const deP0 = r.descansos.filter((d) => d.personal_id === 'p00');
    expect(deP0.length).toBeGreaterThanOrEqual(3);
    for (const d of deP0) expect(diasDe(d)).toBe(7);
    for (let i = 1; i < deP0.length; i++) expect(difDias(deP0[i - 1].desde, deP0[i].desde)).toBe(28);
  });

  it('con más gente de la que entra, avisa los días que se pasan', () => {
    const r = generarPlan({ personas: personas(20), desde: '2026-10-01', hasta: '2026-11-30', cfg, fijos: [] });
    expect(r.pico).toBe(minimoSimultaneo(20, cfg));
    expect(r.choques.length).toBeGreaterThan(0);
  });

  it('sigue el ritmo de quien ya traía descansos', () => {
    const r = generarPlan({
      personas: [{ personal_id: 'x', ultimoHasta: '2026-09-27' }],
      desde: '2026-10-01', hasta: '2026-11-30', cfg, fijos: [],
    });
    // Descansó hasta el 27/09 → trabaja 21 días → vuelve a salir el 19/10.
    expect(r.descansos[0]).toEqual({ personal_id: 'x', desde: '2026-10-19', hasta: '2026-10-25' });
  });

  it('respeta los descansos fijos de otros y no pisa los propios', () => {
    const fijos: DescansoRango[] = [
      { personal_id: 'f1', desde: '2026-10-01', hasta: '2026-10-07' },
      { personal_id: 'f2', desde: '2026-10-01', hasta: '2026-10-07' },
      { personal_id: 'f3', desde: '2026-10-01', hasta: '2026-10-07' },
      { personal_id: 'f4', desde: '2026-10-01', hasta: '2026-10-07' },
      { personal_id: 'y', desde: '2026-10-15', hasta: '2026-10-21' },
    ];
    const r = generarPlan({ personas: [{ personal_id: 'y' }], desde: '2026-10-01', hasta: '2026-10-31', cfg, fijos });
    expect(r.choques).toEqual([]);
    for (const d of r.descansos) {
      expect(seCruzan(d, { desde: '2026-10-01', hasta: '2026-10-07' })).toBe(false);
      expect(seCruzan(d, fijos[4])).toBe(false);
    }
  });

  it('período vacío o mal armado no genera nada', () => {
    expect(generarPlan({ personas: personas(3), desde: '2026-10-10', hasta: '2026-10-01', cfg, fijos: [] }).descansos).toEqual([]);
  });
});
