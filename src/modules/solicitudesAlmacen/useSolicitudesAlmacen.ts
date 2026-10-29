/* ============================================================
   Golden Touch · Solicitudes de Pedido · Estado compartido (29/10/2026)

   Lo usan la pantalla de PC y la de teléfono: el interruptor, las SP por
   revisar, las revisadas de la semana, las existencias y el borrador de lo
   que Almacén va marcando en cada SP (se conserva mientras la pantalla esté
   abierta aunque entre un cambio por realtime).
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtime } from '@/shared/lib/useRealtime';
import { mensajeError } from '@/shared/lib/errores';
import type { ProductoParecido } from '@/modules/inventario/inventario.repository';
import {
  buscarProductoPorNombre, existenciasDe, interruptorRevisionAlmacen, listRevisadasRecientes,
  listSolicitudesPorRevisar, stockPlano, type ExistenciaProducto, type SolicitudConRevision,
} from './solicitudesAlmacen.repository';
import {
  acotarDisponible, aplicarLote, propuestaDesdeExistencias, type ModoLote, type RevisionRenglon, type StockPorProducto,
} from './revisionAlmacen';

const claveNombre = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function useSolicitudesAlmacen() {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [porRevisar, setPorRevisar] = useState<SolicitudConRevision[]>([]);
  const [revisadas, setRevisadas] = useState<SolicitudConRevision[]>([]);
  const [existencias, setExistencias] = useState<Record<string, ExistenciaProducto>>({});
  const [sugeridos, setSugeridos] = useState<Record<string, ProductoParecido | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const buscados = useRef(new Set<string>());

  const reload = useCallback(async () => {
    try {
      const on = await interruptorRevisionAlmacen();
      setActivo(on);
      if (!on) { setPorRevisar([]); setRevisadas([]); setError(null); return; }
      const [pr, rv] = await Promise.all([listSolicitudesPorRevisar(), listRevisadasRecientes(7)]);
      const ids = pr.flatMap((s) => s.orden.items.map((i) => i.productoId ?? '')).filter(Boolean);
      setExistencias(await existenciasDe(ids));
      setPorRevisar(pr);
      setRevisadas(rv);
      setError(null);
      // Renglones escritos a mano: se busca una sola vez el parecido del inventario.
      const nuevos = [...new Set(pr.flatMap((s) => s.orden.items.filter((i) => !i.productoId).map((i) => i.nombre ?? '')))]
        .filter((n) => n.trim().length >= 3 && !buscados.current.has(claveNombre(n)));
      if (nuevos.length) {
        nuevos.forEach((n) => buscados.current.add(claveNombre(n)));
        const res = await Promise.all(nuevos.map(async (n) => [claveNombre(n), await buscarProductoPorNombre(n)] as const));
        setSugeridos((prev) => ({ ...prev, ...Object.fromEntries(res) }));
      }
    } catch (e) {
      setError(mensajeError(e, 'No se pudieron cargar las solicitudes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime(['ordenes', 'solicitudes_revision_almacen', 'sistema_interruptores'], () => { void reload(); });

  const stock: StockPorProducto = useMemo(() => stockPlano(existencias), [existencias]);
  const sugerido = useCallback((nombre: string) => sugeridos[claveNombre(nombre ?? '')] ?? null, [sugeridos]);

  return { activo, porRevisar, revisadas, existencias, stock, sugerido, loading, error, reload };
}

/** Lo que Almacén va marcando en cada SP, por orden y renglón. Arranca con la propuesta según existencias. */
export function useBorradores(stock: StockPorProducto) {
  const [borradores, setBorradores] = useState<Record<string, Record<number, number>>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});

  const revisionDe = useCallback((s: SolicitudConRevision): RevisionRenglon[] => {
    const propuesta = propuestaDesdeExistencias(s.orden.items, stock);
    const b = borradores[s.orden.id];
    if (!b) return propuesta;
    return propuesta.map((r) => (r.idx in b ? { idx: r.idx, cantidad_disponible: b[r.idx] } : r));
  }, [borradores, stock]);

  const fijar = useCallback((s: SolicitudConRevision, idx: number, valor: number | null) => {
    const sol = Number(s.orden.items[idx]?.cantidad) || 0;
    setBorradores((prev) => ({ ...prev, [s.orden.id]: { ...prev[s.orden.id], [idx]: acotarDisponible(valor, sol) } }));
  }, []);

  const lote = useCallback((s: SolicitudConRevision, modo: ModoLote) => {
    const r = aplicarLote(s.orden.items, modo, stock);
    setBorradores((prev) => ({ ...prev, [s.orden.id]: Object.fromEntries(r.map((x) => [x.idx, x.cantidad_disponible])) }));
  }, [stock]);

  const olvidar = useCallback((ordenId: string) => {
    setBorradores((prev) => { const n = { ...prev }; delete n[ordenId]; return n; });
    setNotas((prev) => { const n = { ...prev }; delete n[ordenId]; return n; });
  }, []);

  const nota = useCallback((ordenId: string) => notas[ordenId] ?? '', [notas]);
  const fijarNota = useCallback((ordenId: string, v: string) => setNotas((p) => ({ ...p, [ordenId]: v })), []);

  return { revisionDe, fijar, lote, olvidar, nota, fijarNota };
}
