import { Fragment, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money } from '@/shared/lib/format';
import type { ItemOrden, OfertaProveedor, Orden, Proveedor } from '@/shared/lib/types';
import { repartirOpEntreProveedores, type GrupoReparto } from './pedidos.repository';
import { rotuloMarcaModelo } from '@/shared/lib/marcaModelo';
import { rotuloConversion } from '@/modules/inventario/presentaciones';
import {
  ajusteInicial, cambiarModo, cotizaEnOtraUnidad, faltaFactor, precioUsoDe, renglonReparto,
  unidadCotizadaDe, unidadUsoDe, type AjusteRenglon, type ModoUnidad,
} from './repartoRenglon';

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

  // Lo que ESA oferta cotizó para el ítem (cantidad, unidad, factor y precio).
  const ofertadoEn = (it: ItemOrden, of: OfertaProveedor) => of.items.find((x) => keyItem(x) === keyItem(it));
  // Cambios de unidad/cantidad que hizo Compras en el reparto, por ítem Y oferta: al
  // cambiar de proveedor se arranca otra vez de lo que cotizó el nuevo.
  const [ajustes, setAjustes] = useState<Record<string, AjusteRenglon>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const claveAj = (it: ItemOrden, of: OfertaProveedor) => `${keyItem(it)}|${of.id}`;
  const ajusteDe = (it: ItemOrden, of: OfertaProveedor): AjusteRenglon =>
    ajustes[claveAj(it, of)] ?? ajusteInicial(it, ofertadoEn(it, of));
  const ajustar = (it: ItemOrden, of: OfertaProveedor, aj: AjusteRenglon | null) =>
    setAjustes((p) => {
      const n = { ...p };
      if (aj) n[claveAj(it, of)] = aj; else delete n[claveAj(it, of)];
      return n;
    });
  // El renglón tal como irá a la OC hija: por defecto, lo que cotizó el proveedor
  // (2 PAILA × $230), no la cantidad/unidad de la OP con el precio de la oferta.
  const renglonEn = (it: ItemOrden, of: OfertaProveedor) =>
    renglonReparto(it, ofertadoEn(it, of), ajusteDe(it, of));
  // Precio de un ítem en una oferta (0 si la oferta no lo cotiza).
  const precioEn = (it: ItemOrden, of: OfertaProveedor) => (ofertadoEn(it, of) ? renglonEn(it, of).precio : 0);
  // Precio por unidad de USO (para comparar: una PAILA de 5 GALON no es «más cara» que un GALON).
  const precioUsoEn = (it: ItemOrden, of: OfertaProveedor) => precioUsoDe(ajusteDe(it, of), ofertadoEn(it, of));
  // Marca/modelo que ESE proveedor ofertó para el ítem (para mostrar el detalle al elegirlo).
  const fichaEn = (it: ItemOrden, of: OfertaProveedor): string =>
    rotuloMarcaModelo(of.items.find((y) => keyItem(y) === keyItem(it)) ?? {});
  // Proveedores (ofertas) que cotizan cada ítem.
  const ofertasDe = (it: ItemOrden) => ofertas.filter((of) => of.items.some((x) => keyItem(x) === keyItem(it)));

  // Asignación ítem → ofertaId. Por defecto, la oferta más barata de cada ítem.
  const [asig, setAsig] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const it of itemsCompra) {
      const ofs = ofertasDe(it);
      if (ofs.length) {
        // Se compara por unidad de USO: un SACO de 25 KG no es «más caro» que un KG.
        const mejor = ofs.slice().sort((a, b) => precioUsoEn(it, a) - precioUsoEn(it, b))[0];
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
      // Los renglones se arman sobre los de la OP, así que hay que traer de la oferta
      // ganadora lo que es suyo: el precio Y la marca/modelo que ESE proveedor cotizó.
      // Antes solo se copiaba el precio y la OC hija salía sin marca, aunque la oferta
      // la dijera. Si la oferta no la aclara, queda la que pidió la solicitud.
      const ofertado = ofertadoEn(it, of);
      // Cantidad, unidad (PAILA, SACO…) y precio: los que cotizó ese proveedor, o los que
      // Compras ajustó aquí. Así la OC hija dice lo mismo que la fila del reparto.
      cur.items.push({
        ...renglonEn(it, of),
        marca: ofertado?.marca?.trim() || it.marca || null,
        modelo: ofertado?.modelo?.trim() || it.modelo || null,
      });
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
      // Peso de estos ítems dentro de la oferta (para prorratear descuento e impuestos).
      const peso = totalOferta > 0 ? total / totalOferta : 0;
      // Descuento obtenido prorrateado al peso de estos ítems dentro de la oferta.
      const descOferta = Number(of.descuento_obtenido) || 0;
      const descuentoObtenido = descOferta > 0 ? Math.round(descOferta * peso * 100) / 100 : 0;
      // IVA/IGTF: se RECALCULAN sobre la base real de esta hija con el % de la oferta
      // (fuente única = la oferta). Recalcular por % es más robusto que prorratear el monto,
      // porque la oferta puede tener precio_total ≠ Σ ítems (evita inflar/subvaluar el IVA).
      const baseNeta = Math.round((total - descuentoObtenido) * 100) / 100;
      const ivaAplicado = !!of.iva_aplicado;
      const ivaPct = ivaAplicado ? Number(of.iva_pct) || 0 : 0;
      const ivaMonto = ivaAplicado ? Math.round(baseNeta * (ivaPct / 100) * 100) / 100 : 0;
      const igtfAplicado = !!of.igtf_aplicado;
      const igtfPct = igtfAplicado ? Number(of.igtf_pct) || 0 : 0;
      const igtfMonto = igtfAplicado ? Math.round(baseNeta * (igtfPct / 100) * 100) / 100 : 0;
      return {
        proveedorId: of.proveedor_id, items, total, totalDivisa,
        condicionesPago: of.condiciones_pago ?? null, descuentoObtenido,
        ivaAplicado, ivaPct, ivaMonto, igtfAplicado, igtfPct, igtfMonto,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asig, itemsCompra, ofertas, ajustes]);

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
  // Total real que pagará cada hija: base − descuento + IVA/IGTF (prorrateados).
  const totalConImp = (g: GrupoReparto) => Math.round((
    g.total - (Number(g.descuentoObtenido) || 0) + (Number(g.ivaMonto) || 0) + (Number(g.igtfMonto) || 0)
  ) * 100) / 100;
  const impDe = (g: GrupoReparto) => Math.round(((Number(g.ivaMonto) || 0) + (Number(g.igtfMonto) || 0)) * 100) / 100;
  const totalGeneral = grupos.reduce((a, g) => a + totalConImp(g), 0);

  async function confirmar() {
    if (!hayConPrecio) { toast('Asigna al menos un ítem con precio a un proveedor.', 'error'); return; }
    const sinCantidad = grupos.flatMap((g) => g.items).filter((i) => i.precio > 0 && !(Number(i.cantidad) > 0));
    if (sinCantidad.length) { toast(`Indica la cantidad de: ${sinCantidad.map((i) => i.nombre).join(', ')}.`, 'error'); return; }
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
        Elige a qué proveedor comprarle cada ítem. Cada ítem va a un solo proveedor. Al confirmar se crea
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
              const ren = of ? renglonEn(it, of) : null;
              const sub = ren ? ren.cantidad * ren.precio : 0;
              const ofertado = of ? ofertadoEn(it, of) : undefined;
              const aj = of ? ajusteDe(it, of) : null;
              const uso = unidadUsoDe(it, ofertado);
              const cot = unidadCotizadaDe(it, ofertado);
              const abierto = !!of && editando === keyItem(it);
              const conversion = ren ? rotuloConversion(ren, ren.cantidad) : null;
              const pedido = `${it.cantidad}${it.unidad ? ` ${it.unidad}` : ''}`;
              const queda = ren ? `${ren.cantidad}${ren.unidad ? ` ${ren.unidad}` : ''}` : pedido;
              return (
                <Fragment key={keyItem(it)}>
                <tr>
                  <td>{it.nombre}<div className="muted mono" style={{ fontSize: '.72rem' }}>{it.sku}</div>
                    {of && fichaEn(it, of) && (
                      <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--brand, #ff8a00)', marginTop: '.15rem' }}>🏷 {fichaEn(it, of)}</div>
                    )}
                  </td>
                  <td className="num mono">
                    {queda}
                    {conversion && <div className="muted" style={{ fontSize: '.7rem' }}>{conversion}</div>}
                    {ren && queda !== pedido && <div className="muted" style={{ fontSize: '.7rem' }}>pedido: {pedido}</div>}
                    {of && aj && faltaFactor(aj, it, ofertado) && (
                      <div style={{ fontSize: '.7rem', color: 'var(--warning, #f59e0b)' }}>⚠ ¿cuántos {uso} trae 1 {cot}?</div>
                    )}
                    {of && (
                      <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '.72rem', padding: '.1rem .4rem', marginTop: '.15rem' }}
                        onClick={() => setEditando(abierto ? null : keyItem(it))}>
                        {abierto ? 'Listo' : '✎ Unidad'}
                      </button>
                    )}
                  </td>
                  <td>
                    {!ofs.length ? (
                      <span className="muted">Ningún proveedor lo cotizó</span>
                    ) : (
                      <select className="select" value={ofId ?? ''} onChange={(e) => setAsig((p) => ({ ...p, [keyItem(it)]: e.target.value }))}>
                        <option value="">— elegir —</option>
                        {ofs.slice().sort((a, b) => precioUsoEn(it, a) - precioUsoEn(it, b)).map((o) => {
                          const f = fichaEn(it, o);
                          const r = renglonEn(it, o);
                          const porUso = r.factor && r.factor !== 1 ? ` (${money(precioUsoEn(it, o))} / ${r.unidad_uso ?? ''})` : '';
                          return (
                            <option key={o.id} value={o.id}>
                              {proveedorMap.get(o.proveedor_id)?.razon_social ?? '—'} · {money(r.precio)}{r.unidad ? ` / ${r.unidad}` : ''}{porUso}{f ? ` · ${f}` : ''}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </td>
                  <td className="num mono">{of ? money(sub) : '—'}</td>
                </tr>
                {abierto && of && aj && (
                  <tr>
                    <td colSpan={4} style={{ background: 'var(--surface-2)' }}>
                      <EditorUnidad
                        aj={aj} uso={uso} cot={cot}
                        cotizaOtra={cotizaEnOtraUnidad(it, ofertado) || (Number(ofertado?.factor) || 1) !== 1}
                        precio={ren?.precio ?? 0} unidad={ren?.unidad ?? ''} precioUso={precioUsoEn(it, of)}
                        onChange={(n) => ajustar(it, of, n)}
                        onReset={() => ajustar(it, of, null)}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Resumen por proveedor */}
      <div className="card" style={{ marginTop: '.8rem', background: 'var(--surface-2)' }}>
        <div className="card-title" style={{ fontSize: '.85rem' }}><span>Órdenes a generar ({grupos.length})</span></div>
        {!grupos.length ? <p className="muted" style={{ margin: 0 }}>Asigna ítems para ver las órdenes.</p> : (
          <div className="table-wrap">
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Proveedor</th><th className="num">Ítems</th><th className="num">Total (BCV)</th><th className="num">Total divisa</th></tr></thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.proveedorId}>
                  <td>{proveedorMap.get(g.proveedorId)?.razon_social ?? '—'}</td>
                  <td className="num mono">{g.items.length}</td>
                  <td className="num mono">
                    {money(totalConImp(g))}
                    {impDe(g) > 0 && (
                      <div className="muted" style={{ fontSize: '.7rem' }}>
                        base {money(g.total - (Number(g.descuentoObtenido) || 0))} · imp. +{money(impDe(g))}
                      </div>
                    )}
                  </td>
                  <td className="num mono">{g.totalDivisa != null ? money(Math.round((g.totalDivisa + impDe(g)) * 100) / 100) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ textAlign: 'right' }}>Total</td><td className="num mono">{money(totalGeneral)}</td><td></td></tr></tfoot>
          </table>
          </div>
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

/** Cambiar la unidad del renglón en el reparto: la cotizada, la del inventario u otra. */
function EditorUnidad({ aj, uso, cot, cotizaOtra, precio, unidad, precioUso, onChange, onReset }: {
  aj: AjusteRenglon; uso: string; cot: string; cotizaOtra: boolean;
  precio: number; unidad: string; precioUso: number;
  onChange: (aj: AjusteRenglon) => void; onReset: () => void;
}) {
  const num = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')) || 0);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-end', fontSize: '.8rem' }}>
      <label style={{ display: 'grid', gap: '.2rem' }}>
        <span className="muted">Unidad</span>
        <select className="select" value={aj.modo} onChange={(e) => onChange(cambiarModo(aj, e.target.value as ModoUnidad))}>
          {cotizaOtra && <option value="cotizada">{cot || 'Cotizada'} (como cotizó)</option>}
          <option value="uso">{uso || 'Unidad'} (inventario)</option>
          <option value="otra">Otra…</option>
        </select>
      </label>
      {aj.modo === 'cotizada' && cotizaOtra && (
        <label style={{ display: 'grid', gap: '.2rem' }}>
          <span className="muted">1 {cot} =</span>
          <span style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
            <input className="input" type="number" min={0} step="any" style={{ width: '6rem' }}
              value={aj.factorCotizada || ''} onChange={(e) => onChange({ ...aj, factorCotizada: num(e.target.value) })} />
            {uso}
          </span>
        </label>
      )}
      {aj.modo === 'otra' && (
        <>
          <label style={{ display: 'grid', gap: '.2rem' }}>
            <span className="muted">Nombre</span>
            <input className="input" style={{ width: '7rem' }} placeholder="CAJA, TAMBOR…"
              value={aj.otraUnidad} onChange={(e) => onChange({ ...aj, otraUnidad: e.target.value.toUpperCase() })} />
          </label>
          <label style={{ display: 'grid', gap: '.2rem' }}>
            <span className="muted">1 {aj.otraUnidad || 'unidad'} =</span>
            <span style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
              <input className="input" type="number" min={0} step="any" style={{ width: '6rem' }}
                value={aj.otraFactor || ''} onChange={(e) => {
                  // Al definir el factor, la cantidad se mantiene en unidades de uso.
                  const cantUso = (Number(aj.cantidad) || 0) * (aj.otraFactor > 0 ? aj.otraFactor : 1);
                  const f = num(e.target.value);
                  onChange({ ...aj, otraFactor: f, cantidad: f > 0 ? Math.round((cantUso / f) * 1000) / 1000 : aj.cantidad });
                }} />
              {uso}
            </span>
          </label>
        </>
      )}
      <label style={{ display: 'grid', gap: '.2rem' }}>
        <span className="muted">Cantidad</span>
        <input className="input" type="number" min={0} step="any" style={{ width: '6rem' }}
          value={aj.cantidad || ''} onChange={(e) => onChange({ ...aj, cantidad: num(e.target.value) })} />
      </label>
      <div className="mono" style={{ paddingBottom: '.35rem' }}>
        {money(precio)}{unidad ? ` / ${unidad}` : ''}
        {unidad && uso && unidad !== uso && <span className="muted"> · {money(precioUso)} / {uso}</span>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>↺ Como cotizó</button>
    </div>
  );
}
