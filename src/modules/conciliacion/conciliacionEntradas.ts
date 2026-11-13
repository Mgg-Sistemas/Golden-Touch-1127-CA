/* ============================================================
   Conciliación · Módulo de Conciliación por Entradas de Retención
   (Entradas - Reintegros de Retenciones y Descuentos).

   Cruza las entradas bancarias / libro mayor del Drive (reintegros de
   retenciones que los proveedores reembolsan a Golden Touch, descuentos
   de compra o entradas correspondientes a GT) con las órdenes de compra
   y las órdenes del sistema que esperan reintegro (órdenes con retención
   'después de pagar' donde Tesorería pagó completo y el proveedor reintegra).
   ============================================================ */

import type { DriveConciliacion, FilaConciliacion } from './conciliacion';
import { r2 } from './conciliacion';
import { parseMontoBs, mismaReferencia } from './cruceDrive';
import type { Orden } from '@/shared/lib/types';
import { supabase } from '@/shared/lib/supabase';
import {
  leerRetencionesCompras,
  lineasRetencion,
  type CamposRetencionesCompras,
} from '@/modules/pedidos/retencionesCompras';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';

export interface FilaConciliacionEntrada {
  item: number;
  id: string;
  ordenId?: string | null;
  codigoOc: string | null;
  proveedor: string;
  fechaReintegro: string; // día en que hubo el reintegro
  moneda: string;
  montoBs: number;
  montoUsd: number | null;
  tasa: number | null;
  referencia: string | null; // referencia de la entrada bancaria
  cuentaBanco: string | null;
  tipoRetencion: string; // ej: 'ISAE + IVA', 'ISLR + ISAE + IVA', 'Descuento compra'
  facturas: string[]; // números de factura asociados si se indican
  motivo: string;
  estado: 'reintegrado' | 'esperando_reintegro';
  estadoLabel: string;
  drive: DriveConciliacion | null;
}

export interface IndicadoresEntradas {
  totalEntradas: {
    cantidad: number;
    bs: number;
    usd: number;
  };
  totalBsReintegrado: number;
  totalUsdEquivalente: number;
  esperandoReintegro: {
    cantidad: number;
    bs: number;
    usd: number;
  };
  reintegrosCruzados: {
    cantidad: number;
    bs: number;
  };
  // Resúmenes planos para acceso rápido
  total: number;
  totalBs: number;
  totalUsd: number;
  cantidadReintegrados: number;
  cantidadEsperando: number;
  cantidadCruzados: number;
}

/* ─────────────── Utilidades de Normalización ─────────────── */

