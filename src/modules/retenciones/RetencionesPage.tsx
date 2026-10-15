import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { notify } from '@/shared/lib/notify';
import { money, num, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { labelCondicionPago } from '@/modules/pedidos/ofertas.repository';
import {
  listRetencionesPendientes, listRetencionesHechas, finalizarRetencion,
  urlRetencion, comprobantesDeOrden, labelRetencionModo,
  TIPOS_RETENCION, type RetencionItem, type TipoRetencion,
} from './retenciones.repository';
import { LibroFiscalView, ConfiguracionFiscalModal } from '@/modules/libroFiscal/LibroFiscal';
import { aplicarFiltros, conteoOpcion, paginar, type FiltroLista } from '@/modules/libroFiscal/listas';
import { BarraLista, Paginador, type ControlFiltro } from '@/modules/libroFiscal/ListaControles';
import '@/modules/libroFiscal/libroFiscal.css';
import '@/modules/libroFiscal/libroFiscalV8.css';
import { norm } from '@/shared/lib/texto';

type Vista = 'pendientes' | 'hechas' | 'libro' | 'agrupada' | 'periodos' | 'reportes';

export function RetencionesPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('retenciones', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [vista, setVista] = useState<Vista>('agrupada');
  const [parametros, setParametros] = useState(false);
  const [pendientes, setPendientes] = useState<RetencionItem[]>([]);
  const [hechas, setHechas] = useState<RetencionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<RetencionItem | null>(null);

  // Búsqueda, filtros, orden y página de las dos listas de OC (Por realizar y Realizadas).
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fTipo, setFTipo] = useState<'' | TipoRetencion>('');
  const [fTesoreria, setFTesoreria] = useState('');
  const [fTexto, setFTexto] = useState('');
  const [orden, setOrden] = useState<'reciente' | 'antiguo' | 'proveedor'>('reciente');
  const [pag, setPag] = useState(1);
  const [tam, setTam] = useState(25);
  const limpiarFiltros = () => { setFDesde(''); setFHasta(''); setFTipo(''); setFTesoreria(''); setFTexto(''); };
  useEffect(() => { setPag(1); }, [vista, fDesde, fHasta, fTipo, fTesoreria, fTexto, orden]);

  const reload = useCallback(async () => {
    const [p, h] = await Promise.all([
      listRetencionesPendientes().catch(() => [] as RetencionItem[]),
      listRetencionesHechas().catch(() => [] as RetencionItem[]),
    ]);
    setPendientes(p); setHechas(h);
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reload().catch(() => { /* RLS/red */ }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);

  // Realtime multiusuario: lo que registra otro (o paga Tesorería) se refleja al instante.
  useRealtime(['ordenes'], () => { void reload(); });

  // La lista de la vista: búsqueda y fechas (las de siempre), filtros con su conteo y orden.
  const baseLista = useMemo(() => {
    const txt = norm(fTexto);
    const xs = vista === 'pendientes' ? pendientes : hechas;
    return xs.filter(({ orden: o, proveedorNombre }) => {
      if (vista === 'hechas') {
        const fin = (o.retencion_finalizada_en ?? '').slice(0, 10);
        if (fDesde && fin && fin < fDesde) return false;
        if (fHasta && fin && fin > fHasta) return false;
        if (fDesde && !fin) return false;
      }
      if (txt) {
        const hay = norm(`${o.oc_codigo ?? ''} ${o.codigo} ${proveedorNombre} ${o.numero_administracion ?? ''}`);
        if (!hay.includes(txt)) return false;
      }
      return true;
    });
  }, [vista, pendientes, hechas, fDesde, fHasta, fTexto]);

  const filtrosLista = useMemo<FiltroLista<RetencionItem>[]>(() => [
    {
      campo: 'tesoreria', etiqueta: 'Tesorería', valor: fTesoreria,
      opciones: [['pagada', 'Pagada'], ['por_pagar', 'Por pagar']],
      pasa: ({ orden: o }, v) => (v === 'pagada' ? !!o.retencion_pagada : !o.retencion_pagada),
    },
    ...(vista === 'hechas' ? [{
      campo: 'tipo', etiqueta: 'Tipo de retención', valor: fTipo,
      opciones: TIPOS_RETENCION.map((t): [string, string] => [t.key, t.label]),
      pasa: ({ orden: o }: RetencionItem, v: string) => comprobantesDeOrden(o).some((c) => c.tipo === v),
    }] : []),
  ], [vista, fTesoreria, fTipo]);

  const filas = useMemo(() => {
    const fecha = ({ orden: o }: RetencionItem) => String((vista === 'hechas' ? o.retencion_finalizada_en : o.metodo_pago_en) ?? '');
    const xs = aplicarFiltros(baseLista, filtrosLista);
    const reciente = (a: RetencionItem, b: RetencionItem) => fecha(b).localeCompare(fecha(a));
    xs.sort(orden === 'antiguo' ? (a, b) => -reciente(a, b)
      : orden === 'proveedor' ? (a, b) => a.proveedorNombre.localeCompare(b.proveedorNombre) || reciente(a, b)
        : reciente);
    return xs;
  }, [vista, baseLista, filtrosLista, orden]);
  const pagina = useMemo(() => paginar(filas, pag, tam), [filas, pag, tam]);

  const controles: ControlFiltro[] = filtrosLista.map((f) => ({
    campo: f.campo, etiqueta: f.etiqueta, valor: f.valor,
    total: aplicarFiltros(baseLista, filtrosLista.filter((o) => o.campo !== f.campo)).length,
    opciones: f.opciones.map(([v, t]) => ({ valor: v, texto: t, cuenta: conteoOpcion(baseLista, filtrosLista, f.campo, v) })),
  }));
  const ponerFiltro = (campo: string, v: string) => {
    if (campo === 'tesoreria') setFTesoreria(v);
    else if (campo === 'tipo') setFTipo(v as '' | TipoRetencion);
  };

  return (
    <div>
      {/* ── Cabecera v8 ── */}
      <header style={{ marginBottom: '.75rem' }}>
        <p className="muted" style={{ margin: '0 0 .5rem' }}>
          Retenciones por factura: aplicables, registradas y no aplicables.
        </p>
        <div className="lfv8-cabeza-acciones">
          <button className="btn btn-ghost" onClick={() => setParametros(true)}>⚙ Parámetros</button>
          <nav className="view-toggle" role="tablist" aria-label="Pantallas del módulo" style={{ margin: 0 }}>
            <button className={vista === 'pendientes' ? 'active' : ''} onClick={() => setVista('pendientes')}>
              Por realizar{pendientes.length ? ` (${pendientes.length})` : ''}
            </button>
            <button className={vista === 'hechas' ? 'active' : ''} onClick={() => setVista('hechas')}>Realizadas</button>
            <button className={vista === 'libro' ? 'active' : ''} onClick={() => setVista('libro')}>📒 Libro fiscal</button>
            <button className={vista === 'agrupada' ? 'active' : ''} onClick={() => setVista('agrupada')}>Vista agrupada</button>
            <button className={vista === 'periodos' ? 'active' : ''} onClick={() => setVista('periodos')}>Períodos</button>
            <button className={vista === 'reportes' ? 'active' : ''} onClick={() => setVista('reportes')}>Reportes</button>
          </nav>
        </div>
      </header>

      {/* ── Período en curso (sobre la vista agrupada y libro fiscal) ── */}
      {(vista === 'agrupada' || vista === 'libro') && (
        <div className="lfv8-per-curso">
          <span className="lfv8-per-curso-label">Período en curso</span>
          <span className="lfv8-per-chip"><b>IVA</b> <span className="muted">Sin período configurado</span></span>
          <span className="lfv8-per-chip"><b>ISLR</b> <span className="muted">Sin período configurado</span></span>
          <span className="lfv8-per-chip"><b>ISAE</b> <span className="muted">Sin período configurado</span></span>
        </div>
      )}

      {/* ── Vista agrupada (v8): tarjetas, casillas, tira ── */}
      {vista === 'agrupada' && (
        <LibroFiscalView canWrite={canWrite} actor={actor} actorName={actorName} />
      )}

      {/* ── Libro fiscal: una fila por retención ── */}
      {vista === 'libro' && (
        <div className="lfv8-vacio">
          <p>Una fila por retención registrada. Para agrupar por factura o proveedor, usar la Vista agrupada.</p>
          <button className="btn" onClick={() => setVista('agrupada')}>Ir a Vista agrupada</button>
        </div>
      )}

      {/* ── Períodos fiscales ── */}
      {vista === 'periodos' && (
        <div className="lfv8-vacio">
          <p>Períodos fiscales por impuesto: apertura, cierre, declaración y vencimientos.</p>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: '.3rem' }}>Disponible próximamente. La configuración de períodos se gestiona desde Parámetros.</p>
        </div>
      )}

      {/* ── Reportes ── */}
      {vista === 'reportes' && (
        <div className="lfv8-vacio">
          <p>Libro de retenciones, relaciones por proveedor, resumen por período y exportación.</p>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: '.3rem' }}>Disponible próximamente. Los PDF del libro y la relación se generan desde la Vista agrupada.</p>
        </div>
      )}

      {/* ── Listas de OC: Por realizar / Realizadas ── */}
      {(vista === 'pendientes' || vista === 'hechas') && (
      <>
      {/* Tarjeta total pendientes (solo en la vista Por realizar) */}
      {vista === 'pendientes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div className="card" style={{ margin: 0 }}>
            <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>Total de retenciones pendientes</div>
            <div className="mono" style={{ fontSize: '1.9rem', fontWeight: 800, color: pendientes.length ? 'var(--warning)' : 'var(--success)' }}>{pendientes.length}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '.75rem' }}>
        <BarraLista
          q={fTexto} onQ={setFTexto} placeholder="Buscar por N° de OC, OP o proveedor"
          resultados={filas.length} unidad="OC"
          filtros={controles} onFiltro={ponerFiltro}
          orden={{ valor: orden, opciones: [['reciente', 'Más reciente primero'], ['antiguo', 'Más antiguo primero'], ['proveedor', 'Proveedor (A–Z)']] }}
          onOrden={(v) => setOrden(v as typeof orden)}
          onQuitar={limpiarFiltros}
          extra={vista === 'hechas' ? (
            <>
              <label className="lf-campo"><span>Realizada desde</span><input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} /></label>
              <label className="lf-campo"><span>Hasta</span><input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} /></label>
            </>
          ) : undefined}
        />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.86rem' }}>
            <thead>
              <tr>
                <th>N°OC</th><th>OP</th><th>Proveedor</th><th>Condición</th><th>Retención</th>
                <th style={{ textAlign: 'right' }}>Total $</th><th>Tesorería</th>
                {vista === 'hechas' && <th>Realizada</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={vista === 'hechas' ? 9 : 8} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
              {!loading && !filas.length && (
                <tr><td colSpan={vista === 'hechas' ? 9 : 8}><EmptyState icon={vista === 'pendientes' ? '✅' : '🧾'} message={vista === 'pendientes' ? 'No hay retenciones pendientes' : 'Sin retenciones en el historial con esos filtros'} /></td></tr>
              )}
              {!loading && pagina.filas.map(({ orden: o, proveedorNombre }) => (
                <tr key={o.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => setSel({ orden: o, proveedorNombre })}>
                  <td className="mono">{o.oc_codigo ?? '—'}</td>
                  <td className="mono">{o.codigo}</td>
                  <td>{proveedorNombre}{o.numero_administracion ? <div className="muted mono" style={{ fontSize: '.74rem' }}>📞 Adm. {o.numero_administracion}</div> : null}</td>
                  <td>{labelCondicionPago(o.condiciones_pago)}</td>
                  <td>{labelRetencionModo(o.retencion_modo)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(o.total)}</td>
                  <td>{o.retencion_pagada ? <span className="badge" style={{ color: 'var(--success)' }}>✓ Pagada</span> : <span className="muted">Por pagar</span>}</td>
                  {vista === 'hechas' && <td className="muted">{o.retencion_finalizada_en ? dateTime(o.retencion_finalizada_en) : '—'}</td>}
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-primary" onClick={() => setSel({ orden: o, proveedorNombre })}>Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && (
          <Paginador pagina={pagina} tam={tam} unidad="OC" onPagina={setPag} onTam={(t) => { setTam(t); setPag(1); }} />
        )}
      </div>
      </>
      )}

      {sel && (
        <RetencionModal
          item={sel} canWrite={canWrite} actor={actor} actorName={actorName}
          onClose={() => setSel(null)}
          onSaved={async () => { setSel(null); await reload(); }}
        />
      )}
      {parametros && (
        <ConfiguracionFiscalModal puedeEditar={canWrite} onClose={() => setParametros(false)} />
      )}
    </div>
  );
}

