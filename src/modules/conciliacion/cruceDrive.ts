/* ============================================================
   Conciliación · cruce con el archivo del DRIVE (12/11/2026). Lógica pura.

   Se carga un CSV o Excel (el del Drive / banco) en formato estándar (Código OC,
   Referencia, Monto Bs) o en formato Libro Mayor / extracto de caja del Drive
   (fecha, movimiento, moneda, monto / bs salidas, nombre @ descripción, desde, hacia...).

   Para Libro Mayor:
     · Filtra exclusivamente operaciones de Golden Touch (GT);
     · Excluye comisiones bancarias, traspasos internos, gastos personales de directiva,
       viáticos de choferes, compras de casiterita/mineras y movimientos estrictos de MGG;
     · Extrae códigos de OC/ODC/CS/SERV/OSV, referencias bancarias, montos en Bs, fecha y movimiento;
     · Normaliza códigos (ODC 183 -> OC-2026-0183 / OC-183);
     · Si una fila tiene órdenes agrupadas (ej. ODC 189 Y 191), genera registros vinculados;
     · Misma referencia permite coincidencia entre 4 dígitos (Tesorería) y 6-8 dígitos (banco).
   ============================================================ */
import { claveDoc, type EstadoDrive, type FilaConciliacion, type OrigenDoc } from './conciliacion';

export const TOLERANCIA_BS = 1;

export const ETIQUETA_DRIVE: Record<EstadoDrive, string> = { cuadra: 'CUADRA', no_cuadra: 'NO CUADRA' };

export type TipoArchivoDrive = 'estandar' | 'libro_mayor' | 'desconocido';

/* ─────────────── Utilidades de texto y montos ─────────────── */

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const claveEncabezado = (s: unknown) => sinAcentos(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, '');
const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const fmtBs = (n: number) => `Bs ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const normCodigo = (s: string) => s.toUpperCase().replace(/\s+/g, '');
const digitos = (s: string) => s.replace(/\D+/g, '').replace(/^0+/, '');
const alfanum = (s: string) => sinAcentos(s).toUpperCase().replace(/[^A-Z0-9]+/g, '');

/**
 * Monto en Bs desde una celda: número de Excel o texto («Bs 1.234.567,89», «1234567.89»,
 * «1,234.50», «-2.500,00»). Toma el valor absoluto (un débito sale negativo en el banco).
 */
export function parseMontoBs(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.abs(v) : null;
  let s = String(v ?? '').replace(/bs\.?|ves|\s/gi, '').replace(/[()]/g, '');
  if (!s) return null;
  s = s.replace(/^[-+]/, '');
  if (!/^[\d.,]+$/.test(s)) return null;
  const ultPunto = s.lastIndexOf('.');
  const ultComa = s.lastIndexOf(',');
  if (ultPunto >= 0 && ultComa >= 0) {
    // El último separador es el decimal.
    s = ultComa > ultPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultComa >= 0) {
    const partes = s.split(',');
    s = partes.length === 2 && partes[1].length <= 2 ? `${partes[0]}.${partes[1]}` : s.replace(/,/g, '');
  } else if (ultPunto >= 0) {
    const partes = s.split('.');
    // «1.234» o «1.234.567» = miles (así se escribe en Venezuela); «12.5» o «12.50» = decimal.
    if (partes.length > 2 || partes[1].length === 3) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

/** Normaliza fechas de Excel (serial) o texto (DD/MM/YYYY, YYYY-MM-DD) a formato ISO YYYY-MM-DD. */
export function normalizarFechaDrive(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 20000 && v < 60000) {
      const ms = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const s = String(v).trim();
  const mIso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (mIso) {
    return `${mIso[1]}-${mIso[2].padStart(2, '0')}-${mIso[3].padStart(2, '0')}`;
  }
  const mLat = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (mLat) {
    let y = mLat[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mLat[2].padStart(2, '0')}-${mLat[1].padStart(2, '0')}`;
  }
  return s;
}

/* ─────────────── Encabezados y Formato Estándar ─────────────── */

/** Encabezados que se reconocen (sin acentos, espacios ni signos), por prioridad. */
const ALIAS: Record<'oc' | 'referencia' | 'monto', string[]> = {
  oc: ['codigooc', 'codigodeoc', 'oc', 'nrooc', 'numerooc', 'noc', 'ordendecompra', 'ordencompra', 'orden', 'codigo', 'documento', 'nrodocumento'],
  referencia: ['referencia', 'ref', 'nroreferencia', 'numeroreferencia', 'nrodereferencia', 'numerodereferencia', 'nref', 'referenciabancaria',
    'refbancaria', 'referenciadepago', 'referenciapago', 'operacion', 'nrooperacion', 'numerooperacion', 'nrodeoperacion', 'comprobante'],
  monto: ['montobs', 'montoenbs', 'montobolivares', 'montoenbolivares', 'bs', 'bolivares', 'monto', 'importebs', 'importe', 'totalbs', 'total',
    'montopagado', 'montototal', 'debito', 'debe', 'cargo', 'credito', 'haber', 'abono'],
};

export interface ColumnasDrive { oc: number; referencia: number; monto: number }

