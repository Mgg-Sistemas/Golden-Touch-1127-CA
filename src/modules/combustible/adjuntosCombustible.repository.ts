/* ============================================================
   Golden Touch · Combustible · Fotos y PDF de un movimiento de tanque

   Mismo mecanismo que los adjuntos de Salidas, con su propio bucket
   privado (`combustible-adjuntos`) y su tabla (`combustible_adjuntos`),
   gateados por el módulo Combustible. Hasta 4 por movimiento. Si el
   movimiento se borra, la base borra sus archivos.
   ============================================================ */
import { crearRepoAdjuntos } from '@/modules/salidas/adjuntosSalida.repository';

export const MODULO_ADJUNTO_TANQUE = 'tanque_mov' as const;

export const adjuntosCombustible = crearRepoAdjuntos('combustible-adjuntos', 'combustible_adjuntos');
