import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { money, num, dateTime } from '@/shared/lib/format';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import type { Almacen, Caja, Existencia, Movimiento, MovimientoCaja, Producto } from '@/shared/lib/types';
import { listProductos } from '@/modules/inventario/inventario.repository';
import { listAlmacenes, listExistencias } from '@/modules/inventario/almacenes.repository';
import {
  listCajas, listSalidasDinero, listTrasladosDinero,
} from './cajas.repository';
import { listSalidasMaterial, listTrasladosMaterial } from './salidas.repository';
import { descargarSalidaDineroPdf, descargarTrasladoDineroPdf } from './salidaPdf';
import { SalidaMaterialForm } from './SalidaMaterialForm';
import { TrasladoMaterialForm } from './TrasladoMaterialForm';
import { SalidaDineroForm } from './SalidaDineroForm';
import { TrasladoDineroForm } from './TrasladoDineroForm';
import { ConciliarMineralModal } from './ConciliarMineralModal';
import { GestionarCajasModal } from './GestionarCajasModal';
import { SalidaMaterialDetalle } from './SalidaMaterialDetalle';

type Scope = 'salidas' | 'traslados';
type Tipo = 'material' | 'dinero';
type Modal =
  | { kind: 'none' }
  | { kind: 'salida-material' }
  | { kind: 'traslado-material' }
  | { kind: 'salida-dinero' }
  | { kind: 'traslado-dinero' }
  | { kind: 'conciliar'; salida: MovimientoCaja }
  | { kind: 'detalle-material'; mov: Movimiento; esTraslado: boolean }
  | { kind: 'cajas' };

