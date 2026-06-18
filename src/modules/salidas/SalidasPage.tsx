import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal as ModalUI } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money, num, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import type {
  Almacen, Caja, Existencia, Movimiento, MovimientoCaja, Producto,
  SolicitudSalida, EstadoSolicitudSalida, ScopeSalida, TipoSalida, Usuario,
} from '@/shared/lib/types';
import { listProductos } from '@/modules/inventario/inventario.repository';
import { listAlmacenes, listExistencias } from '@/modules/inventario/almacenes.repository';
import { listUsuarios } from '@/modules/usuarios/usuarios.repository';
import {
  listCajas, listSalidasDinero, listTrasladosDinero,
} from './cajas.repository';
import {
  listSalidasMaterial, listTrasladosMaterial,
  listSolicitudesSalida, aprobarSolicitudSalida, ejecutarSolicitudSalida, cancelarSolicitudSalida,
} from './salidas.repository';
import { descargarSalidaDineroPdf, descargarTrasladoDineroPdf, descargarOrdenSalidaPdf } from './salidaPdf';
import { SalidaMaterialForm } from './SalidaMaterialForm';
import { TrasladoMaterialForm } from './TrasladoMaterialForm';
import { SalidaDineroForm } from './SalidaDineroForm';
import { TrasladoDineroForm } from './TrasladoDineroForm';
import { ConciliarMineralModal } from './ConciliarMineralModal';
import { GestionarCajasModal } from './GestionarCajasModal';
import { SalidaMaterialDetalle } from './SalidaMaterialDetalle';
import { BarChart, type ChartPoint } from '@/shared/ui/Chart';
import {
  descargarResumenUnidadPdf, descargarResumenUnidadExcel, enviarResumenUnidadCorreo,
  type SalidaResumenRow, type GrupoUnidad, type GrupoProducto,
} from './resumenUnidadSalidas';

type Scope = 'salidas' | 'traslados';
type Tipo = 'material' | 'dinero';
type Vista = 'kanban' | 'lista';
type Modal =
  | { kind: 'none' }
  | { kind: 'salida-material' }
  | { kind: 'traslado-material' }
  | { kind: 'salida-dinero' }
  | { kind: 'traslado-dinero' }
  | { kind: 'conciliar'; salida: MovimientoCaja }
  | { kind: 'detalle-material'; mov: Movimiento; esTraslado: boolean }
  | { kind: 'detalle-solicitud'; sol: SolicitudSalida }
  | { kind: 'resumen-unidad' }
  | { kind: 'cajas' };

const SOL_COLS: { key: EstadoSolicitudSalida; label: string }[] = [
  { key: 'por_aprobar', label: 'Por aprobar' },
  { key: 'aprobada', label: 'Aprobada' },
  { key: 'ejecutada', label: 'Ejecutada' },
  { key: 'cancelada', label: 'Cancelada' },
];
const SOL_ESTADO_CLASS: Record<EstadoSolicitudSalida, string> = {
  por_aprobar: 'warning', aprobada: 'info', ejecutada: 'success', cancelada: 'danger',
};

