/* ============================================================
   Golden Touch · Tesorería · Calendario Bancario de Venezuela
   ------------------------------------------------------------
   Superintendencia de las Instituciones del Sector Bancario
   (SUDEBAN) y Banco Central de Venezuela (BCV).

   En Venezuela, cuando un día es feriado bancario («Lunes Bancario»
   o feriado nacional bancario), los bancos no operan y el BCV no
   realiza mesas de cambio interbancarias.
   La tasa publicada el día hábil anterior (generalmente el viernes)
   sale con «Fecha Valor» del PRÓXIMO DÍA HÁBIL BANCARIO (por ejemplo,
   el martes siguiente si el lunes es bancario).

   Esta utilidad centraliza el calendario bancario oficial de SUDEBAN,
   la sincronización opcional con APIs de feriados y el cálculo
   automático del próximo día hábil para la tasa del BCV.
   ============================================================ */

/** Feriados bancarios oficiales y Lunes Bancarios de SUDEBAN (Venezuela). */
export const FERIADOS_BANCARIOS_VE: Record<string, string> = {
  // ─── 2025 ──────────────────────────────────────────
  '2025-01-01': 'Año Nuevo (Feriado Nacional)',
  '2025-01-06': 'Día de Reyes (Lunes Bancario)',
  '2025-03-03': 'Lunes de Carnaval (Feriado Nacional)',
  '2025-03-04': 'Martes de Carnaval (Feriado Nacional)',
  '2025-03-19': 'Día de San José (Feriado Bancario)',
  '2025-04-17': 'Jueves Santo (Feriado Nacional)',
  '2025-04-18': 'Viernes Santo (Feriado Nacional)',
  '2025-04-19': 'Declaración de la Independencia (Feriado Nacional)',
  '2025-05-01': 'Día del Trabajador (Feriado Nacional)',
  '2025-06-02': 'Ascensión del Señor (Lunes Bancario)',
  '2025-06-23': 'Corpus Christi (Lunes Bancario)',
  '2025-06-24': 'Batalla de Carabobo (Feriado Nacional)',
  '2025-06-30': 'San Pedro y San Pablo (Lunes Bancario)',
  '2025-07-05': 'Día de la Independencia (Feriado Nacional)',
  '2025-07-24': 'Natalicio de Simón Bolívar (Feriado Nacional)',
  '2025-08-18': 'Asunción de Nuestra Señora (Lunes Bancario)',
  '2025-09-15': 'Virgen del Valle (Lunes Bancario)',
  '2025-10-12': 'Día de la Resistencia Indígena (Feriado Nacional)',
  '2025-10-20': 'Dr. José Gregorio Hernández (Lunes Bancario)',
  '2025-11-03': 'Día de Todos los Santos (Lunes Bancario)',
  '2025-11-24': 'Virgen del Rosario de Chiquinquirá (Lunes Bancario)',
  '2025-12-08': 'Inmaculada Concepción (Feriado Bancario)',
  '2025-12-24': 'Feriado Bancario (Víspera de Navidad)',
  '2025-12-25': 'Natividad de Nuestro Señor (Feriado Nacional)',
  '2025-12-31': 'Feriado Bancario (Fin de Año)',

  // ─── 2026 (Año Actual) ──────────────────────────────
  '2026-01-01': 'Año Nuevo (Feriado Nacional)',
  '2026-01-12': 'Día de Reyes (Lunes Bancario)',
  '2026-02-16': 'Lunes de Carnaval (Feriado Nacional)',
  '2026-02-17': 'Martes de Carnaval (Feriado Nacional)',
  '2026-03-23': 'Día de San José (Lunes Bancario)',
  '2026-04-02': 'Jueves Santo (Feriado Nacional)',
  '2026-04-03': 'Viernes Santo (Feriado Nacional)',
  '2026-04-19': 'Declaración de la Independencia (Feriado Nacional)',
  '2026-05-01': 'Día del Trabajador (Feriado Nacional)',
  '2026-05-18': 'Ascensión del Señor (Lunes Bancario)',
  '2026-06-08': 'Corpus Christi (Lunes Bancario)',
  '2026-06-15': 'Día de San Antonio (Lunes Bancario)',
  '2026-06-24': 'Batalla de Carabobo (Feriado Nacional)',
  '2026-06-29': 'Día de San Pedro y San Pablo (Lunes Bancario)',
  '2026-07-05': 'Día de la Independencia (Feriado Nacional)',
  '2026-07-24': 'Natalicio de Simón Bolívar (Feriado Nacional)',
  '2026-08-17': 'Asunción de Nuestra Señora (Lunes Bancario)',
  '2026-09-14': 'Día de la Virgen del Valle (Lunes Bancario)',
  '2026-10-12': 'Día de la Resistencia Indígena (Feriado Nacional)',
  '2026-10-26': 'Día del Dr. José Gregorio Hernández (Lunes Bancario)',
  '2026-11-02': 'Día de Todos los Santos (Lunes Bancario)',
  '2026-11-23': 'Día de la Virgen del Rosario de Chiquinquirá (Lunes Bancario)',
  '2026-12-14': 'Día de la Inmaculada Concepción (Lunes Bancario)',
  '2026-12-24': 'Feriado Bancario (Víspera de Navidad)',
  '2026-12-25': 'Natividad de Nuestro Señor (Feriado Nacional)',
  '2026-12-31': 'Feriado Bancario (Fin de Año)',

  // ─── 2027 ──────────────────────────────────────────
  '2027-01-01': 'Año Nuevo (Feriado Nacional)',
  '2027-01-11': 'Día de Reyes (Lunes Bancario)',
  '2027-02-08': 'Lunes de Carnaval (Feriado Nacional)',
  '2027-02-09': 'Martes de Carnaval (Feriado Nacional)',
  '2027-03-15': 'Día de San José (Lunes Bancario)',
  '2027-03-25': 'Jueves Santo (Feriado Nacional)',
  '2027-03-26': 'Viernes Santo (Feriado Nacional)',
  '2027-04-19': 'Declaración de la Independencia (Feriado Nacional)',
  '2027-05-01': 'Día del Trabajador (Feriado Nacional)',
  '2027-05-10': 'Ascensión del Señor (Lunes Bancario)',
  '2027-05-31': 'Corpus Christi (Lunes Bancario)',
  '2027-06-14': 'Día de San Antonio (Lunes Bancario)',
  '2027-06-24': 'Batalla de Carabobo (Feriado Nacional)',
  '2027-06-28': 'Día de San Pedro y San Pablo (Lunes Bancario)',
  '2027-07-05': 'Día de la Independencia (Feriado Nacional)',
  '2027-07-24': 'Natalicio de Simón Bolívar (Feriado Nacional)',
  '2027-08-16': 'Asunción de Nuestra Señora (Lunes Bancario)',
  '2027-09-13': 'Día de la Virgen del Valle (Lunes Bancario)',
  '2027-10-12': 'Día de la Resistencia Indígena (Feriado Nacional)',
  '2027-10-25': 'Día del Dr. José Gregorio Hernández (Lunes Bancario)',
  '2027-11-01': 'Día de Todos los Santos (Lunes Bancario)',
  '2027-11-22': 'Día de la Virgen del Rosario de Chiquinquirá (Lunes Bancario)',
  '2027-12-13': 'Día de la Inmaculada Concepción (Lunes Bancario)',
  '2027-12-24': 'Feriado Bancario (Víspera de Navidad)',
  '2027-12-25': 'Natividad de Nuestro Señor (Feriado Nacional)',
  '2027-12-31': 'Feriado Bancario (Fin de Año)',
};

