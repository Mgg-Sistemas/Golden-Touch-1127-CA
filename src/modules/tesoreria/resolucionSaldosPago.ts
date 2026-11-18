/* ============================================================
   Golden Touch · Tesorería · Resolución inteligente de saldos al pagar
   Evita falsos «Saldo insuficiente» cuando sí hay fondos en otra
   cuenta (jurídica / personal / general) o en otra caja activa:
   1. Elige como caja inicial aquella con mayor cobertura en la moneda
      indicada por Compras (en vez de `cajas[0]` alfabética con saldo residual).
   2. Prellena el multipago sin desbordar `s.saldo` por redondeo Bs↔USD
      (`round2(saldo / tasa) * tasa > saldo`).
   3. Resuelve la billetera de la comisión bancaria hacia la cuenta que
      realmente está pagando y tiene holgura suficiente (nunca `saldosCaja[0]`
      a ciegas cuando `Bs · jurídica` solo tiene Bs 2,37 residuales).
   4. Valida antes de tocar la base que `(monto pata + comisión) <= disponible`
      por billetera e informa en qué otra cuenta/caja sí hay fondos.
   ============================================================ */
import type { Caja, CajaSaldo } from '@/shared/lib/types';

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface MetodoPagoIndic {
  moneda: string;
  monto?: number | null;
}

export function etiquetaCuentaCorta(cuenta: string | null | undefined): string {
  if (!cuenta || cuenta === 'general') return '';
  if (cuenta === 'juridica') return 'Jurídica';
  if (cuenta === 'personal') return 'Personal';
  return cuenta;
}

/** Convierte un monto en su moneda nativa a USD equivalente sin inflar por encima del saldo real. */
export function montoAUsdExacto(
  moneda: string,
  montoNativo: number,
  tasaBs: number,
  copUsd?: number | null,
): number {
  const n = Number(montoNativo) || 0;
  if (n <= 0) return 0;
  if (moneda === 'USD' || moneda === 'USDT') return n;
  if (moneda === 'Bs') return tasaBs > 0 ? n / tasaBs : 0;
  if (moneda === 'COP') return copUsd && copUsd > 0 ? n / copUsd : 0;
  return n;
}

export function usdAMontoNativo(
  moneda: string,
  usd: number,
  tasaBs: number,
  copUsd?: number | null,
): number {
  const u = Number(usd) || 0;
  if (u <= 0) return 0;
  if (moneda === 'USD' || moneda === 'USDT') return round2(u);
  if (moneda === 'Bs') return tasaBs > 0 ? round2(u * tasaBs) : 0;
  if (moneda === 'COP') return copUsd && copUsd > 0 ? round2(u * copUsd) : 0;
  return round2(u);
}

/** Saldos efectivos (con saldo > 0) de una caja, sintetizando el saldo legado solo si la caja no tiene filas en `caja_saldos`. */
export function saldosEfectivosDeCaja(
  caja: Caja | undefined | null,
  todosSaldos: CajaSaldo[],
): CajaSaldo[] {
  if (!caja) return [];
  const filas = todosSaldos.filter((s) => s.caja_id === caja.id);
  if (filas.length > 0) {
    return filas.filter((s) => (Number(s.saldo) || 0) > 0);
  }
  const saldoLegado = round2(Number(caja.saldo) || 0);
  if (saldoLegado > 0) {
    return [
      {
        id: `legacy:${caja.id}`,
        caja_id: caja.id,
        cuenta: 'general',
        moneda: caja.moneda,
        saldo: saldoLegado,
        tasa_prom: null,
      },
    ];
  }
  return [];
}

/** Etiqueta descriptiva para el selector de cajas con sus saldos reales por cuenta/moneda. */
export function etiquetaCajaConSaldos(
  caja: Caja,
  todosSaldos: CajaSaldo[],
  fmtMonto: (n: number, moneda: string) => string,
): string {
  const vivos = saldosEfectivosDeCaja(caja, todosSaldos);
  if (!vivos.length) return `${caja.nombre} · sin saldo`;
  const partes = vivos.map((s) => {
    const cta = etiquetaCuentaCorta(s.cuenta);
    return `${fmtMonto(Number(s.saldo) || 0, s.moneda)}${cta ? ` (${cta})` : ''}`;
  });
  return `${caja.nombre} · ${partes.join(' · ')}`;
}

