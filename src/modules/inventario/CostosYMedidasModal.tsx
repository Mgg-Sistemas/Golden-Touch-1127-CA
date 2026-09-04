/* ============================================================
   Golden Touch · Inventario · Costos y medidas
   ------------------------------------------------------------
   Carga masiva de los dos datos que se quedan sin cargar cuando un
   producto nace desde otro módulo (una solicitud, una compra directa,
   una salida): el COSTO UNITARIO y la MEDIDA.

   Regla que se explica en pantalla, porque es la que confunde:
   el precio es lo que vale UNA unidad y se conserva aunque el
   producto quede en 0. Lo que depende del stock es el VALOR del
   inventario (stock × precio): con 0 unidades el producto aporta 0
   y vuelve a aportar cuando entra material.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { dosDecimales, money, num } from '@/shared/lib/format';
import { norm } from '@/shared/lib/texto';
import type { Producto } from '@/shared/lib/types';
import {
  cambiarMedidaProducto,
  fijarCostoProducto,
  getUnidades,
} from './inventario.repository';

interface Props {
  productos: Producto[];
  actor: string;
  actorName: string | null;
  canWrite: boolean;
  onClose: () => void;
  /** Se llama tras cada guardado para que la página recargue. */
  onGuardado: () => void;
}

/** Edición pendiente de una fila (lo tecleado y todavía no guardado). */
interface Borrador {
  precio?: string;
  unidad?: string;
}

type Filtro = 'sin_costo' | 'todos';

/** Productos a los que les falta el costo unitario. */
export function contarSinCosto(productos: Producto[]): number {
  return productos.filter((p) => p.estado === 'activo' && !(Number(p.precio) > 0)).length;
}

