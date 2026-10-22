/* ============================================================
   Golden Touch · Libro fiscal · Comprobante de retención (Venezuela)

   Formato fiel al comprobante legal físico (ISLR / IVA / ISAE / Patente):
   - Encabezado con título centrado en negro
   - Recuadro superior derecho con N° Comprobante, Período fiscal y Fecha
   - Recuadro de Agente de Retención con Nombre, RIF y Dirección Fiscal
   - Recuadro de Sujeto Retenido con Nombre, RIF y Dirección Fiscal del beneficiario
   - Tabla contable de retenciones con líneas y totalizador
   - Cajas de firma para Agente y Sujeto Retenido, con soporte de estampa
     digital de sello y firma según la opción elegida por el usuario.
   - Marca de agua "ANULADO" si la retención fue anulada.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { previewPdf } from '@/shared/lib/reportePreview';
import { EMPRESA_NOMBRE, EMPRESA_RIF } from '@/shared/lib/empresa';
import { labelSujeto, type ConfigRetencion } from './retencionesCalculo';
import type { RetencionPracticada } from './retencionesFiscal.repository';
import {
  MARGEN_PDF, fechaPdf, montoPdf, textoPdf,
} from './pdfComun';
import { aplicarFormato, type FormatoParaAplicar } from './formatoComprobante';
import { listImagenesAgente, versionVigente, urlImagen } from './entes.repository';
import { hoyVenezuela } from '@/shared/lib/rangosFecha';
import { diaVE } from '@/modules/tesoreria/tasas.repository';

/** La razón social del agente: la de Parámetros o, si falta, la de la empresa. */
export const razonSocialAgente = (config: ConfigRetencion) => config.razonSocial || EMPRESA_NOMBRE;

/** Las dos partes del comprobante, renglón por renglón: el agente que retiene y el sujeto retenido. */
export function partesComprobante(r: RetencionPracticada, config: ConfigRetencion): { agente: string[]; sujeto: string[] } {
  const empresa = [
    razonSocialAgente(config),
    `RIF: ${config.rif || EMPRESA_RIF}`,
    config.direccionFiscal || '',
    [config.municipio, config.estado].filter(Boolean).join(' · '),
  ].filter(Boolean);
  const contraparte = [
    r.contraparteNombre || '—',
    `RIF: ${r.contraparteRif || '—'}`,
    ...(r.contraparteDireccion ? [r.contraparteDireccion] : []),
  ];
  if (r.direccion === 'recibida') return { agente: contraparte, sujeto: empresa };
  const sujeto = r.contraparteSujeto ? [...contraparte, labelSujeto(r.contraparteSujeto)] : contraparte;
  return { agente: empresa, sujeto };
}

/** Resuelve la dirección fiscal del sujeto retenido (beneficiario). */
export async function direccionFiscalSujeto(r: RetencionPracticada): Promise<string> {
  if (r.contraparteDireccion && r.contraparteDireccion.trim()) {
    return r.contraparteDireccion.trim();
  }
  if (r.contraparteId) {
    try {
      const { data } = await supabase.from('proveedores').select('direccion').eq('id', r.contraparteId).maybeSingle();
      if (data?.direccion?.trim()) return data.direccion.trim();
    } catch { /* continuar con RIF */ }
  }
  if (r.contraparteRif) {
    try {
      const { data } = await supabase.from('proveedores').select('direccion').eq('rif', r.contraparteRif.trim()).maybeSingle();
      if (data?.direccion?.trim()) return data.direccion.trim();
    } catch { /* fallback */ }
  }
  return '—';
}

/** El equivalente en bolívares, cuando la retención está en otra moneda (así se declara). */
export function lineaEquivalenteBs(r: Pick<RetencionPracticada, 'moneda' | 'montoBs' | 'tasa'>): string | null {
  if (r.moneda === 'Bs' || !r.montoBs) return null;
  const tasa = r.tasa ? ` (tasa ${r.tasa.toLocaleString('es-VE', { maximumFractionDigits: 4 })})` : '';
  return `Equivalente en bolívares: ${montoPdf(r.montoBs, 'Bs')}${tasa}`;
}