/**
 * Elige la mejor caja inicial para abrir el pago de una OC:
 * 1) Si Compras indicó moneda(s) en `metodo_pago` (ej. Pago móvil → Bs), prioriza la caja
 *    que más cubra en esas monedas (y que alcance a cubrir el total si existe).
 * 2) En empate o sin moneda indicada, elige la de mayor saldo total equivalente en USD.
 * 3) Respaldo: la primera caja de la lista.
 */
export function elegirCajaInicialPago(
  cajas: Caja[],
  todosSaldos: CajaSaldo[],
  metodoPago: MetodoPagoIndic[] | null | undefined,
  totalUsd: number,
  tasaBs: number,
  copUsd?: number | null,
): string {
  if (!cajas.length) return '';
  const monedasObjetivo = new Set(
    (metodoPago ?? []).map((m) => String(m.moneda || '').trim()).filter(Boolean),
  );
  // Si las tasas aún no cargan para Bs, igual podemos comparar el saldo nominal en la moneda objetivo.
  const tasaEfectiva = tasaBs > 0 ? tasaBs : 1;

  let mejorId = cajas[0].id;
  let mejorCubreObjetivo = false;
  let mejorUsdObjetivo = -1;
  let mejorUsdTotal = -1;

  for (const c of cajas) {
    const vivos = saldosEfectivosDeCaja(c, todosSaldos);
    let usdObj = 0;
    let usdTot = 0;
    for (const s of vivos) {
      const u = montoAUsdExacto(s.moneda, Number(s.saldo) || 0, tasaEfectiva, copUsd);
      usdTot += u;
      if (monedasObjetivo.has(s.moneda)) usdObj += u;
    }
    const cubreObj =
      monedasObjetivo.size > 0 &&
      totalUsd > 0 &&
      tasaBs > 0 &&
      usdObj >= totalUsd - 0.01;

    const supera =
      (cubreObj && !mejorCubreObjetivo) ||
      (cubreObj === mejorCubreObjetivo &&
        (usdObj > mejorUsdObjetivo + 0.005 ||
          (Math.abs(usdObj - mejorUsdObjetivo) <= 0.005 && usdTot > mejorUsdTotal + 0.005)));

    if (supera) {
      mejorId = c.id;
      mejorCubreObjetivo = cubreObj;
      mejorUsdObjetivo = usdObj;
      mejorUsdTotal = usdTot;
    }
  }

  return mejorId;
}

/** Cajas adicionales que tienen saldo positivo cuando la caja actual no alcanza por sí sola. */
export function cajasSugeridasParaCompletar(
  cajas: Caja[],
  todosSaldos: CajaSaldo[],
  cajaPrimariaId: string,
  cajasExtraIds: string[],
  metodoPago?: MetodoPagoIndic[] | null,
): Array<{ caja: Caja; saldos: CajaSaldo[] }> {
  const excluidas = new Set([cajaPrimariaId, ...cajasExtraIds]);
  const monedasObj = new Set(
    (metodoPago ?? []).map((m) => String(m.moneda || '').trim()).filter(Boolean),
  );
  return cajas
    .filter((c) => !excluidas.has(c.id))
    .map((caja) => ({ caja, saldos: saldosEfectivosDeCaja(caja, todosSaldos) }))
    .filter(({ saldos }) => saldos.length > 0)
    .sort((a, b) => {
      const aMatch = a.saldos.some((s) => monedasObj.has(s.moneda)) ? 1 : 0;
      const bMatch = b.saldos.some((s) => monedasObj.has(s.moneda)) ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      const sumA = a.saldos.reduce((acc, s) => acc + (Number(s.saldo) || 0), 0);
      const sumB = b.saldos.reduce((acc, s) => acc + (Number(s.saldo) || 0), 0);
      return sumB - sumA;
    });
}

/**
 * Prellena cuánto sale de cada cuenta para cubrir `totalUsd` (de mayor a menor saldo),
 * garantizando que ningún monto nativo supere `Number(s.saldo)` por efecto de redondeo.
 */