function RetencionModal({ item, canWrite, actor, actorName, onClose, onSaved }: {
  item: RetencionItem; canWrite: boolean; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const o = item.orden;
  const yaFinalizada = !!o.retencion_finalizada;
  const comprobantes = useMemo(() => comprobantesDeOrden(o), [o]);
  const [archivos, setArchivos] = useState<Partial<Record<TipoRetencion, File>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const algunArchivo = (Object.values(archivos) as (File | undefined)[]).some(Boolean);

  function setArchivo(tipo: TipoRetencion, file: File | null) {
    setArchivos((m) => ({ ...m, [tipo]: file ?? undefined }));
  }

  async function descargar(path: string) {
    try { previewArchivo(await urlRetencion(path), path.split('/').pop() || 'comprobante'); }
    catch { toast('No se pudo abrir el comprobante', 'error'); }
  }

  async function handleFinalizar(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!algunArchivo) { setError('Carga al menos un comprobante (IVA, ISLR o Municipal).'); return; }
    setSaving(true);
    try {
      void actorName;
      await finalizarRetencion({ orden: o, archivos, actor });
      notify(`Retención registrada · OC ${o.oc_codigo ?? o.codigo}`, 'success', { link: '#/app/retenciones' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo finalizar la retención.'); setSaving(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>
      {!yaFinalizada && canWrite && (
        <button type="submit" form="ret-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Finalizar retención'}</button>
      )}
    </>
  );

  return (
    <Modal title={`Retención · OC ${o.oc_codigo ?? o.codigo}`} size="lg" onClose={onClose} footer={footer}>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      {/* Detalle de la OC */}
      <div className="card" style={{ margin: '0 0 .75rem' }}>
        <div className="card-title" style={{ marginBottom: '.4rem' }}>Detalle de la orden de compra</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.4rem .9rem', fontSize: '.86rem' }}>
          <div><span className="muted">Proveedor:</span> <strong>{item.proveedorNombre}</strong></div>
          <div><span className="muted">Tlf. de administración del proveedor:</span> <strong className="mono">{o.numero_administracion || '—'}</strong></div>
          <div><span className="muted">Condición:</span> {labelCondicionPago(o.condiciones_pago)}</div>
          <div><span className="muted">Retención:</span> {labelRetencionModo(o.retencion_modo)}</div>
          <div><span className="muted">Total:</span> <strong className="mono">{money(o.total)}</strong></div>
          <div><span className="muted">Tesorería:</span> {o.retencion_pagada ? <strong style={{ color: 'var(--success)' }}>✓ Pagada{o.retencion_pagada_en ? ` · ${dateTime(o.retencion_pagada_en)}` : ''}</strong> : 'Por pagar'}</div>
        </div>

        {/* Factura del proveedor cargada al finalizar la OC */}
        <div style={{ marginTop: '.55rem', display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: '.86rem' }}>Factura del proveedor:</span>
          {o.factura_recepcion_path
            ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => descargar(o.factura_recepcion_path!)}>🧾 Ver factura{o.factura_recepcion_nombre ? ` · ${o.factura_recepcion_nombre}` : ''}</button>
            : <span className="muted" style={{ fontSize: '.84rem' }}>— sin factura cargada —</span>}
        </div>

        <div className="table-wrap" style={{ marginTop: '.5rem' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Material</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th></tr></thead>
            <tbody>
              {(o.items ?? []).map((it, i) => (
                <tr key={i}><td>{it.nombre}{it.sku ? <span className="muted"> · {it.sku}</span> : null}</td><td className="mono" style={{ textAlign: 'right' }}>{num(it.cantidad)}</td><td className="mono" style={{ textAlign: 'right' }}>{money(it.precio)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comprobantes ya cargados (descarga) */}
      {comprobantes.length > 0 && (
        <div className="card" style={{ margin: '0 0 .75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Comprobantes cargados</div>
          <div style={{ display: 'grid', gap: '.35rem' }}>
            {comprobantes.map((c) => (
              <div key={c.tipo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', fontSize: '.85rem' }}>
                <span><span className="badge">{c.label}</span> <span className="muted">{c.nombre}</span></span>
                <button className="btn btn-sm btn-ghost" onClick={() => descargar(c.path)}>📎 Descargar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Carga de los 3 comprobantes (al menos uno) */}
      {!yaFinalizada && canWrite && (
        <form id="ret-form" onSubmit={handleFinalizar}>
          <div className="muted" style={{ fontSize: '.8rem', marginBottom: '.5rem' }}>
            Carga <strong>al menos uno</strong> de los comprobantes (PDF o imagen). Al finalizar, la retención queda registrada y se refleja en Tesorería.
          </div>
          {TIPOS_RETENCION.map((t) => (
            <div key={t.key} className="form-row">
              <label>{t.label}</label>
              <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(t.key, e.target.files?.[0] ?? null)} />
              {archivos[t.key] && <small className="muted">{archivos[t.key]?.name}</small>}
            </div>
          ))}
        </form>
      )}
      {yaFinalizada && (
        <div className="muted" style={{ fontSize: '.84rem' }}>✓ Retención finalizada{o.retencion_finalizada_en ? ` el ${dateTime(o.retencion_finalizada_en)}` : ''}.</div>
      )}
    </Modal>
  );
}
