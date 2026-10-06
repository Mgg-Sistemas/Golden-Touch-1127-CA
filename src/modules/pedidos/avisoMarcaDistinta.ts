/* Golden Touch · Aviso a Compras cuando en una recepción llegó otra marca (06/10/2026). */
import type { Orden } from '@/shared/lib/types';
import { notify } from '@/shared/lib/notify';
import { cambiosDeMarcaEnRecepcion, type RecepcionRenglon } from './pedidos.repository';

/** Si llegó otra marca en algún renglón, Compras se entera por la campana. */
export function avisarCambiosDeMarca(orden: Orden, recepciones: RecepcionRenglon[]): void {
  const cambios = cambiosDeMarcaEnRecepcion(orden, recepciones);
  if (!cambios.length) return;
  notify(
    `Llegó otra marca · ${orden.oc_codigo ?? orden.codigo}`,
    'warning',
    { link: '#/app/pedidos', detail: cambios.map((c) => `${c.nombre}: ${c.cambio}`).join(' · ') },
  );
}