export const sinAcentos = (s: string) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const normCodigo = (s: string) =>
  sinAcentos(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

export const digitos = (s: string) =>
  String(s ?? '').replace(/\D+/g, '').replace(/^0+/, '');

/** Convierte valores numéricos de Excel o strings a formato YYYY-MM-DD. */
export function parsearFecha(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    return !isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : '';
  }
  if (typeof v === 'number') {
    // Número serial de Excel (ej: 46330)
    if (v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return String(v);
  }
  const s = String(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m1) {
    const [, d, m, y] = m1;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})\b/);
  if (m2) {
    const [, d, m, y] = m2;
    return `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

/* ─────────────── Proveedores conocidos base ─────────────── */

export const PROVEEDORES_CONOCIDOS_BASE = [
  'SUPER HOME',
  'AMLV CREATIVO',
  'HIERRO SAN FELIX',
  'TECNO PUNTO',
];

/* ─────────────── Extracción de Campos de Texto ─────────────── */

/**
 * Extrae el código de la orden de una celda o texto descriptivo.
 * Maneja casos como:
 *  - 'ODC 236 MGG Y ODC 181 GT' -> 'ODC 181 GT'
 *  - 'ODC 201' -> 'OC-2026-0201'
 *  - 'OC-2026-0181' -> 'OC-2026-0181'
 */
export function extraerCodigoOc(texto: string, anioDefault = 2026): string | null {
  if (!texto) return null;

  // 1. Caso específico de GT cuando se menciona GT o Golden Touch:
  // Ej: 'ODC 236 MGG Y ODC 181 GT' -> 'ODC 181 GT'
  const matchGt = texto.match(/(?:ODC|OC)\s*[-#]?\s*(\d+)\s*(?:GT\b|GOLDEN\s*TOUCH\b)/i);
  if (matchGt) {
    return `ODC ${matchGt[1]} GT`;
  }

  // 2. Código completo existente: OC-2026-0201 o CS-2026-0005
  const matchFull = texto.match(/\b((?:OC|CS)-\d{4}-\d{4})\b/i);
  if (matchFull) {
    return matchFull[1].toUpperCase();
  }

  // 3. Caso general ODC: 'ODC 201' -> 'OC-2026-0201'
  // Busca las menciones de ODC / OC y prioriza la que no sea MGG
  const matchesOdc = Array.from(texto.matchAll(/(?:ODC|OC)\s*[-#]?\s*(\d+)(?:\s*(MGG|GT))?/gi));
  for (const m of matchesOdc) {
    const tag = (m[2] ?? '').toUpperCase();
    if (tag === 'MGG') continue; // Si es explícitamente MGG y no tiene GT, no es de GT
    const num = m[1];
    if (tag === 'GT') {
      return `ODC ${num} GT`;
    }
    // Formatear a 4 dígitos con prefijo del año
    return `OC-${anioDefault}-${String(num).padStart(4, '0')}`;
  }

  return null;
}

/**
 * Extrae el nombre del proveedor desde columna específica, lista conocida o patrones.
 */
export function extraerProveedor(
  texto: string,
  colVal?: string | null,
  proveedoresLista: string[] = [],
): string {
  if (colVal && colVal.trim() && !/^(entrada|salida|reintegro|retencion|monto)/i.test(colVal.trim())) {
    return colVal.trim().toUpperCase();
  }
  const lista = [...new Set([...proveedoresLista, ...PROVEEDORES_CONOCIDOS_BASE])];
  const sinAc = sinAcentos(texto).toUpperCase();
  for (const p of lista) {
    if (p && p.trim() && sinAc.includes(sinAcentos(p).toUpperCase())) {
      return p.trim().toUpperCase();
    }
  }

  // Patrón entre FACTURA y CORRESPONDIENTE / ODC / OC / REF
  const m = texto.match(
    /(?:SEGUN\s+)?FACTURA[S]?\s*(?:#\d+|\d+)\s+([A-Z0-9\s.,&-]+?)\s+(?:CORRESPONDIENTE|ODC|OC|POR|PARA|REF)\b/i,
  );
  if (m && m[1].trim()) {
    return m[1].trim().toUpperCase();
  }

  return '—';
}

/**
 * Determina el tipo de retención o descuento según el texto de la entrada.
 * Ejemplos: 'ISAE + IVA', 'ISLR + ISAE + IVA', 'Descuento compra'.
 */
export function extraerTipoRetencion(texto: string): string {
  const sinAc = sinAcentos(texto).toUpperCase();
  const tieneIslr = /\bISLR\b|I\.S\.L\.R\./.test(sinAc);
  const tieneIsae = /\bISAE\b|MUNICIPAL/.test(sinAc);
  const tieneIva = /\bIVA\b|I\.V\.A\./.test(sinAc);
  const tieneIgtf = /\bIGTF\b/.test(sinAc);
  const tieneDescuento = /DESCUENTO/.test(sinAc);

  if (tieneDescuento && !tieneIslr && !tieneIsae && !tieneIva) {
    return 'Descuento compra';
  }

  const partes: string[] = [];
  if (tieneIslr) partes.push('ISLR');
  if (tieneIsae) partes.push('ISAE');
  if (tieneIva) partes.push('IVA');
  if (tieneIgtf) partes.push('IGTF');
  if (tieneDescuento) partes.push('Descuento');

  if (partes.length > 0) {
    return partes.join(' + ');
  }

  if (/RETENCION/i.test(sinAc)) {
    return 'Retención';
  }

  return 'Reintegro';
}

/**
 * Extrae los números de factura referenciados en el texto (#00003010, #00322...).
 */
export function extraerFacturas(texto: string): string[] {
  const out: string[] = [];
  const conHash = texto.match(/#[A-Za-z0-9_-]{3,15}/g);
  if (conHash) {
    for (const h of conHash) out.push(h);
  }
  const sinHash = texto.matchAll(/(?:FACTURA[S]?|FACT|FC)\s*(?:N[°ºO.]\s*)?(\d{4,12})\b/gi);
  for (const m of sinHash) {
    const formatted = `#${m[1]}`;
    if (!out.includes(formatted)) out.push(formatted);
  }
  return [...new Set(out)];
}

