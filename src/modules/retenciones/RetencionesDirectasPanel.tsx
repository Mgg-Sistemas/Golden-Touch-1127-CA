/* ============================================================
   GT-INT-09 · Retenciones de COMPRAS DIRECTAS

   Ojo con el nombre: en el sistema conviven dos cosas distintas que se llaman
   «retención».

     1. El FLUJO sobre órdenes de compra (las otras dos pestañas de esta
        pantalla). Vive como columnas de la propia orden y por eso el
        repositorio de este módulo lee `ordenes`.

     2. La tabla `retenciones`, que se escribe sola cuando Tesorería paga una
        COMPRA DIRECTA con retención. Esa es la que muestra este panel.

   Hasta ahora esos registros se guardaban y NO se veían en ninguna pantalla:
   `listRetenciones()` existía en el repositorio de Tesorería pero no la
   llamaba nadie. Es información fiscal — al proveedor ya se le retuvo el
   monto, salió menos plata de la caja, y la empresa tiene que declarar ese
   dinero. Sin pantalla, no había forma de saber cuánto ni de quién.

   Además, cuando el pago de una compra directa no logra registrar su
   retención, el aviso le dice al usuario «cargala a mano en Retenciones».
   Este panel es ese lugar: sin él, ese mensaje apuntaba a la nada.
   ============================================================ */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { money } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { supabase } from '@/shared/lib/supabase';
import { listRetenciones, crearRetencion } from '@/modules/tesoreria/tesoreria.repository';
import type { Retencion, TipoRetencion } from '@/shared/lib/types';

/** Los tres tipos que admite la tabla (el CHECK de la base los exige en mayúscula). */
const TIPOS: { key: TipoRetencion; label: string }[] = [
  { key: 'IVA', label: 'IVA' },
  { key: 'ISLR', label: 'ISLR' },
  { key: 'MUNICIPAL', label: 'Municipal' },
];

function fechaCorta(f: string): string {
  if (!f) return '—';
  const [a, m, d] = f.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : f;
}

