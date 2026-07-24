import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtime } from '@/shared/lib/useRealtime';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money, num } from '@/shared/lib/format';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { MovimientosAcopioView, type ResumenAcopio } from './MovimientosAcopioView';
import type { FilaMov } from './movimientosAcopioCalc';
import { CategoriasModal } from './CategoriasModal';
import { HistoricoCajasModal } from './HistoricoCajasModal';
import { listProductos } from '@/modules/inventario/inventario.repository';
import { getNombresAlmacenes } from '@/modules/inventario/almacenes.repository';
import type { Producto, RecepcionAcopio } from '@/shared/lib/types';
import {
  createRecepcion,
  updateRecepcion,
  cerrarRecepcion,
  anularRecepcion,
  deleteRecepcion,
  type RecepcionInput,
  type LoteInput,
} from './acopio.repository';
import { listCajas, crearMovimientoCaja, cerrarYAbrirCaja, proximoNumeroCaja, listClasificacionesAll, resumenCajaAcopio, esCategoriaVehiculo, consumoGastosPorEquipo, gastosDetalleCategoria, listGastosPorAceptar, type CajaMovimientoInput, type ResumenCajaAcopio, type GastoPorAceptar } from './caja.repository';
import { GastosPorAceptar } from './GastosPorAceptar';
import { descargarResumenCajaPdf, enviarResumenCajaPorCorreo } from './resumenCajaPdf';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import { ConsumoChartModal } from '@/shared/ui/ConsumoChartModal';
import { ConsumoMartillosModal } from './ConsumoMartillosModal';
import { ConsumoAceiteModal } from './ConsumoAceiteModal';
import type { ClasificacionAcopio } from '@/shared/lib/types';
import { DineroPorEntrar } from './DineroPorEntrar';
import { listEntrantesPorConfirmar } from '@/modules/tesoreria/transferenciasInter.repository';
import { descargarRecepcionPdf } from './acopioPdf';
import { listContratos } from '@/modules/produccion/contratos.repository';
import type { CajaCierre, TransferenciaInter, ContratoAcopio } from '@/shared/lib/types';

const ESTADO_LABEL: Record<string, string> = {
  abierta: '● Abierta', cerrada: '✔ Cerrada', anulada: '✖ Anulada',
};
/** Filas por defecto en una recepción nueva (la plantilla original trae 25). */
const FILAS_DEFAULT = 25;