export function SalidasPage() {
  const { can, appUser, isAdmin, role } = usePermissions();
  const canWrite = can('salidas', 'escritura');
  // Aprueban y ejecutan: admin, quien tenga FULL en salidas, cualquier ANALISTA
  // (analista, analista_de_*) y cualquier JEFE/JEFA (jefe_*, jefa_*). El obrero solo
  // crea solicitudes.
  const puedeAprobar = isAdmin || can('salidas', 'full') || /^(analista|jef[ae])/.test(role ?? '');
  const actor = appUser?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [scope, setScope] = useState<Scope>('salidas');
  // El dinero se maneja directo desde Tesorería; Salidas solo opera material.
  const tipo: Tipo = 'material';
  const [vista, setVista] = useState<Vista>('kanban');
  const [modal, setModal] = useState<Modal>({ kind: 'none' });
  const [loading, setLoading] = useState(true);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [salMat, setSalMat] = useState<Movimiento[]>([]);
  const [trasMat, setTrasMat] = useState<Movimiento[]>([]);
  const [salDin, setSalDin] = useState<MovimientoCaja[]>([]);
  const [trasDin, setTrasDin] = useState<MovimientoCaja[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudSalida[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [pds, exs, alms, cjs, sm, tm, sd, td, sols, usrs] = await Promise.all([
        listProductos(),
        listExistencias().catch(() => [] as Existencia[]),
        listAlmacenes().catch(() => [] as Almacen[]),
        listCajas().catch(() => [] as Caja[]),
        listSalidasMaterial().catch(() => [] as Movimiento[]),
        listTrasladosMaterial().catch(() => [] as Movimiento[]),
        listSalidasDinero().catch(() => [] as MovimientoCaja[]),
        listTrasladosDinero().catch(() => [] as MovimientoCaja[]),
        listSolicitudesSalida().catch(() => [] as SolicitudSalida[]),
        listUsuarios().catch(() => [] as Usuario[]),
      ]);
      setProductos(pds); setExistencias(exs); setAlmacenes(alms); setCajas(cjs);
      setSalMat(sm); setTrasMat(tm); setSalDin(sd); setTrasDin(td); setSolicitudes(sols); setUsuarios(usrs);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar el módulo', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime multiusuario: stock, cajas y solicitudes se reflejan al instante.
  useRealtime(['movimientos', 'movimientos_caja', 'cajas', 'productos', 'solicitudes_salida'], () => { void reload(); });
  useEffect(() => { void reload(); }, [reload]);

  // Mapa email → nombre completo, para mostrar quién autorizó/solicitó con su nombre
  // (las solicitudes guardan el email del aprobador, no el nombre).
  const nombrePorEmail = useMemo(() => {
    const m = new Map<string, string>();
    usuarios.forEach((u) => {
      const nom = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
      if (u.email && nom) m.set(u.email.toLowerCase(), nom);
    });
    return m;
  }, [usuarios]);
  const nombreDe = useCallback((email?: string | null) => {
    if (!email) return '—';
    return nombrePorEmail.get(email.toLowerCase()) || email;
  }, [nombrePorEmail]);

  const almacenesActivos = useMemo(
    () => almacenes.filter((a) => a.estado === 'activo').map((a) => a.nombre),
    [almacenes],
  );

  const esMaterial = tipo === 'material';
  const esSalida = scope === 'salidas';
  const scopeSol: ScopeSalida = esSalida ? 'salida' : 'traslado';
  const tipoSol: TipoSalida = esMaterial ? 'material' : 'dinero';

  // Solicitudes del scope+tipo activo (para el kanban de trámite).
  const solsVista = useMemo(
    () => solicitudes.filter((s) => s.scope === scopeSol && s.tipo === tipoSol),
    [solicitudes, scopeSol, tipoSol],
  );

  function abrirNuevo() {
    if (esSalida && esMaterial) setModal({ kind: 'salida-material' });
    else if (!esSalida && esMaterial) setModal({ kind: 'traslado-material' });
    else if (esSalida && !esMaterial) setModal({ kind: 'salida-dinero' });
    else setModal({ kind: 'traslado-dinero' });
  }
  const btnLabel = esSalida ? '+ Nueva solicitud de salida' : '+ Nueva solicitud de traslado';

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Salidas / Traslados</h1>
          <p className="muted">Toda salida o traslado de <strong>material por almacén</strong> se crea como <strong>solicitud</strong>: el obrero la registra, el analista o el admin la aprueba, y al ejecutar se descuenta el stock.</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setModal({ kind: 'resumen-unidad' })}>📊 Resumen de gasto (material)</button>
          {canWrite && <button className="btn btn-primary" onClick={abrirNuevo}>{btnLabel}</button>}
        </div>
      </div>

      {/* Switch principal: Salidas / Traslados (solo material; el dinero va por Tesorería) */}
      <div className="view-toggle" role="tablist" aria-label="Tipo de operación" style={{ marginBottom: '1rem' }}>
        <button className={scope === 'salidas' ? 'active' : ''} onClick={() => setScope('salidas')}>↘ Salidas</button>
        <button className={scope === 'traslados' ? 'active' : ''} onClick={() => setScope('traslados')}>↔ Traslados</button>
      </div>

      {/* Vista: Kanban (trámite) / Lista (historial de movimientos ejecutados) */}
      <div className="view-toggle" role="tablist" aria-label="Kanban o lista" style={{ marginBottom: '1rem' }}>
        <button className={vista === 'kanban' ? 'active' : ''} onClick={() => setVista('kanban')}>🗂 Solicitudes</button>
        <button className={vista === 'lista' ? 'active' : ''} onClick={() => setVista('lista')}>📜 Historial</button>
      </div>

      {loading ? (
        <EmptyState message="Cargando…" icon="◔" />
      ) : vista === 'kanban' ? (
        <SolicitudesKanban sols={solsVista} onVer={(sol) => setModal({ kind: 'detalle-solicitud', sol })} />
      ) : (
        <Historial
          scope={scope} tipo={tipo}
          salMat={salMat} trasMat={trasMat} salDin={salDin} trasDin={trasDin}
          canWrite={canWrite}
          onConciliar={(s) => setModal({ kind: 'conciliar', salida: s })}
          onVerMaterial={(mov, esTraslado) => setModal({ kind: 'detalle-material', mov, esTraslado })}
        />
      )}

      {modal.kind === 'detalle-solicitud' && (
        <SolicitudDetalleModal
          sol={modal.sol}
          puedeAprobar={puedeAprobar}
          actor={actor}
          actorName={actorName}
          nombreDe={nombreDe}
          onClose={() => setModal({ kind: 'none' })}
          onChanged={reload}
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
      {modal.kind === 'resumen-unidad' && (
        <ResumenUnidadModal solicitudes={solicitudes} defaultEmail={actor} nombreDe={nombreDe} onClose={() => setModal({ kind: 'none' })} />
      )}
    </div>
  );
}

/* ───────── Resumen del gasto de material por UNIDAD SOLICITANTE ───────── */
function ResumenUnidadModal({ solicitudes, defaultEmail, nombreDe, onClose }: {
  solicitudes: SolicitudSalida[]; defaultEmail: string; nombreDe: (email?: string | null) => string; onClose: () => void;
}) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [dimension, setDimension] = useState<'unidad' | 'producto'>('unidad');
  const [drill, setDrill] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emails, setEmails] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);

  // SALIDAS y TRASLADOS de MATERIAL ejecutados = gasto de material (a costo PMP).
  const filas = useMemo<SalidaResumenRow[]>(() => {
    return solicitudes
      .filter((s) => (s.scope === 'salida' || s.scope === 'traslado') && s.tipo === 'material' && s.estado === 'ejecutada')
      .flatMap((s) => {
        const at = s.ejecutada_en ?? s.created_at;
        const esTraslado = s.scope === 'traslado';
        // Una fila por material (solicitudes multi-ítem) o una sola (legado).
        const renglones = (s.items && s.items.length)
          ? s.items.map((it) => ({ nombre: it.producto_nombre ?? '—', cantidad: Number(it.cantidad) || 0, precio: Number(it.precio_unit) || 0, unidad: it.unidad ?? '', almacen: it.almacen ?? s.almacen_origen ?? '' }))
          : [{ nombre: s.producto_nombre ?? '—', cantidad: Number(s.cantidad) || 0, precio: Number(s.precio_unit) || 0, unidad: '', almacen: s.almacen_origen ?? '' }];
        return renglones.map((r) => ({
          unidad: (s.unidad_solicitante ?? '').trim() || 'Sin unidad',
          producto: r.nombre,
          at,
          tipo: esTraslado ? 'Traslado' : 'Salida',
          codigo: s.codigo ?? '',
          solicitante: s.solicitante || s.actor_name || s.actor || '—',
          autorizo: s.aprobada_por ? nombreDe(s.aprobada_por) : '',
          autorizadoEn: s.aprobada_en ?? '',
          ejecutoPor: s.ejecutada_por ? nombreDe(s.ejecutada_por) : '',
          origen: r.almacen,
          destinoTxt: esTraslado ? (s.almacen_destino ?? '') : (s.destino ?? ''),
          motivo: s.motivo ?? '',
          cantidad: r.cantidad,
          precioUnit: r.precio,
          unidadMedida: r.unidad,
          monto: r.cantidad * r.precio,
        } as SalidaResumenRow));
      })
      .filter((f) => {
        const dia = (f.at ?? '').slice(0, 10);
        if (desde && dia < desde) return false;
        if (hasta && dia > hasta) return false;
        return true;
      });
  }, [solicitudes, desde, hasta, nombreDe]);

  const grupos = useMemo<GrupoUnidad[]>(() => {
    const m = new Map<string, GrupoUnidad>();
    for (const f of filas) {
      const g = m.get(f.unidad) ?? { unidad: f.unidad, monto: 0, cantidad: 0, count: 0 };
      g.monto += f.monto; g.cantidad += f.cantidad; g.count += 1;
      m.set(f.unidad, g);
    }
    return [...m.values()].sort((a, b) => b.monto - a.monto);
  }, [filas]);

  const gruposProd = useMemo<GrupoProducto[]>(() => {
    const m = new Map<string, GrupoProducto>();
    for (const f of filas) {
      const g = m.get(f.producto) ?? { producto: f.producto, monto: 0, cantidad: 0, count: 0 };
      g.monto += f.monto; g.cantidad += f.cantidad; g.count += 1;
      m.set(f.producto, g);
    }
    return [...m.values()].sort((a, b) => b.monto - a.monto);
  }, [filas]);

  // Al cambiar de dimensión se cierra el drill-down abierto (las claves no se mezclan).
  function cambiarDimension(d: 'unidad' | 'producto') { setDimension(d); setDrill(null); }

  const totalMonto = grupos.reduce((a, g) => a + g.monto, 0);
  const porUnidad = dimension === 'unidad';
  const data: ChartPoint[] = porUnidad
    ? grupos.map((g) => ({ label: g.unidad, value: g.monto, tooltip: `${g.unidad}: ${money(g.monto)}` }))
    : gruposProd.map((g) => ({ label: g.producto, value: g.monto, tooltip: `${g.producto}: ${money(g.monto)}` }));
  const drillFilas = drill
    ? filas.filter((f) => (porUnidad ? f.unidad : f.producto) === drill).sort((a, b) => (a.at < b.at ? 1 : -1))
    : [];
  const meta = { desde: desde || null, hasta: hasta || null };

  async function exportar(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo exportar', 'error'); }
    finally { setBusy(false); }
  }
  async function enviar() {
    setBusy(true);
    try {
      const { destinatarios } = await enviarResumenUnidadCorreo(emails.split(/[,\s;]+/), grupos, gruposProd, filas, meta);
      toast(`Enviado a ${destinatarios.join(', ')}`, 'success');
      setEmailOpen(false);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error'); }
    finally { setBusy(false); }
  }

  const footer = <button className="btn btn-primary" onClick={onClose}>Cerrar</button>;

  return (
    <ModalUI title="📊 Gasto de material (salidas y traslados)" size="lg" onClose={onClose} footer={footer}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.7rem' }}>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
          Desde <input className="input" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
          Hasta <input className="input" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} />
        </label>
        {(desde || hasta) && <button className="btn btn-sm btn-ghost" onClick={() => { setDesde(''); setHasta(''); }}>✕ Fechas</button>}
        <span className="muted" style={{ fontSize: '.78rem', marginLeft: 'auto' }}>{filas.length} movimiento(s) · {money(totalMonto)}</span>
      </div>

      {/* Dimensión del resumen: por unidad solicitante o por producto */}
      <div className="view-toggle" role="tablist" aria-label="Agrupar por" style={{ marginBottom: '.6rem' }}>
        <button className={porUnidad ? 'active' : ''} onClick={() => cambiarDimension('unidad')}>🏢 Por unidad solicitante</button>
        <button className={!porUnidad ? 'active' : ''} onClick={() => cambiarDimension('producto')}>📦 Por producto</button>
      </div>

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
        <button className="btn btn-sm btn-ghost" disabled={busy || !filas.length} onClick={() => void exportar(() => descargarResumenUnidadPdf(grupos, gruposProd, filas, meta))}>↓ PDF</button>
        <button className="btn btn-sm btn-ghost" disabled={busy || !filas.length} onClick={() => void exportar(() => descargarResumenUnidadExcel(grupos, gruposProd, filas, meta))}>↓ Excel</button>
        <button className="btn btn-sm btn-ghost" disabled={busy || !filas.length} onClick={() => setEmailOpen((v) => !v)}>✉ Correo</button>
      </div>
      {emailOpen && (
        <div className="card" style={{ padding: '.6rem', marginBottom: '.6rem', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" name="resumen-emails" style={{ flex: 1, minWidth: 220 }} defaultValue={emails} onChange={(e) => setEmails(e.target.value)} placeholder="correo1@…, correo2@…" />
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void enviar()}>{busy ? 'Enviando…' : 'Enviar'}</button>
        </div>
      )}

      {!filas.length && <EmptyState message="No hay salidas ni traslados de material ejecutados en el período." />}

      {filas.length > 0 && (
        <>
          <div className="card" style={{ padding: '.8rem', marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Gasto por {porUnidad ? 'unidad' : 'producto'} (USD)</span></div>
            <BarChart data={data} yFormatter={(v) => money(v)} emptyMessage="Sin movimientos en el período."
              onBarClick={(p) => setDrill((d) => d === p.label ? null : p.label)} />
            <p className="muted" style={{ fontSize: '.74rem', margin: '.4rem 0 0' }}>📊 Tocá una barra (o una fila) para ver el detalle de {porUnidad ? 'esa unidad' : 'ese producto'}.</p>
          </div>

          {/* Tabla resumen (clic = drill-down) */}
          <div className="table-wrap" style={{ marginBottom: drill ? '.75rem' : 0 }}>
            <table className="table" style={{ fontSize: '.84rem' }}>
              <thead><tr><th>{porUnidad ? 'Unidad solicitante' : 'Producto'}</th><th style={{ textAlign: 'right' }}>Movs.</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Gasto (USD)</th></tr></thead>
              <tbody>
                {porUnidad ? grupos.map((g) => (
                  <tr key={g.unidad} style={{ cursor: 'pointer', background: drill === g.unidad ? 'var(--bg-1)' : undefined }} onClick={() => setDrill((d) => d === g.unidad ? null : g.unidad)}>
                    <td>{g.unidad}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(g.count)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(g.cantidad)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(g.monto)}</td>
                  </tr>
                )) : gruposProd.map((g) => (
                  <tr key={g.producto} style={{ cursor: 'pointer', background: drill === g.producto ? 'var(--bg-1)' : undefined }} onClick={() => setDrill((d) => d === g.producto ? null : g.producto)}>
                    <td>{g.producto}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(g.count)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(g.cantidad)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(g.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ fontWeight: 700 }}>
                <td style={{ textAlign: 'right' }}>TOTAL</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(filas.length)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(grupos.reduce((a, g) => a + g.cantidad, 0))}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(totalMonto)}</td>
              </tr></tfoot>
            </table>
          </div>

          {/* Drill-down: detalle completo (cuándo salió, quién solicitó/autorizó, origen→destino) */}
          {drill && (
            <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
              <div className="card-title" style={{ margin: '0 0 .35rem' }}>Detalle · {drill} <span className="muted" style={{ fontWeight: 400 }}>({drillFilas.length} movimiento(s))</span></div>
              <table className="table" style={{ fontSize: '.8rem' }}>
                <thead><tr>
                  <th>Fecha y hora</th><th>Tipo</th><th>Código</th>
                  {porUnidad ? <th>Material</th> : <th>Unidad</th>}
                  <th>Solicitó</th><th>Autorizó</th><th>Origen → Destino</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Costo u.</th><th style={{ textAlign: 'right' }}>Gasto (USD)</th>
                </tr></thead>
                <tbody>
                  {drillFilas.map((f, i) => (
                    <tr key={i}>
                      <td>{dateTime(f.at)}</td>
                      <td>{f.tipo}</td>
                      <td className="mono">{f.codigo}</td>
                      <td>{porUnidad ? f.producto : f.unidad}</td>
                      <td>{f.solicitante}</td>
                      <td title={f.autorizadoEn ? dateTime(f.autorizadoEn) : undefined}>{f.autorizo || '—'}</td>
                      <td>{[f.origen, f.destinoTxt].filter(Boolean).join(' → ') || '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{num(f.cantidad)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(f.precioUnit)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(f.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: '.72rem', margin: '.35rem 0 0' }}>Pasá el mouse sobre «Autorizó» para ver la fecha de autorización.</p>
            </div>
          )}
        </>
      )}
    </ModalUI>
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
              <th>Realizado por</th>
              <th style={{ textAlign: 'right' }}>Cantidad</th>
              <th style={{ textAlign: 'right' }}>Precio unit.</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={8}><EmptyState message={esTraslado ? 'Sin traslados de material.' : 'Sin salidas de material.'} icon="📦" /></td></tr>
            ) : rows.map((m) => {
              const cant = Math.abs(Number(m.delta) || 0);
              const precio = Number(m.precio_unitario) || 0;
              return (
                <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => onVerMaterial(m, esTraslado)} title="Ver detalle">
                  <td className="muted" style={{ fontSize: '.78rem' }}>{dateTime(m.at)}</td>
                  <td><strong>{m.producto?.nombre ?? '—'}</strong><div className="muted mono" style={{ fontSize: '.7rem' }}>{m.producto?.sku}</div></td>
                  <td>{esTraslado ? <span className="mono">{m.almacen} → {m.destino}</span> : <span className="badge">{m.almacen}</span>}</td>
                  <td>{m.solicitante || m.actor_name || m.actor || '—'}</td>
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

/* ───────────── Kanban de solicitudes (trámite de aprobación) ───────────── */

function resumenSolicitud(s: SolicitudSalida): string {
  if (s.tipo === 'material') {
    const cant = num(Number(s.cantidad) || 0);
    if (s.scope === 'traslado') return `${cant} · ${s.almacen_origen} → ${s.almacen_destino}`;
    return `${cant} · ${s.almacen_origen} → ${s.destino ?? '—'}`;
  }
  const monto = money(Number(s.monto) || 0);
  if (s.scope === 'traslado') return `${monto} ${s.moneda ?? ''} → ${s.destino ?? '—'}`;
  return `${monto} ${s.moneda ?? ''} → ${s.destino ?? '—'}`;
}

function SolicitudesKanban({ sols, onVer }: { sols: SolicitudSalida[]; onVer: (s: SolicitudSalida) => void }) {
  if (!sols.length) return <EmptyState message="No hay solicitudes en esta vista. Creá una con el botón de arriba." icon="🗂" />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem' }}>
      {SOL_COLS.map((col) => {
        const items = sols.filter((s) => s.estado === col.key);
        return (
          <div key={col.key} className="card" style={{ margin: 0, padding: '.6rem', background: 'var(--bg-1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
              <strong style={{ fontSize: '.82rem' }}>{col.label}</strong>
              <span className={`badge ${SOL_ESTADO_CLASS[col.key]}`}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {items.map((s) => (
                <button key={s.id} className="card" onClick={() => onVer(s)}
                  style={{ margin: 0, padding: '.55rem .65rem', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }}>
                  <div className="mono" style={{ fontSize: '.72rem', color: 'var(--primary-3)' }}>{s.codigo}</div>
                  <div style={{ fontSize: '.82rem', fontWeight: 600 }}>
                    {s.tipo === 'material' ? (s.producto_nombre ?? 'Material') : 'Dinero'}
                  </div>
                  <div className="muted" style={{ fontSize: '.74rem' }}>{resumenSolicitud(s)}</div>
                  <div style={{ fontSize: '.72rem', marginTop: '.2rem', color: 'var(--success)', fontWeight: 600 }}>
                    👤 {s.solicitante ?? '—'}
                  </div>
                  <div className="muted" style={{ fontSize: '.68rem', marginTop: '.15rem' }}>{dateTime(s.created_at)}</div>
                </button>
              ))}
              {!items.length && <div className="muted" style={{ fontSize: '.74rem', padding: '.25rem' }}>—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── Detalle + acciones de una solicitud ───────────── */

function SolicitudDetalleModal({
  sol, puedeAprobar, actor, actorName, nombreDe, onClose, onChanged,
}: {
  sol: SolicitudSalida;
  puedeAprobar: boolean;
  actor: string;
  actorName: string | null;
  nombreDe: (email?: string | null) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState('');

  const ejecutarLabel =
    sol.tipo === 'dinero'
      ? (sol.scope === 'traslado' ? 'Ejecutar (traslado de caja)' : 'Ejecutar (egreso de caja)')
      : (sol.scope === 'traslado' ? 'Ejecutar (mueve stock)' : 'Ejecutar (descuenta stock)');

  async function run(fn: () => Promise<void>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      notify(okMsg, 'success');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo completar la acción', 'error');
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      {sol.tipo === 'material' && (
        <button className="btn btn-ghost" disabled={busy}
          onClick={() => { void descargarOrdenSalidaPdf(sol).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error')); }}>
          ↓ Orden de salida (PDF)
        </button>
      )}
      {puedeAprobar && sol.estado === 'por_aprobar' && (
        <button className="btn btn-primary" disabled={busy}
          onClick={() => run(() => aprobarSolicitudSalida(sol, actor), `Solicitud ${sol.codigo} aprobada`)}>
          ✔ Aprobar
        </button>
      )}
      {puedeAprobar && sol.estado === 'aprobada' && (
        <button className="btn btn-primary" disabled={busy}
          onClick={() => run(() => ejecutarSolicitudSalida(sol, actor, actorName), `Solicitud ${sol.codigo} ejecutada`)}>
          {ejecutarLabel}
        </button>
      )}
      {sol.estado !== 'ejecutada' && sol.estado !== 'cancelada' && (
        <button className="btn btn-danger" disabled={busy} onClick={() => setCancelOpen(true)}>Cancelar solicitud</button>
      )}
      <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cerrar</button>
    </>
  );

  return (
    <ModalUI title={`Solicitud ${sol.codigo}`} onClose={onClose} footer={footer}>
      <table className="table" style={{ fontSize: '.85rem' }}>
        <tbody>
          <tr><td className="muted">Tipo</td><td>{sol.scope === 'traslado' ? 'Traslado' : 'Salida'} de {sol.tipo === 'dinero' ? 'dinero' : 'material'}</td></tr>
          <tr><td className="muted">Estado</td><td><span className={`badge ${SOL_ESTADO_CLASS[sol.estado]}`}>{SOL_COLS.find((c) => c.key === sol.estado)?.label}</span></td></tr>
          <tr><td className="muted">Solicitante</td><td>{sol.solicitante}</td></tr>
          {sol.unidad_solicitante && <tr><td className="muted">Unidad solicitante</td><td>{sol.unidad_solicitante}</td></tr>}
          {sol.tipo === 'material' ? (
            <>
              <tr><td className="muted">{sol.scope === 'traslado' ? 'Origen → Destino' : 'Almacén origen'}</td>
                <td>{sol.scope === 'traslado' ? `${sol.almacen_origen} → ${sol.almacen_destino}` : sol.almacen_origen}</td></tr>
              {sol.items && sol.items.length > 1 ? (
                <tr>
                  <td className="muted">Materiales</td>
                  <td>
                    <table className="table" style={{ fontSize: '.8rem', margin: 0 }}>
                      <thead><tr><th>Producto</th>{sol.scope !== 'traslado' && <th>Almacén</th>}<th className="num">Cantidad</th><th className="num">P. unit.</th><th className="num">Subtotal</th></tr></thead>
                      <tbody>
                        {sol.items.map((it, i) => (
                          <tr key={i}>
                            <td>{it.producto_nombre}{it.producto_sku ? ` · ${it.producto_sku}` : ''}
                              {it.observacion && <div className="muted" style={{ fontSize: '.72rem' }}>📝 {it.observacion}</div>}</td>
                            {sol.scope !== 'traslado' && <td>{it.almacen ?? sol.almacen_origen ?? '—'}</td>}
                            <td className="num mono">{num(Number(it.cantidad) || 0)} {it.unidad ?? ''}</td>
                            <td className="num mono">{money(Number(it.precio_unit) || 0)}</td>
                            <td className="num mono">{money((Number(it.cantidad) || 0) * (Number(it.precio_unit) || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr><td colSpan={sol.scope !== 'traslado' ? 4 : 3} className="num"><strong>Total</strong></td><td className="num mono"><strong>{money(sol.items.reduce((a, it) => a + (Number(it.cantidad) || 0) * (Number(it.precio_unit) || 0), 0))}</strong></td></tr></tfoot>
                    </table>
                  </td>
                </tr>
              ) : (
                <>
                  <tr><td className="muted">Producto</td><td>{sol.producto_nombre ?? '—'}</td></tr>
                  <tr><td className="muted">Cantidad</td><td className="mono">{num(Number(sol.cantidad) || 0)}</td></tr>
                </>
              )}
            </>
          ) : (
            <>
              <tr><td className="muted">Monto</td><td className="mono">{money(Number(sol.monto) || 0)} {sol.moneda ?? ''}</td></tr>
              <tr><td className="muted">{sol.scope === 'traslado' ? 'Hacia' : 'Dirigido a'}</td><td>{sol.destino ?? '—'}</td></tr>
            </>
          )}
          {sol.motivo && <tr><td className="muted">Motivo</td><td>{sol.motivo}</td></tr>}
          {sol.consumo_interno && <tr><td className="muted">Tipo</td><td><span className="badge">CONSUMO INTERNO</span></td></tr>}
          {sol.chofer_nombre && <tr><td className="muted">Chofer / responsable</td><td>{sol.chofer_nombre}{sol.chofer_cedula ? ` · C.I. ${sol.chofer_cedula}` : ''}</td></tr>}
          {(sol.vehiculo_descripcion || sol.vehiculo_placa) && <tr><td className="muted">Vehículo</td><td>{[sol.vehiculo_descripcion, sol.vehiculo_placa].filter(Boolean).join(' · ')}</td></tr>}
          {sol.direccion_despacho && <tr><td className="muted">Dirección de despacho</td><td>{sol.direccion_despacho}</td></tr>}
          {sol.direccion_destino && <tr><td className="muted">Dirección de destino</td><td>{sol.direccion_destino}</td></tr>}
          <tr><td className="muted">Creada</td><td>{dateTime(sol.created_at)}</td></tr>
          {sol.aprobada_en && <tr><td className="muted">Autorizada por</td><td>{nombreDe(sol.aprobada_por)} · {dateTime(sol.aprobada_en)}</td></tr>}
          {sol.ejecutada_en && <tr><td className="muted">Ejecutada por</td><td>{nombreDe(sol.ejecutada_por)} · {dateTime(sol.ejecutada_en)}</td></tr>}
        </tbody>
      </table>

      {!puedeAprobar && sol.estado !== 'ejecutada' && sol.estado !== 'cancelada' && (
        <div className="muted" style={{ fontSize: '.78rem', marginTop: '.5rem' }}>
          Solo un analista, un jefe o el administrador puede aprobar y ejecutar esta solicitud.
        </div>
      )}

      {cancelOpen && (
        <div className="card" style={{ marginTop: '.75rem', borderColor: 'var(--danger)' }}>
          <label className="muted" style={{ fontSize: '.8rem' }}>Motivo de la cancelación</label>
          <textarea className="input" name="motivo-cancel" rows={2} defaultValue={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} placeholder="Indicá por qué se cancela…" />
          <div className="actions" style={{ marginTop: '.5rem' }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setCancelOpen(false)} disabled={busy}>Volver</button>
            <button className="btn btn-sm btn-danger" disabled={busy || !motivoCancel.trim()}
              onClick={() => run(() => cancelarSolicitudSalida(sol, actor, motivoCancel.trim()), `Solicitud ${sol.codigo} cancelada`)}>
              Confirmar cancelación
            </button>
          </div>
        </div>
      )}
    </ModalUI>
  );
}