/** Almacenamiento en memoria para feriados sincronizados por API. */
const feriadosDinamicos: Map<string, string> = new Map();

/** Registra o sincroniza un feriado en caliente. */
export function registrarFeriadoBancario(fechaISO: string, motivo: string): void {
  const f = fechaISO.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    feriadosDinamicos.set(f, motivo.trim());
  }
}

/** ¿Es un feriado bancario o Lunes Bancario oficial de Venezuela? */
export function esFeriadoBancario(fechaISO: string): boolean {
  const f = fechaISO.slice(0, 10);
  return Boolean(feriadosDinamicos.get(f) || FERIADOS_BANCARIOS_VE[f]);
}

/** Motivo del feriado bancario, o null si es día bancario normal. */
export function motivoFeriadoBancario(fechaISO: string): string | null {
  const f = fechaISO.slice(0, 10);
  return feriadosDinamicos.get(f) || FERIADOS_BANCARIOS_VE[f] || null;
}

/** ¿Cae en fin de semana (sábado o domingo)? */
export function esFinDeSemana(fechaISO: string): boolean {
  const parts = fechaISO.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return false;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = dt.getUTCDay();
  return day === 0 || day === 6; // 0 = Domingo, 6 = Sábado
}

/**
 * ¿Es un día no hábil para la banca venezolana (fin de semana o feriado bancario)?
 */
