import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { editarPreciosOrdenPorPagar } from './pedidos.repository';
import type { ItemOrden, Orden } from '@/shared/lib/types';

/** Formato de monto local (mismo criterio que Tesorería). */
function monto(n: number | null | undefined, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$ ${v}` : `${moneda} ${v}`;
}

/**
 * Editar precios y AGREGAR productos (hasta 3) a una OC ya «Confirmada pagar»
 * (`confirmada_metodo` u `oc_aprobada`) SIN devolverla a aprobación. El total a pagar
 * se recalcula por la diferencia y se sincroniza en Tesorería (que lee `total`). Se usa
 * tanto desde Compras/Pedidos como desde Tesorería.
 */
export function EditarPreciosOcModal({ orden: o, actor, onClose, onSaved }: {
  orden: Orden; actor: string; onClose: () => void; onSaved: () => Promise<void> | void;
}) {
  // El total que paga Tesorería está en divisa cuando el pago es en divisa; si no, en la
  // moneda de la OC. Se edita el precio que ALIMENTA ese total (precio_usd o precio).
  const enDivisa = !!o.pago_en_divisa;
  const moneda = enDivisa ? 'USD' : (o.total_moneda ?? 'USD');
  const priceKey: 'precio' | 'precio_usd' = enDivisa ? 'precio_usd' : 'precio';
  const [items, setItems] = useState<ItemOrden[]>(() => (o.items ?? []).map((i) => ({ ...i })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Los ítems ORIGINALES de la OC ocupan los primeros `origLen` índices; los que se
  // agreguen acá quedan a partir de ahí y son totalmente editables (nombre, cant., precio).
  const origLen = (o.items ?? []).length;
  const MAX_NUEVOS = 3; // «solo 2 o 3 productos»
  const nuevos = Math.max(0, items.length - origLen);

  const idxComprar = items.map((it, i) => ({ it, i })).filter(({ it }) => it.comprar !== false);
  function setPrecio(i: number, v: string) {
    const n = Number(v);
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [priceKey]: Number.isFinite(n) ? n : 0 } : it)));
  }
  function setNombre(i: number, v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, nombre: v } : it)));
  }
  function setCantidad(i: number, v: string) {
    const n = Number(v);
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, cantidad: Number.isFinite(n) && n > 0 ? n : 0 } : it)));
  }
  function agregarItem() {
    if (nuevos >= MAX_NUEVOS) return;
    setItems((prev) => [...prev, {
      sku: '', nombre: '', cantidad: 1, precio: 0, precio_usd: enDivisa ? 0 : null,
      comprar: true, marca: null, es_servicio: true,
    } as ItemOrden]);
  }
  function quitarItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const baseNew = idxComprar.reduce((a, { it }) => a + Number(it.cantidad) * (Number(it[priceKey]) || 0), 0);
  const baseOld = (o.items ?? []).filter((i) => i.comprar !== false)
    .reduce((a, i) => a + Number(i.cantidad) * (Number(i[priceKey]) || 0), 0);
  const totalNuevo = Math.max(0, r2((Number(o.total) || 0) + r2(baseNew - baseOld)));

  async function guardar() {
    setError(null);
    // Los ítems agregados acá deben tener nombre y cantidad válida.
    const nuevosInvalidos = items.slice(origLen).some((it) => !it.nombre.trim() || !(Number(it.cantidad) > 0));
    if (nuevosInvalidos) { setError('Completá nombre y cantidad (> 0) de los productos agregados.'); return; }
    setSaving(true);
    try {
      const limpios = items.map((it) => (it.nombre ? { ...it, nombre: it.nombre.trim() } : it));
      await editarPreciosOrdenPorPagar(o, limpios, actor);
      toast('OC actualizada · el total a pagar quedó sincronizado', 'success');
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); setSaving(false); }
  }

  return (
    <Modal title={`✏️ Editar precios · ${o.oc_codigo ?? o.codigo}`} size="lg" onClose={() => !saving && onClose()} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => void guardar()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar precios'}</button>
      </>
    }>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.6rem' }}><strong>Error:</strong> {error}</div>}
      <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
        Ajustá el <strong>precio unitario</strong> de cada ítem y, si hace falta, <strong>agregá productos</strong> (hasta {MAX_NUEVOS}). El <strong>total a pagar</strong> se recalcula por la diferencia (se conservan IVA/IGTF/descuentos). El cambio queda en la <strong>traza</strong> de la OC y se sincroniza en Tesorería.
      </p>
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Producto</th><th className="num">Cant.</th><th className="num">Precio unit. ({moneda})</th><th className="num">Subtotal</th><th></th></tr></thead>
          <tbody>
            {idxComprar.map(({ it, i }) => {
              const esNuevo = i >= origLen;
              return (
              <tr key={i}>
                <td>
                  {esNuevo ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                      <span className="badge" style={{ background: 'var(--primary-3, #ff8a00)', color: '#000' }}>NUEVO</span>
                      <input className="input" style={{ minWidth: 160 }} placeholder="Nombre del producto"
                        value={it.nombre} onChange={(e) => setNombre(i, e.target.value)} />
                    </div>
                  ) : (
                    <>{it.nombre}{it.marca ? <span className="muted"> · {it.marca}</span> : ''}</>
                  )}
                </td>
                <td className="num">
                  {esNuevo ? (
                    <input className="input mono" type="number" min={0} step="any" style={{ width: 80, textAlign: 'right' }}
                      value={String(it.cantidad ?? 0)} onChange={(e) => setCantidad(i, e.target.value)} />
                  ) : (
                    <span className="mono">{Number(it.cantidad)}</span>
                  )}
                </td>
                <td className="num">
                  <input className="input mono" type="number" min={0} step="any" style={{ width: 130, textAlign: 'right' }}
                    value={String(it[priceKey] ?? 0)} onChange={(e) => setPrecio(i, e.target.value)} />
                </td>
                <td className="num mono">{monto(Number(it.cantidad) * (Number(it[priceKey]) || 0), moneda)}</td>
                <td className="num">
                  {esNuevo && (
                    <button type="button" className="btn btn-ghost btn-sm" title="Quitar producto agregado"
                      onClick={() => quitarItem(i)} disabled={saving}>✕</button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '.5rem' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={agregarItem} disabled={saving || nuevos >= MAX_NUEVOS}>
          ＋ Agregar producto {nuevos >= MAX_NUEVOS ? `(máx. ${MAX_NUEVOS})` : ''}
        </button>
      </div>
      <div className="card" style={{ marginTop: '.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
        <div className="muted" style={{ fontSize: '.8rem' }}>Total actual: <strong className="mono">{monto(Number(o.total) || 0, moneda)}</strong></div>
        <div style={{ fontSize: '1.05rem' }}>Nuevo total a pagar: <strong className="mono" style={{ color: 'var(--primary-3, #ff8a00)' }}>{monto(totalNuevo, moneda)}</strong></div>
      </div>
    </Modal>
  );
}
