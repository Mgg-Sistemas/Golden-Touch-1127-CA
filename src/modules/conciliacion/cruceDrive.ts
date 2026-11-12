/* ============================================================
   Conciliación · cruce con el archivo del DRIVE (12/11/2026). Lógica pura.

   Se carga un CSV o Excel (el del Drive / banco) con el código de la OC, la
   referencia y el monto en Bs. Se valida como la importación de Inventario
   (resumen, errores por columna y detalle por fila) y se cruza:
     · primero por CÓDIGO de OC; si no viene o no existe, por REFERENCIA;
     · CUADRA si la referencia coincide con la del pago Y el monto en Bs coincide
       (con una tolerancia de 1 Bs por redondeo); si no, NO CUADRA.
   Varias filas de la misma OC con su referencia (pago en partes) cuadran si la
   suma da el monto. Lo que no está en el archivo queda como estaba.
   ============================================================ */
import { claveDoc, type EstadoDrive, type FilaConciliacion, type OrigenDoc } from './conciliacion';

export const TOLERANCIA_BS = 1;

export const ETIQUETA_DRIVE: Record<EstadoDrive, string> = { cuadra: 'CUADRA', no_cuadra: 'NO CUADRA' };

/* ─────────────── Lectura ─────────────── */

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const claveEncabezado = (s: unknown) => sinAcentos(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Encabezados que se reconocen (sin acentos, espacios ni signos), por prioridad. */
const ALIAS: Record<'oc' | 'referencia' | 'monto', string[]> = {
  oc: ['codigooc', 'codigodeoc', 'oc', 'nrooc', 'numerooc', 'noc', 'ordendecompra', 'ordencompra', 'orden', 'codigo', 'documento', 'nrodocumento'],
  referencia: ['referencia', 'ref', 'nroreferencia', 'numeroreferencia', 'nrodereferencia', 'numerodereferencia', 'nref', 'referenciabancaria',
    'refbancaria', 'referenciadepago', 'referenciapago', 'operacion', 'nrooperacion', 'numerooperacion', 'nrodeoperacion', 'comprobante'],
  monto: ['montobs', 'montoenbs', 'montobolivares', 'montoenbolivares', 'bs', 'bolivares', 'monto', 'importebs', 'importe', 'totalbs', 'total',
    'montopagado', 'montototal', 'debito', 'debe', 'cargo', 'credito', 'haber', 'abono'],
};

export interface ColumnasDrive { oc: number; referencia: number; monto: number }

/** Dónde está cada columna en la fila de encabezados (-1 = no está). */
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
export function parsearCsv(texto: string): string[][] {
  const sinBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto; // marca BOM de Excel
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

const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

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
}

export interface LecturaDrive {
  columnas: ColumnasDrive;
  encabezados: string[];
  filas: FilaArchivoDrive[];
}

/**
 * Lee la matriz (CSV o la primera hoja del Excel). Busca la fila de encabezados en las
 * primeras 15 (un estado de cuenta suele traer el banco y la cuenta arriba).
 */
export function leerMatrizDrive(matriz: unknown[][]): LecturaDrive {
  let inicio = -1;
  let columnas: ColumnasDrive = { oc: -1, referencia: -1, monto: -1 };
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const c = detectarColumnas(matriz[i] ?? []);
    if (c.monto >= 0 && (c.oc >= 0 || c.referencia >= 0)) { inicio = i; columnas = c; break; }
  }
  if (inicio < 0) {
    throw new Error('No encontré las columnas. El archivo tiene que traer una columna de MONTO en Bs y al menos una de '
      + 'CÓDIGO OC o REFERENCIA (por ejemplo: «Código OC», «Referencia», «Monto Bs»).');
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
  return { columnas, encabezados: (matriz[inicio] ?? []).map((x) => texto(x)), filas };
}

/* ─────────────── Cruce ─────────────── */

const normCodigo = (s: string) => s.toUpperCase().replace(/\s+/g, '');
const digitos = (s: string) => s.replace(/\D+/g, '').replace(/^0+/, '');
const alfanum = (s: string) => sinAcentos(s).toUpperCase().replace(/[^A-Z0-9]+/g, '');

/**
 * ¿Es la misma referencia? Por sus dígitos (sin ceros a la izquierda): iguales, o una
 * termina con la otra si tienen 6 o más (el banco a veces muestra solo los últimos).
 * «Bs 00123456», «123456» y «REF-123456» son la misma.
 */
export function mismaReferencia(a: string, b: string): boolean {
  const da = digitos(a);
  const db = digitos(b);
  if (!da || !db) return !!alfanum(a) && alfanum(a) === alfanum(b);
  if (da === db) return true;
  const [corta, larga] = da.length <= db.length ? [da, db] : [db, da];
  return corta.length >= 6 && larga.endsWith(corta);
}

/** El monto en Bs con que se compara: lo pagado en Bs; si no, el de la OC en Bs. */
export function montosEsperados(r: Pick<FilaConciliacion, 'pagadoBs' | 'totalBs'>): number[] {
  return [r.pagadoBs, r.totalBs].filter((x): x is number => x != null && Number.isFinite(x) && x > 0);
}

const coincideMonto = (monto: number, r: Pick<FilaConciliacion, 'pagadoBs' | 'totalBs'>, tol: number) =>
  montosEsperados(r).some((m) => Math.abs(m - monto) <= tol);

const fmtBs = (n: number) => `Bs ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    const r = porCodigo.get(normCodigo(f.oc));
    if (r) return { r, por: 'codigo' as const, nota: null };
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
    const una = fs.find((x) => x.resultado === 'cuadra');
    const conRef = fs.filter((x) => !!x.referencia && r.referencias.some((y) => mismaReferencia(y, x.referencia)));
    const suma = conRef.reduce((a, x) => a + (x.montoBs ?? 0), 0);
    const partes = conRef.length > 1 && coincideMonto(suma, r, tol);
    const base = { origen: r.origen, ordenId: r.ordenId, codigo: r.codigo };
    if (una) porDoc.set(k, { ...base, estado: 'cuadra', detalle: `Ref. ${una.referencia} · ${fmtBs(una.montoBs as number)}` });
    else if (partes) {
      porDoc.set(k, { ...base, estado: 'cuadra', detalle: `${conRef.length} pagos (${conRef.map((x) => x.referencia).join(', ')}) suman ${fmtBs(suma)}` });
      for (const x of conRef) { x.resultado = 'cuadra'; x.detalle = `Cuadra junto con los otros pagos de ${r.codigo} (suman ${fmtBs(suma)})`; }
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
