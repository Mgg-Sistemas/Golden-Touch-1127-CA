/* ============================================================
   Golden Touch · RRHH · Cómo se arma una quincena

   Esto reproduce la nómina como se lleva de verdad (la planilla del Drive,
   «RECIBOS DE PAGOS … 1 QUINCENA»), que no es «sueldo mensual ÷ 30 × días»:

     · Con cada trabajador se acuerda un TOTAL MENSUAL en dólares.
     · De ese total, un PORCENTAJE se declara como SUELDO y el resto como
       BONO (en la planilla, 20 % y 80 %).
     · La quincena es la mitad de cada uno.
     · El RECIBO que se firma declara SOLO la parte de sueldo, pasada a
       bolívares con la TASA DE CIERRE de la quincena. El bono no va en el
       recibo: se paga aparte, en divisas.
     · Dentro del recibo, el sueldo se reparte en DÍAS TRABAJADOS y DÍAS DE
       DESCANSO (11 + 4 = 15), los dos al mismo sueldo diario.

   Todo acá es cálculo puro, para poder probarlo sin pantalla ni base.
   ============================================================ */

/** El 20 % del Excel: lo que se declara como sueldo. El resto va como bono. */
export const SUELDO_PCT_DEFECTO = 20;

/** Días de una quincena. El sueldo diario del recibo sale de dividir por esto. */
export const DIAS_QUINCENA = 15;

export interface BaseQuincena {
  /** Total acordado POR MES, en dólares (en la planilla, «Total Recibe mes»). */
  totalMesUsd: number;
  /** Qué porcentaje del total se declara como sueldo (0–100). */
  sueldoPct?: number;
  /** Tasa Bs/$ del cierre de la quincena. */
  tasaBs?: number;
  diasTrabajados?: number;
  diasDescanso?: number;
}

export interface QuincenaCalculada {
  sueldoMesUsd: number;
  bonoMesUsd: number;
  sueldoQuincenaUsd: number;
  bonoQuincenaUsd: number;
  /** Lo que se le paga en total por la quincena, en dólares (sueldo + bono). */
  totalQuincenaUsd: number;
  /** La parte sueldo, en bolívares a la tasa de cierre. Es el monto del recibo. */
  sueldoQuincenaBs: number;
  /** Bs por día: el sueldo de la quincena dividido en 15. */
  sueldoDiarioBs: number;
  diasTrabajados: number;
  diasDescanso: number;
  /** Lo devengado por días trabajados y por días de descanso, en bolívares. */
  trabajadosBs: number;
  descansoBs: number;
  /** Suma de los dos anteriores: el devengado del recibo. */
  devengadoBs: number;
}

function n(v: number | null | undefined): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Dos decimales, que es como se paga y como se imprime. */
export function r2(v: number): number {
  return Math.round((n(v) + Number.EPSILON) * 100) / 100;
}

/**
 * El porcentaje de sueldo, acotado. Un valor fuera de 0–100 no es un error de
 * la persona que carga: es un dato roto, y dejarlo pasar pagaría de más.
 */
export function pctValido(pct: number | null | undefined): number {
  const x = n(pct ?? SUELDO_PCT_DEFECTO);
  return Math.min(100, Math.max(0, x));
}

export function calcularQuincena(base: BaseQuincena): QuincenaCalculada {
  const totalMes = Math.max(0, n(base.totalMesUsd));
  const pct = pctValido(base.sueldoPct);
  const tasa = Math.max(0, n(base.tasaBs));

  const sueldoMesUsd = r2((totalMes * pct) / 100);
  // El bono es el RESTO, no «total × 80 %»: si se calcularan por separado,
  // con un porcentaje como 33 los dos redondeos dejarían de sumar el total.
  const bonoMesUsd = r2(totalMes - sueldoMesUsd);

  const sueldoQuincenaUsd = r2(sueldoMesUsd / 2);
  const bonoQuincenaUsd = r2(bonoMesUsd / 2);
  const totalQuincenaUsd = r2(sueldoQuincenaUsd + bonoQuincenaUsd);

  const sueldoQuincenaBs = r2(sueldoQuincenaUsd * tasa);
  // El diario NO se redondea a dos: con quince días, redondear acá se nota en
  // el total del recibo. Se redondea recién cada renglón.
  const sueldoDiarioBs = sueldoQuincenaBs / DIAS_QUINCENA;

  const diasTrabajados = Math.max(0, n(base.diasTrabajados));
  const diasDescanso = Math.max(0, n(base.diasDescanso));
  const trabajadosBs = r2(sueldoDiarioBs * diasTrabajados);
  const descansoBs = r2(sueldoDiarioBs * diasDescanso);

  return {
    sueldoMesUsd, bonoMesUsd,
    sueldoQuincenaUsd, bonoQuincenaUsd, totalQuincenaUsd,
    sueldoQuincenaBs, sueldoDiarioBs,
    diasTrabajados, diasDescanso,
    trabajadosBs, descansoBs,
    devengadoBs: r2(trabajadosBs + descansoBs),
  };
}

/** Bolívares → dólares a una tasa. Con tasa 0 no se puede convertir: es 0, no infinito. */
export function aUsd(montoBs: number, tasaBs: number): number {
  const tasa = n(tasaBs);
  if (!(tasa > 0)) return 0;
  return r2(n(montoBs) / tasa);
}

/** Dólares → bolívares a una tasa. */
export function aBs(montoUsd: number, tasaBs: number): number {
  return r2(n(montoUsd) * Math.max(0, n(tasaBs)));
}

/**
 * ¿Qué hay que avisarle a quien carga la nómina? `null` = está bien.
 * Son avisos, no bloqueos: la quincena se puede cargar igual.
 */
export function avisosQuincena(base: BaseQuincena): string[] {
  const avisos: string[] = [];
  const dias = n(base.diasTrabajados) + n(base.diasDescanso);
  if (dias > DIAS_QUINCENA) {
    avisos.push(`Trabajados y descanso suman ${dias} días: la quincena tiene ${DIAS_QUINCENA}.`);
  }
  if (!(n(base.tasaBs) > 0)) {
    avisos.push('Sin tasa de cierre el recibo sale en cero bolívares.');
  }
  return avisos;
}
