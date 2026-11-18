import { describe, expect, it } from 'vitest';
import type { Caja, CajaSaldo } from '@/shared/lib/types';
import {
  calcularPrellenadoMultipago,
  cajasSugeridasParaCompletar,
  elegirCajaInicialPago,
  etiquetaCajaConSaldos,
  resolverBilleteraComision,
  validarFondosPorBilletera,
} from './resolucionSaldosPago';

const fmt = (n: number, mon: string) =>
  `${mon} ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function mkCaja(id: string, nombre: string, moneda: 'Bs' | 'USD' = 'Bs', saldo = 0): Caja {
  return {
    id,
    nombre,
    moneda,
    saldo,
    estado: 'activo',
    created_at: '2026-11-01T00:00:00Z',
  };
}

function mkSaldo(
  id: string,
  cajaId: string,
  cuenta: 'general' | 'juridica' | 'personal',
  moneda: string,
  saldo: number,
): CajaSaldo {
  return { id, caja_id: cajaId, cuenta, moneda, saldo };
}

describe('resolucionSaldosPago', () => {
  it('CS-2026-0042: nunca toma saldosCaja[0] (Bs jurídica = 2.37) para la comisión cuando el pago sale de otra cuenta con fondos', () => {
    const saldos: CajaSaldo[] = [
      mkSaldo('s-jur', 'c1', 'juridica', 'Bs', 2.37),
      mkSaldo('s-per', 'c1', 'personal', 'Bs', 500_000),
    ];
    const pre = calcularPrellenadoMultipago(
      saldos,
      [{ moneda: 'Bs', monto: 235 }],
      235,
      916.65,
    );
    expect(Number(pre['s-jur'] || 0)).toBeLessThanOrEqual(2.37);
    expect(Number(pre['s-per'])).toBe(215412.75);

    const billeteraCom = resolverBilleteraComision(saldos, pre, '', 646.24);
    expect(billeteraCom?.id).toBe('s-per');

    const err = validarFondosPorBilletera({
      saldosCaja: saldos,
      legMontos: pre,
      comSaldo: billeteraCom,
      comMonto: 646.24,
      todosSaldos: saldos,
      cajas: [mkCaja('c1', 'Caja Bs', 'Bs', 500002.37)],
      fmtMonto: fmt,
    });
    expect(err).toBeNull();
  });

  it('cuando la pata activa queda justa (holgura 2.37 Bs) pero otra cuenta tiene Bs para la comisión, desvía la comisión a la cuenta con holgura', () => {
    const saldos: CajaSaldo[] = [
      mkSaldo('s-jur', 'c1', 'juridica', 'Bs', 215_415.12),
      mkSaldo('s-per', 'c1', 'personal', 'Bs', 25_000),
    ];
    const legMontos = { 's-jur': '215412.75' }; // quedan solo 2.37 Bs en jurídica
    const billeteraCom = resolverBilleteraComision(saldos, legMontos, '', 646.24);
    expect(billeteraCom?.id).toBe('s-per');
  });

  it('calcularPrellenadoMultipago jamás supera s.saldo por redondeo Bs↔USD (round2(saldo/tasa)*tasa > saldo)', () => {
    // 9162 / 916.65 = 9.99509... -> round2 sería 10.00 -> 10 * 916.65 = 9166.50 > 9162!
    const saldos: CajaSaldo[] = [
      mkSaldo('s-jur', 'c1', 'juridica', 'Bs', 9162),
      mkSaldo('s-per', 'c1', 'personal', 'Bs', 5000),
    ];
    const pre = calcularPrellenadoMultipago(saldos, [{ moneda: 'Bs', monto: 12 }], 12, 916.65);
    expect(Number(pre['s-jur'])).toBe(9162);
    expect(Number(pre['s-per'])).toBeGreaterThan(0);
    const totalBs = Number(pre['s-jur'] || 0) + Number(pre['s-per'] || 0);
    expect(totalBs).toBeCloseTo(12 * 916.65, 1);
  });

  it('elegirCajaInicialPago prefiere la caja que tiene fondos reales en la moneda indicada por Compras en vez de cajas[0] con 2.37 Bs', () => {
    const cajas = [
      mkCaja('c-alfa', 'A · Multimoneda', 'USD', 0),
      mkCaja('c-bs', 'Caja Bs', 'Bs', 450_000),
    ];
    const todosSaldos: CajaSaldo[] = [
      mkSaldo('s1', 'c-alfa', 'juridica', 'Bs', 2.37),
      mkSaldo('s2', 'c-alfa', 'general', 'USDT', 50),
      mkSaldo('s3', 'c-bs', 'personal', 'Bs', 450_000),
    ];
    const elegida = elegirCajaInicialPago(
      cajas,
      todosSaldos,
      [{ moneda: 'Bs', monto: 235 }],
      235,
      916.65,
    );
    expect(elegida).toBe('c-bs');
  });

  it('validarFondosPorBilletera bloquea antes de tocar la base cuando pago + comisión supera el saldo e informa en qué caja sí hay dinero', () => {
    const cajas = [
      mkCaja('c1', 'Caja Multimoneda', 'USD', 0),
      mkCaja('c2', 'Caja Bs', 'Bs', 300_000),
    ];
    const sJur = mkSaldo('s-jur', 'c1', 'juridica', 'Bs', 215_415.12);
    const sOtra = mkSaldo('s-otra', 'c2', 'personal', 'Bs', 300_000);
    const err = validarFondosPorBilletera({
      saldosCaja: [sJur],
      legMontos: { 's-jur': '215412.75' },
      comSaldo: sJur,
      comMonto: 646.24,
      todosSaldos: [sJur, sOtra],
      cajas,
      fmtMonto: fmt,
    });
    expect(err).toContain('Saldo insuficiente en Caja Multimoneda · Bs (Jurídica)');
    expect(err).toContain('Sí hay fondos disponibles en: Caja Bs · Personal');
  });

  it('etiquetaCajaConSaldos y cajasSugeridasParaCompletar exponen claramente dónde está el dinero', () => {
    const c1 = mkCaja('c1', 'Caja Multimoneda', 'USD', 0);
    const c2 = mkCaja('c2', 'Caja Bs', 'Bs', 300_000);
    const todosSaldos = [
      mkSaldo('s1', 'c1', 'juridica', 'Bs', 2.37),
      mkSaldo('s2', 'c2', 'personal', 'Bs', 300_000),
    ];
    expect(etiquetaCajaConSaldos(c2, todosSaldos, fmt)).toContain('Personal');
    const sug = cajasSugeridasParaCompletar([c1, c2], todosSaldos, 'c1', [], [{ moneda: 'Bs' }]);
    expect(sug.map((x) => x.caja.id)).toEqual(['c2']);
  });
});