/**
 * Extrae la referencia bancaria del pago/recibo.
 */
export function extraerReferencia(texto: string, colVal?: unknown): string | null {
  if (colVal != null && String(colVal).trim()) {
    const s = String(colVal).trim();
    if (!/^(entrada|salida|reintegro|monto)/i.test(s)) return s;
  }
  const m = texto.match(/(?:REF|REFERENCIA|COMPROBANTE|OPERACI[OÓ]N|OP)[.:\s#]*([A-Za-z0-9]{4,15})\b/i);
  if (m) return m[1];
  return null;
}

/**
 * Detecta el banco o cuenta bancaria.
 */
export function extraerCuentaBanco(texto: string, colVal?: unknown): string | null {
  if (colVal != null && String(colVal).trim()) {
    return String(colVal).trim();
  }
  const sinAc = sinAcentos(texto).toUpperCase();
  if (sinAc.includes('BANESCO')) return 'Banesco';
  if (sinAc.includes('VENEZUELA') || /\bBDV\b/.test(sinAc)) return 'Banco de Venezuela';
  if (sinAc.includes('MERCANTIL')) return 'Mercantil';
  if (sinAc.includes('BNC') || sinAc.includes('NACIONAL DE CREDITO')) return 'BNC';
  if (sinAc.includes('PROVINCIAL') || sinAc.includes('BBVA')) return 'Provincial';
  if (sinAc.includes('BANCAMIGA')) return 'Bancamiga';
  return null;
}

/* ─────────────── Detección de Columnas de Encabezado ─────────────── */

const ALIAS_ENTRADAS = {
  fecha: ['fecha', 'fechavalor', 'fecharegistro', 'fechaoperacion', 'fechaope', 'date', 'dia'],
  movimiento: ['movimiento', 'tipomovimiento', 'tipo', 'operacion', 'tipooperacion', 'transaccion', 'tipotransaccion', 'conceptooperacion'],
  concepto: ['concepto', 'descripcion', 'detalle', 'motivo', 'observacion', 'observaciones', 'glosa', 'beneficiarioconcepto', 'descripcionoperacion'],
  referencia: ['referencia', 'ref', 'nroreferencia', 'numeroreferencia', 'comprobante', 'nrooperacion', 'numerooperacion', 'secuencia', 'refbancaria'],
  monto: ['montobs', 'montoenbs', 'monto', 'importebs', 'importe', 'totalbs', 'total'],
  entrada: ['entrada', 'entradas', 'haber', 'abono', 'abonos', 'ingreso', 'ingresos', 'credito', 'creditos', 'deposito', 'depositos'],
  salida: ['salida', 'salidas', 'debe', 'cargo', 'cargos', 'egreso', 'egresos', 'debito', 'debitos'],
  banco: ['banco', 'bancocuenta', 'cuenta', 'cuentabanco', 'cuentabancaria'],
  proveedor: ['proveedor', 'beneficiario', 'empresa', 'cliente', 'razonsocial'],
  codigoOc: ['codigooc', 'oc', 'odc', 'nrooc', 'nroodc', 'orden', 'ordendecompra', 'ordencompra'],
  tasa: ['tasa', 'tasabcv', 'tasadecambio', 'cambio'],
};

export function detectarColumnasEntradas(encabezados: unknown[]): Record<keyof typeof ALIAS_ENTRADAS, number> {
  const claves = encabezados.map((s) => sinAcentos(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, ''));
  const cols = {
    fecha: -1,
    movimiento: -1,
    concepto: -1,
    referencia: -1,
    monto: -1,
    entrada: -1,
    salida: -1,
    banco: -1,
    proveedor: -1,
    codigoOc: -1,
    tasa: -1,
  };
  const usadas = new Set<number>();
  const buscar = (alias: string[]) => {
    for (const a of alias) {
      const idx = claves.findIndex((k, j) => k === a && !usadas.has(j));
      if (idx >= 0) {
        usadas.add(idx);
        return idx;
      }
    }
    return -1;
  };

  cols.entrada = buscar(ALIAS_ENTRADAS.entrada);
  cols.salida = buscar(ALIAS_ENTRADAS.salida);
  cols.monto = buscar(ALIAS_ENTRADAS.monto);
  cols.movimiento = buscar(ALIAS_ENTRADAS.movimiento);
  cols.referencia = buscar(ALIAS_ENTRADAS.referencia);
  cols.fecha = buscar(ALIAS_ENTRADAS.fecha);
  cols.banco = buscar(ALIAS_ENTRADAS.banco);
  cols.proveedor = buscar(ALIAS_ENTRADAS.proveedor);
  cols.codigoOc = buscar(ALIAS_ENTRADAS.codigoOc);
  cols.tasa = buscar(ALIAS_ENTRADAS.tasa);
  cols.concepto = buscar(ALIAS_ENTRADAS.concepto);

  return cols;
}

/* ─────────────── Vinculación con Órdenes / Salidas ─────────────── */

/**
 * Busca si la orden o pago existe en las filas de Conciliación (filasSalidas).
 */
export function vincularConSalida(
  codigoOc: string | null,
  proveedor: string,
  _facturas: string[],
  referencia: string | null,
  filasSalidas: FilaConciliacion[],
): FilaConciliacion | null {
  if (!filasSalidas || !filasSalidas.length) return null;

  // 1. Por coincidencia de código de OC
  if (codigoOc) {
    const normBuscado = normCodigo(codigoOc);
    const digBuscado = digitos(codigoOc);

    for (const s of filasSalidas) {
      if (normCodigo(s.codigo) === normBuscado) return s;
      const digS = digitos(s.codigo);
      if (digBuscado && digS) {
        if (digS === digBuscado || digS.endsWith(digBuscado) || digBuscado.endsWith(digS)) {
          return s;
        }
      }
    }
  }

  // 2. Por referencia bancaria
  if (referencia) {
    for (const s of filasSalidas) {
      if (s.referencias.some((r) => mismaReferencia(r, referencia))) return s;
    }
  }

  // 3. Por proveedor único
  if (proveedor && proveedor !== '—') {
    const normProv = sinAcentos(proveedor).toUpperCase();
    const coincidencias = filasSalidas.filter(
      (s) => sinAcentos(s.proveedor).toUpperCase() === normProv,
    );
    if (coincidencias.length === 1) return coincidencias[0];
  }

  return null;
}

/* ─────────────── Extracción Principal del Drive ─────────────── */

/**
 * Recorre la matriz del archivo Drive/Excel (el libro mayor o tabla de banco).
 * Identifica filas de 'ENTRADA (RECIBO)' o donde el movimiento sea entrada,
 * que tengan 'reintegro', 'retencion', 'descuento' o que pertenezcan a GT.
 * Extrae la fecha, el código de la orden, el proveedor, el tipo de retención,
 * las facturas, la referencia bancaria y el monto en Bs.
 * Si encuentra la OC en `filasSalidas`, vincula su `ordenId` y datos.
 */
export function extraerEntradasDrive(
  matriz: unknown[][],
  filasSalidas: FilaConciliacion[] = [],
): FilaConciliacionEntrada[] {
  if (!Array.isArray(matriz) || !matriz.length) return [];

  // Buscar fila de encabezados en las primeras 15 filas
  let inicio = -1;
  let columnas = {
    fecha: -1,
    movimiento: -1,
    concepto: -1,
    referencia: -1,
    monto: -1,
    entrada: -1,
    salida: -1,
    banco: -1,
    proveedor: -1,
    codigoOc: -1,
    tasa: -1,
  };

  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const r = matriz[i];
    if (!Array.isArray(r)) continue;
    const c = detectarColumnasEntradas(r);
    if (
      (c.monto >= 0 || c.entrada >= 0) &&
      (c.movimiento >= 0 || c.concepto >= 0 || c.referencia >= 0 || c.codigoOc >= 0)
    ) {
      inicio = i;
      columnas = c;
      break;
    }
  }

  const filasInicio = inicio >= 0 ? inicio + 1 : 0;
  const proveedoresSalidas = filasSalidas.map((s) => s.proveedor).filter(Boolean);
  const resultado: FilaConciliacionEntrada[] = [];

  for (let i = filasInicio; i < matriz.length; i++) {
    const r = matriz[i];
    if (!Array.isArray(r) || !r.some((x) => x != null && String(x).trim())) continue;

    const textoFila = r.map((x) => (x == null ? '' : String(x))).join(' ');
    const textoNorm = sinAcentos(textoFila).toLowerCase();

    // 1. Identificar si es ENTRADA
    let esEntrada = false;
    let esSalida = false;

    if (columnas.movimiento >= 0 && r[columnas.movimiento] != null) {
      const mov = sinAcentos(String(r[columnas.movimiento])).toLowerCase();
      if (/entrada|recibo|ingreso|abono|credito/.test(mov)) esEntrada = true;
      if (/salida|egreso|debito|cargo/.test(mov)) esSalida = true;
    }

    if (columnas.entrada >= 0 && r[columnas.entrada] != null) {
      const valE = parseMontoBs(r[columnas.entrada]);
      if (valE && valE > 0) esEntrada = true;
    }

    if (columnas.salida >= 0 && r[columnas.salida] != null) {
      const valS = parseMontoBs(r[columnas.salida]);
      const valE = columnas.entrada >= 0 ? parseMontoBs(r[columnas.entrada]) : null;
      if (valS && valS > 0 && (!valE || valE === 0)) esSalida = true;
    }

    if (!esEntrada && !esSalida) {
      if (/entrada\s*\(recibo\)|\bentrada\b|\brecibo\b|\bingreso\b|\babono\b/.test(textoNorm)) {
        esEntrada = true;
      }
    }

    if (!esEntrada || esSalida) continue;

    // Descartar cierres de caja del mes anterior, saldos iniciales y traspasos entre cuentas propias
    if (/cierre\s*caja|saldo\s*cierre|apertura\s*caja|mes\s*anterior|traspaso|transferencia\s*entre\s*cuentas/i.test(textoNorm)) {
      continue;
    }

    // 2. Comprobar si tiene 'reintegro', 'retencion', 'descuento' o pertenece a GT
    const tieneReintegro = /reintegro/.test(textoNorm);
    const tieneRetencion = /retencion/.test(textoNorm);
    const tieneDescuento = /descuento/.test(textoNorm);
    const perteneceGT = /\bgt\b/.test(textoNorm) || /golden\s*touch/.test(textoNorm) || /bdt\s*juridico\s*gt/i.test(textoNorm) || /usdt\s*gt/i.test(textoNorm);
    const tieneMgg = /mineral\s*group|\bmgg\b/.test(textoNorm);

    if (tieneMgg && !perteneceGT) {
      continue;
    }

    if (!tieneReintegro && !tieneRetencion && !tieneDescuento && !perteneceGT) {
      continue;
    }

    // 3. Monto en Bs
    let montoBs: number | null = null;
    if (columnas.entrada >= 0 && r[columnas.entrada] != null) {
      montoBs = parseMontoBs(r[columnas.entrada]);
    }
    if ((montoBs == null || montoBs <= 0) && columnas.monto >= 0 && r[columnas.monto] != null) {
      montoBs = parseMontoBs(r[columnas.monto]);
    }
    if (montoBs == null || montoBs <= 0) {
      for (const celda of r) {
        const val = parseMontoBs(celda);
        if (val && val > 0) {
          montoBs = val;
          break;
        }
      }
    }

    if (montoBs == null || montoBs <= 0) continue;

    // 4. Fecha del reintegro (exclusivamente Noviembre 2026 en adelante)
    const fechaCruda = columnas.fecha >= 0 ? r[columnas.fecha] : null;
    let fechaReintegro = parsearFecha(fechaCruda);
    if (!fechaReintegro) {
      for (const celda of r) {
        const f = parsearFecha(celda);
        if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) {
          fechaReintegro = f;
          break;
        }
      }
    }

    if (fechaReintegro && fechaReintegro < '2026-11-01') continue;
    if (/octubre\s*2026|2026-10/i.test(textoNorm)) continue;

    // 5. Concepto / Motivo
    const concepto =
      columnas.concepto >= 0 && r[columnas.concepto] != null
        ? String(r[columnas.concepto]).trim()
        : textoFila;

    // 6. Código OC
    const codigoCol = columnas.codigoOc >= 0 ? String(r[columnas.codigoOc] ?? '') : '';
    const codigoOc = extraerCodigoOc(codigoCol || textoFila);

    // 7. Proveedor
    const provCol = columnas.proveedor >= 0 ? String(r[columnas.proveedor] ?? '') : '';
    let proveedor = extraerProveedor(textoFila, provCol, proveedoresSalidas);

    // 8. Tipo de Retención
    const tipoRetencion = extraerTipoRetencion(textoFila);

    // 9. Facturas
    const facturas = extraerFacturas(textoFila);

    // 10. Referencia bancaria
    const refCol = columnas.referencia >= 0 ? r[columnas.referencia] : null;
    const referencia = extraerReferencia(textoFila, refCol);

    // 11. Cuenta Banco
    const bancoCol = columnas.banco >= 0 ? r[columnas.banco] : null;
    const cuentaBanco = extraerCuentaBanco(textoFila, bancoCol);

    // 12. Tasa
    let tasa: number | null = null;
    if (columnas.tasa >= 0 && r[columnas.tasa] != null) {
      tasa = parseMontoBs(r[columnas.tasa]);
    }

    // 13. Vincular con filasSalidas
    const salidaVinculada = vincularConSalida(codigoOc, proveedor, facturas, referencia, filasSalidas);
    let ordenId: string | null = null;

    if (salidaVinculada) {
      ordenId = salidaVinculada.ordenId;
      if (proveedor === '—' && salidaVinculada.proveedor) {
        proveedor = salidaVinculada.proveedor;
      }
      if (!tasa && salidaVinculada.tasa) {
        tasa = salidaVinculada.tasa;
      }
    }

    const montoUsd = tasa && tasa > 0 ? r2(montoBs / tasa) : null;
    const driveDetalle = salidaVinculada
      ? `Reintegro vinculado con ${salidaVinculada.codigo}${referencia ? ` · Ref. ${referencia}` : ''}`
      : `Reintegro en banco/Drive${referencia ? ` · Ref. ${referencia}` : ''}`;

    const drive: DriveConciliacion = {
      estado: 'cuadra',
      detalle: driveDetalle,
      archivo: null,
      archivoPath: null,
      en: fechaReintegro || null,
      por: null,
    };

    resultado.push({
      item: resultado.length + 1,
      id: `reintegro-${referencia || i + 1}`,
      ordenId,
      codigoOc,
      proveedor,
      fechaReintegro,
      moneda: 'Bs',
      montoBs: r2(montoBs),
      montoUsd,
      tasa,
      referencia,
      cuentaBanco,
      tipoRetencion,
      facturas,
      motivo: concepto || `Reintegro retención ${tipoRetencion}`,
      estado: 'reintegrado',
      estadoLabel: 'Reintegrado',
      drive,
    });
  }

  return resultado;
}

