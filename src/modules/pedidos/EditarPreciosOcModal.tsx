import { useEffect, useRef, useState } from 'react';
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

  // ── IVA / IGTF editables (10/09/2026) ──────────────────────────────────────
  // Antes esta pantalla solo tocaba precios y los impuestos quedaban congelados.
  // Cuando una OC quedaba con el impuesto equivocado —el caso OC-2026-0085, que
  // perdió el IVA de la oferta al elegir nota de entrega y conservó un IGTF
  // calculado sobre ese IVA— no había forma de arreglarla desde el sistema.
  const ivaPrev = o.iva_aplicado ? Math.max(0, Number(o.iva_monto) || 0) : 0;
  const igtfPrev = o.igtf_aplicado ? Math.max(0, Number(o.igtf_monto) || 0) : 0;
  const basePrev = Math.max(0, r2((Number(o.total) || 0) - ivaPrev - igtfPrev));
  const baseNueva = Math.max(0, r2(basePrev + r2(baseNew - baseOld)));

  const [conIva, setConIva] = useState(!!o.iva_aplicado);
  const [ivaPct, setIvaPct] = useState(String(Number(o.iva_pct) > 0 ? o.iva_pct : 16));
  const [ivaMontoStr, setIvaMontoStr] = useState(ivaPrev > 0 ? String(ivaPrev) : '');
  const ivaManualRef = useRef(ivaPrev > 0);
  const [conIgtf, setConIgtf] = useState(!!o.igtf_aplicado);
  const [igtfPct, setIgtfPct] = useState(String(Number(o.igtf_pct) > 0 ? o.igtf_pct : 3));
  const [igtfMontoStr, setIgtfMontoStr] = useState(igtfPrev > 0 ? String(igtfPrev) : '');
  const igtfManualRef = useRef(igtfPrev > 0);

  // % ↔ monto sincronizados: mientras no se escriba el monto a mano, manda el %.
  const ivaPctNum = Math.max(0, Math.min(100, r2(Number(ivaPct) || 0)));
  useEffect(() => {
    if (ivaManualRef.current) return;
    const p = Number(ivaPct) || 0;
    setIvaMontoStr(p > 0 && baseNueva > 0 ? String(r2(baseNueva * (p / 100))) : '');
  }, [ivaPct, baseNueva]);
  const ivaMonto = conIva ? Math.max(0, r2(Number(ivaMontoStr) || 0)) : 0;
  // El IGTF se calcula sobre lo que realmente se paga: base + IVA.
  const baseIgtf = r2(baseNueva + ivaMonto);
  const igtfPctNum = Math.max(0, Math.min(100, r2(Number(igtfPct) || 0)));
  useEffect(() => {
    if (igtfManualRef.current) return;
    const p = Number(igtfPct) || 0;
    setIgtfMontoStr(p > 0 && baseIgtf > 0 ? String(r2(baseIgtf * (p / 100))) : '');
  }, [igtfPct, baseIgtf]);
  const igtfMonto = conIgtf ? Math.max(0, r2(Number(igtfMontoStr) || 0)) : 0;

  function onIvaPct(v: string) { ivaManualRef.current = false; setConIva(true); setIvaPct(v); }
  function onIvaMonto(v: string) {
    ivaManualRef.current = true; setConIva(true); setIvaMontoStr(v);
    const m = Number(v) || 0;
    setIvaPct(m > 0 && baseNueva > 0 ? String(Math.round((m / baseNueva) * 10000) / 100) : '0');
  }
  function onIgtfPct(v: string) { igtfManualRef.current = false; setConIgtf(true); setIgtfPct(v); }
  function onIgtfMonto(v: string) {
    igtfManualRef.current = true; setConIgtf(true); setIgtfMontoStr(v);
    const m = Number(v) || 0;
    setIgtfPct(m > 0 && baseIgtf > 0 ? String(Math.round((m / baseIgtf) * 10000) / 100) : '0');
  }

  const totalNuevo = Math.max(0, r2(baseNueva + ivaMonto + igtfMonto));

  async function guardar() {
    setError(null);
    // Los ítems agregados acá deben tener nombre y cantidad válida.
    const nuevosInvalidos = items.slice(origLen).some((it) => !it.nombre.trim() || !(Number(it.cantidad) > 0));
    if (nuevosInvalidos) { setError('Completá nombre y cantidad (> 0) de los productos agregados.'); return; }
    setSaving(true);
    try {
      const limpios = items.map((it) => (it.nombre ? { ...it, nombre: it.nombre.trim() } : it));
      await editarPreciosOrdenPorPagar(o, limpios, actor, {
        conIva, ivaPct: ivaPctNum, ivaMonto,
        conIgtf, igtfPct: igtfPctNum, igtfMonto,
      });
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
        Ajustá el <strong>precio unitario</strong> de cada ítem y, si hace falta, <strong>agregá productos</strong> (hasta {MAX_NUEVOS}). También podés <strong>corregir el IVA y el IGTF</strong> acá abajo. El <strong>total a pagar</strong> se recompone desde cero (base + IVA + IGTF), el cambio queda en la <strong>traza</strong> de la OC y se sincroniza solo en Tesorería.
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
      {/* IVA / IGTF. Se editan acá porque es donde se corrige el monto a pagar, y
          porque una OC con el impuesto mal puesto no tenía cómo arreglarse. */}
      <div className="card" style={{ marginTop: '.7rem', padding: '.6rem .75rem' }}>
        <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.45rem' }}>
          IMPUESTOS · se recalculan sobre la base de {monto(baseNueva, moneda)}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', fontSize: '.84rem', marginBottom: '.4rem' }}>
          <input type="checkbox" checked={conIva} onChange={(e) => setConIva(e.target.checked)} disabled={saving} />
          <strong style={{ minWidth: 42 }}>IVA</strong>
          <input className="input mono" type="number" min={0} max={100} step="any" value={ivaPct}
            onChange={(e) => onIvaPct(e.target.value)} disabled={saving}
            title="Porcentaje de IVA (editable)"
            style={{ width: 62, textAlign: 'right', padding: '.15rem .3rem', height: 'auto' }} />
          <span>%</span>
          <span className="muted">o</span>
          <input className="input mono" type="number" min={0} step="any" value={ivaMontoStr}
            onChange={(e) => onIvaMonto(e.target.value)} disabled={saving}
            title="Monto del IVA (se puede escribir a mano)" placeholder="0,00"
            style={{ width: 104, textAlign: 'right', padding: '.15rem .3rem', height: 'auto' }} />
          <span className="mono muted">= {monto(ivaMonto, moneda)}</span>
        </label>
        {conIva && ivaPctNum !== 16 && ivaPctNum > 0 && (
          <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.4rem' }}>
            ⚠ Estás aplicando {ivaPctNum.toLocaleString('es-VE', { maximumFractionDigits: 2 })}% en vez del 16% general.
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', fontSize: '.84rem' }}>
          <input type="checkbox" checked={conIgtf} onChange={(e) => setConIgtf(e.target.checked)} disabled={saving} />
          <strong style={{ minWidth: 42 }}>IGTF</strong>
          <input className="input mono" type="number" min={0} max={100} step="any" value={igtfPct}
            onChange={(e) => onIgtfPct(e.target.value)} disabled={saving}
            title="Porcentaje de IGTF (editable)"
            style={{ width: 62, textAlign: 'right', padding: '.15rem .3rem', height: 'auto' }} />
          <span>%</span>
          <span className="muted">o</span>
          <input className="input mono" type="number" min={0} step="any" value={igtfMontoStr}
            onChange={(e) => onIgtfMonto(e.target.value)} disabled={saving}
            title="Monto del IGTF (se puede escribir a mano)" placeholder="0,00"
            style={{ width: 104, textAlign: 'right', padding: '.15rem .3rem', height: 'auto' }} />
          <span className="mono muted">= {monto(igtfMonto, moneda)}</span>
        </label>
        {conIgtf && (
          <div className="muted" style={{ fontSize: '.74rem', marginTop: '.35rem' }}>
            El IGTF se calcula sobre {monto(baseIgtf, moneda)} (base{ivaMonto > 0 ? ' + IVA' : ''}), que es lo que de verdad se paga.
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
        <div className="muted" style={{ fontSize: '.8rem' }}>
          Total actual: <strong className="mono">{monto(Number(o.total) || 0, moneda)}</strong>
          <br />
          <span className="mono">
            {monto(baseNueva, moneda)}
            {ivaMonto > 0 ? ` + ${monto(ivaMonto, moneda)} IVA` : ''}
            {igtfMonto > 0 ? ` + ${monto(igtfMonto, moneda)} IGTF` : ''}
          </span>
        </div>
        <div style={{ fontSize: '1.05rem' }}>Nuevo total a pagar: <strong className="mono" style={{ color: 'var(--primary-3, #ff8a00)' }}>{monto(totalNuevo, moneda)}</strong></div>
      </div>
    </Modal>
  );
}