/** Dónde está cada columna en la fila de encabezados estándar (-1 = no está). */
export function detectarColumnas(encabezados: unknown[]): ColumnasDrive {
  const claves = encabezados.map(claveEncabezado);
  const buscar = (alias: string[], usadas: number[]) => {
    for (const a of alias) {
      const i = claves.findIndex((k, j) => k === a && !usadas.includes(j));
      if (i >= 0) return i;
    }
    return -1;
  };
  const monto = buscar(ALIAS.monto, []);
  const referencia = buscar(ALIAS.referencia, [monto]);
  const oc = buscar(ALIAS.oc, [monto, referencia]);
  return { oc, referencia, monto };
}

/** CSV a matriz: detecta el separador (; , tab |) y respeta las comillas. */
export function parsearCsv(textoCsv: string): string[][] {
  const sinBom = textoCsv.charCodeAt(0) === 0xfeff ? textoCsv.slice(1) : textoCsv; // marca BOM de Excel
  const limpio = sinBom.replace(/^sep=.\r?\n/i, '');
  const primera = limpio.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const sep = [';', ',', '\t', '|'].map((s) => ({ s, n: primera.split(s).length - 1 })).sort((a, b) => b.n - a.n)[0];
  const d = sep && sep.n > 0 ? sep.s : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === d) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim()));
}

export interface FilaArchivoDrive {
  /** Número de fila en el archivo (como lo ve quien lo abre). */
  fila: number;
  oc: string;
  referencia: string;
  montoBs: number | null;
  montoTexto: string;
  errores: string[];
  /** Fila sin código, referencia ni monto (saldos, totales, renglones vacíos): no cuenta. */
  ignorada: boolean;
  fecha?: string;
  movimiento?: 'salida' | 'entrada';
  descripcion?: string;
  cuenta?: string;
  origen?: string;
  destino?: string;
}

export interface LecturaDrive {
  tipo?: TipoArchivoDrive;
  columnas: ColumnasDrive;
  encabezados: string[];
  filas: FilaArchivoDrive[];
}

/* ─────────────── Detección de Tipo de Archivo ─────────────── */

function esEncabezadoLibroMayor(row: unknown[]): boolean {
  const claves = row.map(claveEncabezado);
  const tieneNombreDesc = claves.some((k) => k.includes('nombredescripcion') || k === 'nombreydescripcion');
  const tieneDesc = tieneNombreDesc || claves.some((k) => k === 'descripcion' || k === 'concepto' || k === 'detalle');
  const tieneMov = claves.some((k) => k === 'movimiento' || k === 'tipomovimiento');
  const tieneDesdeHacia = claves.some((k) => k.includes('desdeproviene') || k.includes('haciadestino') || k === 'desde' || k === 'hacia');
  const tieneBsSalidas = claves.some((k) => k.includes('bssalidas') || k.includes('bsentradas'));
  const tieneResumenDiario = claves.some((k) => k.includes('tasausdt') || k.includes('totalalatasausdt') || k.includes('bancodedondesaleelcapture'));

  if (tieneNombreDesc) return true;
  if (tieneDesc && (tieneMov || tieneDesdeHacia || tieneBsSalidas || tieneResumenDiario)) return true;
  if (tieneBsSalidas && (tieneResumenDiario || tieneDesdeHacia)) return true;
  return false;
}

export function encontrarFilaEncabezadosLibroMayor(matriz: unknown[][]): number {
  const limite = Math.min(matriz.length, 25);
  for (let i = 0; i < limite; i++) {
    if (esEncabezadoLibroMayor(matriz[i] ?? [])) return i;
  }
  return -1;
}

/**
 * Detecta si la matriz es:
 *   a) 'estandar': tiene columnas 'Codigo OC', 'Referencia', 'Monto Bs'.
 *   b) 'libro_mayor': extracto del Drive/banco con columnas como 'fecha', 'movimiento',
 *      'moneda', 'monto', 'nombre @ descripcion', o 'bs salidas', 'nombre @ descripcion'.
 */
export function detectarTipoArchivoDrive(matriz: unknown[][]): TipoArchivoDrive {
  if (!matriz || !matriz.length) return 'desconocido';
  const limite = Math.min(matriz.length, 25);
  for (let i = 0; i < limite; i++) {
    if (esEncabezadoLibroMayor(matriz[i] ?? [])) return 'libro_mayor';
  }
  for (let i = 0; i < limite; i++) {
    const c = detectarColumnas(matriz[i] ?? []);
    if (c.monto >= 0 && (c.oc >= 0 || c.referencia >= 0)) return 'estandar';
  }
  return 'desconocido';
}

/* ─────────────── Libro Mayor / Caja del Drive ─────────────── */

export interface ColumnasLibroMayor {
  fecha: number;
  movimiento: number;
  moneda: number;
  monto: number;
  montoSalidas: number;
  montoEntradas: number;
  descripcion: number;
  desde: number;
  hacia: number;
  clasificacion: number;
  subclasificacion: number;
  referencia: number;
  banco: number;
}

