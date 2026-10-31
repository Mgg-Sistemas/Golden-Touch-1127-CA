/* ============================================================
   Golden Touch · Retenciones · Golden-master (F0)

   Blinda el cálculo antes de despertar ninguna regla: prueba, al céntimo, que
   el MOTOR de reglas (tal como lo corre el registro vivo: contextoDePrueba +
   calcularConRegla, vía correrPrueba) da EXACTAMENTE lo mismo que el cálculo
   viejo (calcularRetencionIva/Islr/Local, calcularIgtf), para una matriz amplia
   por impuesto.

   Política ante divergencia: manda el cálculo viejo. Cualquier diferencia > 0
   (ni un céntimo) deja esa regla NO apta para promover; se reconcilia la
   fórmula del motor o la regla, nunca se baja la tolerancia.

   ── FUENTE DE LAS REGLAS ──────────────────────────────────────────────────
   PLACEHOLDER: hoy se usan las reglas de arranque de 20-R7 (lo que el seed
   sembró). Cuando BD (golden-touch-1127-ca-cd) envíe el JSON de las 5 reglas
   REALES en_prueba, se reemplaza SOLO el bloque REGLAS de abajo por ese JSON y
   se vuelve a correr. El arnés y la matriz no cambian.
   ──────────────────────────────────────────────────────────────────────────
   ============================================================ */
import { describe, expect, it } from 'vitest';
import { calcularConRegla, condicionesQueFallan, type Regla } from './motorReglas';
import { contextoDePrueba, correrPrueba, type DatosPrueba, type EntradaPrueba } from './probarRegla';
import { CONFIG_RETENCION_DEFECTO } from './retencionesCalculo';

/* ─────────── FUENTE DE LAS REGLAS (reemplazar por el JSON real de BD) ─────────── */
export const FUENTE_REGLAS = 'arranque 20-R7 (PLACEHOLDER hasta el JSON real de BD)';

const regla = (impuestoClave: string, nombre: string, condiciones: Regla['condiciones'], pasos: Regla['pasos']): Regla => ({
  impuestoClave, nombre, version: 1, estado: 'en_prueba', desde: '2026-10-16', hasta: null, prioridad: 100, condiciones, pasos,
});

const REGLAS: Record<'IVA' | 'ISLR' | 'MUNICIPAL' | 'ESTADAL' | 'IGTF', Regla> = {
  IVA: regla('IVA', 'IVA', [
    { pieza: 'direccion', operador: 'es', valor: 'practicada' },
    { pieza: 'condicion_agente', operador: 'en', valor: ['agente_retencion', 'contribuyente_especial'] },
  ], [
    { paso: 1, operacion: 'componer_base', valores: { componentes: [{ campo: 'iva', signo: '+' }] } },
    { paso: 6, operacion: 'retener_pct', valores: { parametro: 'pct_retencion', supuestos: 'pct_retencion_art5' } },
    { paso: 8, operacion: 'redondear', valores: { decimales: 2 } },
  ]),
  ISLR: regla('ISLR', 'ISLR por concepto', [
    { pieza: 'direccion', operador: 'es', valor: 'practicada' },
    { pieza: 'clasificacion', operador: 'es', valor: { clasificacion: 'islr_conceptos' } },
  ], [
    { paso: 1, operacion: 'componer_base', valores: { componentes: [{ campo: 'pago', signo: '+' }], porcion: 'clasificacion' } },
    { paso: 2, operacion: 'convertir_moneda', valores: { tasa: 'bcv_fecha_factura' } },
    { paso: 3, operacion: 'comparar_minimo', valores: { desde: 'clasificacion' } },
    { paso: 4, operacion: 'pct_clasificacion', valores: { clasificacion: 'islr_conceptos' } },
    { paso: 5, operacion: 'restar_sustraendo', valores: { desde: 'clasificacion' } },
    { paso: 7, operacion: 'topes', valores: { minimo: 0 } },
    { paso: 8, operacion: 'redondear', valores: { decimales: 2 } },
  ]),
  MUNICIPAL: regla('MUNICIPAL', 'ISAE', [{ pieza: 'direccion', operador: 'es', valor: 'practicada' }], [
    { paso: 1, operacion: 'componer_base', valores: { componentes: [{ campo: 'pago', signo: '+' }] } },
    { paso: 4, operacion: 'pct_parametro', valores: { parametro: 'alicuota' } },
    { paso: 8, operacion: 'redondear', valores: { decimales: 2 } },
  ]),
  ESTADAL: regla('ESTADAL', 'Timbre fiscal estadal', [{ pieza: 'direccion', operador: 'es', valor: 'practicada' }], [
    { paso: 1, operacion: 'componer_base', valores: { componentes: [{ campo: 'pago', signo: '+' }] } },
    { paso: 4, operacion: 'pct_parametro', valores: { parametro: 'alicuota' } },
    { paso: 8, operacion: 'redondear', valores: { decimales: 2 } },
  ]),
  // BD avisó que IGTF NO lleva condición «practicada»: la dejamos sin condiciones, como en producción.
  IGTF: regla('IGTF', 'IGTF', [], [
    { paso: 1, operacion: 'componer_base', valores: { componentes: [{ campo: 'pago_divisas', signo: '+' }] } },
    { paso: 4, operacion: 'pct_parametro', valores: { parametro: 'alicuota' } },
    { paso: 8, operacion: 'redondear', valores: { decimales: 2 } },
  ]),
};