/* ─────────────── Indicadores de Entradas ─────────────── */

/**
 * Calcula los totales e indicadores clave para el módulo de Conciliación de Entradas:
 *  - Total entradas / reintegros
 *  - Total Bs reintegrado
 *  - Total $ equivalente
 *  - Esperando reintegro
 *  - Reintegros cruzados con Drive/Banco (CUADRA)
 */
export function indicadoresEntradas(filas: FilaConciliacionEntrada[]): IndicadoresEntradas {
  const reintegros = filas.filter((f) => f.estado === 'reintegrado');
  const esperando = filas.filter((f) => f.estado === 'esperando_reintegro');
  const cuadran = filas.filter((f) => f.drive?.estado === 'cuadra');

  const sumaBs = (xs: FilaConciliacionEntrada[]) => r2(xs.reduce((a, f) => a + (f.montoBs || 0), 0));
  const sumaUsd = (xs: FilaConciliacionEntrada[]) => r2(xs.reduce((a, f) => a + (f.montoUsd || 0), 0));

  const totalBsReintegrado = sumaBs(reintegros);
  const totalUsdEquivalente = sumaUsd(reintegros);

  return {
    totalEntradas: {
      cantidad: filas.length,
      bs: sumaBs(filas),
      usd: sumaUsd(filas),
    },
    totalBsReintegrado,
    totalUsdEquivalente,
    esperandoReintegro: {
      cantidad: esperando.length,
      bs: sumaBs(esperando),
      usd: sumaUsd(esperando),
    },
    reintegrosCruzados: {
      cantidad: cuadran.length,
      bs: sumaBs(cuadran),
    },
    // Resúmenes directos
    total: filas.length,
    totalBs: sumaBs(filas),
    totalUsd: sumaUsd(filas),
    cantidadReintegrados: reintegros.length,
    cantidadEsperando: esperando.length,
    cantidadCruzados: cuadran.length,
  };
}

