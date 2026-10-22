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
  incluirLogo?: boolean;
  incluirFirma?: boolean;
  incluirSello?: boolean;
  /** Compatibilidad hacia atrás */
  incluirFirmaSello?: boolean;
}

export interface DisponibilidadElementosDigitales {
  tieneLogo: boolean;
  tieneFirma: boolean;
  tieneSello: boolean;
  tieneAlguno: boolean;
}

/** Comprueba qué elementos (logo, firma, sello) están cargados y activos en Parámetros del módulo. */
export async function consultarElementosDigitales(fecha = hoyVenezuela()): Promise<DisponibilidadElementosDigitales> {
  try {
    const imagenes = await listImagenesAgente();
    const l = versionVigente(imagenes.filter((i) => i.clase === 'logo' && i.activo), fecha);
    const f = versionVigente(imagenes.filter((i) => i.clase === 'firma' && i.activo), fecha);
    const s = versionVigente(imagenes.filter((i) => i.clase === 'sello' && i.activo), fecha);
    return {
      tieneLogo: !!l?.ruta,
      tieneFirma: !!f?.ruta,
      tieneSello: !!s?.ruta,
      tieneAlguno: !!(l?.ruta || f?.ruta || s?.ruta),
    };
  } catch {
    return { tieneLogo: false, tieneFirma: false, tieneSello: false, tieneAlguno: false };
  }
}