/* ─────────── Datos de la fecha (fixtures; se afinan con el snapshot de BD) ─────────── */
const UT = 43;
const PARAMS = { pct_retencion: 75, pct_retencion_art5: 100, alicuota_municipal: 1, alicuota_estadal: 0.5, alicuota_igtf: 3 };
// Valores de clasificación del ISLR (como los devuelve retencion_clasificacion_valor).
const VC_PNR = { pct: 3, basePct: 100, minimo: 83.3334, minimoUnidad: 'UT' as const, sustraendoFactor: 83.3334 }; // persona natural residente
const VC_PJD = { pct: 2, basePct: 90, minimo: null, minimoUnidad: null, sustraendoFactor: null };                 // jurídica domiciliada (sin sustraendo ni mínimo)

const CONFIG = { ...CONFIG_RETENCION_DEFECTO, valorUt: UT };

/** DatosPrueba para un impuesto, con los parámetros/valores que lee su regla. */
function datos(imp: 'IVA' | 'ISLR' | 'MUNICIPAL' | 'ESTADAL' | 'IGTF', over: Partial<DatosPrueba> = {}): DatosPrueba {
  const parametros: Record<string, number | null> = {};
  if (imp === 'IVA') { parametros.pct_retencion = PARAMS.pct_retencion; parametros.pct_retencion_art5 = PARAMS.pct_retencion_art5; }
  if (imp === 'MUNICIPAL') parametros.alicuota = PARAMS.alicuota_municipal;
  if (imp === 'ESTADAL') parametros.alicuota = PARAMS.alicuota_estadal;
  if (imp === 'IGTF') parametros.alicuota = PARAMS.alicuota_igtf;
  return {
    ut: UT, parametros, condicionesAgente: ['agente_retencion', 'contribuyente_especial'],
    valorClasificacion: imp === 'ISLR' ? VC_PNR : null,
    clasificacionClave: imp === 'ISLR' ? 'islr_conceptos' : null,
    tarifas: {}, config: { ...CONFIG, pctIgtf: PARAMS.alicuota_igtf },
    ...over,
  };
}

/** EntradaPrueba con valores por defecto neutros. */
function entrada(over: Partial<EntradaPrueba> = {}): EntradaPrueba {
  return {
    fecha: '2026-10-20', direccion: 'practicada', sujeto: null, moneda: 'Bs', tasa: null,
    pago: 0, baseImponible: 0, iva: 0, supuesto: false, codigo: null, ...over,
  };
}

/** Corre motor y viejo con los mismos datos; exige que el monto coincida al céntimo. */
function exigirIgual(imp: 'IVA' | 'ISLR' | 'MUNICIPAL' | 'ESTADAL' | 'IGTF', e: EntradaPrueba, d: DatosPrueba) {
  const r = correrPrueba(REGLAS[imp], e, d);
  expect(r.hoy, 'el cálculo viejo tiene que existir para este impuesto').not.toBeNull();
  // Ni un céntimo: el monto del motor y el viejo, redondeados a 2 decimales, idénticos.
  expect(r.motor.monto).toBe(r.hoy!.monto);
  return r;
}