export function detectarColumnasLibroMayor(encabezados: unknown[]): ColumnasLibroMayor {
  const claves = encabezados.map(claveEncabezado);
  const buscar = (alias: string[]) => {
    for (const a of alias) {
      const i = claves.findIndex((k) => k === a || k.includes(a));
      if (i >= 0) return i;
    }
    return -1;
  };

  const descripcion = buscar(['nombredescripcion', 'nombreydescripcion', 'descripcion', 'concepto', 'detalle', 'beneficiario', 'nombre']);
  const fecha = buscar(['fechadepago', 'fechapago', 'fecha', 'date', 'fec']);
  const movimiento = buscar(['tipodemovimiento', 'tipomovimiento', 'movimiento', 'operacion']);
  const moneda = buscar(['moneda', 'divisa', 'currency']);
  const montoSalidas = buscar(['bssalidas', 'salidasbs', 'salidas', 'debito', 'debe', 'cargo', 'egreso', 'egresos']);
  const montoEntradas = buscar(['bsentradas', 'entradasbs', 'entradas', 'credito', 'haber', 'abono', 'ingreso', 'ingresos']);
  const monto = buscar(['montobs', 'montoenbs', 'monto', 'importebs', 'importe', 'totalbs', 'total']);
  const desde = buscar(['desdeproviene', 'cuentaorigen', 'desde', 'proviene', 'origen']);
  const hacia = buscar(['haciadestino', 'cuentadestino', 'destinatario', 'hacia', 'destino']);
  const clasificacion = buscar(['clasificaciondegasto', 'clasificacion', 'categoria', 'rubro']);
  const subclasificacion = buscar(['subclasificacion', 'subcategoria', 'subrubro']);
  const referencia = buscar(['referenciabancaria', 'refbancaria', 'referencia', 'nroreferencia', 'ref', 'comprobante']);
  const banco = buscar(['bancodedondesaleelcapture', 'bancocapture', 'banco']);

  return {
    fecha, movimiento, moneda, monto, montoSalidas, montoEntradas,
    descripcion, desde, hacia, clasificacion, subclasificacion, referencia, banco,
  };
}

export interface DatosFilaLibroMayor {
  desde: string;
  hacia: string;
  moneda: string;
  banco: string;
  descripcion: string;
  clasificacion: string;
  subclasificacion: string;
}

/**
 * Valida si la fila pertenece exclusivamente a Golden Touch (GT) y no debe excluirse.
 * Excluye:
 *   · comisiones bancarias
 *   · traspasos internos entre cuentas propias
 *   · gastos personales de directiva (Cheli personal, Bethania...)
 *   · viáticos de choferes
 *   · compras de casiterita/mineras
 *   · movimientos estrictos de MGG sin mención a GT
 */
export function esFilaGoldenTouch(d: DatosFilaLibroMayor): { valida: boolean; motivo?: string } {
  const sinAcentosTexto = (s: string) => sinAcentos(String(s || '')).toUpperCase();
  const desc = sinAcentosTexto(d.descripcion);
  const clasif = sinAcentosTexto(d.clasificacion);
  const subclasif = sinAcentosTexto(d.subclasificacion);
  const hacia = sinAcentosTexto(d.hacia);
  const desde = sinAcentosTexto(d.desde);
  const moneda = sinAcentosTexto(d.moneda);
  const banco = sinAcentosTexto(d.banco);

  const todo = `${desc} ${clasif} ${subclasif} ${hacia} ${desde} ${moneda} ${banco}`;

  // 1. Exclusiones de gastos no conciliables
  if (/\bCOMISI[OÓ]N(\s*BANCARIA)?\b|\bGASTO\s*BANCARIO\b|\bDEBITO\s*BANCARIO\b/i.test(todo)) {
    return { valida: false, motivo: 'comision_bancaria' };
  }
  if (/\bTRASPASO\b|TRANSFERENCIA\s+ENTRE\s+CUENTAS|\bFONDEO\b|\bENTRE\s+CUENTAS\b|CAMBIO\s+DE\s+DIVISA|\bCUENTAS\s+PROPIAS\b/i.test(todo)) {
    return { valida: false, motivo: 'traspaso_interno' };
  }
  if (/\bCHELI\b|\bBETHANIA\b|\bBETANIA\b|GASTO\s*PERSONAL/i.test(todo)) {
    return { valida: false, motivo: 'gasto_personal' };
  }
  if (/\bVI[AÁ]TICOS?\b|\bCHOFER(?:ES)?\b/i.test(todo)) {
    return { valida: false, motivo: 'viaticos_chofer' };
  }
  if (/\bCASITERITA\b|\bCOLT[AÁ]N\b|\bMINERA\b|\bMINER[IÍ]A\b|\bMINEROS?\b/i.test(todo)) {
    return { valida: false, motivo: 'casiterita_minera' };
  }

  // 2. Exclusión de movimientos exclusivos de MGG
  const tieneMgg = /MINERAL\s*GROUP|\bMGG\b/i.test(todo);
  const tieneGt = /GOLDEN\s*TOUCH|\bGT\b/i.test(todo);
  if (tieneMgg && !tieneGt) {
    return { valida: false, motivo: 'estrictamente_mgg' };
  }

  // 3. Inclusión Golden Touch: destino, origen, moneda, banco, descripción o clasificación
  const esGt = [hacia, desde, moneda, banco, desc, clasif].some((s) => /GOLDEN\s*TOUCH|\bGT\b/i.test(s));
  if (!esGt) {
    return { valida: false, motivo: 'no_es_gt' };
  }

  return { valida: true };
}

