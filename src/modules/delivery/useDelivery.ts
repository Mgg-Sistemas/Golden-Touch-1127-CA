/* ============================================================
   Golden Touch · Delivery · Estado compartido (30/10/2026)

   Lo usan la PC y el teléfono: el interruptor, los pedidos (con su OC,
   proveedor y analista), el historial y la última ubicación de cada
   motorizado. Se refresca solo por realtime.

   Con el interruptor apagado no hay pedidos, pero las ubicaciones se siguen
   leyendo (para probar el mapa antes de encenderlo).
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtime } from '@/shared/lib/useRealtime';
import { mensajeError } from '@/shared/lib/errores';
import type { EventoDeliveryRow, UbicacionDelivery } from './delivery.types';
import type { PedidoDeliveryConRetencion } from './delivery';
import {
  deliveryActivo, listEventosDelivery, listPedidosDelivery, listUbicaciones,
} from './delivery.repository';

const TABLAS = ['delivery_pedidos', 'delivery_eventos', 'delivery_ubicaciones', 'sistema_interruptores', 'ordenes'];

export function useDelivery() {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [pedidos, setPedidos] = useState<PedidoDeliveryConRetencion[]>([]);
  const [eventos, setEventos] = useState<EventoDeliveryRow[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Solo vale la respuesta de la última recarga (si llegan dos seguidas por realtime).
  const turno = useRef(0);

  const reload = useCallback(async () => {
    const yo = ++turno.current;
    try {
      const on = await deliveryActivo();
      if (yo !== turno.current) return;
      setActivo(on);
      // Quien no puede leer las ubicaciones (el motorizado) simplemente no las ve.
      const ubic = listUbicaciones().catch(() => [] as UbicacionDelivery[]);
      if (!on) {
        const u = await ubic;
        if (yo !== turno.current) return;
        setPedidos([]); setEventos([]); setUbicaciones(u); setError(null);
        return;
      }
      const [ps, evs, u] = await Promise.all([listPedidosDelivery(), listEventosDelivery(), ubic]);
      if (yo !== turno.current) return;
      setPedidos(ps); setEventos(evs); setUbicaciones(u); setError(null);
    } catch (e) {
      if (yo === turno.current) setError(mensajeError(e, 'No se pudo cargar Delivery.'));
    } finally {
      if (yo === turno.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime(TABLAS, () => { void reload(); });

  return { activo, loading, error, pedidos, eventos, ubicaciones, reload };
}
