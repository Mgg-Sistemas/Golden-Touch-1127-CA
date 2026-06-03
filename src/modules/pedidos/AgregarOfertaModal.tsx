import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money } from '@/shared/lib/format';
import type { ItemOrden, Orden, Proveedor } from '@/shared/lib/types';
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

  // Calificación histórica de los proveedores (se guarda al finalizar cada pedido).
  const [stats, setStats] = useState<Map<string, ProveedorStats>>(new Map());
  useEffect(() => {
    const ids = opcionesProveedor.map((p) => p.id);
    if (!ids.length) return;
    getStatsForProveedores(ids).then(setStats).catch(() => setStats(new Map()));
  }, [opcionesProveedor]);
  const statSel = !nuevoProveedor ? stats.get(proveedorId) : undefined;

  const [items, setItems] = useState<FormItem[]>(orden.items.map((i) => ({ ...i, precio: 0 })));
  const [fechaEntrega, setFechaEntrega] = useState<string>('');
  const [condiciones, setCondiciones] = useState('');
  const [notas, setNotas] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        if (!provRazon.trim() || !provRif.trim()) {
          toast('Razón social y RIF son obligatorios para el nuevo proveedor', 'error');
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
          rif: provRif.trim().toUpperCase(),
          contacto: null,
          telefono: provTelefono.trim() || null,
          email: emailClean || null,
          direccion: provDireccion.trim().toUpperCase() || null,
          categorias: [],
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
              <input className="input" value={provRazon} onChange={(e) => setProvRazon(e.target.value.toUpperCase())} />
            </div>
            <div className="form-row">
              <label>RIF *</label>
              <input
                className="input mono"
                value={provRif}
                onChange={(e) => setProvRif(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="J-12345678"
                maxLength={10}
              />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Teléfono</label>
              <input
                className="input"
                inputMode="numeric"
                value={provTelefono}
                onChange={(e) => setProvTelefono(e.target.value.replace(/\D/g, '').slice(0, 15))}
                maxLength={15}
                placeholder="Solo dígitos"
              />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input
                className="input"
                type="email"
                value={provEmail}
                onChange={(e) => setProvEmail(e.target.value)}
                placeholder="correo@dominio.com"
              />
            </div>
          </div>
          <div className="form-row">
            <label>Dirección</label>
            <input className="input" value={provDireccion} onChange={(e) => setProvDireccion(e.target.value.toUpperCase())} />
          </div>
        </div>
      ) : (
        <div className="form-row">
          <label>Proveedor</label>
          {opcionesProveedor.length ? (
            <>
              <select className="select" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                {opcionesProveedor.map((p) => (
                  <option key={p.id} value={p.id}>{p.razon_social} ({p.rif})</option>
                ))}
              </select>
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
                      style={{ width: 110, textAlign: 'right' }}
                      min={0}
                      step={0.01}
                      value={it.precio}
                      onChange={(e) => updateItemPrecio(idx, Number(e.target.value) || 0)}
                    />
                  </td>
                  <td className="num mono">{money(it.cantidad * it.precio)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="num">TOTAL OFERTA</td>
                <td className="num mono">{money(precioTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
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
        <label>Notas</label>
        <textarea className="textarea" placeholder="Comentarios sobre la oferta, exclusiones, garantías…" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      <div className="form-row">
        <label>Cotización del proveedor · PDF o imagen (opcional)</label>
        <input type="file" className="input" accept="application/pdf,image/*" onChange={handleFileChange} />
        {pdfFile && (
          <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>
            ✓ {pdfFile.name} ({(pdfFile.size / 1024).toFixed(0)} KB)
          </div>
        )}
        <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
          Solo PDF · máximo 10 MB. El jefe podrá descargarlo para validar la oferta antes de aprobar.
        </div>
      </div>
    </Modal>
  );
}