export function calcularPrellenadoMultipago(
  saldosCaja: CajaSaldo[],
  metodoPago: MetodoPagoIndic[] | null | undefined,
  totalUsd: number,
  tasaBs: number,
  copUsd?: number | null,
  dosDecimalesFmt: (v: string) => string = (v) => v,
): Record<string, string> {
  if (!saldosCaja.length || totalUsd <= 0) return {};
  if (saldosCaja.some((s) => s.moneda === 'Bs') && !(tasaBs > 0)) return {};
  if (saldosCaja.some((s) => s.moneda === 'COP') && !(copUsd && copUsd > 0)) return {};

  const objetivo: Record<string, number> = {};
  let indicUsd = 0;
  for (const m of metodoPago ?? []) {
    const u = round2(Number(m.monto) || 0);
    if (u <= 0) continue;
    objetivo[m.moneda] = round2((objetivo[m.moneda] || 0) + u);
    indicUsd = round2(indicUsd + u);
  }
  const usarIndic = indicUsd > 0.01;
  // Si Compras indicó moneda sin monto explícito (monto = 0), igual preferimos esa moneda primero.
  const monedasSinMonto = !usarIndic
    ? [...new Set((metodoPago ?? []).map((m) => String(m.moneda || '').trim()).filter(Boolean))]
    : [];

  const capUsdExacto = (s: CajaSaldo) =>
    montoAUsdExacto(s.moneda, round2(Number(s.saldo) || 0), tasaBs, copUsd);

  const asignadoNativo: Record<string, number> = {};
  const usdCubiertoPorCuenta = (s: CajaSaldo) =>
    montoAUsdExacto(s.moneda, asignadoNativo[s.id] || 0, tasaBs, copUsd);

  const asignarUsdACuentas = (cuentas: CajaSaldo[], usdObjetivo: number): number => {
    let rest = usdObjetivo;
    const ordenadas = [...cuentas].sort((a, b) => capUsdExacto(b) - capUsdExacto(a));
    for (const s of ordenadas) {
      if (rest <= 0.004) break;
      const saldoMax = round2(Number(s.saldo) || 0);
      const yaNativo = asignadoNativo[s.id] || 0;
      const libreNativo = round2(saldoMax - yaNativo);
      if (libreNativo <= 0) continue;
      const requeridoNativo = usdAMontoNativo(s.moneda, rest, tasaBs, copUsd);
      // Nunca superar el disponible real de la cuenta (`libreNativo`).
      const usarNativo = Math.min(libreNativo, requeridoNativo);
      if (usarNativo <= 0) continue;
      asignadoNativo[s.id] = round2(yaNativo + usarNativo);
      const cubiertoUsd = montoAUsdExacto(s.moneda, usarNativo, tasaBs, copUsd);
      rest = Math.max(0, rest - cubiertoUsd);
    }
    return rest;
  };

  if (usarIndic) {
    for (const [mon, usdObj] of Object.entries(objetivo)) {
      const legsMon = saldosCaja.filter((s) => s.moneda === mon);
      asignarUsdACuentas(legsMon, usdObj);
    }
  } else if (monedasSinMonto.length > 0) {
    const preferidas = saldosCaja.filter((s) => monedasSinMonto.includes(s.moneda));
    asignarUsdACuentas(preferidas, totalUsd);
  }

  const totalCubiertoUsd = saldosCaja.reduce((acc, s) => acc + usdCubiertoPorCuenta(s), 0);
  const faltanteUsd = totalUsd - totalCubiertoUsd;
  if (faltanteUsd > 0.004) {
    asignarUsdACuentas(saldosCaja, faltanteUsd);
  }

  const next: Record<string, string> = {};
  for (const s of saldosCaja) {
    const nat = round2(asignadoNativo[s.id] || 0);
    if (nat > 0) {
      next[s.id] = dosDecimalesFmt(String(nat));
    }
  }
  return next;
}

/**
 * Resuelve de qué billetera sale la comisión bancaria opcional:
 * - Si el usuario eligió explícitamente `comisionSaldoId` y existe en `saldosCaja`, la respeta.
 * - Si dejó `— billetera de la comisión —` (`""`), elige automáticamente una billetera con
 *   holgura suficiente (`saldo - montoPata >= comisionMonto`), priorizando:
 *   1) Pata activa en Bs con holgura suficiente.
 *   2) Otra cuenta en Bs disponible en `saldosCaja` con holgura suficiente.
 *   3) Cualquier pata activa con holgura suficiente.
 *   4) Cualquier cuenta en `saldosCaja` con holgura suficiente.
 *   5) Respaldo: la pata activa (o cuenta) de mayor saldo restante — NUNCA `saldosCaja[0]` a ciegas.
 */
