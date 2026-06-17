import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { notify } from '@/shared/lib/notify';
import { money } from '@/shared/lib/format';
import { PREFIJOS_RIF, partirRif } from '@/shared/lib/rif';
import type { CostoLogistico, FichaOferta, ItemOrden, Orden, OrigenProveedor, Proveedor } from '@/shared/lib/types';
import { crearOferta, subirPdfOferta, CONDICIONES_PAGO } from './ofertas.repository';
import { getStatsForProveedores, type ProveedorStats } from './evaluaciones.repository';
import { insert as crearProveedor } from '@/modules/proveedores/proveedores.repository';

/** Estrellas ★ según un promedio 1–5. */
function estrellas(avg: number): string {
  const full = Math.round(avg);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

interface Props {
  orden: Orden;
  proveedores: Proveedor[];
  proveedoresYaOfertados: Set<string>;
  registradoPorEmail: string;
  onClose: () => void;
  onCreated: () => void;
}

interface FormItem extends ItemOrden {
  precio: number;
}

export function AgregarOfertaModal({
  orden,
  proveedores,
  proveedoresYaOfertados,
  registradoPorEmail,
  onClose,
  onCreated,
}: Props) {
  const opcionesProveedor = useMemo(
    () => proveedores.filter((p) => p.estado === 'activo' && !proveedoresYaOfertados.has(p.id)),
    [proveedores, proveedoresYaOfertados]
  );

  // Modo proveedor: si el checkbox está activo, se crea uno nuevo en línea.
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  const [proveedorId, setProveedorId] = useState<string>(opcionesProveedor[0]?.id ?? '');

  // Campos del proveedor nuevo (cuando nuevoProveedor=true)
  const [provRazon, setProvRazon] = useState('');
  const [provRif, setProvRif] = useState('');
  const [provTelefono, setProvTelefono] = useState('');
  const [provEmail, setProvEmail] = useState('');
  const [provDireccion, setProvDireccion] = useState('');
  const [provOrigen, setProvOrigen] = useState<OrigenProveedor>('nacional');
  const rifPartes = partirRif(provRif);

  // Calificación histórica de los proveedores (se guarda al finalizar cada pedido).
  const [stats, setStats] = useState<Map<string, ProveedorStats>>(new Map());
  useEffect(() => {
    const ids = opcionesProveedor.map((p) => p.id);
    if (!ids.length) return;
    getStatsForProveedores(ids).then(setStats).catch(() => setStats(new Map()));
  }, [opcionesProveedor]);
  const statSel = !nuevoProveedor ? stats.get(proveedorId) : undefined;

  // Solo se cotizan los ítems marcados "comprar" en la OP (los desmarcados no se compran).
  const [items, setItems] = useState<FormItem[]>(
    orden.items.filter((i) => i.comprar !== false).map((i) => ({ ...i, precio: 0 })),
  );
  const [fechaEntrega, setFechaEntrega] = useState<string>('');
  // Precio total si se paga en divisa/efectivo (el precioTotal de la cotización es el de referencia BCV).
  const [precioDivisa, setPrecioDivisa] = useState<string>('');
  const [condiciones, setCondiciones] = useState('');
  const [notas, setNotas] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Ficha del producto ofertado + costos logísticos (todo opcional).
  const [ficha, setFicha] = useState<FichaOferta>({});
  function setFichaField(k: keyof Omit<FichaOferta, 'logistica'>, v: string) {
    setFicha((f) => ({ ...f, [k]: v }));
  }
  function setLogistica(k: 'flete' | 'transporte' | 'embalaje' | 'seguros', v: CostoLogistico) {
    setFicha((f) => ({ ...f, logistica: { ...(f.logistica ?? {}), [k]: v } }));
  }
  /** Devuelve la ficha solo si tiene algún dato; si no, null (no se guarda vacía). */
  function fichaLimpia(): FichaOferta | null {
    const base: FichaOferta = {};
    (['marca', 'modelo', 'procedencia', 'materiales', 'dimensiones', 'peso', 'nivel_calidad'] as const).forEach((k) => {
      const v = (ficha[k] ?? '').toString().trim();
      if (v) base[k] = v;
    });
    const log = ficha.logistica ?? {};
    const logClean: NonNullable<FichaOferta['logistica']> = {};
    (['flete', 'transporte', 'embalaje', 'seguros'] as const).forEach((k) => {
      if (log[k]) logClean[k] = log[k];
    });
    if (Object.keys(logClean).length) base.logistica = logClean;
    return Object.keys(base).length ? base : null;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) { setPdfFile(null); return; }
    if (f.type !== 'application/pdf' && !f.type.startsWith('image/')) {
      toast('El archivo debe ser PDF o imagen', 'error');
      e.target.value = '';
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast('El archivo no puede superar 10 MB', 'error');
      e.target.value = '';
      return;
    }
    setPdfFile(f);
  }

  const precioTotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  // Comparación BCV vs divisa/efectivo: diferencia y % de ahorro (diferencia / BCV).
  const divisaNum = Number(precioDivisa.replace(',', '.'));
  const tieneDivisa = precioDivisa.trim() !== '' && Number.isFinite(divisaNum) && divisaNum > 0;
  const diferencia = tieneDivisa ? precioTotal - divisaNum : 0;
  const ahorroPct = tieneDivisa && precioTotal > 0 ? (diferencia / precioTotal) * 100 : 0;

  function updateItemPrecio(idx: number, precio: number) {
    setItems((prev) => prev.map((it, k) => (k === idx ? { ...it, precio: Math.max(0, precio) } : it)));
  }

  async function handleSubmit() {
    if (precioTotal <= 0) {
      toast('El precio total debe ser mayor a cero', 'error');
      return;
    }
    if (!condiciones.trim()) {
      toast('Elegí la condición de pago (define el flujo: contado, crédito, contra entrega…)', 'error');
      return;
    }
    setSubmitting(true);
    try {
      // 1) Resolver proveedor (existente o crear uno nuevo)
      let provId = proveedorId;
      if (nuevoProveedor) {
        if (!provRazon.trim() || !rifPartes.numero) {
          toast('Razón social y RIF (con número) son obligatorios para el nuevo proveedor', 'error');
          setSubmitting(false);
          return;
        }
        const emailClean = provEmail.trim();
        if (emailClean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
          toast('El correo del proveedor no tiene un formato válido', 'error');
          setSubmitting(false);
          return;
        }
        const creado = await crearProveedor({
          razon_social: provRazon.trim().toUpperCase(),
          rif: `${rifPartes.letra}-${rifPartes.numero}`,
          contacto: null,
          telefono: provTelefono.trim() || null,
          email: emailClean || null,
          direccion: provDireccion.trim().toUpperCase() || null,
          categorias: [],
          origen: provOrigen,
          estado: 'activo',
        });
        provId = creado.id;
        notify(`Proveedor "${creado.razon_social}" registrado`, 'success', { link: '#/app/proveedores' });
      } else if (!provId) {
        toast('Selecciona un proveedor', 'error');
        setSubmitting(false);
        return;
      }

      // 2) Subir PDF (si lo hay)
      let pdf_path: string | null = null;
      let pdf_filename: string | null = null;
      if (pdfFile) {
        const uploaded = await subirPdfOferta(orden.id, provId, pdfFile);
        pdf_path = uploaded.path;
        pdf_filename = uploaded.filename;
      }

      // 3) Crear oferta
      await crearOferta({
        orden_id: orden.id,
        proveedor_id: provId,
        items,
        precio_total: precioTotal,
        fecha_entrega_prometida: fechaEntrega || null,
        condiciones_pago: condiciones.trim() || null,
        notas: notas.trim() || null,
        registrada_por_email: registradoPorEmail,
        pdf_path,
        pdf_filename,
        ficha: fichaLimpia(),
        precio_divisa: tieneDivisa ? divisaNum : null,
      });
      notify(`Oferta registrada para ${orden.codigo}`, 'success', { link: '#/app/pedidos' });
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al registrar', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={`Agregar oferta · ${orden.codigo}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : 'Registrar oferta'}
          </button>
        </>
      }
    >
      <div className="form-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={nuevoProveedor}
            onChange={(e) => setNuevoProveedor(e.target.checked)}
          />
          <span>Proveedor no registrado (lo creo ahora junto con la oferta)</span>
        </label>
      </div>

      {nuevoProveedor ? (
        <div className="card" style={{ background: 'var(--bg-2)', padding: '1rem', marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>
            <span>Datos del nuevo proveedor</span>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Razón social *</label>
              <input
                className="input"
                name="prov-razon"
                defaultValue={provRazon}
                onChange={(e) => {
                  e.target.value = e.target.value.toUpperCase();
                  setProvRazon(e.target.value);
                }}
              />
            </div>
            <div className="form-row">
              <label>RIF *</label>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <select
                  className="select"
                  value={rifPartes.letra}
                  onChange={(e) => setProvRif(`${e.target.value}-${rifPartes.numero}`)}
                  style={{ width: 'auto', flex: '0 0 auto' }}
                  aria-label="Tipo de RIF"
                >
                  {PREFIJOS_RIF.map((p) => (
                    <option key={p.letra} value={p.letra}>{p.letra} · {p.desc}</option>
                  ))}
                </select>
                <input
                  className="input mono"
                  name="prov-rif-numero"
                  defaultValue={rifPartes.numero}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                    e.target.value = digits;
                    setProvRif(`${rifPartes.letra}-${digits}`);
                  }}
                  placeholder="40778442"
                  inputMode="numeric"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Teléfono</label>
              <input
                className="input"
                name="prov-telefono"
                inputMode="numeric"
                defaultValue={provTelefono}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 15);
                  e.target.value = digits;
                  setProvTelefono(digits);
                }}
                maxLength={15}
                placeholder="Solo dígitos"
              />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input
                className="input"
                type="email"
                name="prov-email"
                defaultValue={provEmail}
                onChange={(e) => setProvEmail(e.target.value)}
                placeholder="correo@dominio.com"
              />
            </div>
          </div>
          <div className="form-row">
            <label>Dirección</label>
            <input
              className="input"
              name="prov-direccion"
              defaultValue={provDireccion}
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase();
                setProvDireccion(e.target.value);
              }}
            />
          </div>
          <div className="form-row">
            <label>Origen</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
              {([
                { val: 'nacional', txt: '🇻🇪 Nacional' },
                { val: 'internacional', txt: '🌎 Internacional' },
              ] as const).map((o) => {
                const checked = provOrigen === o.val;
                return (
                  <label
                    key={o.val}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '.3rem',
                      padding: '.35rem .65rem',
                      background: checked ? 'var(--brand-soft, rgba(255,138,0,.12))' : 'var(--bg-1)',
                      border: `1px solid ${checked ? 'var(--brand, #ff8a00)' : 'var(--border)'}`,
                      borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => setProvOrigen(o.val)} />
                    <span style={{ fontSize: '.82rem' }}>{o.txt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="form-row">
          <label>Proveedor</label>
          {opcionesProveedor.length ? (
            <>
              <SearchSelect
                value={proveedorId}
                onChange={setProveedorId}
                options={opcionesProveedor.map((p) => ({ value: p.id, label: `${p.razon_social} (${p.rif})` }))}
                placeholder="Buscar proveedor por nombre o RIF…"
                emptyText="Ningún proveedor coincide"
              />
              {statSel && (
                <div className="card" style={{ marginTop: '.4rem', padding: '.45rem .6rem', background: 'var(--bg-1)', fontSize: '.82rem' }}>
                  {statSel.total_evaluaciones > 0 ? (
                    <span>
                      <strong style={{ color: 'var(--warning)' }}>{estrellas(statSel.calidad_avg)}</strong>{' '}
                      <strong>{statSel.calidad_avg.toFixed(1)}/5</strong> calidad ·{' '}
                      {Math.round(statSel.puntualidad_pct * 100)}% puntual ·{' '}
                      <span className="muted">{statSel.total_evaluaciones} evaluación{statSel.total_evaluaciones !== 1 ? 'es' : ''} previa{statSel.total_evaluaciones !== 1 ? 's' : ''}</span>
                    </span>
                  ) : (
                    <span className="muted">Proveedor sin evaluaciones previas (calificación neutra hasta su primer pedido recibido).</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
              No quedan proveedores activos sin oferta. Marca <strong>"Proveedor no registrado"</strong> arriba para crear uno nuevo.
            </p>
          )}
        </div>
      )}

      <div className="form-row">
        <label>Cotización por ítem</label>
        <div className="table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th className="num">Cantidad</th>
                <th className="num">Precio unit.</th>
                <th className="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={`${it.sku}-${idx}`}>
                  <td className="mono">{it.sku}</td>
                  <td>{it.nombre}</td>
                  <td className="num">{it.cantidad}</td>
                  <td className="num">
                    <input
                      type="number"
                      className="input mono"
                      name={`item-precio-${idx}`}
                      style={{ width: 110, textAlign: 'right' }}
                      min={0}
                      step={0.01}
                      defaultValue={it.precio}
                      onChange={(e) => updateItemPrecio(idx, Number(e.target.value) || 0)}
                    />
                  </td>
                  <td className="num mono">{money(it.cantidad * it.precio)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="num">TOTAL OFERTA (BCV)</td>
                <td className="num mono">{money(precioTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Comparación BCV vs divisa/efectivo: diferencia y % de ahorro por proveedor. */}
      <div className="form-row">
        <label>Precio total si paga en divisa / efectivo <span className="muted">(opcional)</span></label>
        <input
          type="number"
          className="input mono"
          min={0}
          step={0.01}
          style={{ maxWidth: 200 }}
          value={precioDivisa}
          onChange={(e) => setPrecioDivisa(e.target.value)}
          placeholder="0.00"
        />
        {tieneDivisa && (
          <div className="card" style={{ marginTop: '.5rem', padding: '.6rem .8rem', background: 'var(--bg-1)', display: 'flex', flexWrap: 'wrap', gap: '1.2rem', fontSize: '.86rem' }}>
            <span>BCV: <strong className="mono">{money(precioTotal)}</strong></span>
            <span>Divisa/efectivo: <strong className="mono">{money(divisaNum)}</strong></span>
            <span>Diferencia: <strong className="mono" style={{ color: diferencia >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(diferencia)}</strong></span>
            <span>Ahorro: <strong style={{ color: diferencia >= 0 ? 'var(--success)' : 'var(--danger)' }}>{ahorroPct.toFixed(2)}%</strong></span>
          </div>
        )}
        <small className="muted">Se muestra la diferencia ({money(precioTotal)} − divisa) y el % (diferencia / BCV) para comparar proveedores.</small>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Fecha de entrega prometida</label>
          <input type="date" className="input" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Condiciones del Pago *</label>
          <select className="select" value={condiciones} onChange={(e) => setCondiciones(e.target.value)} required>
            <option value="">— elegir —</option>
            {CONDICIONES_PAGO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row">
        <label>Ficha del producto ofertado <span className="muted">(opcional)</span></label>
        <div className="form-grid">
          <input className="input" placeholder="Marca" value={ficha.marca ?? ''} onChange={(e) => setFichaField('marca', e.target.value)} />
          <input className="input" placeholder="Modelo" value={ficha.modelo ?? ''} onChange={(e) => setFichaField('modelo', e.target.value)} />
        </div>
        <div className="form-grid" style={{ marginTop: '.4rem' }}>
          <input className="input" placeholder="Procedencia" value={ficha.procedencia ?? ''} onChange={(e) => setFichaField('procedencia', e.target.value)} />
          <input className="input" placeholder="Nivel de calidad" value={ficha.nivel_calidad ?? ''} onChange={(e) => setFichaField('nivel_calidad', e.target.value)} />
        </div>
        <div className="form-grid" style={{ marginTop: '.4rem' }}>
          <input className="input" placeholder="Dimensiones" value={ficha.dimensiones ?? ''} onChange={(e) => setFichaField('dimensiones', e.target.value)} />
          <input className="input" placeholder="Peso" value={ficha.peso ?? ''} onChange={(e) => setFichaField('peso', e.target.value)} />
        </div>
        <input className="input" placeholder="Materiales" value={ficha.materiales ?? ''} onChange={(e) => setFichaField('materiales', e.target.value)} style={{ marginTop: '.4rem' }} />
      </div>

      <div className="form-row">
        <label>Costos logísticos <span className="muted">(¿incluido en el precio o por cuenta del comprador?)</span></label>
        <div style={{ display: 'grid', gap: '.4rem' }}>
          {([['flete', 'Flete'], ['transporte', 'Transporte'], ['embalaje', 'Embalaje'], ['seguros', 'Seguros']] as const).map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap' }}>
              <span style={{ width: 100, fontSize: '.85rem', fontWeight: 600 }}>{label}</span>
              {([['incluido', 'Incluido'], ['comprador', 'Por cuenta del comprador']] as const).map(([val, txt]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer', fontSize: '.82rem' }}>
                  <input type="radio" name={`log-${key}`} checked={ficha.logistica?.[key] === val} onChange={() => setLogistica(key, val)} />
                  {txt}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label>Notas</label>
        <textarea className="textarea" name="oferta-notas" placeholder="Comentarios sobre la oferta, exclusiones, garantías…" defaultValue={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      <div className="form-row">
        <label>Cargue la cotización del proveedor (opcional)</label>
        <input type="file" className="input" accept="application/pdf,image/*" onChange={handleFileChange} />
        {pdfFile && (
          <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>
            ✓ {pdfFile.name} ({(pdfFile.size / 1024).toFixed(0)} KB)
          </div>
        )}
        <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
          PDF o imagen · máximo 10 MB. El jefe podrá descargarlo para validar la oferta antes de aprobar.
        </div>
      </div>
    </Modal>
  );
}