export function SalidasPage() {
  const { can, appUser } = usePermissions();
  const canWrite = can('salidas', 'escritura');
  const actor = appUser?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [scope, setScope] = useState<Scope>('salidas');
  const [tipo, setTipo] = useState<Tipo>('material');
  const [modal, setModal] = useState<Modal>({ kind: 'none' });
  const [loading, setLoading] = useState(true);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [salMat, setSalMat] = useState<Movimiento[]>([]);
  const [trasMat, setTrasMat] = useState<Movimiento[]>([]);
  const [salDin, setSalDin] = useState<MovimientoCaja[]>([]);
  const [trasDin, setTrasDin] = useState<MovimientoCaja[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [pds, exs, alms, cjs, sm, tm, sd, td] = await Promise.all([
        listProductos(),
        listExistencias().catch(() => [] as Existencia[]),
        listAlmacenes().catch(() => [] as Almacen[]),
        listCajas().catch(() => [] as Caja[]),
        listSalidasMaterial().catch(() => [] as Movimiento[]),
        listTrasladosMaterial().catch(() => [] as Movimiento[]),
        listSalidasDinero().catch(() => [] as MovimientoCaja[]),
        listTrasladosDinero().catch(() => [] as MovimientoCaja[]),
      ]);
      setProductos(pds); setExistencias(exs); setAlmacenes(alms); setCajas(cjs);
      setSalMat(sm); setTrasMat(tm); setSalDin(sd); setTrasDin(td);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar el módulo', 'error');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const almacenesActivos = useMemo(
    () => almacenes.filter((a) => a.estado === 'activo').map((a) => a.nombre),
    [almacenes],
  );

  const esMaterial = tipo === 'material';
  const esSalida = scope === 'salidas';

  function abrirNuevo() {
    if (esSalida && esMaterial) setModal({ kind: 'salida-material' });
    else if (!esSalida && esMaterial) setModal({ kind: 'traslado-material' });
    else if (esSalida && !esMaterial) setModal({ kind: 'salida-dinero' });
    else setModal({ kind: 'traslado-dinero' });
  }
  const btnLabel = esSalida ? '+ Nueva salida' : '+ Nuevo traslado';

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Salidas / Traslados</h1>
          <p className="muted">Despachos y traslados de material (descuentan/mueven stock) y movimientos de dinero de la tesorería.</p>
        </div>
        <div className="actions">
          {tipo === 'dinero' && canWrite && (
            <button className="btn btn-ghost" onClick={() => setModal({ kind: 'cajas' })}>🏦 Cajas</button>
          )}
          {canWrite && <button className="btn btn-primary" onClick={abrirNuevo}>{btnLabel}</button>}
        </div>
      </div>

      {/* Switch principal: Salidas / Traslados */}
      <div className="view-toggle" role="tablist" aria-label="Tipo de operación" style={{ marginBottom: '.75rem' }}>
        <button className={scope === 'salidas' ? 'active' : ''} onClick={() => setScope('salidas')}>↘ Salidas</button>
        <button className={scope === 'traslados' ? 'active' : ''} onClick={() => setScope('traslados')}>↔ Traslados</button>
      </div>

      {/* Sub-switch: Material / Dinero */}
      <div className="view-toggle" role="tablist" aria-label="Material o dinero" style={{ marginBottom: '1rem' }}>
        <button className={tipo === 'material' ? 'active' : ''} onClick={() => setTipo('material')}>📦 Material</button>
        <button className={tipo === 'dinero' ? 'active' : ''} onClick={() => setTipo('dinero')}>💵 Dinero</button>
      </div>

      {/* Tarjetas de saldo por caja (solo dinero) */}
      {tipo === 'dinero' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
          {cajas.filter((c) => c.estado === 'activo').map((c) => (
            <div key={c.id} className="card" style={{ margin: 0, padding: '.8rem 1rem' }}>
              <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.nombre} · {c.moneda}</div>
              <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-3)' }}>{money(Number(c.saldo) || 0)}</div>
            </div>
          ))}
          {!cajas.some((c) => c.estado === 'activo') && (
            <div className="muted" style={{ fontSize: '.85rem' }}>No hay cajas activas. {canWrite && 'Creá una con 🏦 Cajas.'}</div>
          )}
        </div>
      )}

      {loading ? (
        <EmptyState message="Cargando…" icon="◔" />
      ) : (
        <Historial
          scope={scope} tipo={tipo}
          salMat={salMat} trasMat={trasMat} salDin={salDin} trasDin={trasDin}
          canWrite={canWrite}
          onConciliar={(s) => setModal({ kind: 'conciliar', salida: s })}
          onVerMaterial={(mov, esTraslado) => setModal({ kind: 'detalle-material', mov, esTraslado })}
        />
      )}

      {modal.kind === 'salida-material' && (
        <SalidaMaterialForm productos={productos} existencias={existencias} almacenesList={almacenesActivos}
          actor={actor} actorName={actorName} onClose={() => setModal({ kind: 'none' })} onSaved={reload} />
      )}
      {modal.kind === 'traslado-material' && (
        <TrasladoMaterialForm productos={productos} existencias={existencias} almacenesList={almacenesActivos}
          actor={actor} actorName={actorName} onClose={() => setModal({ kind: 'none' })} onSaved={reload} />
      )}
      {modal.kind === 'salida-dinero' && (
        <SalidaDineroForm cajas={cajas} almacenesList={almacenesActivos}
          actor={actor} actorName={actorName} onClose={() => setModal({ kind: 'none' })} onSaved={reload} />
      )}
      {modal.kind === 'traslado-dinero' && (
        <TrasladoDineroForm cajas={cajas}
          actor={actor} actorName={actorName} onClose={() => setModal({ kind: 'none' })} onSaved={reload} />
      )}
      {modal.kind === 'conciliar' && (
        <ConciliarMineralModal salida={modal.salida} productos={productos} almacenesList={almacenesActivos}
          actor={actor} actorName={actorName} onClose={() => setModal({ kind: 'none' })} onSaved={reload} />
      )}
      {modal.kind === 'cajas' && (
        <GestionarCajasModal actor={actor} actorName={actorName} onClose={() => setModal({ kind: 'none' })} onCambioAplicado={reload} />
      )}
      {modal.kind === 'detalle-material' && (
        <SalidaMaterialDetalle
          mov={modal.mov}
          esTraslado={modal.esTraslado}
          producto={productos.find((p) => p.id === modal.mov.producto_id) ?? null}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
    </div>
  );
}

