/* ============================================================
   Golden Touch · Cocina · Lista física del mercado

   Al cerrar un mercado y abrir el nuevo se puede adjuntar la lista en papel
   de lo que entró (05/10/2026, pedido del usuario): hasta 4 FOTOS o un solo
   PDF, nunca las dos cosas. La base repite la regla
   (trg_cocina_mercado_adjuntos_regla), así dos personas a la vez tampoco la
   pasan. Aquí está para avisar en la pantalla antes de subir nada.
   ============================================================ */
import { crearRepoAdjuntos } from '@/modules/salidas/adjuntosSalida.repository';
import { esPdfAdjunto, type ReglaAdjuntos, type ArchivoDeRegla } from '@/modules/salidas/adjuntosSalidaReglas';

export const MODULO_LISTA_MERCADO = 'cocina_mercado' as const;
/** Mismo bucket privado que las fotos de las comidas; la carpeta es el id del mercado. */
export const adjuntosMercado = crearRepoAdjuntos('cocina-adjuntos', 'cocina_mercado_adjuntos');

export const MAX_FOTOS_LISTA = 4;

const cuenta = (archivos: ArchivoDeRegla[]) => {
  const pdfs = archivos.filter((a) => esPdfAdjunto(a.tipo, a.nombre)).length;
  return { pdfs, fotos: archivos.length - pdfs };
};

/** Qué está mal si a `actuales` se le suman `nuevos`, o null si entran. */
export function errorListaMercado(actuales: ArchivoDeRegla[], nuevos: ArchivoDeRegla[]): string | null {
  const { pdfs, fotos } = cuenta([...actuales, ...nuevos]);
  if (pdfs > 1) return 'La lista del mercado admite un solo PDF.';
  if (pdfs === 1 && fotos > 0) return 'Va un PDF o hasta 4 fotos, no las dos cosas.';
  if (fotos > MAX_FOTOS_LISTA) return `La lista del mercado admite hasta ${MAX_FOTOS_LISTA} fotos.`;
  return null;
}

/** Cuántos archivos más se pueden agregar. Con un PDF ya está completa. */
export function libresListaMercado(actuales: ArchivoDeRegla[]): number {
  const { pdfs, fotos } = cuenta(actuales);
  return pdfs > 0 ? 0 : Math.max(0, MAX_FOTOS_LISTA - fotos);
}

export const REGLA_LISTA_MERCADO: ReglaAdjuntos = {
  max: MAX_FOTOS_LISTA,
  error: errorListaMercado,
  libres: libresListaMercado,
  ayuda: 'Hasta 4 fotos o 1 PDF con la lista en papel de lo que entró.',
};