export function resolverBilleteraComision(
  saldosCaja: CajaSaldo[],
  legMontos: Record<string, string>,
  comisionSaldoId: string,
  comisionMonto: number,
): CajaSaldo | null {
  if (!saldosCaja.length) return null;
  if (comisionSaldoId) {
    const explicita = saldosCaja.find((s) => s.id === comisionSaldoId);
    if (explicita) return explicita;
  }

  const com = round2(Number(comisionMonto) || 0);
  const holgura = (s: CajaSaldo) =>
    round2((Number(s.saldo) || 0) - (Number(legMontos[s.id]) || 0));
  const esActiva = (s: CajaSaldo) => (Number(legMontos[s.id]) || 0) > 0;
  const porMayorHolgura = (a: CajaSaldo, b: CajaSaldo) => holgura(b) - holgura(a);

  const grupos: CajaSaldo[][] = [
    saldosCaja.filter((s) => esActiva(s) && s.moneda === 'Bs' && holgura(s) >= com - 0.005),
    saldosCaja.filter((s) => s.moneda === 'Bs' && holgura(s) >= com - 0.005),
    saldosCaja.filter((s) => esActiva(s) && holgura(s) >= com - 0.005),
    saldosCaja.filter((s) => holgura(s) >= com - 0.005),
  ];

  for (const g of grupos) {
    if (g.length > 0) {
      return [...g].sort(porMayorHolgura)[0];
    }
  }

  const activas = saldosCaja.filter(esActiva).sort(porMayorHolgura);
  if (activas.length > 0) return activas[0];
  return [...saldosCaja].sort(porMayorHolgura)[0] ?? null;
}

/**
 * Valida en el navegador ANTES de tocar la base que cada billetera alcance para
 * `(monto a pagar + comisión bancaria)`. Si alguna no alcanza y existe dinero en
 * otra cuenta o caja activa, lo indica claramente en el mensaje de error.
 */
export function validarFondosPorBilletera(params: {
  saldosCaja: CajaSaldo[];
  legMontos: Record<string, string>;
  comSaldo: CajaSaldo | null;
  comMonto: number;
  todosSaldos: CajaSaldo[];
  cajas: Caja[];
  fmtMonto: (n: number, moneda: string) => string;
}): string | null {
  const { saldosCaja, legMontos, comSaldo, comMonto, todosSaldos, cajas, fmtMonto } = params;
  const com = round2(Number(comMonto) || 0);

  for (const s of saldosCaja) {
    const pata = round2(Number(legMontos[s.id]) || 0);
    const extraCom = com > 0 && comSaldo?.id === s.id ? com : 0;
    const requerido = round2(pata + extraCom);
    if (requerido <= 0) continue;

    const disp = round2(Number(s.saldo) || 0);
    if (requerido > disp + 0.005) {
      const cajaNombre = cajas.find((c) => c.id === s.caja_id)?.nombre ?? 'la caja';
      const cta = etiquetaCuentaCorta(s.cuenta);
      const nombreBilletera = `${cajaNombre} · ${s.moneda}${cta ? ` (${cta})` : ''}`;
      const desglose =
        pata > 0 && extraCom > 0
          ? ` (${fmtMonto(pata, s.moneda)} de pago + ${fmtMonto(extraCom, s.moneda)} de comisión)`
          : extraCom > 0
            ? ` de comisión bancaria`
            : '';

      // Buscar otras cuentas/cajas activas que sí tengan fondos en esa moneda.
      const cajasMap = new Map(cajas.map((c) => [c.id, c]));
      const otrasConFondos = todosSaldos
        .filter(
          (o) =>
            o.id !== s.id &&
            o.moneda === s.moneda &&
            cajasMap.has(o.caja_id) &&
            (Number(o.saldo) || 0) >= (extraCom > 0 && pata === 0 ? extraCom : requerido) - 0.005,
        )
        .sort((a, b) => (Number(b.saldo) || 0) - (Number(a.saldo) || 0))
        .slice(0, 3)
        .map((o) => {
          const nom = cajasMap.get(o.caja_id)?.nombre ?? 'Caja';
          const c = etiquetaCuentaCorta(o.cuenta);
          return `${nom}${c ? ` · ${c}` : ''} (${fmtMonto(Number(o.saldo) || 0, o.moneda)})`;
        });

      const sugerencia = otrasConFondos.length
        ? ` Sí hay fondos disponibles en: ${otrasConFondos.join(', ')}.`
        : '';

      return `Saldo insuficiente en ${nombreBilletera}: se intentan descontar ${fmtMonto(requerido, s.moneda)}${desglose} y el disponible en esa cuenta es ${fmtMonto(disp, s.moneda)}.${sugerencia}`;
    }
  }

  return null;
}