function Historial({
  scope, tipo, salMat, trasMat, salDin, trasDin, canWrite, onConciliar, onVerMaterial,
}: {
  scope: Scope; tipo: Tipo;
  salMat: Movimiento[]; trasMat: Movimiento[]; salDin: MovimientoCaja[]; trasDin: MovimientoCaja[];
  canWrite: boolean;
  onConciliar: (s: MovimientoCaja) => void;
  onVerMaterial: (mov: Movimiento, esTraslado: boolean) => void;
}) {
  // Material
  if (tipo === 'material') {
    const rows = scope === 'salidas' ? salMat : trasMat;
    const esTraslado = scope === 'traslados';
    return (
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead>
            <tr>
              <th>Fecha</th><th>Producto</th><th>{esTraslado ? 'Origen → Destino' : 'Origen'}</th>
              {!esTraslado && <th>Dirigido a</th>}
              <th style={{ textAlign: 'right' }}>Cantidad</th>
              <th style={{ textAlign: 'right' }}>Precio unit.</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={esTraslado ? 6 : 7}><EmptyState message={esTraslado ? 'Sin traslados de material.' : 'Sin salidas de material.'} icon="📦" /></td></tr>
            ) : rows.map((m) => {
              const cant = Math.abs(Number(m.delta) || 0);
              const precio = Number(m.precio_unitario) || 0;
              return (
                <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => onVerMaterial(m, esTraslado)} title="Ver detalle">
                  <td className="muted" style={{ fontSize: '.78rem' }}>{dateTime(m.at)}</td>
                  <td><strong>{m.producto?.nombre ?? '—'}</strong><div className="muted mono" style={{ fontSize: '.7rem' }}>{m.producto?.sku}</div></td>
                  <td>{esTraslado ? <span className="mono">{m.almacen} → {m.destino}</span> : <span className="badge">{m.almacen}</span>}</td>
                  {!esTraslado && <td>{m.destino || '—'}</td>}
                  <td className="mono" style={{ textAlign: 'right' }}>{num(cant)} {m.producto?.unidad ?? ''}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{precio ? money(precio) : '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{precio ? money(precio * cant) : '—'}</td>
                  <td className="muted" style={{ fontSize: '.78rem' }}>{m.detalle || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Dinero
  const rows = scope === 'salidas' ? salDin : trasDin;
  const esTraslado = scope === 'traslados';
  return (
    <div className="table-wrap">
      <table className="table" style={{ fontSize: '.85rem' }}>
        <thead>
          <tr>
            <th>Fecha</th><th>Caja</th>
            <th>{esTraslado ? 'Hacia' : 'Dirigido a'}</th>
            <th style={{ textAlign: 'right' }}>Monto</th>
            <th>Motivo</th>
            {!esTraslado && <th>Estado</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr><td colSpan={esTraslado ? 6 : 7}><EmptyState message={esTraslado ? 'Sin traslados de dinero.' : 'Sin salidas de dinero.'} icon="💵" /></td></tr>
          ) : rows.map((m) => (
            <tr key={m.id}>
              <td className="muted" style={{ fontSize: '.78rem' }}>{dateTime(m.at)}</td>
              <td>{m.caja?.nombre ?? '—'} <span className="badge">{m.moneda}</span></td>
              <td>{m.destino || '—'}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{money(Number(m.monto) || 0)}</td>
              <td className="muted" style={{ fontSize: '.78rem' }}>{m.motivo || '—'}</td>
              {!esTraslado && (
                <td>
                  <span className={`badge ${m.estado_mineral === 'conciliada' ? 'success' : 'warning'}`}>
                    {m.estado_mineral === 'conciliada' ? 'Conciliada' : 'Pendiente'}
                  </span>
                </td>
              )}
              <td className="actions">
                <button className="btn btn-sm btn-ghost" onClick={() => esTraslado ? descargarTrasladoDineroPdf(m) : descargarSalidaDineroPdf(m)}>↓ PDF</button>
                {!esTraslado && canWrite && m.estado_mineral === 'pendiente' && (
                  <button className="btn btn-sm btn-primary" onClick={() => onConciliar(m)}>⛏ Recibir mineral</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
