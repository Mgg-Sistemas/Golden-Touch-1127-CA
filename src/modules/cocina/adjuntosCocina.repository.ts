/* ============================================================
   Golden Touch · Cocina · Fotos de una comida servida

   Mismo mecanismo que los adjuntos de Salidas y de Combustible, con su
   propio bucket privado (`cocina-adjuntos`) y su tabla (`cocina_adjuntos`),
   gateados por el módulo Cocina. Hasta 4 por comida. Los archivos se borran
   desde la app ANTES de borrar la comida: Supabase no deja borrarlos desde
   la base.
   ============================================================ */
import { crearRepoAdjuntos } from '@/modules/salidas/adjuntosSalida.repository';

export const MODULO_ADJUNTO_COCINA = 'cocina_mov' as const;

export const adjuntosCocina = crearRepoAdjuntos('cocina-adjuntos', 'cocina_adjuntos');