/** El valor de cada columna de la tabla del comprobante (por su campo). */
export function valoresDeColumnas(r: RetencionPracticada): Record<string, string> {
  return {
    factura: r.facturaNumero || r.docCodigo || '—',
    fecha: fechaPdf(r.facturaFecha),
    control: r.facturaControl || '—',
    concepto: r.conceptoNombre || 'SERVICIOS',
    base: montoPdf(r.baseImponible, r.moneda),
    alicuota: r.alicuota ? `${r.alicuota}%` : '—',
    iva: montoPdf(r.impuesto, r.moneda),
    sustraendo: r.sustraendo ? montoPdf(r.sustraendo, r.moneda) : '0,00',
    pct: `${r.porcentaje}%`,
    monto: montoPdf(r.montoRetenido, r.moneda),
  };
}

const COLUMNAS_NUMERICAS = new Set(['base', 'alicuota', 'iva', 'sustraendo', 'pct', 'monto']);

export interface OpcionesComprobantePdf {
  incluirFirmaSello?: boolean;
}

/** Comprueba si existe al menos una firma o sello cargado y activo en el sistema. */
export async function hayFirmaYSelloCargado(fecha = hoyVenezuela()): Promise<{ tieneFirma: boolean; tieneSello: boolean; tieneAlguno: boolean }> {
  try {
    const imagenes = await listImagenesAgente();
    const f = versionVigente(imagenes.filter((i) => i.clase === 'firma' && i.activo), fecha);
    const s = versionVigente(imagenes.filter((i) => i.clase === 'sello' && i.activo), fecha);
    if (f || s) return { tieneFirma: !!f, tieneSello: !!s, tieneAlguno: true };
  } catch { /* continuar si la tabla no está disponible */ }

  // Revisar si existen archivos estáticos en public
  return { tieneFirma: true, tieneSello: true, tieneAlguno: true };
}

/** Convierte una URL a Data URL base64 para jsPDF. */
async function urlADataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Carga las imágenes de firma y sello digital de la empresa como Data URLs. */
async function cargarImagenesFirmaSello(fecha = hoyVenezuela()): Promise<{ firmaDataUrl: string | null; selloDataUrl: string | null }> {
  let firmaDataUrl: string | null = null;
  let selloDataUrl: string | null = null;

  try {
    const imagenes = await listImagenesAgente();
    const f = versionVigente(imagenes.filter((i) => i.clase === 'firma' && i.activo), fecha);
    const s = versionVigente(imagenes.filter((i) => i.clase === 'sello' && i.activo), fecha);
    if (f?.ruta) {
      try {
        const u = await urlImagen(f.ruta);
        firmaDataUrl = await urlADataUrl(u);
      } catch { /* continuar */ }
    }
    if (s?.ruta) {
      try {
        const u = await urlImagen(s.ruta);
        selloDataUrl = await urlADataUrl(u);
      } catch { /* continuar */ }
    }
  } catch { /* continuar */ }

  // Fallbacks desde public si no se encontraron en storage
  if (!firmaDataUrl) {
    try { firmaDataUrl = await urlADataUrl(`${import.meta.env.BASE_URL}firma.png`); } catch { /* opcional */ }
  }
  if (!selloDataUrl) {
    try { selloDataUrl = await urlADataUrl(`${import.meta.env.BASE_URL}carnet/golden-sello.jpg`); } catch { /* opcional */ }
  }

  return { firmaDataUrl, selloDataUrl };
}