export function AcopioPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('acopio', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [almacenes, setAlmacenes] = useState<string[]>([]);
  const [cajas, setCajas] = useState<CajaCierre[]>([]);
  const [entrantes, setEntrantes] = useState<TransferenciaInter[]>([]);
  const [gastosPorAceptar, setGastosPorAceptar] = useState<GastoPorAceptar[]>([]);
  // Contratos de producción ACTIVOS — se incluyen como referencia en la foto del cierre.
  const [contratosActivos, setContratosActivos] = useState<ContratoAcopio[]>([]);
  const [editar, setEditar] = useState<RecepcionAcopio | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [movAcopio, setMovAcopio] = useState(false);
  const [categorias, setCategorias] = useState(false);
  const [resumenCaja, setResumenCaja] = useState(false);
  const [martillos, setMartillos] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  // Número de la caja NUEVA que se abre al cerrar: se indica la primera vez y luego
  // se prellena incremental. Al abrir el modal se sugiere el próximo correlativo.
  const [numeroCierre, setNumeroCierre] = useState('');
  // Switch «Listar movimientos»: la tabla de movimientos arranca oculta y se muestra al activarlo.
  const [listar, setListar] = useState(false);
  // Resumen único que alimenta TODAS las tarjetas (misma fuente que la tabla de movimientos).
  const [resumen, setResumen] = useState<ResumenAcopio>({ saldoKg: 0, tasa: 0, usdEntregado: 0, saldoUsd: 0, gastos: 0, nominas: 0, facturado: 0 });
  // Filas actuales de la tabla (para tomar la foto exacta al cerrar la caja).
  const [filasActuales, setFilasActuales] = useState<FilaMov[]>([]);
  const navigate = useNavigate();
  const onResumenAcopio = useCallback((r: ResumenAcopio) => { setResumen(r); }, []);
  const onFilasAcopio = useCallback((f: FilaMov[]) => { setFilasActuales(f); }, []);

  // Tendencia de la TASA: ▲ verde si subió, ▼ rojo si bajó (vs. el último valor visto).
  const [tasaTrend, setTasaTrend] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const t = resumen.tasa;
    if (!t) return;
    const key = 'gt_acopio_tasa_prev';
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw == null ? null : Number(prevRaw);
    if (prev != null && Number.isFinite(prev) && Math.abs(prev - t) > 0.0001) {
      setTasaTrend(t > prev ? 'up' : 'down');
      localStorage.setItem(key, String(t));
    } else if (prev == null || !Number.isFinite(prev)) {
      localStorage.setItem(key, String(t));
    }
  }, [resumen.tasa]);

  const reload = useCallback(async () => {
    const [ps, alms, cjs, ent, cts, gpa] = await Promise.all([
      listProductos(), getNombresAlmacenes(), listCajas(),
      listEntrantesPorConfirmar('acopio').catch(() => []),
      listContratos().catch(() => [] as ContratoAcopio[]),
      listGastosPorAceptar().catch(() => [] as GastoPorAceptar[]),
    ]);
    setProductos(ps);
    setAlmacenes(alms);
    setCajas(cjs);
    setEntrantes(ent);
    setContratosActivos(cts.filter((c) => c.estado === 'activo'));
    setGastosPorAceptar(gpa);
  }, []);

  useEffect(() => {
    let cancel = false;
    reload().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); });
    return () => { cancel = true; };
  }, [reload]);
  useRealtime(['acopio_recepciones', 'acopio_recepcion_lotes', 'acopio_caja_movimientos', 'acopio_clasificaciones', 'acopio_cajas', 'acopio_costo_clases', 'acopio_cuadres', 'acopio_cuadre_movimientos', 'acopio_contratos', 'acopio_gastos_por_aceptar', 'transferencias_inter', 'cajas', 'productos', 'existencias'], reload);

  // Caja a la que se asocian los movimientos nuevos (la ACTUALMENTE ABIERTA).
  const cajaActual = useMemo(() => cajas.find((c) => c.estado === 'abierta') ?? cajas[0] ?? null, [cajas]);

  // CIERRE de caja: congela la caja actual (movimientos + saldos de las tarjetas) en
  // histórico y abre una nueva que arranca con el saldo acumulado (USD como movimiento
  // de «USD entregados»; Kg como saldo de apertura). Tasa y gastos se reinician.
  async function cerrarCaja() {
    setCerrando(true);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const totalKg = filasActuales.reduce((a, f) => a + f.kgCerrados, 0);
      await cerrarYAbrirCaja({
        cajaActual,
        actor, actorName,
        numeroNueva: numeroCierre.trim() || null,
        snapshot: {
          numero: cajaActual?.numero ?? 'Caja',
          nombre: cajaActual?.nombre ?? null,
          fechaInicio: cajaActual?.fecha_inicio ?? filasActuales[0]?.fecha ?? null,
          fechaCierre: hoy,
          resumen: {
            saldoUsd: resumen.saldoUsd, saldoKg: resumen.saldoKg, tasa: resumen.tasa,
            usdEntregado: resumen.usdEntregado, gastos: resumen.gastos, nominas: resumen.nominas,
            facturado: resumen.facturado, totalKg,
          },
          filas: filasActuales.map((f) => ({
            fecha: f.fecha, descripcion: f.descripcion, usdEntregado: f.usdEntregado,
            kgCerrados: f.kgCerrados, usdFacturados: f.usdFacturados, gastosGt: f.gastosGt,
            nominasGt: f.nominasGt, saldoUsd: f.saldoUsd, saldoKgCasiterita: f.saldoKgCasiterita,
          })),
          // Contratos de producción aún activos: referencia dentro de la foto del cierre.
          contratosActivos: contratosActivos.map((c) => ({
            numero: c.numero, fecha: hoy, supervisor: c.supervisor ?? null,
            lugarExtraccion: c.lugar_extraccion ?? null, kgSecoLimpio: Number(c.kg_seco_limpio) || 0,
          })),
        },
      });
      toast('Caja cerrada · se abrió una nueva con el saldo acumulado', 'success');
      setConfirmarCierre(false);
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cerrar la caja', 'error');
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>📦 Centro de Costo PERAMANAL</h1>
          <p className="muted hint">Control de recepción de mineral por centro de acopio. Al cerrar una recepción, el mineral recibido suma stock al inventario.</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setResumenCaja(true)}>📊 Resumen caja</button>
          <button className="btn btn-ghost" onClick={() => setHistorico(true)}>🗂 Histórico cierres</button>
          <button className="btn btn-ghost" onClick={() => setMartillos(true)}>🔨 Consumo Martillos</button>
          <button className="btn btn-ghost" onClick={() => setAceite(true)}>🛢 Consumo Aceite</button>
          <button className="btn btn-ghost" onClick={() => setCategorias(true)}>🏷 Categorías</button>
          {canWrite && <button className="btn btn-ghost" onClick={() => { proximoNumeroCaja().then(setNumeroCierre).catch(() => setNumeroCierre('')); setConfirmarCierre(true); }} title="Cierra la caja actual y abre una nueva con el saldo acumulado">🔒 Cerrar caja</button>}
          <label className="switch-inline" title="Mostrar u ocultar la lista de movimientos del centro de acopio">
            <span className="switch">
              <input type="checkbox" checked={listar} onChange={(e) => setListar(e.target.checked)} />
              <span className="slider-toggle" />
            </span>
            <span style={{ fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>LISTAR MOVIMIENTOS</span>
          </label>
          {canWrite && listar && <button className="btn btn-primary" onClick={() => setMovAcopio(true)}>+ Agregar Movimiento</button>}
        </div>
      </div>

      {/* Dinero que llega desde el otro sistema (puente inter-sistema) */}
      <DineroPorEntrar entrantes={entrantes} cajas={cajas} actor={actor} actorName={actorName} onReload={reload} />

      {/* Gastos de Tesorería (Peramanal) pendientes de aceptar en los movimientos */}
      {canWrite && <GastosPorAceptar gastos={gastosPorAceptar} onReload={reload} />}

      {/* Tarjeta protagonista: TASA ACTUAL DEL MATERIAL (varía con los gastos) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card" style={{ borderColor: 'var(--primary)', background: 'linear-gradient(135deg, var(--surface-2), var(--surface))' }}>
          <div className="card-title"><span>💲 Tasa actual del material</span></div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-3)' }} className="mono">{money(resumen.tasa)}<span style={{ fontSize: '.9rem', fontWeight: 500 }}> /Kg</span></div>
            {tasaTrend && (
              <span style={{ fontWeight: 800, fontSize: '.9rem', color: tasaTrend === 'up' ? 'var(--success)' : 'var(--danger)' }}
                title={tasaTrend === 'up' ? 'La tasa subió respecto al valor anterior' : 'La tasa bajó respecto al valor anterior'}>
                {tasaTrend === 'up' ? '▲ SUBIÓ' : '▼ BAJÓ'}
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.3rem' }}>(Facturado + Gastos + Nóminas) ÷ Kg cerrados</div>
        </div>
        <div className="card" style={{ borderColor: 'var(--success)', cursor: 'pointer' }}
          onClick={() => navigate('/app/tesoreria?ver=creditos')}
          title="Ver la deuda a MGG en Cuentas por pagar (créditos)">
          <div className="card-title"><span>💵 USD entregados</span></div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success)' }} className="mono">{money(resumen.usdEntregado)}</div>
          <div className="muted" style={{ fontSize: '.72rem' }}>suma de lo que entra (incluye el dinero recibido del otro sistema) · se debe a MGG → clic para ver en Tesorería</div>
        </div>
        <div className="card"><div className="card-title"><span>Saldo de caja</span></div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: resumen.saldoUsd < 0 ? 'var(--danger)' : undefined }} className="mono">{money(resumen.saldoUsd)}</div><div className="muted" style={{ fontSize: '.72rem' }}>saldo en moneda $ Usd (corrido)</div></div>
        <div className="card"><div className="card-title"><span>Saldo en Kg</span></div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: resumen.saldoKg < 0 ? 'var(--danger)' : undefined }} className="mono">{num(resumen.saldoKg)} Kg</div><div className="muted" style={{ fontSize: '.72rem' }}>saldo de casiterita (acumulado)</div></div>
        <div className="card"><div className="card-title"><span>Gastos GT</span></div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--danger)' }} className="mono">{money(resumen.facturado + resumen.gastos + resumen.nominas)}</div><div className="muted" style={{ fontSize: '.72rem' }}>incluye facturado y nómina</div></div>
      </div>

      {/* Lista de movimientos del centro de acopio (contratos cerrados se reflejan aquí).
          Se muestra solo con el switch «Listar movimientos»; aun oculta, alimenta las tarjetas. */}
      <MovimientosAcopioView onResumen={onResumenAcopio} onFilas={onFilasAcopio} visible={listar} caja={cajaActual} />

      {categorias && <CategoriasModal canWrite={canWrite} onClose={() => setCategorias(false)} />}

      {resumenCaja && <ResumenCajaModal defaultEmail={user?.email ?? ''} onClose={() => setResumenCaja(false)} />}

      {martillos && <ConsumoMartillosModal onClose={() => setMartillos(false)} />}
      {aceite && <ConsumoAceiteModal onClose={() => setAceite(false)} />}

      {historico && <HistoricoCajasModal onClose={() => setHistorico(false)} />}

      {confirmarCierre && (
        <Modal
          title="🔒 Cerrar caja"
          compact
          onClose={() => { if (!cerrando) setConfirmarCierre(false); }}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => { if (!cerrando) setConfirmarCierre(false); }} disabled={cerrando}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => { if (!cerrando) void cerrarCaja(); }} disabled={cerrando || !numeroCierre.trim()}>{cerrando ? 'Cerrando…' : 'Cerrar caja'}</button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            Se cerrará la caja actual (<strong>{cajaActual?.numero ?? '—'}</strong>) y se guardará en el histórico con sus movimientos y saldos. Se abrirá una caja nueva: el saldo <strong>{money(resumen.saldoUsd)}</strong> entra como «USD entregados». El Saldo en Kg (<strong>{num(resumen.saldoKg)} Kg</strong>) se REINICIA en 0 — todo el acumulado de casiterita se despacha a Recepción. La tasa y los gastos también se reinician.
            {contratosActivos.length ? ` Se incluirá${contratosActivos.length > 1 ? 'n' : ''} ${contratosActivos.length} contrato(s) activo(s) como referencia en la foto del cierre (no se cierran).` : ''}
          </p>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>N° de la caja nueva</label>
            <input className="input" value={numeroCierre} onChange={(e) => setNumeroCierre(e.target.value)} placeholder="Ej. Caja 5" autoFocus />
            <small className="muted">Indicalo la primera vez; luego se sugiere incremental automáticamente. Podés editarlo.</small>
          </div>
        </Modal>
      )}

      {movAcopio && (
        <AgregarMovimientoModal
          cajaActual={cajaActual}
          actor={actor}
          actorName={actorName}
          onClose={() => setMovAcopio(false)}
          onSaved={async () => { setMovAcopio(false); await reload(); }}
        />
      )}

      {(nuevo || editar) && (
        <RecepcionModal
          recepcion={editar}
          productos={productos}
          almacenes={almacenes}
          canWrite={canWrite}
          actor={actor}
          actorName={actorName}
          onClose={() => { setNuevo(false); setEditar(null); }}
          onSaved={async () => { setNuevo(false); setEditar(null); await reload(); }}
        />
      )}
    </div>
  );
}