/* ─────────────── Órdenes esperando Reintegro ─────────────── */

const ESTADOS_IGNORADOS = new Set(['cancelada', 'rechazada', 'desistida_proveedor', 'reasignada']);

/**
 * Determina si una orden del sistema requiere y espera reintegro:
 * Órdenes con retención 'después de pagar' que aún no han sido reintegradas.
 */
export function esOrdenEsperandoReintegro(o: Orden & CamposRetencionesCompras): boolean {
  if (ESTADOS_IGNORADOS.has(o.estado)) return false;
  const esDespues = o.retencion_momento === 'despues_de_pagar' || o.retencion_modo === 'completo_reembolso';
  if (!esDespues) return false;

  const retCompras = leerRetencionesCompras(o);
  const tieneRet =
    (retCompras && retCompras.total > 0) ||
    (Number(o.retencion_compras_total) || 0) > 0 ||
    (Number(o.retencion_monto) || 0) > 0 ||
    (Number(o.retencion_monto_bs) || 0) > 0;

  return tieneRet;
}

export function estaOrdenReintegrada(o: Orden, entradasReintegradas: FilaConciliacionEntrada[]): boolean {
  const norm = (s: string) => normCodigo(s);
  const codOc = o.oc_codigo || o.codigo || '';
  const normOc = norm(codOc);
  const digOc = digitos(codOc);

  return entradasReintegradas.some((e) => {
    if (e.ordenId && e.ordenId === o.id) return true;
    if (e.codigoOc) {
      if (norm(e.codigoOc) === normOc) return true;
      const digE = digitos(e.codigoOc);
      if (digE && digOc && (digE === digOc || digOc.endsWith(digE) || digE.endsWith(digOc))) {
        return true;
      }
    }
    return false;
  });
}