export function CostosYMedidasModal({ productos, actor, actorName, canWrite, onClose, onGuardado }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('sin_costo');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<string[]>([]);

  useEffect(() => {
    let cancelado = false;
    getUnidades(productos)
      .then((u) => { if (!cancelado) setUnidades(u); })
      .catch(() => { /* el repositorio ya cae a las medidas por defecto */ });
    return () => { cancelado = true; };
  }, [productos]);

  const activos = useMemo(() => productos.filter((p) => p.estado === 'activo'), [productos]);

  const categorias = useMemo(
    () => Array.from(new Set(activos.map((p) => p.categoria).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es')),
    [activos],
  );

  const filas = useMemo(() => {
    const texto = norm(q);
    return activos
      .filter((p) => (filtro === 'sin_costo' ? !(Number(p.precio) > 0) : true))
      .filter((p) => (cat ? p.categoria === cat : true))
      .filter((p) => {
        if (!texto) return true;
        const heno = [p.sku, p.nombre, p.nombre_busqueda, p.categoria, p.unidad]
          .map((c) => norm(String(c ?? ''))).join(' ');
        return texto.split(/\s+/).filter(Boolean).every((t) => heno.includes(t));
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [activos, filtro, cat, q]);

  const sinCosto = useMemo(() => contarSinCosto(productos), [productos]);

  /** Lo que el inventario recupera con lo tecleado: solo suma lo que TIENE stock. */
  const recupera = useMemo(() => {
    let valor = 0;
    let conValor = 0;
    let sinStock = 0;
    for (const p of activos) {
      const b = borradores[p.id];
      const precio = Number(b?.precio);
      if (!(precio > 0)) continue;
      const stock = Number(p.stock) || 0;
      if (stock > 0) { valor += stock * precio; conValor += 1; } else { sinStock += 1; }
    }
    return { valor, conValor, sinStock };
  }, [activos, borradores]);

  const pendientes = useMemo(
    () => filas.filter((p) => {
      const b = borradores[p.id];
      if (!b) return false;
      const precioOk = Number(b.precio) > 0;
      const medidaOk = !!b.unidad && b.unidad !== p.unidad;
      return precioOk || medidaOk;
    }),
    [filas, borradores],
  );

  function editar(id: string, patch: Borrador) {
    setBorradores((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  /** Guarda una fila: primero el costo (RPC atómica) y después la medida. */
  async function guardarFila(p: Producto): Promise<boolean> {
    const b = borradores[p.id];
    if (!b) return false;
    const precio = Number(b.precio);
    const medida = (b.unidad ?? '').trim();
    const cambiaPrecio = precio > 0;
    const cambiaMedida = !!medida && medida !== p.unidad;
    if (!cambiaPrecio && !cambiaMedida) return false;
    if (cambiaPrecio) await fijarCostoProducto(p.id, precio, actor, actorName);
    if (cambiaMedida) await cambiarMedidaProducto(p.id, medida);
    setBorradores((prev) => {
      const next = { ...prev };
      delete next[p.id];
      return next;
    });
    return true;
  }

  async function handleGuardarFila(p: Producto) {
    setGuardando(p.id);
    try {
      if (await guardarFila(p)) {
        toast(`${p.nombre}: guardado`, 'success');
        onGuardado();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar', 'error');
    } finally {
      setGuardando(null);
    }
  }

  async function handleGuardarTodo() {
    setGuardando('__todo__');
    let ok = 0;
    const fallidos: string[] = [];
    for (const p of pendientes) {
      try {
        if (await guardarFila(p)) ok += 1;
      } catch {
        fallidos.push(p.sku || p.nombre);
      }
    }
    setGuardando(null);
    if (ok > 0) {
      toast(`${ok} producto(s) guardado(s)`, 'success');
      onGuardado();
    }
    if (fallidos.length) toast(`No se pudieron guardar: ${fallidos.join(', ')}`, 'error');
  }

  const medidasDisponibles = (actual: string) =>
    (unidades.includes(actual) || !actual ? unidades : [actual, ...unidades]);

  return (
    <Modal
      title="Costos y medidas de los productos"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <span className="muted" style={{ marginRight: 'auto', fontSize: '.8rem' }}>
            {sinCosto > 0
              ? `${num(sinCosto)} producto(s) activos sin costo cargado`
              : 'Todos los productos activos tienen su costo cargado'}
          </span>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {canWrite && (
            <button
              className="btn btn-primary"
              disabled={pendientes.length === 0 || guardando !== null}
              onClick={() => { void handleGuardarTodo(); }}
            >
              {guardando === '__todo__'
                ? 'Guardando…'
                : `Guardar ${pendientes.length > 0 ? `los ${pendientes.length} pendientes` : 'pendientes'}`}
            </button>
          )}
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Estos productos existen y se pueden mover, pero valen <strong>$0</strong> en el inventario:
        el material está, el valor no. Cargá el <strong>costo unitario</strong> y, si hace falta,
        corregí la <strong>medida</strong>. Cada costo cargado queda como un ajuste en el kardex,
        con quién lo valoró y cuándo.
      </p>
      <p className="muted" style={{ fontSize: '.8rem' }}>
        El precio es lo que vale <strong>una</strong> unidad y se conserva aunque el producto
        quede en 0. Lo que depende del stock es el <strong>valor del inventario</strong>
        {' '}(stock × precio): con 0 unidades el producto aporta 0 y vuelve a aportar en cuanto
        entre material.
      </p>

      <div className="filterbar" style={{ marginBottom: '.75rem' }}>
        <input
          className="input"
          placeholder="Buscar por nombre o SKU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: '1 1 16rem', minWidth: 0 }}
        />
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
          <option value="sin_costo">Solo los que no tienen costo</option>
          <option value="todos">Todos los productos activos</option>
        </select>
      </div>

      {recupera.conValor > 0 && (
        <div
          className="card"
          style={{ borderColor: 'var(--success)', padding: '.75rem 1rem', marginBottom: '.75rem' }}
        >
          Con lo cargado el inventario recupera <strong>{money(recupera.valor)}</strong>
          {' '}en {num(recupera.conValor)} producto(s) con stock.
          {recupera.sinStock > 0 && (
            <span className="muted">
              {' '}Otros {num(recupera.sinStock)} quedan valorados pero en 0: suman cuando entre material.
            </span>
          )}
        </div>
      )}

      {filas.length === 0 ? (
        <EmptyState
          message={filtro === 'sin_costo'
            ? 'No hay productos sin costo con esos filtros.'
            : 'Ningún producto coincide con esos filtros.'}
          icon="$"
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th>Medida</th>
                <th style={{ textAlign: 'right' }}>Costo unitario</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                {canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const b = borradores[p.id] ?? {};
                const medida = b.unidad ?? p.unidad ?? '';
                const precioTexto = b.precio ?? '';
                const precio = Number(precioTexto) > 0 ? Number(precioTexto) : (Number(p.precio) || 0);
                const stock = Number(p.stock) || 0;
                const valor = stock * precio;
                const hayCambio = Number(precioTexto) > 0 || (!!b.unidad && b.unidad !== p.unidad);
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nombre}</strong>
                      <div className="muted" style={{ fontSize: '.72rem' }}>
                        <span className="mono">{p.sku}</span> · {p.categoria}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }} className="mono">
                      {num(stock)}
                      {stock === 0 && (
                        <span className="badge warning" style={{ marginLeft: '.35rem' }}>en 0</span>
                      )}
                    </td>
                    <td>
                      <select
                        className="select"
                        value={medida}
                        disabled={!canWrite}
                        onChange={(e) => editar(p.id, { unidad: e.target.value })}
                      >
                        {medidasDisponibles(medida).map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        className="input mono"
                        inputMode="decimal"
                        placeholder={Number(p.precio) > 0 ? String(p.precio) : '0,00'}
                        value={precioTexto}
                        disabled={!canWrite}
                        onChange={(e) => editar(p.id, { precio: dosDecimales(e.target.value) })}
                        style={{ textAlign: 'right', maxWidth: '9rem' }}
                        title="Costo de UNA unidad. Se guarda como precio del producto y como costo del inventario."
                      />
                    </td>
                    <td style={{ textAlign: 'right' }} className="mono">
                      {precio > 0 && stock > 0 ? money(valor) : '—'}
                    </td>
                    {canWrite && (
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-icon btn-ghost"
                          disabled={!hayCambio || guardando !== null}
                          onClick={() => { void handleGuardarFila(p); }}
                          title={hayCambio ? 'Guardar este producto' : 'Sin cambios que guardar'}
                          aria-label="Guardar"
                        >
                          {guardando === p.id ? '…' : '✓'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