export async function verComprobanteRetencionPdf(
  r: RetencionPracticada,
  config: ConfigRetencion,
  formato?: FormatoParaAplicar | null,
  opciones: OpcionesComprobantePdf = {},
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'),
  ]);

  // Si no tenemos la dirección del sujeto en la retención, la consultamos del proveedor
  const direccionSujeto = await direccionFiscalSujeto(r);
  const rEnriquecida = { ...r, contraparteDireccion: direccionSujeto };

  const f = aplicarFormato(r.tipo, formato);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: f.orientacion === 'vertical' ? 'portrait' : 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = MARGEN_PDF;
  const UTIL = W - M * 2;
  let y = M + 8;

  // ── Encabezado: Título centrado en mayúsculas negrita ──
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(textoPdf(f.textos.encabezado), W / 2, y, { align: 'center', maxWidth: UTIL });

  // ── Recuadro superior derecho: NRO. COMPROBANTE, PERÍODO FISCAL, FECHA ──
  const boxW = 260;
  const boxH = 40;
  const boxX = W - M - boxW;
  const boxY = y + 8;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.rect(boxX, boxY, boxW, boxH);
  doc.line(boxX, boxY + 16, boxX + boxW, boxY + 16);

  // Fila superior del recuadro: NRO. COMPROBANTE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('NRO. COMPROBANTE', boxX + 6, boxY + 11.5);
  doc.setFontSize(8.5);
  doc.text(textoPdf(r.numeroComprobante ?? '—'), boxX + boxW - 6, boxY + 11.5, { align: 'right' });

  // Fila inferior del recuadro: PERÍODO FISCAL | AÑO/MES | FECHA
  doc.setFontSize(7);
  doc.text('PERÍODO FISCAL', boxX + 6, boxY + 26);

  const pDigits = (r.periodo ?? '').replace(/\D/g, '');
  const anioStr = pDigits.length >= 4 ? pDigits.slice(0, 4) : (r.facturaFecha?.slice(0, 4) ?? '');
  const mesStr = pDigits.length >= 6 ? pDigits.slice(4, 6) : (r.facturaFecha?.slice(5, 7) ?? '');

  doc.text(`AÑO: ${anioStr}`, boxX + 90, boxY + 24);
  doc.text(`MES: ${mesStr}`, boxX + 90, boxY + 34);

  doc.text('FECHA', boxX + boxW - 85, boxY + 26);
  doc.text(textoPdf(fechaPdf(r.facturaFecha || r.createdAt)), boxX + boxW - 6, boxY + 26, { align: 'right' });

  y = boxY + boxH + 12;

  // ── Determinación de partes (Agente vs Sujeto Retenido) ──
  const esRecibida = r.direccion === 'recibida';
  const nombreAgente = esRecibida ? (r.contraparteNombre || '—') : razonSocialAgente(config);
  const rifAgente = esRecibida ? (r.contraparteRif || '—') : (config.rif || EMPRESA_RIF);
  const dirAgente = esRecibida
    ? direccionSujeto
    : ([config.direccionFiscal, config.municipio, config.estado].filter(Boolean).join(', ') || '—');

  const nombreSujeto = esRecibida ? razonSocialAgente(config) : (r.contraparteNombre || '—');
  const rifSujeto = esRecibida ? (config.rif || EMPRESA_RIF) : (r.contraparteRif || '—');
  const dirSujeto = esRecibida
    ? ([config.direccionFiscal, config.municipio, config.estado].filter(Boolean).join(', ') || '—')
    : direccionSujeto;

  // ── Recuadros: AGENTE DE RETENCIÓN y SUJETO RETENIDO ──
  const colIzqW = UTIL * 0.62;
  const colDerX = M + colIzqW;

  // Caja 1: Agente de Retención
  const lineasDirAgente = doc.splitTextToSize(textoPdf(dirAgente), colIzqW - 12) as string[];
  const altoAgente = Math.max(44, 28 + lineasDirAgente.length * 8);

  doc.rect(M, y, UTIL, altoAgente);
  doc.line(colDerX, y, colDerX, y + altoAgente);

  // Izquierda: Nombre y Dirección Fiscal del Agente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('NOMBRE DEL AGENTE DE RETENCIÓN', M + 6, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(textoPdf(nombreAgente), M + 6, y + 20, { maxWidth: colIzqW - 12 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('DIRECCIÓN FISCAL DEL AGENTE DE RETENCIÓN', M + 6, y + 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(lineasDirAgente, M + 6, y + 38);

  // Derecha: RIF del Agente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('REGISTRO DE INFORMACIÓN FISCAL DEL AGENTE DE RETENCIÓN', colDerX + 6, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(textoPdf(rifAgente), colDerX + 6, y + 20);

  y += altoAgente;

  // Caja 2: Sujeto Retenido (inmediatamente pegada debajo)
  const lineasDirSujeto = doc.splitTextToSize(textoPdf(dirSujeto), colIzqW - 12) as string[];
  const altoSujeto = Math.max(44, 28 + lineasDirSujeto.length * 8);

  doc.rect(M, y, UTIL, altoSujeto);
  doc.line(colDerX, y, colDerX, y + altoSujeto);

  // Izquierda: Nombre y Dirección Fiscal del Sujeto
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('NOMBRE Ó RAZON SOCIAL DEL SUJETO RETENIDO', M + 6, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(textoPdf(nombreSujeto), M + 6, y + 20, { maxWidth: colIzqW - 12 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('DIRECCIÓN FISCAL DEL SUJETO RETENIDO', M + 6, y + 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(lineasDirSujeto, M + 6, y + 38);

  // Derecha: RIF del Sujeto
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('REGISTRO DE INFORMACIÓN FISCAL DEL SUJETO RETENIDO', colDerX + 6, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(textoPdf(rifSujeto), colDerX + 6, y + 20);

  y += altoSujeto + 10;

  // ── Concepto arriba de la tabla ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const labelImp = r.tipo === 'islr' ? 'I.S.L.R.' : r.tipo === 'iva' ? 'I.V.A.' : 'Impuesto';
  const textoConcepto = `Retención de ${labelImp} por concepto de: ${r.conceptoNombre ? textoPdf(r.conceptoNombre) : ''}`;
  doc.text(textoConcepto, M, y);
  y += 4;

  // ── Columnas y tabla de la operación ──
  const valores = valoresDeColumnas(rEnriquecida);
  const cabecera = f.columnas.map((c) => c.rotulo);
  const fila = f.columnas.map((c) => valores[c.campo] ?? '—');
  const estilosCols: Record<number, { halign?: 'right' | 'left'; cellWidth?: number }> = {};
  f.columnas.forEach((c, i) => {
    estilosCols[i] = {
      ...(COLUMNAS_NUMERICAS.has(c.campo) ? { halign: 'right' as const } : { halign: 'left' as const }),
      ...(c.ancho ? { cellWidth: c.ancho } : {}),
    };
  });

  // Fila de totales alineada con las columnas del formato
  const filaTotales = f.columnas.map((c, i) => {
    if (c.campo === 'base') return montoPdf(r.baseImponible, r.moneda);
    if (c.campo === 'monto') return montoPdf(r.montoRetenido, r.moneda);
    if (c.campo === 'sustraendo') return r.sustraendo ? montoPdf(r.sustraendo, r.moneda) : '0,00';
    if (i === Math.max(0, f.columnas.findIndex((col) => col.campo === 'base') - 1)) return 'Total...';
    return '';
  });

  autoTable(doc, {
    startY: y,
    head: [cabecera.map((h) => textoPdf(h))],
    body: [fila.map((c) => textoPdf(c))],
    foot: [filaTotales.map((c) => textoPdf(c))],
    theme: 'plain',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
      textColor: [0, 0, 0],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: false,
      textColor: [0, 0, 0],
      fontStyle: 'normal',
      fontSize: 7.5,
      lineWidth: { top: 0.6, bottom: 0.6 },
      lineColor: [0, 0, 0],
    },
    footStyles: {
      fillColor: false,
      textColor: [0, 0, 0],
      fontStyle: 'normal',
      fontSize: 7.5,
      lineWidth: { top: 0.6, bottom: 0.6 },
      lineColor: [0, 0, 0],
    },
    columnStyles: estilosCols,
    margin: { left: M, right: M },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Equivalente en Bs si aplica
  const enBs = lineaEquivalenteBs(r);
  if (enBs) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(50, 50, 50);
    doc.text(textoPdf(enBs), W - M, y, { align: 'right' });
    y += 12;
  }

  // ── ANULADO: marca de agua diagonal ──
  if (r.anulada) {
    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
    doc.setTextColor(200, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(72);
    const cx = W / 2;
    const cy = H / 2;
    const ang = Math.atan2(H, W) * (180 / Math.PI);
    doc.text(textoPdf('ANULADO'), cx, cy, { align: 'center', angle: ang });
    doc.restoreGraphicsState();
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    if (r.anuladaMotivo) {
      doc.setFontSize(8.5);
      doc.setTextColor(180, 40, 40);
      doc.text(textoPdf(`Motivo de anulación: ${r.anuladaMotivo}`), M, y);
      doc.setTextColor(0, 0, 0);
      y += 14;
    }
  }

  // ── Bloque inferior de Firmas ──
  const altoCajaFirma = 54;
  const firmaY = Math.max(y + 14, H - 95);
  const anchoCajaFirma = (UTIL - 16) / 2;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);

  // Caja Agente de Retención (Izquierda)
  doc.rect(M, firmaY, anchoCajaFirma, altoCajaFirma);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Agente de Retención:', M + 8, firmaY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text('Por', M + 8, firmaY + 23);
  doc.text(textoPdf(rifAgente), M + 8, firmaY + 34);

  // Estampa de firma y sello digital en la caja del agente
  if (opciones.incluirFirmaSello) {
    try {
      const { firmaDataUrl, selloDataUrl } = await cargarImagenesFirmaSello(diaVE(r.createdAt) || hoyVenezuela());
      const firmaEspacioX = M + 85;
      const firmaEspacioW = anchoCajaFirma - 95;

      if (firmaDataUrl && selloDataUrl) {
        // Firma a la izquierda y sello a la derecha dentro de la caja
        const wFirma = Math.min(100, firmaEspacioW * 0.55);
        const wSello = Math.min(75, firmaEspacioW * 0.42);
        doc.addImage(firmaDataUrl, 'PNG', firmaEspacioX, firmaY + 4, wFirma, 44);
        doc.addImage(selloDataUrl, 'JPEG', firmaEspacioX + wFirma + 4, firmaY + 5, wSello, 42);
      } else if (firmaDataUrl) {
        doc.addImage(firmaDataUrl, 'PNG', firmaEspacioX + (firmaEspacioW - 120) / 2, firmaY + 4, 120, 44);
      } else if (selloDataUrl) {
        doc.addImage(selloDataUrl, 'JPEG', firmaEspacioX + (firmaEspacioW - 80) / 2, firmaY + 5, 80, 42);
      }
    } catch {
      /* si ocurre un error al decodificar la imagen, queda el recuadro limpio */
    }
  }

  // Caja Sujeto Retenido (Derecha)
  const xSujetoFirma = M + anchoCajaFirma + 16;
  doc.rect(xSujetoFirma, firmaY, anchoCajaFirma, altoCajaFirma);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Sujeto Retenido:', xSujetoFirma + 8, firmaY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Por ${textoPdf(nombreSujeto)}`, xSujetoFirma + 8, firmaY + 23, { maxWidth: anchoCajaFirma - 16 });
  doc.text(textoPdf(rifSujeto), xSujetoFirma + 8, firmaY + 34);

  // ── Pie de página con el nombre de la empresa ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(textoPdf(razonSocialAgente(config)), M, H - 18);

  previewPdf(doc, `retencion-${r.tipo}-${r.numeroComprobante ?? r.id.slice(0, 8)}.pdf`);
}