/** Convierte una orden esperando reintegro en una fila de conciliación de entrada. */
export function ordenAFilaEsperandoReintegro(
  o: Orden & CamposRetencionesCompras,
  item: number,
  proveedores?: Map<string, string>,
  tasaBcv?: number | null,
): FilaConciliacionEntrada {
  const provNombre =
    (o.proveedor_id && proveedores?.get(o.proveedor_id)) || (o as unknown as { proveedor_nombre?: string }).proveedor_nombre || '—';
  const retCompras = leerRetencionesCompras(o);
  const lineas = retCompras ? lineasRetencion(retCompras) : [];
  let tipoRet = lineas.map((l) => l.corta).join(' + ');
  if (!tipoRet) tipoRet = 'Retención';

  const moneda = o.total_moneda === 'Bs' ? 'Bs' : 'USD';
  const tasa = o.retencion_tasa ?? tasaBcv ?? null;

  let montoBs = 0;
  let montoUsd: number | null = null;

  if (retCompras && retCompras.total > 0) {
    if (moneda === 'Bs') {
      montoBs = retCompras.total;
      montoUsd = tasa ? r2(montoBs / tasa) : null;
    } else {
      montoUsd = retCompras.total;
      montoBs = tasa ? r2(montoUsd * tasa) : 0;
    }
  } else if ((o.retencion_monto_bs ?? 0) > 0) {
    montoBs = Number(o.retencion_monto_bs);
    montoUsd = tasa ? r2(montoBs / tasa) : (Number(o.retencion_monto) || null);
  } else if ((o.retencion_monto ?? 0) > 0) {
    if (moneda === 'Bs') {
      montoBs = Number(o.retencion_monto);
      montoUsd = tasa ? r2(montoBs / tasa) : null;
    } else {
      montoUsd = Number(o.retencion_monto);
      montoBs = tasa ? r2(montoUsd * tasa) : 0;
    }
  }

  const cod = o.oc_codigo ?? o.codigo;
  return {
    item,
    id: `espera-${o.id}`,
    ordenId: o.id,
    codigoOc: cod,
    proveedor: provNombre,
    fechaReintegro: '',
    moneda: 'Bs',
    montoBs: r2(montoBs),
    montoUsd: montoUsd ? r2(montoUsd) : null,
    tasa,
    referencia: null,
    cuentaBanco: null,
    tipoRetencion: tipoRet,
    facturas: [],
    motivo: `Pendiente reintegro retención ${tipoRet} (${cod})`,
    estado: 'esperando_reintegro',
    estadoLabel: 'Esperando reintegro',
    drive: null,
  };
}