/* ───────────── Agregar movimiento de caja (acopio) ───────────── */

function AgregarMovimientoModal({ cajaActual, actor, actorName, onClose, onSaved }: {
  cajaActual: CajaCierre | null;
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [gastos, setGastos] = useState('');
  const [gastoCat, setGastoCat] = useState('');
  const [descGastos, setDescGastos] = useState('');
  const [traslado, setTraslado] = useState('');
  const [descTraslado, setDescTraslado] = useState('');
  const [kgRecibidos, setKgRecibidos] = useState('');
  const [descKg, setDescKg] = useState('');
  const [cats, setCats] = useState<ClasificacionAcopio[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listClasificacionesAll().then(setCats).catch(() => setCats([])); }, []);
  // Gastos + Nómina unificados en UNA sola lista buscable. El grupo de cada
  // categoría se conserva para enrutar el monto al campo correcto al guardar.
  const catsUnificadas = useMemo(
    () => cats.filter((c) => (c.grupo === 'gastos_caja' || c.grupo === 'nomina') && c.activo),
    [cats],
  );

  // Redondeo a 2 decimales para los montos en $.
  const r2 = (s: string) => Math.round((Number(s) || 0) * 100) / 100;

  async function guardar() {
    setError(null);
    const gas = r2(gastos), tras = r2(traslado);
    const kg = Number(kgRecibidos) || 0;
    if (gas <= 0 && tras <= 0 && kg <= 0) { setError('Ingresá al menos un monto.'); return; }
    if (gas > 0 && !gastoCat) { setError('Elegí la categoría del gasto.'); return; }
    setSaving(true);
    try {
      const cajaId = cajaActual?.id ?? null;
      // Una fila por concepto. El gasto se registra en su campo según el grupo de
      // la categoría elegida (gastos_caja o nómina), pero en la UI es un solo campo.
      const filas: CajaMovimientoInput[] = [];
      if (gas > 0) {
        const cat = catsUnificadas.find((c) => c.valor === gastoCat);
        const esNomina = cat?.grupo === 'nomina';
        filas.push(esNomina
          ? { fecha, nominas: gas, clasif_grupo: 'nomina', clasif_valor: gastoCat, descripcion: descGastos.trim() || gastoCat, caja_id: cajaId }
          : { fecha, gastos: gas, clasif_grupo: 'gastos_caja', clasif_valor: gastoCat, descripcion: descGastos.trim() || gastoCat, caja_id: cajaId });
      }
      if (tras > 0) filas.push({ fecha, traslado: tras, clasif_grupo: 'traslado', descripcion: descTraslado.trim() || 'Traslado de caja', caja_id: cajaId });
      if (kg > 0) filas.push({ fecha, kg_recibidos: kg, descripcion: descKg.trim() || 'Kg recibidos por MGG', caja_id: cajaId });
      for (const f of filas) await crearMovimientoCaja(f, actor, actorName);
      toast(`${filas.length} movimiento(s) registrado(s)`, 'success');
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={saving}>{saving ? 'Guardando…' : 'Registrar'}</button>
    </>
  );

  // Campo monto en $ con 2 decimales.
  const campoUsd = (label: string, val: string, set: (v: string) => void, name: string) => (
    <div className="form-row">
      <label>{label}</label>
      <input className="input mono" name={name} type="number" min={0} step="0.01" defaultValue={val} onChange={(e) => set(e.target.value)} placeholder="0.00" />
    </div>
  );

  // Descripción del concepto → es lo que se muestra en la columna «Descripción» de la tabla.
  const campoDesc = (val: string, set: (v: string) => void, placeholder: string, name: string) => (
    <div className="form-row">
      <label>Descripción</label>
      <input className="input" name={name} defaultValue={val} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
    </div>
  );

  return (
    <Modal title="Agregar movimiento" size="md" onClose={onClose} footer={footer}>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
      <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
        Caja: <strong>{cajaActual ? `${cajaActual.numero}${cajaActual.nombre ? ` · ${cajaActual.nombre}` : ''}` : '—'}</strong>. Completá los campos que apliquen; cada concepto se registra como un movimiento.
      </p>

      <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>

      {/* Gastos (incluye nómina): monto + categoría buscable + descripción */}
      <div className="form-grid">
        {campoUsd('$ Gastos', gastos, setGastos, 'mov-gastos')}
        <div className="form-row">
          <label>Categoría del gasto</label>
          <SearchSelect
            value={gastoCat}
            onChange={setGastoCat}
            options={catsUnificadas.map((c) => ({ value: c.valor, label: c.grupo === 'nomina' ? `${c.valor} · (nómina)` : c.valor }))}
            placeholder="🔍 Buscar categoría (gasto o nómina)…"
            emptyText="Sin categorías"
          />
        </div>
      </div>
      {campoDesc(descGastos, setDescGastos, gastoCat || 'Descripción del gasto', 'mov-desc-gastos')}

      {/* Traslado: monto + descripción */}
      <div className="form-grid">
        {campoUsd('$ Traslado de Caja', traslado, setTraslado, 'mov-traslado')}
        {campoDesc(descTraslado, setDescTraslado, 'Traslado de caja', 'mov-desc-traslado')}
      </div>

      {/* Kg recibidos por MGG: cantidad + descripción */}
      <div className="form-grid">
        <div className="form-row">
          <label>Kg Recibidos por MGG</label>
          <input className="input mono" name="mov-kg" type="number" min={0} step="any" defaultValue={kgRecibidos} onChange={(e) => setKgRecibidos(e.target.value)} placeholder="0" />
          <small className="muted">Expresado en Kg.</small>
        </div>
        {campoDesc(descKg, setDescKg, 'Kg recibidos por MGG', 'mov-desc-kg')}
      </div>
    </Modal>
  );
}

/* ───────────── Resumen de Caja (réplica de la hoja «RESUMEN CAJA PERAMANAL GT») ───────────── */

function ResumenCajaModal({ defaultEmail, onClose }: { defaultEmail: string; onClose: () => void }) {
  const [r, setR] = useState<ResumenCajaAcopio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);
  const [correoOpen, setCorreoOpen] = useState(false);
  // Filtro por rango de fechas: el resumen se recalcula solo con los movimientos del rango.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const hayRango = !!(desde || hasta);
  // Drill-down: categoría de vehículo elegida → gráfica de gasto por equipo.
  const [consumoCat, setConsumoCat] = useState<string | null>(null);

  // Se recalcula desde los movimientos; en vivo cuando entra/cambia alguno (Realtime).
  const cargar = useCallback(() => {
    resumenCajaAcopio(undefined, { desde: desde || null, hasta: hasta || null })
      .then(setR).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen'));
  }, [desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);
  useRealtime(['acopio_caja_movimientos', 'acopio_contratos'], cargar);

  const pct = (v: number) => `${(v * 100).toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      <button className="btn btn-ghost" disabled={!r} onClick={() => setCorreoOpen(true)}>✉ Correo</button>
      <button className="btn btn-primary" disabled={!r || bajando}
        onClick={async () => {
          if (!r) return;
          setBajando(true);
          try { await descargarResumenCajaPdf(r); }
          catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
          finally { setBajando(false); }
        }}>{bajando ? 'Generando…' : '↓ PDF'}</button>
    </>
  );

  const Kpi = ({ titulo, valor, color, destacar }: { titulo: string; valor: string; color?: string; destacar?: boolean }) => (
    <div className="card" style={destacar ? { borderColor: 'var(--primary)', borderWidth: 2, background: 'linear-gradient(135deg, var(--surface-2), var(--surface))' } : undefined}>
      <div className="card-title"><span>{titulo}</span></div>
      <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{valor}</div>
    </div>
  );

  const TablaCat = ({ titulo, filas, totalLabel, totalMonto, totalPct, color, onCat }: {
    titulo: string; filas: { valor: string; monto: number; pct: number }[]; totalLabel: string; totalMonto: number; totalPct: number; color: string;
    onCat?: (valor: string) => void;
  }) => (
    <>
      <div className="card-title" style={{ marginTop: '1rem' }}><span style={{ color }}>{titulo}</span></div>
      {!filas.length ? <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Sin registros.</p> : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead><tr><th>Categoría</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ textAlign: 'right' }}>% del total gastado</th></tr></thead>
            <tbody>
              {filas.map((c) => {
                const clickable = !!onCat;
                const titulo = esCategoriaVehiculo(c.valor) ? 'Ver gasto por equipo' : 'Ver detalle del gasto';
                return (
                <tr key={c.valor}
                  onClick={clickable ? () => onCat!(c.valor) : undefined}
                  style={clickable ? { cursor: 'pointer' } : undefined}
                  title={clickable ? titulo : undefined}>
                  <td>{c.valor}{clickable && <span className="muted" style={{ marginLeft: '.4rem' }} title={titulo}>📊</span>}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(c.monto)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{pct(c.pct)}</td>
                </tr>
                );
              })}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700, borderTop: '2px solid var(--border, rgba(255,255,255,.15))' }}>
              <td>{totalLabel}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{money(totalMonto)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{pct(totalPct)}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </>
  );

  return (
    <Modal title="📊 Resumen de Caja · PERAMANAL GT" size="lg" onClose={onClose} footer={footer}>
      {error ? (
        <div className="card" style={{ borderColor: 'var(--danger)' }}><strong>Error:</strong> {error}</div>
      ) : !r ? (
        <p className="muted" style={{ margin: 0 }}>Cargando resumen…</p>
      ) : (
        <>
          {/* Filtro por rango de fechas: recalcula el resumen solo con los movimientos del rango. */}
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.6rem' }}>
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Desde <input className="input" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} />
            </label>
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Hasta <input className="input" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} />
            </label>
            {hayRango && <button className="btn btn-sm btn-ghost" onClick={() => { setDesde(''); setHasta(''); }}>✕ Limpiar rango</button>}
            {hayRango && <span className="badge" style={{ fontSize: '.72rem' }}>Mostrando solo el rango seleccionado</span>}
          </div>
          <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
            {hayRango
              ? <>Rango <strong>{desde || '—'}</strong> → <strong>{hasta || '—'}</strong> · {r.movimientos} movimiento(s) en el rango</>
              : <>Inicio <strong>{r.fechaInicio ?? '—'}</strong> · Última actualización <strong>{r.fechaActualizacion}</strong> · <strong>{r.dias}</strong> días transcurridos · {r.movimientos} movimiento(s)</>}
          </p>

          {/* KPIs principales */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem' }}>
            <Kpi titulo="Saldo actual de la caja" valor={money(r.saldoUsd)} color={r.saldoUsd < 0 ? 'var(--danger)' : undefined} destacar />
            <Kpi titulo="Total entregado" valor={money(r.totalEntregado)} color="var(--success)" />
            <Kpi titulo="Total gastado" valor={money(r.totalGastado)} color="var(--danger)" />
            <Kpi titulo="Tasa del material" valor={`${money(r.tasaMaterial)} /Kg`} color="var(--primary-3)" />
          </div>

          {/* % Gastos vs % Nómina */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title"><span>Distribución de lo gastado</span></div>
            <div style={{ display: 'flex', height: 16, borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)' }}>
              <div title={`Gastos ${pct(r.pctGastos)}`} style={{ width: `${r.pctGastos * 100}%`, background: '#ef4444' }} />
              <div title={`Nómina ${pct(r.pctNomina)}`} style={{ width: `${r.pctNomina * 100}%`, background: '#a855f7' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.4rem', fontSize: '.82rem' }}>
              <span><span style={{ color: '#ef4444' }}>■</span> Gastos GT <strong>{pct(r.pctGastos)}</strong> · {money(r.totalGastos)}</span>
              <span><span style={{ color: '#a855f7' }}>■</span> Nómina GT <strong>{pct(r.pctNomina)}</strong> · {money(r.totalNominas)}</span>
            </div>
          </div>

          {/* Kg de casiterita */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.75rem', marginTop: '1rem' }}>
            <Kpi titulo="Producción GT (entra)" valor={`${num(r.kgProduccion)} Kg`} color="var(--primary-3)" />
            <Kpi titulo="Enviados a MGG" valor={`${num(r.kgEnviados)} Kg`} />
            <Kpi titulo="Diferencia" valor={`${num(r.diferenciaKg)} Kg`} color={r.diferenciaKg < 0 ? 'var(--danger)' : 'var(--success)'} />
          </div>

          <TablaCat titulo="Gastos por categoría (incluye nómina)" filas={r.gastosPorCategoria} totalLabel="Total gastado" totalMonto={r.totalGastado} totalPct={1} color="#ef4444" onCat={setConsumoCat} />
          <p className="muted" style={{ fontSize: '.74rem', margin: '.35rem 0 0' }}>📊 Todas las categorías son clicables: muestran el detalle del gasto con gráfica (las de vehículo/maquinaria, por equipo; el resto, por descripción). La nómina aparece como una categoría más; los porcentajes suman 100%.</p>
        </>
      )}

      {correoOpen && r && (
        <CorreoReporteModal
          titulo={`Enviar Resumen de Caja · ${r.centro}`}
          descripcion={`Se enviará el PDF del resumen de caja al ${r.fechaActualizacion} (saldo ${money(r.saldoUsd)} · total gastado ${money(r.totalGastado)}).`}
          defaultEmail={defaultEmail}
          onEnviar={async (emails) => {
            const { destinatarios } = await enviarResumenCajaPorCorreo(r, emails);
            return destinatarios;
          }}
          onClose={() => setCorreoOpen(false)}
        />
      )}

      {consumoCat && (() => {
        const porEquipo = esCategoriaVehiculo(consumoCat);
        return (
          <ConsumoChartModal
            title={`${porEquipo ? 'Gasto por equipo' : 'Detalle del gasto'} · ${consumoCat}`}
            subtitle={porEquipo
              ? 'Gasto por equipo/vehículo de esta categoría. «Valor» = gasto en $; «Cantidad» = nº de movimientos. Respeta el rango del resumen.'
              : 'Detalle del gasto de esta categoría agrupado por descripción. «Valor» = gasto en $; «Cantidad» = nº de movimientos. Respeta el rango del resumen.'}
            cargar={async (d, h) => {
              const args = { categoria: consumoCat, desde: desde || d.toISOString().slice(0, 10), hasta: hasta || h.toISOString().slice(0, 10) };
              const items = porEquipo ? await consumoGastosPorEquipo(args) : await gastosDetalleCategoria(args);
              return items.map((x) => ({ id: x.id, label: x.nombre, unidad: 'mov', cantidad: x.cantidad, valor: x.valor }));
            }}
            onClose={() => setConsumoCat(null)}
          />
        );
      })()}
    </Modal>
  );
}

/* ───────────── Editor / detalle (réplica del formato Excel) ───────────── */

interface FilaLote {
  // Identidad estable de la fila: como los inputs son no-controlados (defaultValue),
  // el key debe ser estable para que React no reutilice el DOM al agregar/quitar lotes.
  _uid: number;
  nro_lote: string;
  cantidad_bolsas: string;
  peso_bolsa_kg: string;
  peso_neto_kg: string;
  precinto_inicio: string;
  peso_recepcionado_kg: string;
  precinto_final: string;
}

let _filaUid = 0;
const filaVacia = (n: number): FilaLote => ({
  _uid: ++_filaUid,
  nro_lote: String(n), cantidad_bolsas: '', peso_bolsa_kg: '', peso_neto_kg: '',
  precinto_inicio: '', peso_recepcionado_kg: '', precinto_final: '',
});

const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** Verf. = IF(precinto_inicio = precinto_final, "V", "F") del Excel. */
const verf = (f: FilaLote) => f.precinto_inicio.trim() === f.precinto_final.trim();

function RecepcionModal({ recepcion, productos, almacenes, canWrite, actor, actorName, onClose, onSaved }: {
  recepcion: RecepcionAcopio | null;
  productos: Producto[];
  almacenes: string[];
  canWrite: boolean;
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esNueva = !recepcion;
  const editable = canWrite && (esNueva || recepcion!.estado === 'abierta');

  const [fecha, setFecha] = useState(recepcion?.fecha ?? new Date().toISOString().slice(0, 10));
  const [centro, setCentro] = useState(recepcion?.centro_acopio ?? 'Peramanal');
  const [aliado, setAliado] = useState(recepcion?.aliado ?? '');
  const [productoId, setProductoId] = useState(recepcion?.producto_id ?? '');
  const [almacen, setAlmacen] = useState(recepcion?.almacen ?? almacenes[0] ?? '');
  const [entNombre, setEntNombre] = useState(recepcion?.entregado_nombre ?? '');
  const [entCi, setEntCi] = useState(recepcion?.entregado_ci ?? '');
  const [recNombre, setRecNombre] = useState(recepcion?.recibido_nombre ?? '');
  const [recCi, setRecCi] = useState(recepcion?.recibido_ci ?? '');
  const [obs, setObs] = useState(recepcion?.observaciones ?? '');
  const [filas, setFilas] = useState<FilaLote[]>(() => {
    const ls = recepcion?.lotes ?? [];
    if (!ls.length) return Array.from({ length: FILAS_DEFAULT }, (_, i) => filaVacia(i + 1));
    return ls.map((l) => ({
      _uid: ++_filaUid,
      nro_lote: l.nro_lote ?? '',
      cantidad_bolsas: l.cantidad_bolsas ? String(l.cantidad_bolsas) : '',
      peso_bolsa_kg: l.peso_bolsa_kg ? String(l.peso_bolsa_kg) : '',
      peso_neto_kg: l.peso_neto_kg ? String(l.peso_neto_kg) : '',
      precinto_inicio: l.precinto_inicio ?? '',
      peso_recepcionado_kg: l.peso_recepcionado_kg ? String(l.peso_recepcionado_kg) : '',
      precinto_final: l.precinto_final ?? '',
    }));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setFila(i: number, patch: Partial<FilaLote>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addFila() { setFilas((prev) => [...prev, filaVacia(prev.length + 1)]); }
  function delFila(i: number) { setFilas((prev) => prev.filter((_, idx) => idx !== i)); }

  const totales = useMemo(() => filas.reduce((a, f) => {
    const bruto = n(f.cantidad_bolsas) * n(f.peso_bolsa_kg);
    return {
      bolsas: a.bolsas + n(f.cantidad_bolsas), bruto: a.bruto + bruto,
      neto: a.neto + n(f.peso_neto_kg), recepcionado: a.recepcionado + n(f.peso_recepcionado_kg),
    };
  }, { bolsas: 0, bruto: 0, neto: 0, recepcionado: 0 }), [filas]);

  const cantidadStock = totales.recepcionado > 0 ? totales.recepcionado : totales.neto;
  const productoSel = productos.find((p) => p.id === productoId) ?? null;
  const unidad = productoSel?.unidad || 'Kg';

  function buildInput(): RecepcionInput {
    const lotes: LoteInput[] = filas.map((f) => ({
      nro_lote: f.nro_lote, cantidad_bolsas: n(f.cantidad_bolsas), peso_bolsa_kg: n(f.peso_bolsa_kg),
      peso_neto_kg: n(f.peso_neto_kg), precinto_inicio: f.precinto_inicio,
      peso_recepcionado_kg: n(f.peso_recepcionado_kg), precinto_final: f.precinto_final,
    }));
    return {
      fecha, centro_acopio: centro, aliado, producto_id: productoId || null, almacen,
      entregado_nombre: entNombre, entregado_ci: entCi, recibido_nombre: recNombre, recibido_ci: recCi,
      observaciones: obs, lotes,
    };
  }

  async function guardar() {
    setError(null);
    if (!fecha) { setError('Indicá la fecha.'); return; }
    setSaving(true);
    try {
      if (esNueva) {
        const r = await createRecepcion(buildInput(), actor, actorName);
        notify(`Recepción ${r.numero} creada (borrador)`, 'success', { link: '#/app/acopio' });
      } else {
        await updateRecepcion(recepcion!.id, buildInput());
        toast('Recepción actualizada', 'success');
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); setSaving(false); }
  }

  async function guardarYCerrar() {
    setError(null);
    if (!productoId) { setError('Elegí el producto (mineral) al que se suma el stock.'); return; }
    if (!almacen.trim()) { setError('Elegí el almacén destino del stock.'); return; }
    if (cantidadStock <= 0) { setError('El peso recibido debe ser mayor que 0.'); return; }
    setSaving(true);
    try {
      let id = recepcion?.id;
      if (esNueva) { id = (await createRecepcion(buildInput(), actor, actorName)).id; }
      else { await updateRecepcion(recepcion!.id, buildInput()); }
      const cerrada = await cerrarRecepcion(id!, actor, actorName);
      notify(`Recepción ${cerrada.numero} cerrada · +${num(cantidadStock)} ${unidad} a ${almacen}`, 'success', { link: '#/app/acopio' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cerrar.'); setSaving(false); }
  }

  async function anular() {
    if (!recepcion) return;
    if (!window.confirm(`¿Anular la recepción ${recepcion.numero}? Si estaba cerrada, se revierte el stock sumado.`)) return;
    setSaving(true);
    try {
      await anularRecepcion(recepcion.id, actor, actorName);
      notify(`Recepción ${recepcion.numero} anulada`, 'info', { link: '#/app/acopio' });
      onSaved();
    } catch (err) { toast(err instanceof Error ? err.message : 'No se pudo anular', 'error'); setSaving(false); }
  }

  async function eliminar() {
    if (!recepcion) return;
    if (!window.confirm(`¿Eliminar el borrador ${recepcion.numero}? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try { await deleteRecepcion(recepcion.id); toast('Borrador eliminado', 'success'); onSaved(); }
    catch (err) { toast(err instanceof Error ? err.message : 'No se pudo eliminar', 'error'); setSaving(false); }
  }

  async function pdf() {
    try {
      const r: RecepcionAcopio = recepcion ? { ...recepcion } : {
        ...buildInput(), id: 'preview', numero: '(borrador)', estado: 'abierta', created_at: new Date().toISOString(),
        lotes: filas.map((f, i) => ({
          id: String(i), recepcion_id: 'preview', orden: i, nro_lote: f.nro_lote,
          cantidad_bolsas: n(f.cantidad_bolsas), peso_bolsa_kg: n(f.peso_bolsa_kg),
          peso_bruto_total: n(f.cantidad_bolsas) * n(f.peso_bolsa_kg), peso_neto_kg: n(f.peso_neto_kg),
          dif_bruto_neto: n(f.cantidad_bolsas) * n(f.peso_bolsa_kg) - n(f.peso_neto_kg),
          precinto_inicio: f.precinto_inicio, peso_recepcionado_kg: n(f.peso_recepcionado_kg),
          dif_neto_recepcionado: n(f.peso_neto_kg) - n(f.peso_recepcionado_kg),
          precinto_final: f.precinto_final, verificado: verf(f),
        })),
      } as RecepcionAcopio;
      await descargarRecepcionPdf(r);
    } catch (err) { toast(err instanceof Error ? err.message : 'No se pudo generar el PDF', 'error'); }
  }

  const estado = recepcion?.estado ?? 'abierta';
  const titulo = esNueva ? 'Nueva recepción de mineral' : `Recepción ${recepcion!.numero} · ${ESTADO_LABEL[estado] ?? estado}`;
  const ro = !editable;
  // Estilos de "hoja" (réplica del Excel con el front del sistema).
  const thStyle: React.CSSProperties = { fontSize: '.68rem', lineHeight: 1.15, textAlign: 'center', verticalAlign: 'bottom', whiteSpace: 'pre-line', padding: '.35rem .3rem' };
  const calcCol: React.CSSProperties = { background: 'var(--surface-2)', textAlign: 'right', fontWeight: 600 };
  const cellNum = { width: 66 };

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>
      <button type="button" className="btn btn-ghost" onClick={pdf} disabled={saving}>↓ PDF</button>
      {!esNueva && estado === 'abierta' && canWrite && (<button type="button" className="btn btn-danger" onClick={eliminar} disabled={saving}>Eliminar</button>)}
      {estado === 'cerrada' && canWrite && (<button type="button" className="btn btn-danger" onClick={anular} disabled={saving}>Anular (revierte stock)</button>)}
      {editable && (
        <>
          <button type="button" className="btn btn-ghost" onClick={() => void guardar()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
          <button type="button" className="btn btn-primary" onClick={() => void guardarYCerrar()} disabled={saving}>{saving ? '…' : 'Cerrar y sumar stock'}</button>
        </>
      )}
    </>
  );

  return (
    <Modal title={titulo} size="xl" onClose={onClose} footer={footer}>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      {/* ── Hoja estilo Excel ── */}
      <div className="card" style={{ padding: '1rem' }}>
        <h3 style={{ textAlign: 'center', margin: '0 0 1rem', letterSpacing: '.02em', fontSize: '1rem' }}>
          CONTROL DE RECEPCIÓN DE MINERAL POR CENTRO DE ACOPIO
        </h3>

        {/* Encabezado: Fecha / Centro de Acopio / Aliado */}
        <div className="form-grid" style={{ gap: '.6rem 1rem' }}>
          <div className="form-row"><label>FECHA</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={ro} /></div>
          <div className="form-row"><label>CENTRO DE ACOPIO</label><input className="input" name="rec-centro" defaultValue={centro} onChange={(e) => setCentro(e.target.value)} disabled={ro} /></div>
          <div className="form-row"><label>ALIADO</label><input className="input" name="rec-aliado" defaultValue={aliado} onChange={(e) => setAliado(e.target.value)} placeholder="Nombre del aliado" disabled={ro} /></div>
        </div>

        {/* Vínculo de inventario (no está en el Excel; es lo que suma stock) */}
        <div className="form-grid" style={{ gap: '.6rem 1rem', marginTop: '.4rem', padding: '.5rem .6rem', border: '1px dashed var(--border-strong)', borderRadius: 8 }}>
          <div className="form-row">
            <label>📦 Producto (mineral) que suma stock al cerrar</label>
            <SearchSelect value={productoId} onChange={setProductoId} disabled={ro} placeholder="🔍 Buscar producto…"
              options={productos.map((p) => ({ value: p.id, label: `${p.nombre} ${p.sku ? `(${p.sku})` : ''}`.trim() }))} />
          </div>
          <div className="form-row">
            <label>Almacén destino del stock</label>
            <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} disabled={ro}>
              {!almacenes.length && <option value="">— sin almacenes —</option>}
              {almacenes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Tabla de lotes — títulos idénticos al Excel */}
        <div className="table-wrap" style={{ marginTop: '.8rem' }}>
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead>
              <tr>
                <th colSpan={7} style={{ textAlign: 'center', fontSize: '.72rem', background: 'var(--surface-3)' }}>DATOS DEL LOTE EN EL CENTRO DE ACOPIO</th>
                <th colSpan={4} style={{ textAlign: 'center', fontSize: '.72rem', background: 'var(--primary)', color: '#1c1f24' }}>RECEPCIÓN GOLDEN TOUCH 1127 C.A. · PUERTO ORDAZ</th>
              </tr>
              <tr>
                <th style={thStyle}>{'N° de Lote\nAsignado'}</th>
                <th style={thStyle}>{'Cantidad\nde Bolsas'}</th>
                <th style={thStyle}>{'Peso de Cada\nBolsa Kg'}</th>
                <th style={thStyle}>{'Peso Bruto\nTotal Kg 🧮'}</th>
                <th style={thStyle}>{'Peso Neto\n(Real Pesado Kg)'}</th>
                <th style={thStyle}>{'Diferencia Kg\n(Bruto − Neto) 🧮'}</th>
                <th style={thStyle}>{'Nro. precinto\n(inicio)'}</th>
                <th style={thStyle}>{'Peso Recepcionado\n(C.A. Pto. Ordaz)'}</th>
                <th style={thStyle}>{'Diferencia Kg\n(Neto − Recep.) 🧮'}</th>
                <th style={thStyle}>{'Nro. precinto\n(final)'}</th>
                <th style={thStyle}>{'Verf.\n🧮'}</th>
                {editable && <th style={{ width: 28 }}></th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const bruto = n(f.cantidad_bolsas) * n(f.peso_bolsa_kg);
                const dif1 = bruto - n(f.peso_neto_kg);
                const dif2 = n(f.peso_neto_kg) - n(f.peso_recepcionado_kg);
                const v = verf(f);
                const algo = f.cantidad_bolsas || f.peso_neto_kg || f.precinto_inicio || f.peso_recepcionado_kg;
                return (
                  <tr key={f._uid}>
                    <td><input className="input" name={`lote-${f._uid}-nro`} style={{ width: 52, textAlign: 'center' }} defaultValue={f.nro_lote} onChange={(e) => setFila(i, { nro_lote: e.target.value })} disabled={ro} /></td>
                    <td><input className="input mono" name={`lote-${f._uid}-bolsas`} style={cellNum} type="number" min={0} step="any" defaultValue={f.cantidad_bolsas} onChange={(e) => setFila(i, { cantidad_bolsas: e.target.value })} disabled={ro} /></td>
                    <td><input className="input mono" name={`lote-${f._uid}-pbolsa`} style={cellNum} type="number" min={0} step="any" defaultValue={f.peso_bolsa_kg} onChange={(e) => setFila(i, { peso_bolsa_kg: e.target.value })} disabled={ro} /></td>
                    <td className="mono" style={{ ...calcCol, color: 'var(--primary-3)' }}>{num(bruto)}</td>
                    <td><input className="input mono" name={`lote-${f._uid}-neto`} style={cellNum} type="number" min={0} step="any" defaultValue={f.peso_neto_kg} onChange={(e) => setFila(i, { peso_neto_kg: e.target.value })} disabled={ro} /></td>
                    <td className="mono" style={calcCol}>{num(dif1)}</td>
                    <td><input className="input" name={`lote-${f._uid}-pini`} style={{ width: 80 }} defaultValue={f.precinto_inicio} onChange={(e) => setFila(i, { precinto_inicio: e.target.value })} disabled={ro} /></td>
                    <td><input className="input mono" name={`lote-${f._uid}-recep`} style={cellNum} type="number" min={0} step="any" defaultValue={f.peso_recepcionado_kg} onChange={(e) => setFila(i, { peso_recepcionado_kg: e.target.value })} disabled={ro} /></td>
                    <td className="mono" style={calcCol}>{num(dif2)}</td>
                    <td><input className="input" name={`lote-${f._uid}-pfin`} style={{ width: 80 }} defaultValue={f.precinto_final} onChange={(e) => setFila(i, { precinto_final: e.target.value })} disabled={ro} /></td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: algo ? (v ? 'var(--success)' : 'var(--danger)') : 'var(--muted)' }}>{algo ? (v ? 'V' : 'F') : '—'}</td>
                    {editable && <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => delFila(i)} title="Quitar fila">✕</button></td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td style={{ textAlign: 'right' }}>TOTALES</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(totales.bolsas)}</td>
                <td></td>
                <td className="mono" style={{ ...calcCol, color: 'var(--primary-3)' }}>{num(totales.bruto)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(totales.neto)}</td>
                <td></td><td></td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(totales.recepcionado)}</td>
                <td></td><td></td><td></td>{editable && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
        {editable && <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }} onClick={addFila}>+ Agregar lote</button>}

        {/* Firmas */}
        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="card-title" style={{ justifyContent: 'center' }}><span>Conforme Entregado</span></div>
            <div className="form-row"><label>Nombres y Apellidos</label><input className="input" name="rec-ent-nombre" defaultValue={entNombre} onChange={(e) => setEntNombre(e.target.value)} disabled={ro} /></div>
            <div className="form-row"><label>N° C.I.</label><input className="input" name="rec-ent-ci" defaultValue={entCi} onChange={(e) => setEntCi(e.target.value)} disabled={ro} /></div>
          </div>
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="card-title" style={{ justifyContent: 'center' }}><span>Conforme Recibido por GOLDEN TOUCH 1127 C.A.</span></div>
            <div className="form-row"><label>Nombres y Apellidos</label><input className="input" name="rec-rec-nombre" defaultValue={recNombre} onChange={(e) => setRecNombre(e.target.value)} disabled={ro} /></div>
            <div className="form-row"><label>N° C.I.</label><input className="input" name="rec-rec-ci" defaultValue={recCi} onChange={(e) => setRecCi(e.target.value)} disabled={ro} /></div>
          </div>
        </div>
        <div className="form-row" style={{ marginTop: '.6rem' }}>
          <label>Observaciones</label>
          <textarea className="input" name="rec-obs" rows={2} defaultValue={obs} onChange={(e) => setObs(e.target.value)} disabled={ro} />
        </div>
      </div>

      {estado === 'cerrada' && (
        <div className="card" style={{ borderColor: 'var(--primary)', marginTop: '.75rem', fontSize: '.85rem' }}>
          ✔ Recepción cerrada · sumó <strong className="mono">{num(recepcion?.mov_cantidad ?? 0)}</strong> al inventario ({recepcion?.mov_almacen}).
        </div>
      )}
      {editable && (
        <p className="muted" style={{ fontSize: '.8rem', marginTop: '.6rem' }}>
          Al cerrar se sumarán <strong className="mono">{num(cantidadStock)} {unidad}</strong> al stock de <strong>{productoSel?.nombre ?? '(elegí producto)'}</strong> en <strong>{almacen || '(elegí almacén)'}</strong>
          {totales.recepcionado <= 0 && totales.neto > 0 && ' · se usa el peso neto porque no hay peso recepcionado.'}
        </p>
      )}
    </Modal>
  );
}