export function RetencionesDirectasPanel({ puedeCargar, actor, actorName }: {
  /** Escritura en Tesorería: es la RLS real de la tabla `retenciones`. */
  puedeCargar: boolean;
  actor: string;
  actorName: string | null;
}) {
  const [filas, setFilas] = useState<Retencion[]>([]);
  const [proveedores, setProveedores] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [nueva, setNueva] = useState(false);

  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fTipo, setFTipo] = useState<'' | TipoRetencion>('');
  const [fTexto, setFTexto] = useState('');

  async function cargar() {
    setLoading(true);
    try {
      const [rs, provs] = await Promise.all([
        listRetenciones(),
        supabase.from('proveedores').select('id, razon_social'),
      ]);
      setFilas(rs);
      setProveedores(new Map((provs.data ?? []).map((p) => [p.id as string, p.razon_social as string])));
    } catch (e) {
      // Se avisa: una tabla fiscal en blanco por un error de red se lee como
      // «no hay retenciones», que es exactamente la conclusión equivocada.
      toast(e instanceof Error ? e.message : 'No se pudieron cargar las retenciones', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void cargar(); }, []);
  // Realtime: si Tesoreria paga una compra directa mientras esta pantalla esta
  // abierta, la retencion aparece sin recargar.
  useRealtime(['retenciones'], () => { void cargar(); });

  const filtradas = useMemo(() => {
    const txt = fTexto.trim().toLowerCase();
    return filas.filter((r) => {
      const f = (r.fecha ?? '').slice(0, 10);
      if (fDesde && f < fDesde) return false;
      if (fHasta && f > fHasta) return false;
      if (fTipo && r.tipo !== fTipo) return false;
      if (txt) {
        const prov = r.proveedor_id ? (proveedores.get(r.proveedor_id) ?? '') : '';
        const hay = `${r.descripcion ?? ''} ${r.comprobante_nro ?? ''} ${prov}`.toLowerCase();
        if (!hay.includes(txt)) return false;
      }
      return true;
    });
  }, [filas, fDesde, fHasta, fTipo, fTexto, proveedores]);

  // Totales por moneda: sumar Bs con USD daría un número sin significado.
  const totales = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtradas) m.set(r.moneda, (m.get(r.moneda) ?? 0) + (Number(r.monto) || 0));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtradas]);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>Retenciones registradas</div>
          <div className="mono" style={{ fontSize: '1.9rem', fontWeight: 800 }}>{filtradas.length}</div>
        </div>
        {totales.map(([moneda, total]) => (
          <div className="card" style={{ margin: 0 }} key={moneda}>
            <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>Total retenido · {moneda}</div>
            <div className="mono" style={{ fontSize: '1.9rem', fontWeight: 800 }}>{money(total)}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div className="filterbar" style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Desde</label>
            <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Hasta</label>
            <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Tipo</label>
            <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value as '' | TipoRetencion)}>
              <option value="">Todas</option>
              {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ margin: 0, flex: '1 1 200px' }}>
            <label>Buscar (proveedor / comprobante / detalle)</label>
            <input className="input" value={fTexto} onChange={(e) => setFTexto(e.target.value)} placeholder="Proveedor, N° de comprobante…" />
          </div>
          <button className="btn btn-ghost" onClick={() => { setFDesde(''); setFHasta(''); setFTipo(''); setFTexto(''); }}>Limpiar</button>
          {puedeCargar && <button className="btn btn-primary" onClick={() => setNueva(true)}>+ Cargar retención</button>}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.86rem' }}>
            <thead>
              <tr>
                <th>Fecha</th><th>Tipo</th><th>Proveedor</th><th>Detalle</th><th>Comprobante</th>
                <th style={{ textAlign: 'right' }}>Base</th>
                <th style={{ textAlign: 'right' }}>%</th>
                <th style={{ textAlign: 'right' }}>Retenido</th>
                <th>Registró</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
              {!loading && !filtradas.length && (
                <tr><td colSpan={9}>
                  <EmptyState
                    icon="🧾"
                    message={filas.length
                      ? 'Ninguna retención coincide con esos filtros.'
                      : 'Todavía no hay retenciones de compras directas. Se registran solas cuando Tesorería paga una compra directa que lleva retención.'}
                  />
                </td></tr>
              )}
              {!loading && filtradas.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{fechaCorta(r.fecha)}</td>
                  <td><span className="badge">{r.tipo}</span></td>
                  <td>{r.proveedor_id ? (proveedores.get(r.proveedor_id) ?? '—') : '—'}</td>
                  <td>{r.descripcion ?? '—'}</td>
                  <td className="mono">{r.comprobante_nro ?? '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(r.base)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.porcentaje}%</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(r.monto)} {r.moneda}</td>
                  <td className="muted">{r.actor_name || r.actor || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {nueva && (
        <NuevaRetencionModal
          actor={actor} actorName={actorName}
          onClose={() => setNueva(false)}
          onSaved={async () => { setNueva(false); await cargar(); }}
        />
      )}
    </>
  );
}

/** Carga manual. Es la salida cuando el pago de una compra directa no logró
 *  registrar su retención solo y el aviso mandó a cargarla acá. */
function NuevaRetencionModal({ actor, actorName, onClose, onSaved }: {
  actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<TipoRetencion>('IVA');
  const [base, setBase] = useState('');
  const [porcentaje, setPorcentaje] = useState('');
  const [moneda, setMoneda] = useState('Bs');
  const [comprobante, setComprobante] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [proveedorId, setProveedorId] = useState('');
  const [provs, setProvs] = useState<{ id: string; razon_social: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('proveedores').select('id, razon_social').order('razon_social')
      .then(({ data }) => setProvs((data ?? []) as { id: string; razon_social: string }[]));
  }, []);

  const b = Number(base.replace(',', '.')) || 0;
  const p = Number(porcentaje.replace(',', '.')) || 0;
  const monto = Math.round(b * (p / 100) * 100) / 100;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (b <= 0) { setError('Indicá la base imponible.'); return; }
    if (p <= 0) { setError('Indicá el porcentaje de retención.'); return; }
    setSaving(true);
    try {
      await crearRetencion({
        tipo, base: b, porcentaje: p, moneda,
        proveedorId: proveedorId || null,
        comprobanteNro: comprobante.trim() || null,
        fecha,
        descripcion: descripcion.trim() || null,
        actor, actorName,
      });
      toast('Retención registrada', 'success');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la retención.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Cargar retención a mano"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="ret-nueva" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </>
      }
    >
      <form id="ret-nueva" onSubmit={guardar}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
          Normalmente estas retenciones se registran solas al pagar una compra directa.
          Usá esta carga cuando el pago avisó que <strong>no pudo registrarla</strong>, o para
          una retención que quedó afuera del sistema.
        </p>

        <div className="form-grid">
          <div className="form-row">
            <label>Tipo *</label>
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoRetencion)}>
              {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Fecha *</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
        </div>

        <div className="form-row">
          <label>Proveedor</label>
          <select className="select" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">— sin proveedor —</option>
            {provs.map((p2) => <option key={p2.id} value={p2.id}>{p2.razon_social}</option>)}
          </select>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Base imponible *</label>
            <input className="input" value={base} onChange={(e) => setBase(e.target.value)} placeholder="0,00" inputMode="decimal" required />
          </div>
          <div className="form-row">
            <label>Porcentaje *</label>
            <input className="input" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} placeholder="75" inputMode="decimal" required />
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Moneda</label>
            <select className="select" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="Bs">Bs</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="form-row">
            <label>N° de comprobante</label>
            <input className="input" value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <div className="form-row">
          <label>Detalle</label>
          <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Compra directa CD-2026-0012" />
        </div>

        <div className="card" style={{ marginTop: '.5rem', padding: '.6rem .85rem' }}>
          Monto a retener: <strong className="mono" style={{ fontSize: '1.15rem' }}>{money(monto)} {moneda}</strong>
        </div>
      </form>
    </Modal>
  );
}