/* ─────────────── Parseo y Normalización de Códigos ─────────────── */

export interface InfoCodigoDoc {
  tipo: 'OC' | 'CS' | 'SERV' | 'OTRO';
  numero: number;
  anio?: number;
  raw: string;
}

export function parsearCodigoDoc(codigo: string): InfoCodigoDoc | null {
  const s = sinAcentos(codigo).trim().toUpperCase();
  const m = s.match(/^(?:PAGO\s+)?(ODC|OC|ORDEN(?:\s+DE\s+COMPRA)?|CD|CS|SERV|SERVICIO|OSV|SV)[-_#\s]*(?:(202\d)[-_])?0*(\d+)$/i);
  if (!m) {
    const mNum = s.match(/^#?0*(\d+)$/);
    if (mNum) return { tipo: 'OC', numero: Number(mNum[1]), raw: codigo };
    return null;
  }
  const pref = m[1].replace(/\s+/g, '');
  let tipo: InfoCodigoDoc['tipo'] = 'OC';
  if (/^(ODC|OC|ORDEN)/i.test(pref)) tipo = 'OC';
  else if (/^(CD|CS)/i.test(pref)) tipo = 'CS';
  else if (/^(SERV|SERVICIO|OSV|SV)/i.test(pref)) tipo = 'SERV';
  else tipo = 'OTRO';
  const anio = m[2] ? Number(m[2]) : undefined;
  const numero = Number(m[3]);
  return { tipo, numero, anio, raw: codigo };
}

/** Comprueba si dos códigos coinciden (ej. 'ODC 183' y 'OC-2026-0183'). */
export function coincidenCodigosDoc(a: string, b: string): boolean {
  if (normCodigo(a) === normCodigo(b)) return true;
  const pa = parsearCodigoDoc(a);
  const pb = parsearCodigoDoc(b);
  if (!pa || !pb) return false;
  if (pa.tipo !== pb.tipo) return false;
  if (pa.numero !== pb.numero) return false;
  if (pa.anio && pb.anio && pa.anio !== pb.anio) return false;
  return true;
}

/** Extrae órdenes individuales o agrupadas (ej. 'ODC 189 Y 191') de un texto. */
export function extraerCodigosDeDescripcion(textoDesc: string): { tipo: string; numero: number; raw: string }[] {
  const REGEX_ORDEN = /(?:PAGO\s+)?\b(ODC|OC|ORDEN(?:\s+DE\s+COMPRA)?|CS|SERV|OSV|SV)\s*[-#]?\s*(?:(?:202\d)[-_])?(\d+)((?:\s*(?:Y|E|AND|\/|,)\s*(?:(?:ODC|OC|ORDEN(?:\s+DE\s+COMPRA)?|CS|SERV|OSV|SV)\s*[-#]?\s*)?(?:(?:202\d)[-_])?\d+)*)/gi;
  const resultados: { tipo: string; numero: number; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = REGEX_ORDEN.exec(textoDesc)) !== null) {
    const rawPref = m[1].toUpperCase().replace(/\s+/g, '');
    let tipo = 'OC';
    if (/^(ODC|OC|ORDEN)/i.test(rawPref)) tipo = 'OC';
    else if (/^(CS|CD)/i.test(rawPref)) tipo = 'CS';
    else if (/^(SERV|OSV|SV)/i.test(rawPref)) tipo = 'SERV';

    const num1 = Number(m[2]);
    if (!resultados.some((r) => r.tipo === tipo && r.numero === num1)) {
      resultados.push({ tipo, numero: num1, raw: `${rawPref} ${num1}` });
    }

    if (m[3]) {
      const extraNums = [...m[3].matchAll(/\d+/g)].map((x) => Number(x[0]));
      for (const n of extraNums) {
        if (!resultados.some((r) => r.tipo === tipo && r.numero === n)) {
          resultados.push({ tipo, numero: n, raw: `${rawPref} ${n}` });
        }
      }
    }
  }
  return resultados;
}

/** Distribuye un monto total entre órdenes agrupadas usando montos esperados si están disponibles. */
function repartirMontos(
  total: number | null,
  codigos: string[],
  docsEsperados: (number | null)[],
): { codigo: string; montoBs: number | null }[] {
  if (total == null) return codigos.map((c, i) => ({ codigo: c, montoBs: docsEsperados[i] ?? null }));
  const n = codigos.length;
  if (n <= 1) return [{ codigo: codigos[0], montoBs: total }];

  const sumaEsperada = docsEsperados.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0;
  const todosTienenEsperado = docsEsperados.every((x) => x != null && x > 0);
  if (todosTienenEsperado && Math.abs(sumaEsperada - total) <= TOLERANCIA_BS) {
    return codigos.map((c, i) => ({ codigo: c, montoBs: docsEsperados[i] }));
  }

  let restante = total;
  let sinEsperado = 0;
  const montos: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const esp = docsEsperados[i];
    if (esp != null && esp > 0 && esp < restante) {
      montos.push(esp);
      restante -= esp;
    } else {
      montos.push(null);
      sinEsperado++;
    }
  }
  if (sinEsperado > 0) {
    const cadaUno = Math.round((restante / sinEsperado) * 100) / 100;
    for (let i = 0; i < n; i++) {
      if (montos[i] == null) montos[i] = cadaUno;
    }
  } else {
    const cadaUno = Math.round((total / n) * 100) / 100;
    return codigos.map((c) => ({ codigo: c, montoBs: cadaUno }));
  }
  return codigos.map((c, i) => ({ codigo: c, montoBs: montos[i] }));
}

/**
 * Extrae los movimientos válidos de Golden Touch a partir de un archivo Libro Mayor / Caja del Drive.
 */
export function extraerMovimientosLibroMayor(matriz: unknown[][], filasConciliacion: FilaConciliacion[] = []): FilaArchivoDrive[] {
  const inicio = encontrarFilaEncabezadosLibroMayor(matriz);
  if (inicio < 0) return [];
  const cols = detectarColumnasLibroMayor(matriz[inicio] ?? []);
  const salida: FilaArchivoDrive[] = [];

  for (let i = inicio + 1; i < matriz.length; i++) {
    const r = matriz[i] ?? [];
    if (!r.some((x) => texto(x))) continue;

    const descCol = cols.descripcion >= 0 ? cols.descripcion : cols.banco;
    const textoDesc = descCol >= 0 ? texto(r[descCol]) : '';
    const textoClasif = cols.clasificacion >= 0 ? texto(r[cols.clasificacion]) : '';
    const textoSubclasif = cols.subclasificacion >= 0 ? texto(r[cols.subclasificacion]) : '';
    const textoDesde = cols.desde >= 0 ? texto(r[cols.desde]) : '';
    const textoHacia = cols.hacia >= 0 ? texto(r[cols.hacia]) : '';
    const textoMoneda = cols.moneda >= 0 ? texto(r[cols.moneda]) : '';
    const textoBanco = cols.banco >= 0 ? texto(r[cols.banco]) : '';
    const textoMov = cols.movimiento >= 0 ? texto(r[cols.movimiento]) : '';
    const fechaRaw = cols.fecha >= 0 ? r[cols.fecha] : '';
    const fecha = normalizarFechaDrive(fechaRaw);

    const filtro = esFilaGoldenTouch({
      desde: textoDesde, hacia: textoHacia, moneda: textoMoneda,
      banco: textoBanco, descripcion: textoDesc, clasificacion: textoClasif,
      subclasificacion: textoSubclasif,
    });
    if (!filtro.valida) continue;

    let movimiento: 'salida' | 'entrada' = 'salida';
    if (cols.montoSalidas >= 0 && parseMontoBs(r[cols.montoSalidas]) != null) {
      movimiento = 'salida';
    } else if (cols.montoEntradas >= 0 && parseMontoBs(r[cols.montoEntradas]) != null) {
      movimiento = 'entrada';
    } else if (/entrada|ingreso|abono|credito|reintegro|descuento/i.test(textoMov)) {
      movimiento = 'entrada';
    } else {
      movimiento = 'salida';
    }

    let montoRaw: unknown = null;
    if (cols.montoSalidas >= 0 && r[cols.montoSalidas] !== '' && r[cols.montoSalidas] != null) {
      montoRaw = r[cols.montoSalidas];
    } else if (cols.montoEntradas >= 0 && r[cols.montoEntradas] !== '' && r[cols.montoEntradas] != null) {
      montoRaw = r[cols.montoEntradas];
    } else if (cols.monto >= 0 && r[cols.monto] !== '' && r[cols.monto] != null) {
      montoRaw = r[cols.monto];
    }

    let montoBs = parseMontoBs(montoRaw);
    if ((montoBs == null || montoBs === 0) && textoDesc) {
      const mDesc = textoDesc.match(/(?:BS\.?|VES)\s*([\d.,]+)|([\d.,]+)\s*(?:BS\.?|VES)/i);
      if (mDesc) montoBs = parseMontoBs(mDesc[1] || mDesc[2]);
    }
    const montoTextoOrig = montoBs != null ? fmtBs(montoBs) : texto(montoRaw);

    const textoBusqueda = cols.descripcion >= 0 && cols.banco >= 0 && cols.descripcion !== cols.banco
      ? `${textoDesc} ${textoBanco}`
      : (textoDesc || textoBanco);

    let referencia = '';
    const mRef = textoBusqueda.match(/(?:REF(?:ERENCIA)?|COMPROBANTE|OPERACION|OP)\s*[:#.-]?\s*([A-Za-z0-9]+)/i);
    if (mRef) referencia = mRef[1];
    else if (cols.referencia >= 0) referencia = texto(r[cols.referencia]);

    const codigos = extraerCodigosDeDescripcion(textoBusqueda);

    if (codigos.length === 0) {
      const ignorada = !referencia;
      const errores: string[] = [];
      if (!ignorada) {
        if (montoBs == null) errores.push('Monto Bs vacío o no numérico');
        else if (montoBs === 0) errores.push('Monto Bs en cero');
      }
      salida.push({
        fila: i + 1, oc: '', referencia, montoBs, montoTexto: montoTextoOrig,
        errores, ignorada, fecha, movimiento, descripcion: textoDesc,
        origen: textoDesde, destino: textoHacia, cuenta: textoMoneda || textoBanco,
      });
    } else if (codigos.length === 1) {
      const c = codigos[0];
      const doc = filasConciliacion.find((d) => coincidenCodigosDoc(d.codigo, c.raw) || (parsearCodigoDoc(d.codigo)?.tipo === c.tipo && parsearCodigoDoc(d.codigo)?.numero === c.numero));
      const codDoc = doc?.codigo ?? (c.tipo === 'OC' ? `OC-${c.numero}` : `${c.tipo}-${c.numero}`);
      const errores: string[] = [];
      if (montoBs == null) errores.push('Monto Bs vacío o no numérico');
      else if (montoBs === 0) errores.push('Monto Bs en cero');
      salida.push({
        fila: i + 1, oc: codDoc, referencia, montoBs, montoTexto: montoBs != null ? fmtBs(montoBs) : montoTextoOrig,
        errores, ignorada: false, fecha, movimiento, descripcion: textoDesc,
        origen: textoDesde, destino: textoHacia, cuenta: textoMoneda || textoBanco,
      });
    } else {
      // Múltiples órdenes agrupadas (ej. 'ODC 189 Y 191')
      const docs = codigos.map((c) =>
        filasConciliacion.find((d) => coincidenCodigosDoc(d.codigo, c.raw) || (parsearCodigoDoc(d.codigo)?.tipo === c.tipo && parsearCodigoDoc(d.codigo)?.numero === c.numero))
      );
      const montosEsperadosDocs = docs.map((d) => (d ? montosEsperados(d)[0] ?? null : null));
      const codigosFinales = codigos.map((c, idx) => docs[idx]?.codigo ?? (c.tipo === 'OC' ? `OC-${c.numero}` : `${c.tipo}-${c.numero}`));
      const distribucion = repartirMontos(montoBs, codigosFinales, montosEsperadosDocs);

      for (let k = 0; k < codigos.length; k++) {
        const item = distribucion[k];
        const errores: string[] = [];
        if (item.montoBs == null) errores.push('Monto Bs vacío o no numérico');
        else if (item.montoBs === 0) errores.push('Monto Bs en cero');
        salida.push({
          fila: i + 1, oc: item.codigo, referencia, montoBs: item.montoBs,
          montoTexto: item.montoBs != null ? fmtBs(item.montoBs) : montoTextoOrig,
          errores, ignorada: false, fecha, movimiento, descripcion: textoDesc,
          origen: textoDesde, destino: textoHacia, cuenta: textoMoneda || textoBanco,
        });
      }
    }
  }

  return salida;
}

/**
 * Lee la matriz (CSV o primera hoja del Excel). Detecta automáticamente si es estándar o libro mayor.
 */
export function leerMatrizDrive(matriz: unknown[][], filasConciliacion: FilaConciliacion[] = []): LecturaDrive {
  const tipo = detectarTipoArchivoDrive(matriz);

  if (tipo === 'libro_mayor') {
    const inicio = encontrarFilaEncabezadosLibroMayor(matriz);
    const encabezados = (matriz[inicio] ?? []).map((x) => texto(x));
    const cols = detectarColumnasLibroMayor(matriz[inicio] ?? []);
    const filas = extraerMovimientosLibroMayor(matriz, filasConciliacion);
    return {
      tipo: 'libro_mayor',
      columnas: {
        oc: cols.descripcion >= 0 ? cols.descripcion : cols.banco,
        referencia: cols.referencia >= 0 ? cols.referencia : (cols.descripcion >= 0 ? cols.descripcion : cols.banco),
        monto: cols.monto >= 0 ? cols.monto : (cols.montoSalidas >= 0 ? cols.montoSalidas : cols.montoEntradas),
      },
      encabezados,
      filas,
    };
  }

  let inicio = -1;
  let columnas: ColumnasDrive = { oc: -1, referencia: -1, monto: -1 };
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const c = detectarColumnas(matriz[i] ?? []);
    if (c.monto >= 0 && (c.oc >= 0 || c.referencia >= 0)) { inicio = i; columnas = c; break; }
  }
  if (inicio < 0) {
    throw new Error('No encontré las columnas. El archivo tiene que traer una columna de MONTO en Bs y al menos una de '
      + 'CÓDIGO OC o REFERENCIA (o ser un extracto de Libro Mayor / Caja del Drive con Nombre @ Descripción y Montos).');
  }
  const filas: FilaArchivoDrive[] = [];
  for (let i = inicio + 1; i < matriz.length; i++) {
    const r = matriz[i] ?? [];
    const oc = columnas.oc >= 0 ? texto(r[columnas.oc]).toUpperCase() : '';
    const referencia = columnas.referencia >= 0 ? texto(r[columnas.referencia]) : '';
    const crudo = r[columnas.monto];
    const montoTexto = texto(crudo);
    const montoBs = parseMontoBs(crudo);
    const errores: string[] = [];
    const ignorada = !oc && !referencia;
    if (!ignorada) {
      if (!montoTexto) errores.push('Monto Bs vacío');
      else if (montoBs == null) errores.push('Monto Bs no es un número');
      else if (montoBs === 0) errores.push('Monto Bs en cero');
    }
    filas.push({ fila: i + 1, oc, referencia, montoBs, montoTexto, errores, ignorada });
  }
  return { tipo: 'estandar', columnas, encabezados: (matriz[inicio] ?? []).map((x) => texto(x)), filas };
}

/* ─────────────── Cruce ─────────────── */

/**
 * ¿Es la misma referencia? Por sus dígitos (sin ceros a la izquierda): iguales, o una
 * termina con la otra si tienen 6 o más, o si una es de 4+ dígitos (como Tesorería) y la otra
 * es de 6 a 8 dígitos (como el banco).
 */
export function mismaReferencia(a: string, b: string): boolean {
  const da = digitos(a);
  const db = digitos(b);
  if (!da || !db) return !!alfanum(a) && alfanum(a) === alfanum(b);
  if (da === db) return true;
  const [corta, larga] = da.length <= db.length ? [da, db] : [db, da];
  return (corta.length >= 6 || (corta.length >= 4 && larga.length >= 6)) && larga.endsWith(corta);
}

/** El monto en Bs con que se compara: lo pagado en Bs; si no, el de la OC en Bs. */
export function montosEsperados(r: Pick<FilaConciliacion, 'pagadoBs' | 'totalBs'>): number[] {
  return [r.pagadoBs, r.totalBs].filter((x): x is number => x != null && Number.isFinite(x) && x > 0);
}

const coincideMonto = (monto: number, r: Pick<FilaConciliacion, 'pagadoBs' | 'totalBs'>, tol: number) =>
  montosEsperados(r).some((m) => Math.abs(m - monto) <= tol);

export type ResultadoFila = 'cuadra' | 'no_cuadra' | 'no_encontrada' | 'error' | 'ignorada';

export interface FilaCruce extends FilaArchivoDrive {
  resultado: ResultadoFila;
  detalle: string;
  /** Con qué documento de Conciliación se cruzó. */
  doc: { origen: OrigenDoc; ordenId: string; codigo: string } | null;
  /** Cómo se encontró: por código de OC o por referencia. */
  por: 'codigo' | 'referencia' | null;
}

export interface CruceDrive {
  total: number;
  cuadran: number;
  noCuadran: number;
  noEncontradas: number;
  conError: number;
  ignoradas: number;
  errorPorColumna: Record<string, number>;
  filas: FilaCruce[];
  /** Resultado por documento (clave origen:id), lo que se guarda en la columna DRIVE. */
  porDoc: Map<string, { origen: OrigenDoc; ordenId: string; codigo: string; estado: EstadoDrive; detalle: string }>;
  /** Como en Inventario: Error = hay filas con error y no se aplica. */
  estado: 'Validado' | 'Con observaciones' | 'Error';
}

function buscarDoc(f: FilaArchivoDrive, porCodigo: Map<string, FilaConciliacion>, filas: FilaConciliacion[], tol: number) {
  if (f.oc) {
    const direct = porCodigo.get(normCodigo(f.oc));
    if (direct) return { r: direct, por: 'codigo' as const, nota: null };
    const fuzzy = filas.filter((r) => coincidenCodigosDoc(f.oc, r.codigo));
    if (fuzzy.length === 1) return { r: fuzzy[0], por: 'codigo' as const, nota: null };
    if (fuzzy.length > 1) {
      const conMonto = f.montoBs == null ? [] : fuzzy.filter((r) => coincideMonto(f.montoBs as number, r, tol));
      if (conMonto.length === 1) return { r: conMonto[0], por: 'codigo' as const, nota: null };
      return { r: null, por: null, nota: `El código ${f.oc} coincide con varios documentos (${fuzzy.map((r) => r.codigo).join(', ')})` };
    }
  }
  if (f.referencia) {
    const conRef = filas.filter((r) => r.referencias.some((x) => mismaReferencia(x, f.referencia)));
    if (conRef.length === 1) return { r: conRef[0], por: 'referencia' as const, nota: null };
    if (conRef.length > 1) {
      const conMonto = f.montoBs == null ? [] : conRef.filter((r) => coincideMonto(f.montoBs as number, r, tol));
      if (conMonto.length === 1) return { r: conMonto[0], por: 'referencia' as const, nota: null };
      return { r: null, por: null, nota: `La referencia está en ${conRef.length} documentos (${conRef.slice(0, 3).map((r) => r.codigo).join(', ')}): pon el código de la OC` };
    }
  }
  return { r: null, por: null, nota: f.oc ? `No hay ningún documento ${f.oc} en Conciliación${f.referencia ? ' ni con esa referencia' : ''}` : 'No hay ningún pago con esa referencia en Conciliación' };
}

/** Cruza las filas del archivo con las de Conciliación. */
export function cruzarDrive(lectura: Pick<LecturaDrive, 'filas'>, filas: FilaConciliacion[], tol = TOLERANCIA_BS): CruceDrive {
  const porCodigo = new Map(filas.map((r) => [normCodigo(r.codigo), r]));
  const errorPorColumna: Record<string, number> = {};
  const salida: FilaCruce[] = [];
  const vinculadas = new Map<string, { r: FilaConciliacion; filas: FilaCruce[] }>();

  for (const f of lectura.filas) {
    if (f.ignorada) { salida.push({ ...f, resultado: 'ignorada', detalle: 'Sin código ni referencia: no se cruza', doc: null, por: null }); continue; }
    if (f.errores.length) {
      for (const e of f.errores) { const col = /monto/i.test(e) ? 'Monto Bs' : 'Otro'; errorPorColumna[col] = (errorPorColumna[col] ?? 0) + 1; }
      salida.push({ ...f, resultado: 'error', detalle: f.errores.join(' · '), doc: null, por: null });
      continue;
    }
    const { r, por, nota } = buscarDoc(f, porCodigo, filas, tol);
    if (!r) { salida.push({ ...f, resultado: 'no_encontrada', detalle: nota ?? 'No encontrada', doc: null, por: null }); continue; }
    const refOk = !!f.referencia && r.referencias.some((x) => mismaReferencia(x, f.referencia));
    const montoOk = coincideMonto(f.montoBs as number, r, tol);
    const motivos: string[] = [];
    if (!f.referencia) motivos.push('el archivo no trae la referencia');
    else if (!r.referencias.length) motivos.push('el pago no tiene referencia en el sistema');
    else if (!refOk) motivos.push(`la referencia ${f.referencia} no es la del pago (${r.referencias.join(', ')})`);
    if (!montoOk) {
      const esp = montosEsperados(r);
      motivos.push(esp.length ? `el monto ${fmtBs(f.montoBs as number)} no coincide con ${esp.map(fmtBs).join(' / ')}` : 'el documento no tiene monto en Bs');
    }
    const fila: FilaCruce = {
      ...f, doc: { origen: r.origen, ordenId: r.ordenId, codigo: r.codigo }, por,
      resultado: refOk && montoOk ? 'cuadra' : 'no_cuadra',
      detalle: refOk && montoOk ? `Referencia y monto coinciden (${por === 'codigo' ? 'por código' : 'por referencia'})` : `No cuadra: ${motivos.join('; ')}`,
    };
    salida.push(fila);
    const k = claveDoc(r.origen, r.ordenId);
    const v = vinculadas.get(k) ?? { r, filas: [] };
    v.filas.push(fila);
    vinculadas.set(k, v);
  }

  const porDoc: CruceDrive['porDoc'] = new Map();
  for (const [k, { r, filas: fs }] of vinculadas) {
    const yaCuadrada = r.drive?.estado === 'cuadra';
    const una = fs.find((x) => x.resultado === 'cuadra');
    const conRef = fs.filter((x) => !!x.referencia && r.referencias.some((y) => mismaReferencia(y, x.referencia)));
    const suma = conRef.reduce((a, x) => a + (x.montoBs ?? 0), 0);
    const partes = conRef.length > 1 && coincideMonto(suma, r, tol);
    const base = { origen: r.origen, ordenId: r.ordenId, codigo: r.codigo };
    if (una) porDoc.set(k, { ...base, estado: 'cuadra', detalle: `Ref. ${una.referencia} · ${fmtBs(una.montoBs as number)}` });
    else if (partes) {
      porDoc.set(k, { ...base, estado: 'cuadra', detalle: `${conRef.length} pagos (${conRef.map((x) => x.referencia).join(', ')}) suman ${fmtBs(suma)}` });
      for (const x of conRef) { x.resultado = 'cuadra'; x.detalle = `Cuadra junto con los otros pagos de ${r.codigo} (suman ${fmtBs(suma)})`; }
    } else if (yaCuadrada) {
      porDoc.set(k, { ...base, estado: 'cuadra', detalle: r.drive?.detalle ? `${r.drive.detalle} (ya conciliada previamente)` : 'Ya conciliada previamente' });
    } else porDoc.set(k, { ...base, estado: 'no_cuadra', detalle: fs[0].detalle.replace(/^No cuadra: /, '') });
  }

  const cuenta = (x: ResultadoFila) => salida.filter((f) => f.resultado === x).length;
  const conError = cuenta('error');
  const noCuadran = cuenta('no_cuadra');
  const noEncontradas = cuenta('no_encontrada');
  return {
    total: salida.filter((f) => f.resultado !== 'ignorada').length,
    cuadran: cuenta('cuadra'), noCuadran, noEncontradas, conError, ignoradas: cuenta('ignorada'),
    errorPorColumna, filas: salida, porDoc,
    estado: conError > 0 ? 'Error' : noCuadran > 0 || noEncontradas > 0 ? 'Con observaciones' : 'Validado',
  };
}

/** Plantilla CSV para el archivo del Drive. */
export const PLANTILLA_DRIVE_CSV = 'Codigo OC;Referencia;Monto Bs\nOC-2026-0001;123456789;1.250,00\n';
