/* ============================================================
   Golden Touch · Asignaciones

   Qué se le dio a cada trabajador: dotación, líneas telefónicas, laptops,
   material de oficina, herramientas. Puede salir del inventario (descuenta
   stock) o ser algo de afuera. Lo que RETORNA queda pendiente hasta que se
   registre la devolución; la dotación y el material de oficina no retornan,
   pero igual quedan en el historial de la persona.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { money, date as fmtDate } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { RANGOS_RAPIDOS, hoyVenezuela, rangoActivo, rangoRapido } from '@/shared/lib/rangosFecha';
import { listPersonal } from '@/modules/rrhh/personal.repository';
import {
  CATEGORIA, CATEGORIAS, ESTADO_LABEL, FILTROS_VACIOS, detalleCorto, filtrarAsignaciones, filtrosActivos,
  nombreDe, normalizar, ordenarAsignaciones, resumenAsignaciones, valorTotal,
  type Asignacion, type FiltrosAsignacion, type PersonaMin,
} from './asignacionesReglas';
import { listAsignaciones, listProductosAsignables, type ProductoAsignable } from './asignaciones.repository';
import { AsignacionModal } from './AsignacionModal';
import { descargarAsignacionesPdf, nombreArchivoPdf } from './asignacionesPdf';

const PILL: Record<Asignacion['estado'], string> = { asignado: 'ambar', devuelto: 'verde', entregado: 'gris' };

export function AsignacionesPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('asignaciones', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;
  const hoy = useMemo(hoyVenezuela, []);

  const [lista, setLista] = useState<Asignacion[]>([]);
  const [personal, setPersonal] = useState<PersonaMin[]>([]);
  const [productos, setProductos] = useState<ProductoAsignable[]>([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState<FiltrosAsignacion>(FILTROS_VACIOS);
  const [masFiltros, setMasFiltros] = useState(false);
  const [modal, setModal] = useState<{ abierto: boolean; asignacion: Asignacion | null } | null>(null);
  const [historial, setHistorial] = useState<PersonaMin | null>(null);
  const [listaModal, setListaModal] = useState<'pendientes' | 'trabajadores' | null>(null);

  const recargar = useCallback(async () => {
    try {
      const [as, ps, pr] = await Promise.all([
        listAsignaciones(),
        listPersonal(false).catch(() => []),
        listProductosAsignables().catch(() => [] as ProductoAsignable[]),
      ]);
      setLista(as);
      setPersonal(ps as PersonaMin[]);
      setProductos(pr);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar las asignaciones', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['asignaciones', 'personal', 'productos'], () => { void recargar(); });

  const personas = useMemo(() => new Map(personal.map((p) => [p.id, p])), [personal]);
  const filtradas = useMemo(() => ordenarAsignaciones(filtrarAsignaciones(lista, f, personas)), [lista, f, personas]);
  const r = useMemo(() => resumenAsignaciones(filtradas, personas), [filtradas, personas]);
  const pendientesTodas = useMemo(() => lista.filter((a) => a.estado === 'asignado'), [lista]);
  const activo = rangoActivo(f.desde, f.hasta, hoy);
  const nActivos = filtrosActivos(f);

  const set = <K extends keyof FiltrosAsignacion>(k: K, v: FiltrosAsignacion[K]) => setF((x) => ({ ...x, [k]: v }));

  const detalleFiltros = () => {
    const p = [];
    if (f.desde || f.hasta) p.push(`Del ${f.desde ? fmtDate(f.desde) : 'inicio'} al ${f.hasta ? fmtDate(f.hasta) : hoy && fmtDate(hoy)}`);
    if (f.personalId) p.push(nombreDe(personas.get(f.personalId)));
    if (f.categoria) p.push(CATEGORIA[f.categoria].label);
    if (f.estado) p.push(f.estado === 'pendientes' ? 'Solo lo que está en su poder' : ESTADO_LABEL[f.estado as Asignacion['estado']]);
    if (f.empresa) p.push(`Nómina ${f.empresa}`);
    if (f.origen) p.push(f.origen === 'inventario' ? 'Salidas del inventario' : 'No del inventario');
    if (f.texto.trim()) p.push(`Búsqueda: «${f.texto.trim()}»`);
    return p.join('  ·  ') || 'Todas las asignaciones';
  };

  async function pdfListado() {
    try {
      await descargarAsignacionesPdf({
        titulo: 'Reporte de asignaciones', detalle: detalleFiltros(), lista: filtradas, personas,
        archivo: nombreArchivoPdf(`asignaciones-${f.desde || 'inicio'}-${f.hasta || hoy}`),
      });
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🎒 Asignaciones</h1>
          <p className="muted">Dotación, líneas telefónicas, equipos y materiales entregados al personal.</p>
        </div>
      </div>

      <div className="lt-kpis">
        <button type="button" className="lt-kpi ambar" onClick={() => setListaModal('pendientes')}>
          <span className="lt-kpi-label">En poder del personal</span>
          <span className="lt-kpi-valor">{r.pendientes}</span>
          <span className="lt-kpi-sub">{money(r.valorPendiente)} por recuperar · tocá para ver el detalle</span>
        </button>
        <button type="button" className="lt-kpi naranja" onClick={() => setListaModal('trabajadores')}>
          <span className="lt-kpi-label">Trabajadores con asignaciones</span>
          <span className="lt-kpi-valor">{r.trabajadoresConPendientes}</span>
          <span className="lt-kpi-sub">con algo pendiente · tocá para ver la lista</span>
        </button>
        <div className={`lt-kpi ${r.pendientesInactivos ? 'rojo' : 'verde'}`}>
          <span className="lt-kpi-label">Pendientes de personal inactivo</span>
          <span className="lt-kpi-valor">{r.pendientesInactivos}</span>
          <span className="lt-kpi-sub">{r.pendientesInactivos ? 'hay que recuperarlos' : 'nada pendiente de quien ya no está'}</span>
        </div>
        <div className="lt-kpi azul">
          <span className="lt-kpi-label">Asignado en lo filtrado</span>
          <span className="lt-kpi-valor">{money(r.valor)}</span>
          <span className="lt-kpi-sub">{r.total} asignación(es) · {r.devueltas} devuelta(s)</span>
        </div>
      </div>

      <div className="lt-filtros">
        <div className="lt-fila">
          <div className="lt-campo lt-ancho">
            <label htmlFor="asg-buscar">Buscar</label>
            <input id="asg-buscar" className="input" value={f.texto} onChange={(e) => set('texto', e.target.value)}
              placeholder="Trabajador, equipo, serial, línea…" />
          </div>
          <div className="lt-campo">
            <label htmlFor="asg-trab">Trabajador</label>
            <select id="asg-trab" className="select" value={f.personalId} onChange={(e) => set('personalId', e.target.value)}>
              <option value="">— todos —</option>
              {[...personal].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b))).map((p) => (
                <option key={p.id} value={p.id}>{nombreDe(p)}{p.activo === false ? ' (inactivo)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="lt-campo">
            <label htmlFor="asg-cat">Categoría</label>
            <select id="asg-cat" className="select" value={f.categoria} onChange={(e) => set('categoria', e.target.value as FiltrosAsignacion['categoria'])}>
              <option value="">Todas</option>
              {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
            </select>
          </div>
          <div className="lt-campo">
            <label htmlFor="asg-estado">Estado</label>
            <select id="asg-estado" className="select" value={f.estado} onChange={(e) => set('estado', e.target.value as FiltrosAsignacion['estado'])}>
              <option value="">Todos</option>
              <option value="pendientes">En su poder</option>
              <option value="devuelto">Devueltas</option>
              <option value="entregado">Entregadas (no retornan)</option>
            </select>
          </div>
          <div className="lt-campo">
            <label htmlFor="asg-desde">Desde</label>
            <input id="asg-desde" className="input" type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} />
          </div>
          <div className="lt-campo">
            <label htmlFor="asg-hasta">Hasta</label>
            <input id="asg-hasta" className="input" type="date" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} />
          </div>
        </div>

        <div className="lt-pie">
          {RANGOS_RAPIDOS.map((x) => (
            <button key={x.valor} type="button" className={`lt-chip${activo === x.valor ? ' activo' : ''}`}
              onClick={() => { const rr = rangoRapido(x.valor, hoy); setF((v) => ({ ...v, desde: rr.desde, hasta: rr.hasta })); }}>
              {x.label}
            </button>
          ))}
          <button type="button" className={`lt-chip${masFiltros ? ' activo' : ''}`} onClick={() => setMasFiltros((m) => !m)}>
            ▾ Más filtros
          </button>
          {nActivos > 0 && <button type="button" className="lt-chip" onClick={() => setF(FILTROS_VACIOS)}>✕ Limpiar ({nActivos})</button>}
          <span className="lt-contador">{filtradas.length} de {lista.length} · {r.pendientes} en su poder</span>
        </div>

        {masFiltros && (
          <div className="lt-mas lt-fila">
            <div className="lt-campo">
              <label htmlFor="asg-empresa">Nómina</label>
              <select id="asg-empresa" className="select" value={f.empresa} onChange={(e) => set('empresa', e.target.value as FiltrosAsignacion['empresa'])}>
                <option value="">Ambas</option><option value="GT">GT</option><option value="MTO">MTO</option>
              </select>
            </div>
            <div className="lt-campo">
              <label htmlFor="asg-origen">Origen</label>
              <select id="asg-origen" className="select" value={f.origen} onChange={(e) => set('origen', e.target.value as FiltrosAsignacion['origen'])}>
                <option value="">Todos</option><option value="inventario">Del inventario</option><option value="externo">De afuera</option>
              </select>
            </div>
            <div className="lt-campo">
              <label htmlFor="asg-retorna">¿Retorna?</label>
              <select id="asg-retorna" className="select" value={f.retorna} onChange={(e) => set('retorna', e.target.value as FiltrosAsignacion['retorna'])}>
                <option value="">Todas</option><option value="si">Sí retorna</option><option value="no">No retorna</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="lt-acciones">
        {canWrite && <button className="btn btn-primary" onClick={() => setModal({ abierto: true, asignacion: null })}>+ Nueva asignación</button>}
        <button className="btn btn-ghost" onClick={() => void pdfListado()} disabled={!filtradas.length}>📄 Reporte en PDF</button>
        {f.personalId && (
          <button className="btn btn-ghost" onClick={() => setHistorial(personas.get(f.personalId) ?? null)}>🧾 Historial del trabajador</button>
        )}
      </div>

      {loading ? <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>Cargando…</div>
        : !filtradas.length ? <div className="card"><EmptyState icon="🎒" message={lista.length ? 'Sin asignaciones con estos filtros' : 'Todavía no hay asignaciones cargadas'} /></div>
        : (
          <div className="card lt-tabla">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th><th>Fecha</th><th>Trabajador</th><th>Categoría</th><th>Qué se asignó</th>
                    <th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Valor</th><th>Origen</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((a) => {
                    const p = personas.get(a.personal_id);
                    const det = detalleCorto(a);
                    return (
                      <tr key={a.id} onClick={() => setModal({ abierto: true, asignacion: a })}
                        title="Ver, editar, devolver o eliminar">
                        <td className="mono">{a.codigo}</td>
                        <td>{fmtDate(a.fecha)}</td>
                        <td>
                          {nombreDe(p)}
                          {p?.cargo && <span className="lt-sub">{p.cargo}</span>}
                        </td>
                        <td>{CATEGORIA[a.categoria]?.icono} {CATEGORIA[a.categoria]?.label}</td>
                        <td>
                          {a.descripcion}
                          {det && <span className="lt-sub">{det}</span>}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>{a.cantidad}{a.unidad ? ` ${a.unidad}` : ''}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{money(valorTotal(a))}</td>
                        <td>{a.producto_id ? 'Inventario' : 'Externo'}</td>
                        <td>
                          <span className={`lt-pill ${PILL[a.estado]}`}>{ESTADO_LABEL[a.estado]}</span>
                          {a.estado === 'devuelto' && <span className="lt-sub">{fmtDate(a.fecha_devolucion)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {modal?.abierto && (
        <AsignacionModal asignacion={modal.asignacion} personal={personal} productos={productos} canWrite={canWrite}
          actor={actor} actorName={actorName} onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await recargar(); }} />
      )}

      {historial && (
        <HistorialModal persona={historial} lista={lista.filter((a) => a.personal_id === historial.id)} personas={personas}
          onAbrir={(a) => { setHistorial(null); setModal({ abierto: true, asignacion: a }); }} onClose={() => setHistorial(null)} />
      )}

      {listaModal && (
        <ListaModal tipo={listaModal} pendientes={pendientesTodas} personas={personas}
          onAbrir={(a) => { setListaModal(null); setModal({ abierto: true, asignacion: a }); }}
          onPersona={(p) => { setListaModal(null); setHistorial(p); }}
          onClose={() => setListaModal(null)} />
      )}
    </div>
  );
}

/* ───────── Historial de un trabajador (con rango de fechas y PDF) ───────── */
function HistorialModal({ persona, lista, personas, onAbrir, onClose }: {
  persona: PersonaMin; lista: Asignacion[]; personas: Map<string, PersonaMin>;
  onAbrir: (a: Asignacion) => void; onClose: () => void;
}) {
  const hoy = useMemo(hoyVenezuela, []);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const activo = rangoActivo(desde, hasta, hoy);
  const enRango = useMemo(
    () => ordenarAsignaciones(lista.filter((a) => (!desde || a.fecha >= desde) && (!hasta || a.fecha <= hasta))),
    [lista, desde, hasta],
  );
  const r = resumenAsignaciones(enRango, personas);

  async function pdf() {
    try {
      await descargarAsignacionesPdf({
        titulo: 'Historial de asignaciones',
        detalle: `${nombreDe(persona)}  ·  ${desde || hasta ? `Del ${desde ? fmtDate(desde) : 'inicio'} al ${hasta ? fmtDate(hasta) : fmtDate(hoy)}` : 'Todo el historial'}`,
        lista: enRango, personas, persona,
        archivo: nombreArchivoPdf(`historial-${nombreDe(persona)}-${desde || 'inicio'}-${hasta || hoy}`),
      });
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  }

  return (
    <Modal title={`🧾 Historial · ${nombreDe(persona)}`} size="lg" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={() => void pdf()} disabled={!enRango.length}>📄 PDF del historial</button>
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </>
    }>
      <div className="lt-fila" style={{ marginBottom: '.5rem' }}>
        <div className="lt-campo">
          <label htmlFor="hist-desde">Desde</label>
          <input id="hist-desde" className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="lt-campo">
          <label htmlFor="hist-hasta">Hasta</label>
          <input id="hist-hasta" className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>
      <div className="lt-pie" style={{ marginBottom: '.7rem' }}>
        {RANGOS_RAPIDOS.map((x) => (
          <button key={x.valor} type="button" className={`lt-chip${activo === x.valor ? ' activo' : ''}`}
            onClick={() => { const rr = rangoRapido(x.valor, hoy); setDesde(rr.desde); setHasta(rr.hasta); }}>{x.label}</button>
        ))}
        {(desde || hasta) && <button type="button" className="lt-chip" onClick={() => { setDesde(''); setHasta(''); }}>✕ Todo</button>}
        <span className="lt-contador">{enRango.length} asignación(es) · {r.pendientes} en su poder · {money(r.valor)}</span>
      </div>

      {!enRango.length ? <EmptyState icon="🎒" message="Sin asignaciones en ese rango." /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Código</th><th>Fecha</th><th>Qué</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Valor</th><th>Estado</th></tr></thead>
            <tbody>
              {enRango.map((a) => (
                <tr key={a.id} onClick={() => onAbrir(a)} style={{ cursor: 'pointer' }}>
                  <td className="mono">{a.codigo}</td>
                  <td>{fmtDate(a.fecha)}</td>
                  <td>
                    {CATEGORIA[a.categoria]?.icono} {a.descripcion}
                    {detalleCorto(a) && <span className="lt-sub">{detalleCorto(a)}</span>}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{a.cantidad}{a.unidad ? ` ${a.unidad}` : ''}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(valorTotal(a))}</td>
                  <td>
                    <span className={`lt-pill ${PILL[a.estado]}`}>{ESTADO_LABEL[a.estado]}</span>
                    {a.estado === 'devuelto' && <span className="lt-sub">{fmtDate(a.fecha_devolucion)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ───────── Listas de las tarjetas ───────── */
function ListaModal({ tipo, pendientes, personas, onAbrir, onPersona, onClose }: {
  tipo: 'pendientes' | 'trabajadores'; pendientes: Asignacion[]; personas: Map<string, PersonaMin>;
  onAbrir: (a: Asignacion) => void; onPersona: (p: PersonaMin) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const t = normalizar(q);

  const porPersona = useMemo(() => {
    const m = new Map<string, Asignacion[]>();
    for (const a of pendientes) m.set(a.personal_id, [...(m.get(a.personal_id) ?? []), a]);
    return [...m.entries()]
      .map(([id, items]) => ({ persona: personas.get(id), id, items, valor: items.reduce((s, x) => s + valorTotal(x), 0) }))
      .filter((x) => !t || normalizar(`${nombreDe(x.persona)} ${x.persona?.cargo ?? ''} ${x.persona?.cedula ?? ''}`).includes(t))
      .sort((a, b) => nombreDe(a.persona).localeCompare(nombreDe(b.persona)));
  }, [pendientes, personas, t]);

  const filas = useMemo(
    () => ordenarAsignaciones(pendientes.filter((a) => !t || normalizar(`${a.descripcion} ${a.codigo} ${nombreDe(personas.get(a.personal_id))}`).includes(t))),
    [pendientes, personas, t],
  );

  return (
    <Modal title={tipo === 'pendientes' ? `⏳ En poder del personal (${pendientes.length})` : `👥 Trabajadores con asignaciones (${porPersona.length})`}
      size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <input className="input" style={{ marginBottom: '.7rem' }} placeholder="🔍 Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      {tipo === 'trabajadores' ? (
        !porPersona.length ? <EmptyState icon="✅" message="Nadie tiene asignaciones pendientes." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Trabajador</th><th>Cargo</th><th style={{ textAlign: 'right' }}>Pendientes</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {porPersona.map((x) => (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => x.persona && onPersona(x.persona)} title="Ver historial">
                    <td>
                      {nombreDe(x.persona)}
                      {x.persona?.activo === false && <span className="lt-pill rojo" style={{ marginLeft: '.4rem' }}>Inactivo</span>}
                    </td>
                    <td>{x.persona?.cargo || '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{x.items.length}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(x.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        !filas.length ? <EmptyState icon="✅" message="No hay nada pendiente de devolver." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Código</th><th>Trabajador</th><th>Qué</th><th>Desde</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {filas.map((a) => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => onAbrir(a)}>
                    <td className="mono">{a.codigo}</td>
                    <td>{nombreDe(personas.get(a.personal_id))}</td>
                    <td>{CATEGORIA[a.categoria]?.icono} {a.descripcion}</td>
                    <td>{fmtDate(a.fecha)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(valorTotal(a))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Modal>
  );
}