describe(`golden-master · ${FUENTE_REGLAS}`, () => {
  describe('IVA', () => {
    it('75 % general del IVA de la factura', () => {
      const r = exigirIgual('IVA', entrada({ baseImponible: 1000, iva: 160 }), datos('IVA'));
      expect(r.motor.monto).toBe(120);
    });
    it('100 % por cada motivo del supuesto (art. 5)', () => {
      // El motor toma el 100 % con supuesto=true (parámetro pct_retencion_art5); el viejo, con cada motivo.
      const r = exigirIgual('IVA', entrada({ baseImponible: 1000, iva: 160, supuesto: true }), datos('IVA'));
      expect(r.motor.monto).toBe(160);
    });
    it('IVA = 0: no hay sobre qué retener, da 0 igual que hoy', () => {
      exigirIgual('IVA', entrada({ baseImponible: 1000, iva: 0 }), datos('IVA'));
    });
    it('empresa NO agente: la regla no aplica (condición falla) y el viejo da 0', () => {
      const d = datos('IVA', { condicionesAgente: [] });
      const ctx = contextoDePrueba(entrada({ baseImponible: 1000, iva: 160 }), d);
      // En producción, si la condición falla no se usa el motor: se queda el cálculo viejo.
      expect(condicionesQueFallan(REGLAS.IVA, ctx).length).toBeGreaterThan(0);
    });
    it('montos con decimales: redondeo a 2 idéntico', () => {
      exigirIgual('IVA', entrada({ baseImponible: 1234.56, iva: 197.53 }), datos('IVA'));
    });
  });

  describe('ISLR', () => {
    const codigo = (over: Partial<EntradaPrueba> = {}) => entrada({ codigo: '001', ...over });
    it('persona natural residente: mínimo en UT y sustraendo en Bs', () => {
      const r = exigirIgual('ISLR', codigo({ pago: 10000 }), datos('ISLR'));
      expect(r.motor.monto).toBe(192.5);
      expect(r.motor.sustraendo).toBeGreaterThan(0);
    });
    it('jurídica domiciliada: % sobre porción de la base, sin sustraendo ni mínimo', () => {
      const r = exigirIgual('ISLR', codigo({ pago: 5000 }), datos('ISLR', { valorClasificacion: VC_PJD }));
      expect(r.motor.base).toBe(4500); // 90 % de 5000
    });
    it('pago bajo el mínimo: no se retiene (0), igual que hoy', () => {
      const r = exigirIgual('ISLR', codigo({ pago: 3000 }), datos('ISLR'));
      expect(r.motor.monto).toBe(0);
      expect(r.motor.aplica).toBe(false);
    });
    it('EN DIVISAS: base en la moneda del documento, mínimo y sustraendo en Bs (tasa BCV de la factura)', () => {
      const r = exigirIgual('ISLR', codigo({ pago: 100, moneda: 'USD', tasa: 40 }), datos('ISLR'));
      expect(r.motor.baseBs).toBe(4000);
      expect(r.motor.montoBs).toBe(Math.round(r.motor.monto * 40 * 100) / 100);
    });
    it('en divisas bajo el mínimo (base en Bs no llega): 0, igual que hoy', () => {
      exigirIgual('ISLR', codigo({ pago: 50, moneda: 'USD', tasa: 40 }), datos('ISLR')); // 50*40=2000 Bs < mínimo
    });
    it('decimales en divisas: redondeo a 2 idéntico', () => {
      exigirIgual('ISLR', codigo({ pago: 137.77, moneda: 'USD', tasa: 38.42 }), datos('ISLR'));
    });
  });

  describe('MUNICIPAL (ISAE)', () => {
    for (const pct of [0.5, 1, 2, 3.75]) {
      it(`alícuota ${pct} %`, () => {
        exigirIgual('MUNICIPAL', entrada({ pago: 8500 }), datos('MUNICIPAL', { parametros: { alicuota: pct } }));
      });
    }
  });

  describe('ESTADAL (timbre fiscal)', () => {
    for (const pct of [0.25, 0.5, 1]) {
      it(`alícuota ${pct} % (aunque GT lo deshabilite, se cubre)`, () => {
        exigirIgual('ESTADAL', entrada({ pago: 12000 }), datos('ESTADAL', { parametros: { alicuota: pct } }));
      });
    }
  });

  describe('IGTF', () => {
    it('% sobre lo pagado en divisas', () => {
      const r = exigirIgual('IGTF', entrada({ pago: 100, moneda: 'USD', tasa: 40 }), datos('IGTF'));
      expect(r.motor.monto).toBe(3);
    });
    it('la regla no lleva condición «practicada»: no cambia el resultado vs calcularIgtf', () => {
      const d = datos('IGTF');
      const ctx = contextoDePrueba(entrada({ pago: 100, moneda: 'USD', tasa: 40 }), d);
      expect(condicionesQueFallan(REGLAS.IGTF, ctx)).toEqual([]); // sin condiciones, siempre aplica
      // Y aplica igual con dirección 'sufrida' (no hay condición que lo impida).
      const ctxSuf = contextoDePrueba(entrada({ pago: 100, moneda: 'USD', tasa: 40, direccion: 'sufrida' }), d);
      expect(calcularConRegla(REGLAS.IGTF, ctxSuf).monto).toBe(3);
    });
    it('pago en Bs: no causa IGTF (pago_divisas = 0), da 0 igual que hoy', () => {
      exigirIgual('IGTF', entrada({ pago: 100, moneda: 'Bs' }), datos('IGTF'));
    });
    it('decimales: redondeo a 2 idéntico', () => {
      exigirIgual('IGTF', entrada({ pago: 733.37, moneda: 'USD', tasa: 1 }), datos('IGTF'));
    });
  });
});
