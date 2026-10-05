/* ============================================================
   Golden Touch · Inventario · Presentaciones de compra de un producto
   Sección de la ficha del producto: en qué otras unidades se compra
   (SACO de 25 KG…), en general o por proveedor. La unidad de uso del
   producto (la del inventario) no cambia.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { list as listProveedores } from '@/modules/proveedores/proveedores.repository';
import type { Proveedor } from '@/shared/lib/types';
import { nombrePresentacion, type Presentacion } from './presentaciones';
import { listPresentaciones, crearPresentacion, quitarPresentacion } from './presentaciones.repository';

interface Props {
  productoId: string;
  unidadUso: string;
}

/** Enter dentro de esta sección no debe enviar el formulario del producto. */
const sinEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault(); };

export function PresentacionesProducto({ productoId, unidadUso }: Props) {
  const { user } = useSession();
  const [lista, setLista] = useState<Presentacion[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [unidad, setUnidad] = useState('');
  const [factor, setFactor] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    listPresentaciones([productoId]).then(setLista).catch(() => setLista([]));
  }, [productoId]);
  useEffect(() => { cargar(); }, [cargar]);
  useRealtime(['producto_presentaciones'], cargar);
  useEffect(() => {
    listProveedores().then((ps) => setProveedores(ps.filter((p) => p.estado === 'activo'))).catch(() => setProveedores([]));
  }, []);
  const nombreProv = useMemo(() => new Map(proveedores.map((p) => [p.id, p.razon_social])), [proveedores]);

  const f = Number(factor.replace(',', '.')) || 0;

  async function agregar() {
    setGuardando(true);
    try {
      await crearPresentacion({ producto_id: productoId, proveedor_id: proveedorId || null, unidad: unidad.toUpperCase(), factor: f }, user?.email ?? null);
      setUnidad(''); setFactor(''); setProveedorId('');
      cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar la presentación', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(p: Presentacion) {
    try {
      await quitarPresentacion(p.id);
      cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo quitar', 'error');
    }
  }

  return (
    <details style={{ marginTop: '.6rem' }} open={lista.length > 0}>
      <summary style={{ cursor: 'pointer', fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '.3rem 0' }}>
        Presentaciones de compra {lista.length > 0 && `(${lista.length})`}
      </summary>
      <div style={{ marginTop: '.4rem' }}>
        <small className="muted" style={{ fontSize: '.74rem', display: 'block', marginBottom: '.5rem' }}>
          El inventario se lleva en <strong>{unidadUso || 'su unidad'}</strong>. Si el proveedor lo vende en otra
          presentación (SACO, CAJA, TAMBOR…), la orden de compra va en esa unidad y al recibir entra convertido a {unidadUso || 'la unidad de uso'}.
        </small>
        {lista.length > 0 && (
          <table className="table" style={{ fontSize: '.82rem', marginBottom: '.5rem' }}>
            <thead><tr><th>Presentación</th><th>Proveedor</th><th></th></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td className="mono">1 {nombrePresentacion(p, unidadUso).replace(' de ', ' = ')}</td>
                  <td>{p.proveedor_id ? (nombreProv.get(p.proveedor_id) ?? 'Proveedor') : <span className="muted">Todos</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                      onClick={() => void quitar(p)} title="Quitar (las OC ya hechas no cambian)">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.5rem', alignItems: 'end' }}>
          <div className="form-row" style={{ margin: 0 }}>
            <label htmlFor="pres-prod-unidad">Se compra en</label>
            <input id="pres-prod-unidad" className="input" placeholder="SACO" value={unidad} onKeyDown={sinEnter}
              onChange={(e) => setUnidad(e.target.value.toUpperCase())} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label htmlFor="pres-prod-factor">Trae ({unidadUso || 'uso'})</label>
            <input id="pres-prod-factor" className="input mono" inputMode="decimal" placeholder="25" value={factor} onKeyDown={sinEnter}
              onChange={(e) => setFactor(e.target.value.replace(/[^0-9.,]/g, ''))} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label htmlFor="pres-prod-prov">Proveedor</label>
            <select id="pres-prod-prov" className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Todos</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-sm" disabled={guardando || !unidad.trim() || !(f > 0)} onClick={() => void agregar()}>
            {guardando ? 'Guardando…' : '+ Agregar'}
          </button>
        </div>
      </div>
    </details>
  );
}
