/* ============================================================
   Golden Touch · Usuarios · Resumen de Actividad (supervisión)
   Qué usuarios se conectan y cuánto tiempo duran en el sistema.
   Se nutre de `sesiones_usuario` (latido cada 60 s desde la app).
   "Conectado" = su último latido es de hace menos de 3 min.
   Exporta a PDF con vista previa.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { previewPdf } from '@/shared/lib/reportePreview';

/** Una sesión está "conectada" si latió en los últimos 3 minutos (latido = 60 s). */
const VENTANA_CONECTADO_MS = 3 * 60 * 1000;

export interface SesionRow {
  id: string;
  user_id: string;
  email: string;
  nombre: string;
  inicio: string;
  ultimo_latido: string;
  duracionMin: number;   // ultimo_latido − inicio (minutos)
  conectado: boolean;
}

export interface UsuarioActividad {
  user_id: string;
  nombre: string;
  email: string;
  sesiones: number;
  totalMin: number;
  conectado: boolean;
  ultimaActividad: string;
}

interface SesionRaw {
  id: string; user_id: string; email: string | null; nombre: string | null;
  inicio: string; ultimo_latido: string;
}

function aRow(s: SesionRaw, ahora: number): SesionRow {
  const ini = new Date(s.inicio).getTime();
  const fin = new Date(s.ultimo_latido).getTime();
  return {
    id: s.id,
    user_id: s.user_id,
    email: s.email ?? '',
    nombre: s.nombre || s.email || '—',
    inicio: s.inicio,
    ultimo_latido: s.ultimo_latido,
    duracionMin: Math.max(0, Math.round((fin - ini) / 60000)),
    conectado: ahora - fin < VENTANA_CONECTADO_MS,
  };
}

/** Sesiones iniciadas en el rango (fechas YYYY-MM-DD o null = todo). */
export async function listSesiones(desde: string | null, hasta: string | null): Promise<SesionRow[]> {
  let q = supabase
    .from('sesiones_usuario')
    .select('id, user_id, email, nombre, inicio, ultimo_latido')
    .order('ultimo_latido', { ascending: false });
  if (desde) q = q.gte('inicio', `${desde}T00:00:00`);
  if (hasta) q = q.lte('inicio', `${hasta}T23:59:59.999`);
  const { data, error } = await q;
  if (error) throw error;
  const ahora = Date.now();
  return ((data ?? []) as SesionRaw[]).map((s) => aRow(s, ahora));
}

/** Solo lo que está conectado AHORA (último latido < 3 min), uno por usuario. */
export async function usuariosConectados(): Promise<SesionRow[]> {
  const desdeIso = new Date(Date.now() - VENTANA_CONECTADO_MS).toISOString();
  const { data, error } = await supabase
    .from('sesiones_usuario')
    .select('id, user_id, email, nombre, inicio, ultimo_latido')
    .gte('ultimo_latido', desdeIso)
    .order('ultimo_latido', { ascending: false });
  if (error) throw error;
  const ahora = Date.now();
  const vistos = new Set<string>();
  const out: SesionRow[] = [];
  for (const s of (data ?? []) as SesionRaw[]) {
    if (vistos.has(s.user_id)) continue;   // la sesión más reciente por usuario
    vistos.add(s.user_id);
    out.push(aRow(s, ahora));
  }
  return out;
}

/** Acumula por usuario: nº de sesiones y tiempo total en el sistema. */
export function resumenPorUsuario(rows: SesionRow[]): UsuarioActividad[] {
  const map = new Map<string, UsuarioActividad>();
  for (const r of rows) {
    const cur = map.get(r.user_id) ?? {
      user_id: r.user_id, nombre: r.nombre, email: r.email,
      sesiones: 0, totalMin: 0, conectado: false, ultimaActividad: r.ultimo_latido,
    };
    cur.sesiones += 1;
    cur.totalMin += r.duracionMin;
    cur.conectado = cur.conectado || r.conectado;
    if (r.ultimo_latido > cur.ultimaActividad) cur.ultimaActividad = r.ultimo_latido;
    map.set(r.user_id, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.totalMin - a.totalMin);
}

/** "2h 15m" / "45m" a partir de minutos. */
export function fmtDuracion(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0) return `${h}h ${r}m`;
  return `${r}m`;
}

export function rangoLabel(desde: string | null, hasta: string | null): string {
  if (desde && hasta) return `Del ${desde} al ${hasta}`;
  if (desde) return `Desde ${desde}`;
  if (hasta) return `Hasta ${hasta}`;
  return 'Todo el período';
}

/* ──────────── PDF (vista previa) ──────────── */
async function construirPdf(conectados: SesionRow[], porUsuario: UsuarioActividad[], sesiones: SesionRow[], desde: string | null, hasta: string | null) {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const MARGIN = 42.52;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 46, 46); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 60 : MARGIN;
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Resumen de actividad de usuarios', tx, y + 18);
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${fmt.dateTime(new Date().toISOString())} · ${rangoLabel(desde, hasta)}`, tx, y + 33);
  doc.setTextColor(0, 0, 0);
  y += 60;

  const lastY = () => {
    // @ts-expect-error plugin
    return (doc.lastAutoTable?.finalY ?? y);
  };

  // Conectados ahora
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`Conectados ahora · ${conectados.length}`, MARGIN, y);
  autoTable(doc, {
    startY: y + 6,
    head: [['Usuario', 'Correo', 'Conectado desde', 'Tiempo en sistema', 'Última actividad']],
    body: conectados.length
      ? conectados.map((s) => [s.nombre, s.email, fmt.dateTime(s.inicio), fmtDuracion(s.duracionMin), fmt.dateTime(s.ultimo_latido)])
      : [['—', 'Nadie conectado en este momento', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 3 },
    margin: MARGIN,
  });
  y = lastY() + 16;

  // Por usuario
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Tiempo por usuario', MARGIN, y);
  autoTable(doc, {
    startY: y + 6,
    head: [['Usuario', 'Correo', 'Sesiones', 'Tiempo total', 'Estado']],
    body: porUsuario.map((u) => [u.nombre, u.email, String(u.sesiones), fmtDuracion(u.totalMin), u.conectado ? 'Conectado' : '—']),
    theme: 'grid',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: MARGIN,
  });
  y = lastY() + 16;

  // Detalle de sesiones
  if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = MARGIN; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`Sesiones · ${sesiones.length}`, MARGIN, y);
  autoTable(doc, {
    startY: y + 6,
    head: [['Usuario', 'Inicio', 'Última actividad', 'Duración', 'Estado']],
    body: sesiones.map((s) => [s.nombre, fmt.dateTime(s.inicio), fmt.dateTime(s.ultimo_latido), fmtDuracion(s.duracionMin), s.conectado ? 'Conectado' : 'Cerrada']),
    theme: 'striped',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 2.5 },
    columnStyles: { 3: { halign: 'right' } },
    margin: MARGIN,
  });

  return doc;
}

export async function descargarActividadPdf(conectados: SesionRow[], porUsuario: UsuarioActividad[], sesiones: SesionRow[], desde: string | null, hasta: string | null): Promise<void> {
  const doc = await construirPdf(conectados, porUsuario, sesiones, desde, hasta);
  previewPdf(doc, `actividad-usuarios-${new Date().toISOString().slice(0, 10)}.pdf`);
}