/**
 * Función pura que filtra las órdenes que esperan reintegro y aún no están en las entradas del banco.
 */
export function obtenerOrdenesEsperandoReintegro(
  ordenes: (Orden & CamposRetencionesCompras)[],
  entradasReintegradas: FilaConciliacionEntrada[] = [],
  opciones?: { proveedores?: Map<string, string>; tasaBcv?: number | null },
): FilaConciliacionEntrada[] {
  const filtradas = ordenes.filter(
    (o) => esOrdenEsperandoReintegro(o) && !estaOrdenReintegrada(o, entradasReintegradas),
  );
  return filtradas.map((o, idx) =>
    ordenAFilaEsperandoReintegro(o, idx + 1, opciones?.proveedores, opciones?.tasaBcv),
  );
}

/** Alias conveniente */
export const ordenesEsperandoReintegro = obtenerOrdenesEsperandoReintegro;

/**
 * Función asíncrona para consultar a Supabase las órdenes que esperan reintegro.
 */
export async function cargarOrdenesEsperandoReintegro(
  entradasReintegradas: FilaConciliacionEntrada[] = [],
): Promise<FilaConciliacionEntrada[]> {
  const { data, error } = await supabase
    .from('ordenes')
    .select('*')
    .gte('created_at', '2026-11-01T00:00:00-04:00')
    .or('retencion_momento.eq.despues_de_pagar,retencion_modo.eq.completo_reembolso')
    .not('estado', 'in', `(${Array.from(ESTADOS_IGNORADOS).join(',')})`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const ordenes = (data ?? []) as (Orden & CamposRetencionesCompras)[];

  const provIds = [...new Set(ordenes.map((o) => o.proveedor_id).filter(Boolean))] as string[];
  const provMap = new Map<string, string>();
  if (provIds.length > 0) {
    const { data: pData } = await supabase.from('proveedores').select('id, razon_social').in('id', provIds);
    for (const p of pData ?? []) provMap.set(p.id, p.razon_social);
  }

  const tasaHoy = await getTasaHoy().catch(() => null);

  return obtenerOrdenesEsperandoReintegro(ordenes, entradasReintegradas, {
    proveedores: provMap,
    tasaBcv: tasaHoy?.usd ?? null,
  });
}
