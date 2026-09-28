/* ============================================================
   Golden Touch · RRHH · Anticipos y préstamos (pestaña)

   Arriba, las tarjetas: cuánto se debe en total y cuántos trabajadores
   deben; se tocan y abren el detalle. Después el alta (común o en modo
   HISTÓRICO, para los préstamos que ya existían antes del sistema), los
   filtros por todo lo que se puede filtrar, y la lista. Cada renglón abre el
   detalle del préstamo con sus abonos; el listado filtrado sale en PDF.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { toast } from '@/shared/ui/Toast';
import { money, date } from '@/shared/lib/format';
import { RANGOS_RAPIDOS, hoyVenezuela, rangoActivo, rangoRapido } from '@/shared/lib/rangosFecha';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { EmpresaRrhh, Personal, AnticipoPrestamo } from '@/shared/lib/types';
import { listPersonal } from './personal.repository';
import { listAnticipos, eliminarAnticipo, registrarAnticipo, listPagosDe } from './anticipos.repository';
import {
  ALTA_VACIA, ETIQUETA_TIPO, FILTROS_VACIOS, agruparPorTrabajador, buscarTrabajadores, errorAlta, filtrarAnticipos,
  filtrosActivos, nombreCompleto, pagadoDe, resumenAnticipos, trabajadoresConPendiente,
  type AltaAnticipo, type FiltrosAnticipos, type TrabajadorConPrestamos,
} from './anticiposResumen';
import { AnticipoDetalleModal } from './AnticipoDetalleModal';
import { descargarPrestamosPdf, nombreArchivo } from './prestamosPdf';

function Kpi({ label, value, sub, color, onClick }: {
  label: string; value: string; sub?: string; color?: string; onClick?: () => void;
}) {
  const clase = `lt-kpi${color ? ` ${color}` : ''}`;
  const cuerpo = (
    <>
      <span className="lt-kpi-label">{label}</span>
      <span className="lt-kpi-valor">{value}</span>
      {sub && <span className="lt-kpi-sub">{sub}</span>}
    </>
  );
  return onClick
    ? <button type="button" className={clase} onClick={onClick} title="Tocá para ver el detalle">{cuerpo}</button>
    : <div className={clase}>{cuerpo}</div>;
}

export function AnticiposTab({ empresa, canWrite, actor, actorName }: { empresa: EmpresaRrhh; canWrite: boolean; actor: string; actorName: string | null }) {
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [lista, setLista] = useState<AnticipoPrestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [alta, setAlta] = useState<AltaAnticipo>(ALTA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosAnticipos>(FILTROS_VACIOS);
  const [porBorrar, setPorBorrar] = useState<AnticipoPrestamo | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [modal, setModal] = useState<'pendientes' | 'trabajadores' | null>(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [masFiltros, setMasFiltros] = useState(false);
  const hoy = useMemo(hoyVenezuela, []);

  const recargar = useCallback(async () => {
    setLoading(true);
    const [ps, as] = await Promise.all([
      listPersonal(false, empresa).catch((e) => { toast(e instanceof Error ? e.message : 'No se pudo cargar el personal', 'error'); return [] as Personal[]; }),
      listAnticipos().catch(() => [] as AnticipoPrestamo[]),
    ]);
    setPersonal(ps); setLista(as);
    setLoading(false);
  }, [empresa]);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['anticipos_prestamos', 'anticipos_pagos', 'personal'], () => { void recargar(); });

  const personas = useMemo(() => new Map(personal.map((p) => [p.id, p])), [personal]);
  const departamentos = useMemo(() => [...new Set(personal.map((p) => p.departamento).filter((d): d is string => !!d))].sort(), [personal]);

  // La base de las tarjetas: todo lo filtrado MENOS el estado (lo pendiente es, por definición, activo).
  const baseKpi = useMemo(() => filtrarAnticipos(lista, { ...filtros, estado: 'todos' }, personas), [lista, filtros, personas]);
  const visibles = useMemo(() => filtrarAnticipos(lista, filtros, personas), [lista, filtros, personas]);
  const resumen = useMemo(() => resumenAnticipos(baseKpi), [baseKpi]);
  const resumenVisible = useMemo(() => resumenAnticipos(visibles), [visibles]);
  const pendientes = useMemo(() => baseKpi.filter((a) => (Number(a.saldo) || 0) > 0), [baseKpi]);
  const deudores = useMemo(() => trabajadoresConPendiente(baseKpi, personas), [baseKpi, personas]);
  const detalle = detalleId ? lista.find((a) => a.id === detalleId) ?? null : null;
  const nFiltros = filtrosActivos(filtros);

  const setF = <K extends keyof FiltrosAnticipos>(k: K, v: FiltrosAnticipos[K]) => setFiltros((f) => ({ ...f, [k]: v }));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const err = errorAlta(alta);
    if (err) { setError(err); return; }
    setError(null); setGuardando(true);
    try {
      await registrarAnticipo(alta, actor, actorName);
      toast(alta.historico ? 'Préstamo histórico cargado' : 'Registrado', 'success');
      setAlta({ ...ALTA_VACIA, historico: alta.historico, fecha: alta.historico ? alta.fecha : ALTA_VACIA.fecha });
      setAltaAbierta(false);
      await recargar();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  }

  async function borrar(a: AnticipoPrestamo) {
    setPorBorrar(null);
    try { await eliminarAnticipo(a.id); await recargar(); toast('Eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  function textoFiltros(): string {
    const partes: string[] = [];
    if (filtros.desde || filtros.hasta) partes.push(`Préstamos ${filtros.desde ? `desde ${date(filtros.desde)}` : ''} ${filtros.hasta ? `hasta ${date(filtros.hasta)}` : ''}`.replace(/\s+/g, ' ').trim());
    if (filtros.estado !== 'todos') partes.push(filtros.estado === 'activos' ? 'Solo activos' : 'Solo saldados');
    if (filtros.tipo !== 'todos') partes.push(`Solo ${ETIQUETA_TIPO[filtros.tipo].toLowerCase()}s`);
    if (filtros.origen !== 'todos') partes.push(filtros.origen === 'historico' ? 'Solo históricos' : 'Solo cargados en el sistema');
    if (filtros.departamento) partes.push(`Departamento ${filtros.departamento}`);
    if (filtros.personalId) partes.push(nombreCompleto(personas.get(filtros.personalId)));
    if (filtros.texto.trim()) partes.push(`Búsqueda «${filtros.texto.trim()}»`);
    if (filtros.montoMin || filtros.montoMax) partes.push(`Monto ${filtros.montoMin ? `≥ ${filtros.montoMin}` : ''} ${filtros.montoMax ? `≤ ${filtros.montoMax}` : ''}`.replace(/\s+/g, ' ').trim());
    return partes.join(' · ') || 'Sin filtros';
  }

  async function pdfLista(anticipos: AnticipoPrestamo[], titulo: string, detalleTxt: string, archivo: string) {
    setGenerandoPdf(true);
    try {
      const pagos = await listPagosDe(anticipos.map((a) => a.id));
      const grupos = agruparPorTrabajador(anticipos, personas).map((g) => ({
        persona: g.persona, anticipos: g.anticipos, pagos: pagos.filter((p) => g.anticipos.some((a) => a.id === p.anticipo_id)),
      }));
      await descargarPrestamosPdf({ titulo, empresa, detalle: detalleTxt, grupos, archivo: nombreArchivo(archivo) });
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
    finally { setGenerandoPdf(false); }
  }

  const abrirDetalle = (id: string) => setDetalleId(id);

  return (
    <div>
      {/* ── Tarjetas ── */}
      <div className="lt-kpis">
        <Kpi color="rojo" label="Total préstamos pendientes" value={money(resumen.totalPendiente)}
          sub={`${resumen.pendientes} préstamo(s) sin saldar · tocá para ver el detalle`}
          onClick={() => setModal('pendientes')} />
        <Kpi color="ambar" label="Trabajadores con préstamos pendientes" value={String(resumen.trabajadoresConPendiente)}
          sub="personas debiendo · tocá para ver el detalle" onClick={() => setModal('trabajadores')} />
        <Kpi color="naranja" label="Prestado / cobrado en lo filtrado" value={money(resumen.totalPrestado)}
          sub={`cobrado ${money(resumen.totalPagado)}`} />
      </div>

      {/* ── Filtros ── */}
      <div className="lt-filtros">
        <div className="lt-fila">
          <div className="lt-campo lt-ancho">
            <label htmlFor="ant-buscar">Buscar</label>
            <input id="ant-buscar" name="anticipos-buscar" className="input" value={filtros.texto}
              onChange={(e) => setF('texto', e.target.value)} placeholder="Nombre del trabajador o motivo…" />
          </div>
          <div className="lt-campo">
            <label htmlFor="ant-trab">Trabajador</label>
            <select id="ant-trab" className="select" value={filtros.personalId} onChange={(e) => setF('personalId', e.target.value)}>
              <option value="">— todos —</option>
              {personal.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}{p.ficha_nro ? ` · Ficha ${p.ficha_nro}` : ''}</option>)}
            </select>
          </div>
          <div className="lt-campo">
            <label htmlFor="ant-tipo">Tipo</label>
            <select id="ant-tipo" className="select" value={filtros.tipo} onChange={(e) => setF('tipo', e.target.value as FiltrosAnticipos['tipo'])}>
              <option value="todos">Todos</option>
              <option value="prestamo">Solo préstamos</option>
              <option value="anticipo">Solo anticipos</option>
            </select>
          </div>
          <div className="lt-campo">
            <label htmlFor="ant-estado">Estado</label>
            <select id="ant-estado" className="select" value={filtros.estado} onChange={(e) => setF('estado', e.target.value as FiltrosAnticipos['estado'])}>
              <option value="todos">Todos</option>
              <option value="activos">Con saldo</option>
              <option value="saldados">Saldados</option>
            </select>
          </div>
          <div className="lt-campo">
            <label htmlFor="ant-desde">Desde</label>
            <input id="ant-desde" name="anticipos-desde" className="input" type="date" value={filtros.desde} onChange={(e) => setF('desde', e.target.value)} />
          </div>
          <div className="lt-campo">
            <label htmlFor="ant-hasta">Hasta</label>
            <input id="ant-hasta" name="anticipos-hasta" className="input" type="date" value={filtros.hasta} onChange={(e) => setF('hasta', e.target.value)} />
          </div>
        </div>

        <div className="lt-pie">
          {RANGOS_RAPIDOS.map((x) => (
            <button key={x.valor} type="button" className={`lt-chip${rangoActivo(filtros.desde, filtros.hasta, hoy) === x.valor ? ' activo' : ''}`}
              onClick={() => { const r = rangoRapido(x.valor, hoy); setFiltros((v) => ({ ...v, desde: r.desde, hasta: r.hasta })); }}>
              {x.label}
            </button>
          ))}
          <button type="button" className={`lt-chip${masFiltros ? ' activo' : ''}`} onClick={() => setMasFiltros((m) => !m)}>▾ Más filtros</button>
          {nFiltros > 0 && <button type="button" className="lt-chip" onClick={() => setFiltros(FILTROS_VACIOS)}>✕ Limpiar ({nFiltros})</button>}
          <span className="lt-contador">{visibles.length} de {lista.length} · {resumen.pendientes} con saldo</span>
        </div>

        {masFiltros && (
          <div className="lt-mas lt-fila">
            <div className="lt-campo">
              <label htmlFor="ant-origen">Origen</label>
              <select id="ant-origen" className="select" value={filtros.origen} onChange={(e) => setF('origen', e.target.value as FiltrosAnticipos['origen'])}>
                <option value="todos">Todos</option>
                <option value="historico">Históricos (anteriores al sistema)</option>
                <option value="sistema">Cargados en el sistema</option>
              </select>
            </div>
            <div className="lt-campo">
              <label htmlFor="ant-depto">Departamento</label>
              <select id="ant-depto" className="select" value={filtros.departamento} onChange={(e) => setF('departamento', e.target.value)}>
                <option value="">Todos</option>
                {departamentos.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="lt-campo">
              <label htmlFor="ant-min">Monto mínimo (USD)</label>
              <input id="ant-min" name="anticipos-monto-min" className="input mono" type="number" min={0} step="any" value={filtros.montoMin}
                onChange={(e) => setF('montoMin', e.target.value)} placeholder="0,00" />
            </div>
            <div className="lt-campo">
              <label htmlFor="ant-max">Monto máximo (USD)</label>
              <input id="ant-max" name="anticipos-monto-max" className="input mono" type="number" min={0} step="any" value={filtros.montoMax}
                onChange={(e) => setF('montoMax', e.target.value)} placeholder="Sin tope" />
            </div>
          </div>
        )}
      </div>

      {/* ── Acciones ── */}
      <div className="lt-acciones">
        {canWrite && <button className="btn btn-primary" onClick={() => setAltaAbierta(true)}>+ Registrar préstamo o anticipo</button>}
        <button className="btn btn-ghost" disabled={generandoPdf || !visibles.length}
          title="PDF de lo que se ve en la lista: total prestado, pagado y deuda por trabajador, con sus abonos"
          onClick={() => void pdfLista(visibles, 'Préstamos y anticipos', textoFiltros(), `prestamos-${empresa}-${new Date().toISOString().slice(0, 10)}`)}>
          {generandoPdf ? 'Generando…' : '📄 Consolidado en PDF'}
        </button>
      </div>

      {/* ── Lista ── */}
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead>
            <tr>
              <th>Fecha</th><th>Trabajador</th><th>Tipo</th><th>Motivo</th>
              <th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Pagado</th><th style={{ textAlign: 'right' }}>Debe</th>
              <th style={{ textAlign: 'center' }}>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !visibles.length && <tr><td colSpan={9}><EmptyState message={nFiltros ? 'Nada coincide con los filtros' : 'Sin anticipos ni préstamos'} icon="💵" /></td></tr>}
            {!loading && visibles.map((a) => {
              const p = personas.get(a.personal_id);
              return (
                <tr key={a.id} style={{ opacity: a.estado === 'saldado' ? 0.65 : 1, cursor: 'pointer' }} onClick={() => abrirDetalle(a.id)} title="Ver detalle y abonos">
                  <td className="mono">{date(a.fecha)}</td>
                  <td>
                    {nombreCompleto(p)}
                    {p?.ficha_nro && <div className="muted" style={{ fontSize: '.74rem' }}>Ficha {p.ficha_nro}{p.cargo ? ` · ${p.cargo}` : ''}</div>}
                  </td>
                  <td>
                    <span className="badge">{ETIQUETA_TIPO[a.tipo]}</span>
                    {a.historico && <span className="badge" style={{ marginLeft: '.25rem' }} title="Cargado como histórico (anterior al sistema)">📜</span>}
                  </td>
                  <td className="muted">{a.motivo || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(a.monto_total)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--success)' }}>{money(pagadoDe(a))}</td>
                  <td className="mono" style={{ textAlign: 'right', color: Number(a.saldo) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{money(a.saldo)}</td>
                  <td style={{ textAlign: 'center' }}><span className="badge" style={{ color: a.estado === 'activo' ? 'var(--warning)' : 'var(--success)' }}>{a.estado === 'activo' ? 'Activo' : 'Saldado'}</span></td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" onClick={() => abrirDetalle(a.id)} title="Detalle y abonos">🔍</button>
                    {canWrite && <button className="btn btn-sm btn-ghost" onClick={() => setPorBorrar(a)} title="Eliminar" style={{ color: 'var(--danger)' }}>🗑</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && visibles.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>Totales ({visibles.length})</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(resumenVisible.totalPrestado)}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--success)' }}>{money(resumenVisible.totalPagado)}</td>
                <td className="mono" style={{ textAlign: 'right', color: resumenVisible.totalPendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>{money(resumenVisible.totalPendiente)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Alta (modal) ── */}
      {altaAbierta && canWrite && (
        <Modal title={alta.historico ? '📜 Cargar préstamo histórico' : '+ Registrar préstamo o anticipo'} size="md"
          onClose={() => { if (!guardando) { setAltaAbierta(false); setError(null); } }}
          footer={<>
            <button className="btn btn-ghost" onClick={() => { setAltaAbierta(false); setError(null); }} disabled={guardando}>Cancelar</button>
            <button type="submit" form="alta-anticipo" className="btn btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : alta.historico ? '📜 Cargar histórico' : '+ Registrar'}
            </button>
          </>}>
          <form id="alta-anticipo" onSubmit={guardar}>
            {error && <div className="aviso danger" style={{ marginBottom: '.6rem' }}><span className="aviso-icono">⛔</span><div><strong>Error:</strong> {error}</div></div>}
            <label style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.88rem', cursor: 'pointer', marginBottom: '.7rem' }}
              title="Para los préstamos que ya existían antes del sistema: se carga con lo que ya se había abonado">
              <input type="checkbox" checked={alta.historico} onChange={(e) => setAlta((a) => ({ ...a, historico: e.target.checked }))} />
              📜 Modo histórico (ya existía antes del sistema)
            </label>
            <div className="form-grid">
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="alta-trab">Trabajador *</label>
                <SearchSelect id="alta-trab" value={alta.personal_id} onChange={(v) => setAlta((a) => ({ ...a, personal_id: v }))} placeholder="🔍 Buscar trabajador…"
                  options={personal.filter((p) => p.activo || alta.historico).map((p) => ({ value: p.id, label: `${nombreCompleto(p)}${p.ficha_nro ? ` · Ficha ${p.ficha_nro}` : ''}${p.activo ? '' : ' · inactivo'}` }))} />
              </div>
              <div className="form-row">
                <label htmlFor="alta-tipo">Tipo</label>
                <select id="alta-tipo" className="select" value={alta.tipo} onChange={(e) => setAlta((a) => ({ ...a, tipo: e.target.value as AltaAnticipo['tipo'] }))}>
                  <option value="prestamo">Préstamo</option>
                  <option value="anticipo">Anticipo</option>
                </select>
              </div>
              <div className="form-row">
                <label htmlFor="alta-fecha">Fecha del préstamo *</label>
                <input id="alta-fecha" name="anticipo-fecha" className="input" type="date" value={alta.fecha}
                  onChange={(e) => setAlta((a) => ({ ...a, fecha: e.target.value }))} required />
                {alta.historico && <small className="muted">El día en que se dio, aunque sea de hace meses.</small>}
              </div>
              <div className="form-row">
                <label htmlFor="alta-monto">Monto total (USD) *</label>
                <input id="alta-monto" name="anticipo-monto-total" className="input mono" type="number" min={0} step="any" value={alta.monto_total ?? ''}
                  onChange={(e) => setAlta((a) => ({ ...a, monto_total: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="0,00" required />
              </div>
              <div className="form-row">
                <label htmlFor="alta-cuota">Cuota sugerida por quincena</label>
                <input id="alta-cuota" name="anticipo-cuota-sugerida" className="input mono" type="number" min={0} step="any" value={alta.cuota_sugerida ?? ''}
                  onChange={(e) => setAlta((a) => ({ ...a, cuota_sugerida: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="0,00" />
              </div>
              {alta.historico && (
                <>
                  <div className="form-row">
                    <label htmlFor="alta-abonado">Ya abonado hasta hoy (USD)</label>
                    <input id="alta-abonado" name="anticipo-abonado" className="input mono" type="number" min={0} step="any" value={alta.abonado ?? ''}
                      onChange={(e) => setAlta((a) => ({ ...a, abonado: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="0,00" />
                    <small className="muted">
                      {alta.monto_total != null && alta.monto_total > 0
                        ? `Queda debiendo ${money(Math.max(0, (alta.monto_total || 0) - (alta.abonado || 0)))}`
                        : 'Lo que ya pagó antes de cargarlo acá; queda como un abono «histórico».'}
                    </small>
                  </div>
                  <div className="form-row">
                    <label htmlFor="alta-fabono">Abonado hasta (fecha)</label>
                    <input id="alta-fabono" name="anticipo-fecha-abono" className="input" type="date" value={alta.fecha_abono}
                      onChange={(e) => setAlta((a) => ({ ...a, fecha_abono: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="alta-motivo">Motivo</label>
                <input id="alta-motivo" name="anticipo-motivo" className="input" value={alta.motivo}
                  onChange={(e) => setAlta((a) => ({ ...a, motivo: e.target.value }))} placeholder="Adelanto de quincena, préstamo personal…" />
              </div>
            </div>
            <p className="muted" style={{ fontSize: '.82rem', marginTop: '.6rem', marginBottom: 0 }}>
              El saldo se descuenta automáticamente al pagar la nómina, hasta saldar. Los pagos por fuera se registran como abono desde el detalle del préstamo.
            </p>
          </form>
        </Modal>
      )}

      {/* ── Modal: préstamos pendientes ── */}
      {modal === 'pendientes' && (
        <PendientesModal pendientes={pendientes} personas={personas} total={resumen.totalPendiente} filtrosTxt={textoFiltros()}
          onClose={() => setModal(null)} onDetalle={abrirDetalle}
          onPdf={() => void pdfLista(pendientes, 'Préstamos pendientes', textoFiltros(), `prestamos-pendientes-${empresa}`)} generando={generandoPdf} />
      )}

      {/* ── Modal: trabajadores con préstamos pendientes ── */}
      {modal === 'trabajadores' && (
        <TrabajadoresModal deudores={deudores} lista={baseKpi} personas={personas}
          onClose={() => setModal(null)} onDetalle={abrirDetalle}
          onPdf={(g) => void pdfLista(g.anticipos, 'Estado de cuenta · Préstamos y anticipos', `${nombreCompleto(g.persona)} · ${textoFiltros()}`, `prestamos-${nombreCompleto(g.persona)}`)}
          generando={generandoPdf} />
      )}

      {detalle && (
        <AnticipoDetalleModal anticipo={detalle} persona={personas.get(detalle.personal_id)} empresa={empresa}
          canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setDetalleId(null)} />
      )}

      {porBorrar && (
        <ConfirmDialog
          title={porBorrar.tipo === 'anticipo' ? 'Eliminar anticipo' : 'Eliminar préstamo'}
          danger
          confirmText="Sí, eliminar"
          message={Number(porBorrar.saldo) < Number(porBorrar.monto_total)
            ? <>Este registro <strong>ya tiene abonos</strong> (descuentos de nómina o pagos). Al eliminarlo se borran también sus abonos y lo que falta deja de restarse en los próximos pagos.</>
            : <>Se elimina el registro. Lo que falta por descontar deja de restarse en los próximos pagos de nómina.</>}
          preview={
            <VistaPrevia titulo="Se va a eliminar">
              <Dato label="Trabajador">{nombreCompleto(personas.get(porBorrar.personal_id))}</Dato>
              <Dato label="Tipo">{ETIQUETA_TIPO[porBorrar.tipo]}{porBorrar.historico ? ' · histórico' : ''}</Dato>
              <Dato label="Fecha"><span className="mono">{date(porBorrar.fecha)}</span></Dato>
              <Dato label="Motivo">{porBorrar.motivo || undefined}</Dato>
              <Dato label="Monto total"><span className="mono">{money(porBorrar.monto_total)}</span></Dato>
              <Dato label="Ya pagado"><span className="mono">{money(pagadoDe(porBorrar))}</span></Dato>
              <Dato label="Saldo pendiente"><strong className="mono">{money(porBorrar.saldo)}</strong></Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void borrar(porBorrar); }}
          onCancel={() => setPorBorrar(null)}
        />
      )}
    </div>
  );
}

/* ───────────── Modal: préstamos pendientes (detalle clickeable) ───────────── */
function PendientesModal({ pendientes, personas, total, filtrosTxt, onClose, onDetalle, onPdf, generando }: {
  pendientes: AnticipoPrestamo[]; personas: Map<string, Personal>; total: number; filtrosTxt: string;
  onClose: () => void; onDetalle: (id: string) => void; onPdf: () => void; generando: boolean;
}) {
  const [q, setQ] = useState('');
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return pendientes;
    return pendientes.filter((a) => {
      const p = personas.get(a.personal_id);
      return `${nombreCompleto(p)} ${p?.cedula ?? ''} ${p?.ficha_nro ?? ''} ${a.motivo ?? ''}`.toLowerCase().includes(t);
    });
  }, [pendientes, personas, q]);
  const orden = useMemo(() => [...filtrados].sort((a, b) => (Number(b.saldo) || 0) - (Number(a.saldo) || 0)), [filtrados]);

  return (
    <Modal title="💰 Préstamos pendientes" size="lg" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onPdf} disabled={generando || !pendientes.length}>{generando ? 'Generando…' : '↓ PDF'}</button>
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </>}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
        <div className="tira danger" style={{ flex: '1 1 160px' }}>
          <div className="tira-titulo">Total pendiente</div>
          <div className="tira-valor mono">{money(total)}</div>
        </div>
        <div className="tira" style={{ flex: '1 1 160px' }}>
          <div className="tira-titulo">Préstamos con saldo</div>
          <div className="tira-valor mono">{pendientes.length}</div>
        </div>
        <div className="tira" style={{ flex: '2 1 220px' }}>
          <div className="tira-titulo">Filtros aplicados</div>
          <div className="tira-valor" style={{ fontSize: '.85rem', fontWeight: 500 }}>{filtrosTxt}</div>
        </div>
      </div>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar por trabajador, cédula, ficha o motivo…" style={{ marginBottom: '.5rem' }} />
      {!orden.length && <EmptyState icon="✅" message={q ? 'Nada coincide con la búsqueda' : 'Nadie debe nada con estos filtros'} />}
      {!!orden.length && (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead><tr><th>Trabajador</th><th>Tipo</th><th>Fecha</th><th>Motivo</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Pagado</th><th style={{ textAlign: 'right' }}>Debe</th><th /></tr></thead>
            <tbody>
              {orden.map((a) => {
                const p = personas.get(a.personal_id);
                return (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => onDetalle(a.id)} title="Ver detalle y abonos">
                    <td>{nombreCompleto(p)}{p?.ficha_nro && <div className="muted" style={{ fontSize: '.74rem' }}>Ficha {p.ficha_nro}</div>}</td>
                    <td><span className="badge">{ETIQUETA_TIPO[a.tipo]}</span>{a.historico ? ' 📜' : ''}</td>
                    <td className="mono">{date(a.fecha)}</td>
                    <td className="muted">{a.motivo || '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(a.monto_total)}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--success)' }}>{money(pagadoDe(a))}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{money(a.saldo)}</td>
                    <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-ghost" title="Detalle">🔍</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ───────────── Modal: trabajadores con préstamos pendientes (lista buscable) ───────────── */
function TrabajadoresModal({ deudores, lista, personas, onClose, onDetalle, onPdf, generando }: {
  deudores: TrabajadorConPrestamos[]; lista: AnticipoPrestamo[]; personas: Map<string, Personal>;
  onClose: () => void; onDetalle: (id: string) => void; onPdf: (g: TrabajadorConPrestamos) => void; generando: boolean;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [verSaldados, setVerSaldados] = useState(false);
  const filtrados = useMemo(() => buscarTrabajadores(deudores, q), [deudores, q]);

  // La ficha completa del trabajador elegido: TODOS sus préstamos (con el
  // interruptor de saldados), no solo los que deben.
  const grupoSel = useMemo(() => {
    if (!sel) return null;
    const suyos = lista.filter((a) => a.personal_id === sel && (verSaldados || (Number(a.saldo) || 0) > 0));
    return agruparPorTrabajador(suyos, personas)[0] ?? (personas.get(sel) ? { persona: personas.get(sel)!, anticipos: [], totalPrestado: 0, totalPagado: 0, saldo: 0, pendientes: 0 } : null);
  }, [sel, lista, personas, verSaldados]);

  const totalDeuda = useMemo(() => deudores.reduce((s, g) => s + g.saldo, 0), [deudores]);

  if (grupoSel) {
    const p = grupoSel.persona;
    return (
      <Modal title={`👤 ${nombreCompleto(p)}`} size="lg" onClose={onClose}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setSel(null)}>← Volver a la lista</button>
          <button className="btn btn-ghost" onClick={() => onPdf(grupoSel)} disabled={generando || !grupoSel.anticipos.length}
            title="Estado de cuenta: total de préstamos, total pagado y lo que debe">{generando ? 'Generando…' : '↓ PDF estado de cuenta'}</button>
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </>}>
        <div className="muted" style={{ fontSize: '.85rem', marginBottom: '.6rem' }}>
          {[p.ficha_nro ? `Ficha ${p.ficha_nro}` : '', p.cedula ? `C.I. ${p.cedula}` : '', p.cargo, p.departamento, p.activo ? '' : 'Inactivo'].filter(Boolean).join(' · ')}
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
          <div className="tira" style={{ flex: '1 1 140px' }}><div className="tira-titulo">Total préstamos</div><div className="tira-valor mono">{money(grupoSel.totalPrestado)}</div></div>
          <div className="tira" style={{ flex: '1 1 140px' }}><div className="tira-titulo">Total pagado</div><div className="tira-valor mono" style={{ color: 'var(--success)' }}>{money(grupoSel.totalPagado)}</div></div>
          <div className={`tira${grupoSel.saldo > 0 ? ' danger' : ''}`} style={{ flex: '1 1 140px' }}><div className="tira-titulo">Lo que debe</div><div className="tira-valor mono">{money(grupoSel.saldo)}</div></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.4rem' }}>
          <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.85rem' }}>
            <input type="checkbox" checked={verSaldados} onChange={(e) => setVerSaldados(e.target.checked)} /> Mostrar saldados
          </label>
        </div>
        {!grupoSel.anticipos.length && <EmptyState icon="💵" message="Sin préstamos para mostrar" />}
        {!!grupoSel.anticipos.length && (
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.84rem' }}>
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Pagado</th><th style={{ textAlign: 'right' }}>Debe</th><th style={{ textAlign: 'center' }}>Estado</th><th /></tr></thead>
              <tbody>
                {grupoSel.anticipos.map((a) => (
                  <tr key={a.id} style={{ cursor: 'pointer', opacity: a.estado === 'saldado' ? 0.65 : 1 }} onClick={() => onDetalle(a.id)} title="Ver detalle y abonos">
                    <td className="mono">{date(a.fecha)}</td>
                    <td><span className="badge">{ETIQUETA_TIPO[a.tipo]}</span>{a.historico ? ' 📜' : ''}</td>
                    <td className="muted">{a.motivo || '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(a.monto_total)}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--success)' }}>{money(pagadoDe(a))}</td>
                    <td className="mono" style={{ textAlign: 'right', color: Number(a.saldo) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{money(a.saldo)}</td>
                    <td style={{ textAlign: 'center' }}><span className="badge" style={{ color: a.estado === 'activo' ? 'var(--warning)' : 'var(--success)' }}>{a.estado === 'activo' ? 'Activo' : 'Saldado'}</span></td>
                    <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-ghost" title="Detalle">🔍</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal title="👥 Trabajadores con préstamos pendientes" size="lg" onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
        <div className="tira" style={{ flex: '1 1 160px' }}><div className="tira-titulo">Trabajadores que deben</div><div className="tira-valor mono">{deudores.length}</div></div>
        <div className="tira danger" style={{ flex: '1 1 160px' }}><div className="tira-titulo">Deuda total</div><div className="tira-valor mono">{money(totalDeuda)}</div></div>
      </div>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar por nombre, cédula, ficha, cargo o departamento…" style={{ marginBottom: '.5rem' }} autoFocus />
      {!filtrados.length && <EmptyState icon="✅" message={q ? 'Nadie coincide con la búsqueda' : 'Nadie debe nada con estos filtros'} />}
      {!!filtrados.length && (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead><tr><th>Trabajador</th><th>Cargo</th><th style={{ textAlign: 'center' }}>Préstamos</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Pagado</th><th style={{ textAlign: 'right' }}>Debe</th><th /></tr></thead>
            <tbody>
              {filtrados.map((g) => (
                <tr key={g.persona.id} style={{ cursor: 'pointer' }} onClick={() => setSel(g.persona.id)} title="Ver sus préstamos">
                  <td>
                    {nombreCompleto(g.persona)}
                    <div className="muted" style={{ fontSize: '.74rem' }}>{[g.persona.ficha_nro ? `Ficha ${g.persona.ficha_nro}` : '', g.persona.cedula ? `C.I. ${g.persona.cedula}` : ''].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="muted">{g.persona.cargo || '—'}{g.persona.departamento ? <div style={{ fontSize: '.74rem' }}>{g.persona.departamento}</div> : null}</td>
                  <td style={{ textAlign: 'center' }}>{g.pendientes}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(g.totalPrestado)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--success)' }}>{money(g.totalPagado)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{money(g.saldo)}</td>
                  <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-ghost" title="Ver sus préstamos">→</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