/** Alias para compatibilidad */
export async function hayFirmaYSelloCargado(fecha = hoyVenezuela()): Promise<{ tieneFirma: boolean; tieneSello: boolean; tieneAlguno: boolean }> {
  const d = await consultarElementosDigitales(fecha);
  return { tieneFirma: d.tieneFirma, tieneSello: d.tieneSello, tieneAlguno: d.tieneFirma || d.tieneSello };
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

/** Carga las imágenes de logo, firma y sello digital de la empresa SOLO si están cargadas en Parámetros del módulo. */
async function cargarElementosDigitales(fecha = hoyVenezuela()): Promise<{
  logoDataUrl: string | null;
  firmaDataUrl: string | null;
  selloDataUrl: string | null;
}> {
  let logoDataUrl: string | null = null;
  let firmaDataUrl: string | null = null;
  let selloDataUrl: string | null = null;

  try {
    const imagenes = await listImagenesAgente();
    const l = versionVigente(imagenes.filter((i) => i.clase === 'logo' && i.activo), fecha);
    const f = versionVigente(imagenes.filter((i) => i.clase === 'firma' && i.activo), fecha);
    const s = versionVigente(imagenes.filter((i) => i.clase === 'sello' && i.activo), fecha);

    if (l?.ruta) {
      try {
        const u = await urlImagen(l.ruta);
        logoDataUrl = await urlADataUrl(u);
      } catch { /* noop */ }
    }
    if (f?.ruta) {
      try {
        const u = await urlImagen(f.ruta);
        firmaDataUrl = await urlADataUrl(u);
      } catch { /* noop */ }
    }
    if (s?.ruta) {
      try {
        const u = await urlImagen(s.ruta);
        selloDataUrl = await urlADataUrl(u);
      } catch { /* noop */ }
    }
  } catch { /* noop */ }

  return { logoDataUrl, firmaDataUrl, selloDataUrl };
}

/** Construye la instancia jsPDF del comprobante de retención. */
export async function generarDocComprobanteRetencionPdf(
  r: RetencionPracticada,
  config: ConfigRetencion,
  formato?: FormatoParaAplicar | null,
  opciones: OpcionesComprobantePdf = {},
): Promise<any> {
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

  // Logo en encabezado izquierdo si se solicita y existe cargado en el modulo
  const { logoDataUrl, firmaDataUrl, selloDataUrl } = await cargarElementosDigitales(diaVE(r.createdAt) || hoyVenezuela());
  if (opciones.incluirLogo && logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', M, y - 4, 75, 34);
    } catch { /* noop */ }
  }

  // ── Encabezado: Título centrado en mayúsculas negrita ──
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(textoPdf(f.textos.encabezado), W / 2, y, { align: 'center', maxWidth: UTIL });

  if (f.textos.nota_legal && f.textos.nota_legal.trim()) {
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(textoPdf(f.textos.nota_legal), W / 2, y, { align: 'center', maxWidth: UTIL });
  }

  // ── Recuadro superior derecho: NRO. COMPROBANTE, PERÍODO FISCAL, FECHA ──
  const boxW = Math.min(270, UTIL * 0.48);
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
  doc.setTextColor(0, 0, 0);
  doc.text(textoPdf(f.rotulos.n_comprobante || 'NRO. COMPROBANTE'), boxX + 6, boxY + 11.5);
  doc.setFontSize(8.5);
  doc.text(textoPdf(r.numeroComprobante ?? '—'), boxX + boxW - 6, boxY + 11.5, { align: 'right' });

  // Fila inferior del recuadro: PERÍODO FISCAL | AÑO/MES | FECHA
  doc.setFontSize(7);
  doc.text(textoPdf(f.rotulos.periodo || 'PERÍODO FISCAL'), boxX + 6, boxY + 26);

  const pDigits = (r.periodo ?? '').replace(/\D/g, '');
  const anioStr = pDigits.length >= 4 ? pDigits.slice(0, 4) : (r.facturaFecha?.slice(0, 4) ?? '');
  const mesStr = pDigits.length >= 6 ? pDigits.slice(4, 6) : (r.facturaFecha?.slice(5, 7) ?? '');

  doc.text(`AÑO: ${anioStr}`, boxX + 88, boxY + 24);
  doc.text(`MES: ${mesStr}`, boxX + 88, boxY + 34);

  doc.text(textoPdf(f.rotulos.fecha_emision || 'FECHA'), boxX + boxW - 85, boxY + 26);
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

  // Adaptación dinámica al texto del Agente
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const lineasNombreAgente = doc.splitTextToSize(textoPdf(nombreAgente), colIzqW - 14) as string[];
  doc.setFontSize(7);
  const lineasDirAgente = doc.splitTextToSize(textoPdf(dirAgente), colIzqW - 14) as string[];

  // Altura requerida con paddings holgados
  const altoIzqAgente = 8 + 8 + (lineasNombreAgente.length * 9.5) + 6 + 8 + (lineasDirAgente.length * 8.5) + 8;
  const altoDerAgente = 38;
  const altoAgente = Math.max(altoIzqAgente, altoDerAgente, 50);

  // Dibujar recuadro Agente
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.rect(M, y, UTIL, altoAgente);
  doc.line(colDerX, y, colDerX, y + altoAgente);

  // Textos Izquierda Agente
  let curY = y + 8.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text(textoPdf(f.rotulos.agente || 'NOMBRE DEL AGENTE DE RETENCIÓN'), M + 6, curY);
  curY += 8.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(lineasNombreAgente, M + 6, curY);
  curY += (lineasNombreAgente.length * 9.5) + 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('DIRECCIÓN FISCAL DEL AGENTE DE RETENCIÓN', M + 6, curY);
  curY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(lineasDirAgente, M + 6, curY);

  // Textos Derecha Agente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('REGISTRO DE INFORMACIÓN FISCAL DEL AGENTE DE RETENCIÓN', colDerX + 6, y + 8.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(textoPdf(rifAgente), colDerX + 6, y + 20);

  y += altoAgente;

  // Adaptación dinámica al texto del Sujeto Retenido
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const lineasNombreSujeto = doc.splitTextToSize(textoPdf(nombreSujeto), colIzqW - 14) as string[];
  doc.setFontSize(7);
  const lineasDirSujeto = doc.splitTextToSize(textoPdf(dirSujeto), colIzqW - 14) as string[];

  const altoIzqSujeto = 8 + 8 + (lineasNombreSujeto.length * 9.5) + 6 + 8 + (lineasDirSujeto.length * 8.5) + 8;
  const altoDerSujeto = 38;
  const altoSujeto = Math.max(altoIzqSujeto, altoDerSujeto, 50);

  // Dibujar recuadro Sujeto
  doc.rect(M, y, UTIL, altoSujeto);
  doc.line(colDerX, y, colDerX, y + altoSujeto);

  // Textos Izquierda Sujeto
  curY = y + 8.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text(textoPdf(f.rotulos.sujeto || 'NOMBRE Ó RAZON SOCIAL DEL SUJETO RETENIDO'), M + 6, curY);
  curY += 8.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(lineasNombreSujeto, M + 6, curY);
  curY += (lineasNombreSujeto.length * 9.5) + 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('DIRECCIÓN FISCAL DEL SUJETO RETENIDO', M + 6, curY);
  curY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(lineasDirSujeto, M + 6, curY);

  // Textos Derecha Sujeto
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('REGISTRO DE INFORMACIÓN FISCAL DEL SUJETO RETENIDO', colDerX + 6, y + 8.5);
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
    if (i === Math.max(0, f.columnas.findIndex((col) => col.campo === 'base') - 1)) return f.rotulos.total || 'Total...';
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
  doc.text(textoPdf(f.rotulos.firma_agente || 'Agente de Retención:'), M + 8, firmaY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text('Por', M + 8, firmaY + 23);
  doc.text(textoPdf(rifAgente), M + 8, firmaY + 34);

  // Estampa de firma y/o sello digital en la caja del agente (solo si se pide y existen cargados en el módulo)
  const conFirma = (opciones.incluirFirma || (opciones.incluirFirmaSello && opciones.incluirFirma === undefined)) && !!firmaDataUrl;
  const conSello = (opciones.incluirSello || (opciones.incluirFirmaSello && opciones.incluirSello === undefined)) && !!selloDataUrl;

  if (conFirma || conSello) {
    try {
      const firmaEspacioX = M + 85;
      const firmaEspacioW = anchoCajaFirma - 95;

      if (conFirma && conSello) {
        const wFirma = Math.min(100, firmaEspacioW * 0.55);
        const wSello = Math.min(75, firmaEspacioW * 0.42);
        doc.addImage(firmaDataUrl!, 'PNG', firmaEspacioX, firmaY + 4, wFirma, 44);
        doc.addImage(selloDataUrl!, 'JPEG', firmaEspacioX + wFirma + 4, firmaY + 5, wSello, 42);
      } else if (conFirma) {
        doc.addImage(firmaDataUrl!, 'PNG', firmaEspacioX + (firmaEspacioW - 120) / 2, firmaY + 4, 120, 44);
      } else if (conSello) {
        doc.addImage(selloDataUrl!, 'JPEG', firmaEspacioX + (firmaEspacioW - 80) / 2, firmaY + 5, 80, 42);
      }
    } catch {
      /* recuadro limpio */
    }
  }

  // Caja Sujeto Retenido (Derecha)
  const xSujetoFirma = M + anchoCajaFirma + 16;
  doc.rect(xSujetoFirma, firmaY, anchoCajaFirma, altoCajaFirma);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(textoPdf(f.rotulos.firma_sujeto || 'Sujeto Retenido:'), xSujetoFirma + 8, firmaY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Por ${textoPdf(nombreSujeto)}`, xSujetoFirma + 8, firmaY + 23, { maxWidth: anchoCajaFirma - 16 });
  doc.text(textoPdf(rifSujeto), xSujetoFirma + 8, firmaY + 34);

  // ── Pie de página con el texto configurado en Parámetros o razón social de la empresa ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  const pieTexto = f.textos.pie || razonSocialAgente(config);
  doc.text(textoPdf(pieTexto), M, H - 18, { maxWidth: UTIL });

  return doc;
}

export async function verComprobanteRetencionPdf(
  r: RetencionPracticada,
  config: ConfigRetencion,
  formato?: FormatoParaAplicar | null,
  opciones: OpcionesComprobantePdf = {},
): Promise<void> {
  const disp = await consultarElementosDigitales(diaVE(r.createdAt) || hoyVenezuela());

  // Preferencias iniciales: solo habilitadas si existen cargadas en Parámetros del módulo
  let conLogo = disp.tieneLogo && (opciones.incluirLogo ?? (localStorage.getItem('retenciones:imprimirConLogo') === 'true'));
  let conFirma = disp.tieneFirma && (opciones.incluirFirma ?? (opciones.incluirFirmaSello ? true : localStorage.getItem('retenciones:imprimirConFirma') === 'true'));
  let conSello = disp.tieneSello && (opciones.incluirSello ?? (opciones.incluirFirmaSello ? true : localStorage.getItem('retenciones:imprimirConSello') === 'true'));

  const generarDoc = () => generarDocComprobanteRetencionPdf(r, config, formato, {
    incluirLogo: conLogo,
    incluirFirma: conFirma,
    incluirSello: conSello,
  });

  const doc = await generarDoc();
  const filename = `retencion-${r.tipo}-${r.numeroComprobante ?? r.id.slice(0, 8)}.pdf`;

  previewPdf(doc, filename, {
    extraControls: ({ bar, updatePdf }) => {
      const container = document.createElement('div');
      container.style.cssText = 'display:flex;align-items:center;gap:.5rem;margin-left:auto;margin-right:.5rem;flex-wrap:wrap;';

      if (!disp.tieneAlguno) {
        const aviso = document.createElement('span');
        aviso.style.cssText =
          'color:#8b949e;font:500 .78rem system-ui;display:inline-flex;align-items:center;gap:.35rem;padding:.35rem .6rem;background:#161b22;border-radius:6px;border:1px solid #30363d;';
        aviso.title = 'Para estampar logo, firma o sello, cárgalos en Parámetros › Firma / Sello o Logo.';
        aviso.textContent = 'Sin logo, firma ni sello en Parámetros (imprime en blanco)';
        container.appendChild(aviso);
      } else {
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;align-items:center;gap:.4rem;';

        const labelTitulo = document.createElement('span');
        labelTitulo.style.cssText = 'color:#8b949e;font:600 .78rem system-ui;margin-right:.2rem;';
        labelTitulo.textContent = 'Imprimir:';
        toolbar.appendChild(labelTitulo);

        const crearCheck = (etiqueta: string, valor: boolean, onChange: (val: boolean) => void) => {
          const lbl = document.createElement('label');
          lbl.style.cssText =
            'color:#e6edf3;font:500 .82rem system-ui;display:inline-flex;align-items:center;gap:.35rem;cursor:pointer;background:#21262d;padding:.35rem .65rem;border-radius:6px;border:1px solid #30363d;user-select:none;';
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = valor;
          chk.style.cssText = 'cursor:pointer;accent-color:#ff8a00;width:.95rem;height:.95rem;margin:0;';
          chk.onchange = async () => {
            onChange(chk.checked);
            lbl.style.opacity = '0.6';
            try {
              const nuevoDoc = await generarDoc();
              updatePdf(nuevoDoc);
            } finally {
              lbl.style.opacity = '1';
            }
          };
          lbl.append(chk, document.createTextNode(etiqueta));
          return lbl;
        };

        if (disp.tieneLogo) {
          toolbar.appendChild(crearCheck('Logo', conLogo, (v) => {
            conLogo = v;
            try { localStorage.setItem('retenciones:imprimirConLogo', String(v)); } catch {}
          }));
        }
        if (disp.tieneFirma) {
          toolbar.appendChild(crearCheck('Firma', conFirma, (v) => {
            conFirma = v;
            try { localStorage.setItem('retenciones:imprimirConFirma', String(v)); } catch {}
          }));
        }
        if (disp.tieneSello) {
          toolbar.appendChild(crearCheck('Sello', conSello, (v) => {
            conSello = v;
            try { localStorage.setItem('retenciones:imprimirConSello', String(v)); } catch {}
          }));
        }

        container.appendChild(toolbar);
      }

      const firstBtn = bar.querySelector('button');
      if (firstBtn) bar.insertBefore(container, firstBtn);
      else bar.appendChild(container);
    },
  });
}
