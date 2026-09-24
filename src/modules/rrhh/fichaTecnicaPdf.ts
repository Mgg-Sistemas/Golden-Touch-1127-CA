/* ============================================================
   Golden Touch · RRHH · Ficha técnica (PDF)

   La hoja de vida de la persona para el expediente: identificación,
   contacto, datos laborales y carga familiar, con la foto si la tiene.

   Todo pasa por `pdfSafe`: la helvetica de jsPDF solo escribe Windows-1252 y
   un glifo que no existe ahí rompe el renglón entero.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { formatearRif } from '@/shared/lib/rif';
import type { Personal, PersonalFamiliar } from '@/shared/lib/types';
import { fotoPersonalDataUrl } from './personal.repository';
import { etiquetaFicha } from './fichaNro';
import {
  antiguedad, edad, labelEmpresa, labelEstadoCivil, labelGenero, labelParentesco,
} from './fichaPersonal';

const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
};

const texto = (v: string | null | undefined) => (v?.trim() ? v.trim() : '—');

export async function descargarFichaTecnicaPdf(
  persona: Personal,
  familiares: PersonalFamiliar[],
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  // La foto es opcional: si falla la descarga, la ficha sale igual.
  const foto = persona.foto_path
    ? await fotoPersonalDataUrl(persona.foto_path).catch(() => null)
    : null;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 40;
  let y = MARGIN;

  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 38, 38); } catch { /* opcional */ } }
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe('FICHA TECNICA DEL TRABAJADOR'), W / 2, y + 15, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`GOLDEN TOUCH 1127 C.A.  ·  ${labelEmpresa(persona.empresa)}`), W / 2, y + 30, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 48;

  /* ── Cabecera: foto + nombre ── */
  const nombre = `${persona.nombre} ${persona.apellido ?? ''}`.trim();
  const FOTO_W = 78; const FOTO_H = 96;
  if (foto) {
    try { doc.addImage(foto, MARGIN, y, FOTO_W, FOTO_H); } catch { /* opcional */ }
  } else {
    doc.setDrawColor(200); doc.rect(MARGIN, y, FOTO_W, FOTO_H);
    doc.setFontSize(7); doc.setTextColor(150);
    doc.text(pdfSafe('SIN FOTO'), MARGIN + FOTO_W / 2, y + FOTO_H / 2, { align: 'center' });
    doc.setTextColor(0);
  }

  const xTexto = MARGIN + FOTO_W + 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(pdfSafe(nombre), xTexto, y + 14, { maxWidth: W - xTexto - MARGIN });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  const anti = antiguedad(persona.fecha_ingreso);
  const anios = edad(persona.fecha_nacimiento);
  doc.text(pdfSafe([
    etiquetaFicha(persona.ficha_nro) || 'Sin ficha',
    persona.cargo || null,
    persona.departamento || null,
  ].filter(Boolean).join('  ·  ')), xTexto, y + 30, { maxWidth: W - xTexto - MARGIN });
  doc.text(pdfSafe([
    persona.activo ? 'ACTIVO' : 'INACTIVO',
    anios !== null ? `${anios} anos` : null,
    anti ? `${anti.texto} en la empresa` : null,
  ].filter(Boolean).join('  ·  ')), xTexto, y + 44);
  doc.setTextColor(0, 0, 0);
  y += FOTO_H + 14;

  /* ── Bloques de datos, cada uno como una tabla de dos columnas ── */
  const bloque = (titulo: string, filas: [string, string][]) => {
    autoTable(doc, {
      startY: y,
      head: [[{ content: pdfSafe(titulo), colSpan: 2 }]],
      body: filas.map(([k, v]) => [pdfSafe(k), pdfSafe(v)]),
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak', lineColor: [225, 225, 225] },
      headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 150, textColor: [110, 110, 110] }, 1: { cellWidth: 'auto', fontStyle: 'bold' } },
      margin: MARGIN,
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin
    y = (doc.lastAutoTable?.finalY ?? y) + 12;
  };

  bloque('IDENTIFICACION', [
    ['Cedula', texto(persona.cedula)],
    ['RIF', persona.rif ? formatearRif(persona.rif) : '—'],
    ['Fecha de nacimiento', dia(persona.fecha_nacimiento)],
    ['Edad', anios !== null ? `${anios} anos` : '—'],
    ['Grupo sanguineo', texto(persona.grupo_sanguineo)],
    ['Genero', persona.genero ? labelGenero(persona.genero) : '—'],
    ['Nacionalidad', texto(persona.nacionalidad)],
    ['Estado civil', persona.estado_civil ? labelEstadoCivil(persona.estado_civil) : '—'],
  ]);

  bloque('CONTACTO', [
    ['Telefono', texto(persona.telefono)],
    ['Correo', texto(persona.correo)],
    ['En una emergencia, llamar a', persona.contacto_emergencia?.trim()
      ? `${persona.contacto_emergencia}${persona.telefono_emergencia ? ` · ${persona.telefono_emergencia}` : ''}`
      : '—'],
    ['Direccion', texto(persona.direccion)],
  ]);

  bloque('DATOS LABORALES', [
    ['Cargo', texto(persona.cargo)],
    ['Departamento', texto(persona.departamento)],
    ['Fecha de ingreso', dia(persona.fecha_ingreso)],
    ['Antiguedad', anti ? anti.texto : '—'],
    ['Nomina', labelEmpresa(persona.empresa)],
    ['Estado', persona.activo ? 'Activo' : 'Inactivo'],
  ]);

  /* ── Carga familiar ── */
  autoTable(doc, {
    startY: y,
    head: [[
      { content: pdfSafe(`CARGA FAMILIAR${familiares.length ? ` (${familiares.length})` : ''}`), colSpan: 5 },
    ], ['NOMBRE', 'PARENTESCO', 'NACIMIENTO', 'EDAD', 'OBSERVACION']],
    body: familiares.length
      ? familiares.map((f) => [
        pdfSafe(f.nombre + (f.cedula ? ` · ${f.cedula}` : '')),
        pdfSafe(labelParentesco(f.parentesco)),
        dia(f.fecha_nacimiento),
        edad(f.fecha_nacimiento) ?? '—',
        pdfSafe([
          f.estudia ? 'estudia' : '', f.discapacidad ? 'discapacidad' : '', f.observacion ?? '',
        ].filter(Boolean).join(' · ') || '—'),
      ])
      : [[{ content: pdfSafe('Sin carga familiar registrada'), colSpan: 5, styles: { textColor: [130, 130, 130] } }]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak', lineColor: [225, 225, 225] },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 'auto' }, 1: { cellWidth: 74 }, 2: { cellWidth: 68 },
      3: { cellWidth: 38, halign: 'right' }, 4: { cellWidth: 120 },
    },
    margin: MARGIN,
  });
  // @ts-expect-error lastAutoTable lo agrega el plugin
  const fin = (doc.lastAutoTable?.finalY ?? y) as number;

  doc.setFontSize(7); doc.setTextColor(120, 120, 120);
  doc.text(pdfSafe(
    `Emitida el ${dia(new Date().toISOString())}. La edad y la antiguedad se calculan a esa fecha. `
    + 'Documento de uso interno: contiene datos personales del trabajador.',
  ), MARGIN, fin + 16, { maxWidth: W - MARGIN * 2 });

  const archivo = `ficha-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;
  previewPdf(doc, archivo);
}
