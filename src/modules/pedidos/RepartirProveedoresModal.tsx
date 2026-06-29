import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money } from '@/shared/lib/format';
import type { ItemOrden, OfertaProveedor, Orden, Proveedor } from '@/shared/lib/types';
import { repartirOpEntreProveedores, type GrupoReparto } from './pedidos.repository';

/** Clave estable de un ítem (para casar el mismo producto entre la OP y las ofertas). */
const keyItem = (it: ItemOrden) => it.productoId ?? it.sku ?? it.nombre;

/**
 * Reparte una OP entre varios proveedores: por cada ítem se elige a QUÉ proveedor
 * (oferta) comprárselo. Un ítem va a un solo proveedor (queda bloqueado para los
 * demás). Al confirmar se crea una OC por proveedor (cada una con su pago y PDF).
 */
export function RepartirProveedoresModal({
  orden, ofertas, proveedorMap, actorEmail, onClose, onDone,
}: {
  orden: Orden;
  ofertas: OfertaProveedor[];
  proveedorMap: Map<string, Proveedor>;
  actorEmail: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const itemsCompra = useMemo(() => orden.items.filter((i) => i.comprar !== false), [orden.items]);

  // Precio de un ítem en una oferta (0 si la oferta no lo cotiza).
  const precioEn = (it: ItemOrden, of: OfertaProveedor) =>
    Number(of.items.find((x) => keyItem(x) === keyItem(it))?.precio) || 0;
  // Marca/modelo que ESE proveedor ofertó para el ítem (para mostrar el detalle al elegirlo).
  const fichaEn = (it: ItemOrden, of: OfertaProveedor): string => {
    const x = of.items.find((y) => keyItem(y) === keyItem(it));
    return [x?.marca, x?.modelo].map((v) => (v ?? '').toString().trim()).filter(Boolean).join(' · ');
  };
  // Proveedores (ofertas) que cotizan cada ítem.
  const ofertasDe = (it: ItemOrden) => ofertas.filter((of) => of.items.some((x) => keyItem(x) === keyItem(it)));

  // Asignación ítem → ofertaId. Por defecto, la oferta más barata de cada ítem.
  const [asig, setAsig] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const it of itemsCompra) {
      const ofs = ofertasDe(it);
      if (ofs.length) {
        const mejor = ofs.slice().sort((a, b) => precioEn(it, a) - precioEn(it, b))[0];
        m[keyItem(it)] = mejor.id;
      }
    }
    return m;
  });
  const [saving, setSaving] = useState(false);

  // Agrupar por oferta/proveedor para el resumen y el guardado.
  const grupos = useMemo<GrupoReparto[]>(() => {
    const porOferta = new Map<string, { of: OfertaProveedor; items: ItemOrden[] }>();
    for (const it of itemsCompra) {
      const ofId = asig[keyItem(it)];
      if (!ofId) continue;
      const of = ofertas.find((o) => o.id === ofId);
      if (!of) continue;
      const cur = porOferta.get(ofId) ?? { of, items: [] };
      cur.items.push({ ...it, precio: precioEn(it, of) });
      porOferta.set(ofId, cur);
    }
    return Array.from(porOferta.values()).map(({ of, items }) => {
      const total = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
      // Total en divisa proporcional al peso de estos ítems dentro de la oferta.
      const totalOferta = Number(of.precio_total) || 0;
      const divisaOferta = of.precio_divisa != null ? Number(of.precio_divisa) : null;
      const totalDivisa = divisaOferta != null && totalOferta > 0
        ? Math.round(divisaOferta * (total / totalOferta) * 100) / 100
        : null;
      // Descuento obtenido prorrateado al peso de estos ítems dentro de la oferta.
      const descOferta = Number(of.descuento_obtenido) || 0;
      const descuentoObtenido = descOferta > 0 && totalOferta > 0
        ? Math.round(descOferta * (total / totalOferta) * 100) / 100
        : 0;
      return { proveedorId: of.proveedor_id, items, total, totalDivisa, condicionesPago: of.condiciones_pago ?? null, descuentoObtenido };
    });
  }, [asig, itemsCompra, ofertas]);

  const sinAsignar = itemsCompra.filter((it) => !asig[keyItem(it)]);
  // Ítems asignados pero con precio 0 (sin oferta real): también vuelven a la SP madre como pendientes.
  const sinPrecio = itemsCompra.filter((it) => {
    const ofId = asig[keyItem(it)];
    if (!ofId) return false;
    const of = ofertas.find((o) => o.id === ofId);
    return of ? precioEn(it, of) <= 0 : false;
  });
  const pendientes = [...sinAsignar, ...sinPrecio];
  const hayConPrecio = grupos.some((g) => g.items.some((i) => i.precio > 0));
  const totalGeneral = grupos.reduce((a, g) => a + g.total, 0);

  async function confirmar() {
    if (!hayConPrecio) { toast('Asigná al menos un ítem con precio a un proveedor.', 'error'); return; }
    setSaving(true);
    try {
      const hijos = await repartirOpEntreProveedores(orden, grupos, actorEmail);
      const extra = pendientes.length
        ? ` · ${pendientes.length} ítem(s) quedaron en ${orden.codigo} (Pendiente cargar ofertas)`
        : '';
      notify(`OP repartida en ${hijos.length} orden(es) de compra · pendiente(s) por aprobación del GG${extra}`, 'success', { link: '#/app/pedidos' });
      onDone();
    } catch (e) {
      const msg = e instanceof Error
        ? e.message
        : (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '');
      toast(msg || 'No se pudo repartir la orden', 'error');
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button className="btn btn-primary" onClick={() => void confirmar()} disabled={saving || !hayConPrecio}>
        {saving ? 'Creando…' : `Crear ${grupos.filter((g) => g.items.some((i) => i.precio > 0)).length} OC(s)`}
      </button>
    </>
  );

  return (
    <Modal title={`Repartir entre proveedores · ${orden.codigo}`} size="lg" onClose={onClose} footer={footer}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
        Elegí a qué proveedor comprarle cada ítem. Cada ítem va a un solo proveedor. Al confirmar se crea
        <strong> una Orden de Compra por proveedor</strong> (cada una con su método de pago y su PDF).
      </p>

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead>
            <tr><th>Producto</th><th className="num">Cant.</th><th>Proveedor (precio unit.)</th><th className="num">Subtotal</th></tr>
          </thead>
          <tbody>
            {itemsCompra.map((it) => {
              const ofs = ofertasDe(it);
              const ofId = asig[keyItem(it)];
              const of = ofertas.find((o) => o.id === ofId) ?? null;
              const sub = of ? it.cantidad * precioEn(it, of) : 0;
              return (
                <tr key={keyItem(it)}>
                  <td>{it.nombre}<div className="muted mono" style={{ fontSize: '.72rem' }}>{it.sku}</div>
                    {of && fichaEn(it, of) && (
                      <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--brand, #ff8a00)', marginTop: '.15rem' }}>🏷 {fichaEn(it, of)}</div>
                    )}
                  </td>
                  <td className="num mono">{it.cantidad}{it.unidad ? ` ${it.unidad}` : ''}</td>
                  <td>
                    {!ofs.length ? (
                      <span className="muted">Ningún proveedor lo cotizó</span>
                    ) : (
                      <select className="select" value={ofId ?? ''} onChange={(e) => setAsig((p) => ({ ...p, [keyItem(it)]: e.target.value }))}>
                        <option value="">— elegir —</option>
                        {ofs.slice().sort((a, b) => precioEn(it, a) - precioEn(it, b)).map((o) => {
                          const f = fichaEn(it, o);
                          return (
                            <option key={o.id} value={o.id}>
                              {proveedorMap.get(o.proveedor_id)?.razon_social ?? '—'} · {money(precioEn(it, o))}{f ? ` · ${f}` : ''}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </td>
                  <td className="num mono">{of ? money(sub) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Resumen por proveedor */}
      <div className="card" style={{ marginTop: '.8rem', background: 'var(--surface-2)' }}>
        <div className="card-title" style={{ fontSize: '.85rem' }}><span>Órdenes a generar ({grupos.length})</span></div>
        {!grupos.length ? <p className="muted" style={{ margin: 0 }}>Asigná ítems para ver las órdenes.</p> : (
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Proveedor</th><th className="num">Ítems</th><th className="num">Total (BCV)</th><th className="num">Total divisa</th></tr></thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.proveedorId}>
                  <td>{proveedorMap.get(g.proveedorId)?.razon_social ?? '—'}</td>
                  <td className="num mono">{g.items.length}</td>
                  <td className="num mono">{money(g.total)}</td>
                  <td className="num mono">{g.totalDivisa != null ? money(g.totalDivisa) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ textAlign: 'right' }}>Total</td><td className="num mono">{money(totalGeneral)}</td><td></td></tr></tfoot>
          </table>
        )}
      </div>
      {pendientes.length > 0 && (
        <p style={{ color: 'var(--warning, #f59e0b)', fontSize: '.8rem', marginBottom: 0 }}>
          ⚠ {pendientes.length} ítem(s) {sinPrecio.length ? 'sin asignar o en $0' : 'sin asignar'}: <strong>{pendientes.map((it) => it.nombre).join(', ')}</strong>.
          Al crear las OC, esos ítems <strong>quedan en {orden.codigo}</strong> en «Pendiente (cargar ofertas)» para cotizarlos y repartirlos aparte.
        </p>
      )}
    </Modal>
  );
}