export function esDiaNoBancario(fechaISO: string): boolean {
  return esFinDeSemana(fechaISO) || esFeriadoBancario(fechaISO);
}

/**
 * Calcula el siguiente día hábil bancario a partir de una fecha YYYY-MM-DD.
 * Si hoy es lunes bancario, avanza hasta el martes (o el siguiente día hábil si hay puente).
 */
export function proximoDiaHabilBancario(fechaISO: string): string {
  const parts = fechaISO.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return fechaISO;
  const [y, m, d] = parts;
  const cur = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  for (let i = 0; i < 15; i++) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const iso = cur.toISOString().slice(0, 10);
    if (!esDiaNoBancario(iso)) {
      return iso;
    }
  }
  return fechaISO;
}

export interface InfoDiaBancario {
  fecha: string;
  esBancario: boolean;
  esFinDeSemana: boolean;
  esFeriado: boolean;
  motivo: string | null;
  /** El día hábil efectivo a tomar para la tasa del BCV */
  fechaEfectivaBcv: string;
}

/**
 * Determina si la fecha dada es un día bancario y qué fecha de tasa BCV le corresponde.
 */
export function infoDiaBancario(fechaISO: string): InfoDiaBancario {
  const f = fechaISO.slice(0, 10);
  const finSemana = esFinDeSemana(f);
  const feriado = esFeriadoBancario(f);
  const esNoBanc = finSemana || feriado;
  const motivo = motivoFeriadoBancario(f) ?? (finSemana ? 'Fin de semana' : null);
  const fechaEfectiva = esNoBanc ? proximoDiaHabilBancario(f) : f;

  return {
    fecha: f,
    esBancario: esNoBanc,
    esFinDeSemana: finSemana,
    esFeriado: feriado,
    motivo,
    fechaEfectivaBcv: fechaEfectiva,
  };
}

export interface FeriadoBancario {
  fecha: string; // YYYY-MM-DD
  motivo: string;
  tipo: 'bancario' | 'nacional';
  diaNombre: string;
  fechaEfectivaBcv: string;
  diaEfectivoNombre: string;
}

/** Nombre del día de la semana en español a partir de YYYY-MM-DD. */
export function diaSemanaNombre(fechaISO: string): string {
  const parts = fechaISO.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return dias[dt.getUTCDay()] ?? '';
}

/** Devuelve la lista ordenada de feriados bancarios y nacionales SUDEBAN (opcionalmente filtrados por año). */
export function listarFeriadosSudeban(anio?: number): FeriadoBancario[] {
  const anioStr = anio ? String(anio) : null;
  const mapa = new Map<string, string>();
  for (const [f, m] of Object.entries(FERIADOS_BANCARIOS_VE)) {
    if (!anioStr || f.startsWith(anioStr)) mapa.set(f, m);
  }
  for (const [f, m] of feriadosDinamicos.entries()) {
    if (!anioStr || f.startsWith(anioStr)) mapa.set(f, m);
  }
  const lista: FeriadoBancario[] = [];
  for (const [fecha, motivo] of mapa.entries()) {
    const esNac = /nacional/i.test(motivo);
    const fechaEfectiva = proximoDiaHabilBancario(fecha);
    lista.push({
      fecha,
      motivo: motivo.replace(/\s*\((Feriado Nacional|Lunes Bancario|Feriado Bancario|Víspera de Navidad|Fin de Año)\)\s*/gi, '').trim() || motivo,
      tipo: esNac ? 'nacional' : 'bancario',
      diaNombre: diaSemanaNombre(fecha),
      fechaEfectivaBcv: fechaEfectiva,
      diaEfectivoNombre: diaSemanaNombre(fechaEfectiva),
    });
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Intenta sincronizar el calendario bancario conectando a API externa de feriados de Venezuela.
 * Si la API no está disponible o falla, el calendario integrado de SUDEBAN asegura funcionamiento 100%.
 */
export async function sincronizarCalendarioBancarioApi(year?: number): Promise<void> {
  const anio = year ?? new Date().getFullYear();
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${anio}/VE`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as Array<{ date?: string; localName?: string; name?: string }>;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.date) {
          const motivo = item.localName || item.name || 'Feriado Nacional';
          registrarFeriadoBancario(item.date, `${motivo} (Feriado Nacional)`);
        }
      }
    }
  } catch {
    // Modo offline / sin red: el diccionario FERIADOS_BANCARIOS_VE cubre todo el periodo
  }
}
