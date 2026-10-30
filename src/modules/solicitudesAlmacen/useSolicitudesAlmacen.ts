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
  buscarProductoPorNombre, existenciasDe, existenciasMinaPorNombre, interruptorRevisionAlmacen, listRevisadasRecientes,
  listSolicitudesPorRevisar, stockPlano, type ExistenciaProducto, type SolicitudConRevision,
} from './solicitudesAlmacen.repository';
import {
  acotarDisponible, aplicarLote, porAlmacenDe, propuestaDesdeExistencias,
  type AlmacenRevision, type ModoLote, type PorAlmacen, type RevisionRenglon, type StockMinaPorNombre, type StockPorProducto,
} from './revisionAlmacen';

const claveNombre = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function useSolicitudesAlmacen() {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [porRevisar, setPorRevisar] = useState<SolicitudConRevision[]>([]);
  const [revisadas, setRevisadas] = useState<SolicitudConRevision[]>([]);
  const [existencias, setExistencias] = useState<Record<string, ExistenciaProducto>>({});
  // 30/10/2026 · lo que hay en el Depósito Mina (por nombre), para que Los Pinos lo vea al confirmar.
  const [stockMina, setStockMina] = useState<StockMinaPorNombre>({});
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
      const [ex, mina] = await Promise.all([existenciasDe(ids), existenciasMinaPorNombre().catch(() => ({} as StockMinaPorNombre))]);
      setExistencias(ex);
      setStockMina(mina);
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

  return { activo, porRevisar, revisadas, existencias, stock, stockMina, sugerido, loading, error, reload };
}

/**
 * Lo que Almacén va marcando en cada SP, por orden, renglón y almacén (Los Pinos / Depósito Mina).
 * Arranca con la propuesta según existencias: primero Los Pinos y lo que falte, de la Mina.
 */
export function useBorradores(stock: StockPorProducto, stockMina: StockMinaPorNombre = {}) {
  const [borradores, setBorradores] = useState<Record<string, Record<number, PorAlmacen>>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});

  const revisionDe = useCallback((s: SolicitudConRevision): RevisionRenglon[] => {
    const propuesta = propuestaDesdeExistencias(s.orden.items, stock, stockMina);
    const b = borradores[s.orden.id];
    if (!b) return propuesta;
    return propuesta.map((r) => {
      const pa = b[r.idx];
      return pa ? { idx: r.idx, cantidad_disponible: pa.los_pinos + pa.mina, por_almacen: pa } : r;
    });
  }, [borradores, stock, stockMina]);

  /** Fija lo que sale de UN almacén; el otro se recorta si entre los dos pasan de lo solicitado. */
  const fijar = useCallback((s: SolicitudConRevision, idx: number, valor: number | null, almacen: AlmacenRevision = 'los_pinos') => {
    const sol = Number(s.orden.items[idx]?.cantidad) || 0;
    setBorradores((prev) => {
      const actual = prev[s.orden.id]?.[idx]
        ?? porAlmacenDe(propuestaDesdeExistencias(s.orden.items, stock, stockMina)[idx]);
      // Lo que se acaba de escribir manda: si no cabe junto con el otro almacén, se recorta el otro.
      const fijo = acotarDisponible(valor, sol);
      const resto = Math.max(0, sol - fijo);
      const res: PorAlmacen = almacen === 'los_pinos'
        ? { los_pinos: fijo, mina: Math.min(actual.mina, resto) }
        : { los_pinos: Math.min(actual.los_pinos, resto), mina: fijo };
      return { ...prev, [s.orden.id]: { ...prev[s.orden.id], [idx]: res } };
    });
  }, [stock, stockMina]);

  const lote = useCallback((s: SolicitudConRevision, modo: ModoLote) => {
    const r = aplicarLote(s.orden.items, modo, stock, stockMina);
    setBorradores((prev) => ({ ...prev, [s.orden.id]: Object.fromEntries(r.map((x) => [x.idx, porAlmacenDe(x)])) }));
  }, [stock, stockMina]);

  const olvidar = useCallback((ordenId: string) => {
    setBorradores((prev) => { const n = { ...prev }; delete n[ordenId]; return n; });
    setNotas((prev) => { const n = { ...prev }; delete n[ordenId]; return n; });
  }, []);

  const nota = useCallback((ordenId: string) => notas[ordenId] ?? '', [notas]);
  const fijarNota = useCallback((ordenId: string, v: string) => setNotas((p) => ({ ...p, [ordenId]: v })), []);

  return { revisionDe, fijar, lote, olvidar, nota, fijarNota };
}
