/* ============================================================
   Golden Touch · Libro fiscal · La pantalla

   El libro contesta una sola pregunta: ¿cuánto impuesto está adelantado y
   cuánto se debe? Y para eso hay que separar las dos direcciones, porque el
   mismo monto significa cosas opuestas:

   · NOS LA PRACTICARON → anticipo a favor. Se descuenta en la declaración.
   · LA PRACTICAMOS     → dinero ajeno que hay que enterar al fisco.
   · IGTF               → ni una ni otra: se paga y no se recupera. Es costo.

   Los totales van en BOLÍVARES, que es como se declara; el detalle por moneda
   queda debajo de cada número.

   Tres piezas:
   · LibroFiscalView          — el libro con sus cuatro números y sus filtros.
   · RegistrarRetencionModal  — carga una retención, en cualquiera de las dos
                                direcciones (calculando, o copiando el
                                comprobante que entregó el cliente).
   · ConfiguracionFiscalModal — los parámetros del agente y el catálogo.

   La cuenta no se hace aquí: viene de `retencionesCalculo.ts`.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';
import {
  CONFIG_RETENCION_DEFECTO, DIRECCIONES, ESTADOS_RETENCION, SUJETOS, TIPOS_IMPUESTO,
  calcularIgtf, calcularRetencionIslr, calcularRetencionIva, calcularRetencionLocal, enBolivares,
  labelDireccion, labelEstadoRetencion, labelImpuesto, labelPeriodo, labelSujeto, limiteEntregaComprobante,
  motivoNoPuedePracticar, periodoDe, puedePracticar, quincenaDe, resumenLibro, significadoRetencion, totalesPorMoneda,
  type CalculoRetencion, type ConceptoRetencion, type ConfigRetencion, type DireccionRetencion,
  type EstadoRetencion, type MotivosIvaCien, type SujetoRetenido, type TipoImpuesto,
} from './retencionesCalculo';
import {
  activarConcepto, adjuntarComprobante, anularRetencion, getAlicuotasLocales, getConfigRetencion, guardarConcepto,
  guardarConfigRetencion, listConceptos, listRetenciones, marcarDeclarada, registrarRetencion, urlComprobante,
  PORCENTAJES_IVA,
  type AlicuotasLocales, type DocKind, type RetencionPracticada,
} from './retencionesFiscal.repository';
import { faltaEnLaCarga } from './validarCarga';
import { aplicarFiltros, buscaEn, paginar, type FiltroLista } from './listas';
import { Paginador } from './ListaControles';
import { eventosRetencion, cuandoCorto, lineaQuien } from './quienCuando';
import './libroFiscal.css';
import './libroFiscalV8.css';
import { useDescartar } from './confirmarDescartar';
import { sugerirSujetoPorRif } from './residenciaSujeto';
import { esCeroSinMotivo, validarMotivoCero } from './motivoCero';
import { RANGOS_RAPIDOS, rangoActivo, rangoRapido } from '@/shared/lib/rangosFecha';

function monto(n: number | null | undefined, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'Bs' ? `Bs ${v}` : `$ ${v}`;
}
function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}
const nDec = (v: string) => Number(String(v).replace(',', '.')) || 0;
const hoyIso = () => new Date().toISOString().slice(0, 10);
const primeroDelMes = () => `${new Date().toISOString().slice(0, 7)}-01`;
/** Lo retenido en Bs: lo guardado, o el monto si ya está en Bs. Sin tasa no se inventa. */
const enBs = (r: RetencionPracticada) => r.montoBs ?? (r.moneda === 'Bs' ? r.montoRetenido : 0);

/* ═══════════════════════ Libro fiscal ═══════════════════════ */

export function LibroFiscalView({ canWrite, actor, actorName }: {
  canWrite: boolean; actor: string; actorName: string | null;
}) {
  // Desde el 07/10/2026 la empresa retiene IVA: el libro abre en lo que
  // practicó (lo que hay que enterar), que es el trabajo del día a día.
  const [direccion, setDireccion] = useState<'' | DireccionRetencion>('practicada');
  const [tipo, setTipo] = useState<'' | TipoImpuesto>('');
  const [estado, setEstado] = useState<'' | EstadoRetencion | 'anulada'>('');
  const [desde, setDesde] = useState(primeroDelMes());
  const [hasta, setHasta] = useState(hoyIso());
  const [texto, setTexto] = useState('');

  const [filas, setFilas] = useState<RetencionPracticada[]>([]);
  const [config, setConfig] = useState<ConfigRetencion>(CONFIG_RETENCION_DEFECTO);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [anular, setAnular] = useState<RetencionPracticada | null>(null);
  const [motivo, setMotivo] = useState('');
  const [registrar, setRegistrar] = useState<SemillaRetencion | null>(null);
  const [parametros, setParametros] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    const [rs, cfg] = await Promise.all([
      listRetenciones({ desde: desde || undefined, hasta: hasta || undefined, incluirAnuladas: true }),
      getConfigRetencion().catch(() => CONFIG_RETENCION_DEFECTO),
    ]);
    setFilas(rs); setConfig(cfg); setErrorCarga(null);
  }, [desde, hasta]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    // Una lectura fallida no es «no hay nada»: se dice.
    reload()
      .catch((e) => { if (!cancel) setErrorCarga(e instanceof Error ? e.message : 'No se pudo leer el libro.'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);

  // La búsqueda, los filtros y el orden se aplican en pantalla: así cada opción
  // dice cuántas retenciones quedan con los demás filtros puestos.
  const [vista, setVista] = useState<'factura' | 'impuesto'>('factura');
  const [orden, setOrden] = useState<'reciente' | 'antiguo' | 'contraparte'>('reciente');
  const [pag, setPag] = useState(1);
  const [tam, setTam] = useState(25);
  useEffect(() => { setPag(1); }, [texto, direccion, tipo, estado, orden, desde, hasta, vista]);

  const filtros = useMemo<FiltroLista<RetencionPracticada>[]>(() => [
    { campo: 'direccion', etiqueta: 'Quién retuvo', valor: direccion, opciones: DIRECCIONES.map((d): [string, string] => [d.key, d.label]), pasa: (r, v) => r.direccion === v },
    { campo: 'tipo', etiqueta: 'Impuesto', valor: tipo, opciones: TIPOS_IMPUESTO.map((t): [string, string] => [t.key, t.corto]), pasa: (r, v) => r.tipo === v },
    {
      campo: 'estado', etiqueta: 'Estado', valor: estado,
      opciones: [...ESTADOS_RETENCION.map((e): [string, string] => [e.key, e.label]), ['anulada', 'Anuladas']],
      pasa: (r, v) => (v === 'anulada' ? r.anulada : !r.anulada && r.estado === v),
    },
  ], [direccion, tipo, estado]);

  const base = useMemo(() => filas.filter((r) => buscaEn(texto, r.contraparteNombre, r.contraparteRif, r.numeroComprobante,
    r.facturaNumero, r.docCodigo, r.conceptoNombre)), [filas, texto]);

  const visibles = useMemo(() => {
    const fecha = (r: RetencionPracticada) => r.facturaFecha ?? r.createdAt.slice(0, 10);
    const xs = aplicarFiltros(base, filtros);
    const reciente = (a: RetencionPracticada, b: RetencionPracticada) => fecha(b).localeCompare(fecha(a)) || b.createdAt.localeCompare(a.createdAt);
    xs.sort(orden === 'antiguo' ? (a, b) => -reciente(a, b)
      : orden === 'contraparte' ? (a, b) => (a.contraparteNombre ?? '').localeCompare(b.contraparteNombre ?? '') || reciente(a, b)
        : reciente);
    return xs;
  }, [base, filtros, orden]);
  const pagina = useMemo(() => paginar(visibles, pag, tam), [visibles, pag, tam]);

  const resumen = useMemo(() => resumenLibro(visibles.map((r) => ({
    tipo: r.tipo, direccion: r.direccion, estado: r.estado, monto: r.montoRetenido, anulada: r.anulada,
  }))), [visibles]);

  const totales = useMemo(() => totalesPorMoneda(visibles.map((r) => ({
    tipo: r.tipo, direccion: r.direccion, estado: r.estado, monto: r.montoRetenido, anulada: r.anulada, moneda: r.moneda,
  }))), [visibles]);

  const quitarFiltros = () => { setDireccion(''); setTipo(''); setEstado(''); setTexto(''); };

  // ── Agrupado por proveedor → factura → casillas (v8) ──
  type FacturaAgrupada = {
    key: string; num: string; doc: string | null; fecha: string | null;
    moneda: string; total: number; retenciones: Map<TipoImpuesto, RetencionPracticada>;
  };
  type ProveedorAgrupado = {
    rif: string | null; nombre: string | null; facturas: FacturaAgrupada[];
    pendientes: number; registradas: number;
  };

  const impuestosTarjeta = useMemo(() => {
    const activos = TIPOS_IMPUESTO.filter((t) => t.key !== 'igtf');
    return activos;
  }, []);

  const conteosPorImpuesto = useMemo(() => {
    const m: Record<string, { pendientes: number; registradas: number; declaradas: number; anuladas: number }> = {};
    for (const t of impuestosTarjeta) m[t.key] = { pendientes: 0, registradas: 0, declaradas: 0, anuladas: 0 };
    for (const r of visibles) {
      if (r.tipo === 'igtf') continue;
      const c = m[r.tipo];
      if (!c) continue;
      if (r.anulada) c.anuladas++;
      else if (r.estado === 'declarada') c.declaradas++;
      else if (r.estado === 'registrada') c.registradas++;
      else c.pendientes++;
    }
    return m;
  }, [visibles, impuestosTarjeta]);

  const proveedores = useMemo<ProveedorAgrupado[]>(() => {
    const provMap = new Map<string, Map<string, FacturaAgrupada>>();
    const provInfo = new Map<string, { nombre: string | null; rif: string | null }>();
    for (const r of visibles) {
      const pk = r.contraparteRif ?? r.contraparteNombre ?? 'sin-proveedor';
      if (!provMap.has(pk)) { provMap.set(pk, new Map()); provInfo.set(pk, { nombre: r.contraparteNombre, rif: r.contraparteRif }); }
      const fMap = provMap.get(pk)!;
      const fk = r.facturaNumero ?? r.docCodigo ?? r.id;
      if (!fMap.has(fk)) fMap.set(fk, {
        key: fk, num: r.facturaNumero ?? '—',
        doc: r.docCodigo, fecha: r.facturaFecha ?? r.createdAt.slice(0, 10),
        moneda: r.moneda, total: r.baseImponible, retenciones: new Map(),
      });
      fMap.get(fk)!.retenciones.set(r.tipo, r);
    }
    const result: ProveedorAgrupado[] = [];
    for (const [pk, fMap] of provMap) {
      const info = provInfo.get(pk)!;
      const facturas = [...fMap.values()];
      let pendientes = 0, registradas = 0;
      for (const f of facturas) for (const r of f.retenciones.values()) {
        if (r.anulada) continue;
        if (r.estado === 'registrada' || r.estado === 'declarada') registradas++;
        else pendientes++;
      }
      result.push({ ...info, facturas, pendientes, registradas });
    }
    return result;
  }, [visibles]);

  async function verComprobante(r: RetencionPracticada) {
    try {
      const { verComprobanteRetencionPdf } = await import('./comprobanteRetencionPdf');
      await verComprobanteRetencionPdf(r, config);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el comprobante', 'error'); }
  }

  async function verAdjunto(r: RetencionPracticada) {
    if (!r.comprobantePath) return;
    try {
      previewArchivo(await urlComprobante(r.comprobantePath), r.comprobanteNombre ?? 'comprobante');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo abrir el comprobante', 'error'); }
  }

  async function verLibroPdf() {
    try {
      const { verLibroFiscalPdf } = await import('./libroFiscalPdf');
      await verLibroFiscalPdf(visibles, config, { desde, hasta, direccion: direccion || null, resumen, totales });
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el libro', 'error'); }
  }

  // La relación para el SENIAT es por impuesto y de lo que la empresa practicó.
  const relacionables = visibles.filter((r) => r.direccion === 'practicada' && !r.anulada);
  async function verRelacion() {
    if (!tipo) { toast('Seleccionar un impuesto para generar la relación.', 'error'); return; }
    if (!relacionables.length) { toast('No hay retenciones practicadas en el rango para la relación.', 'error'); return; }
    try {
      const { verRelacionPdf } = await import('./relacionesPdf');
      await verRelacionPdf(relacionables, config, { desde, hasta, tipo });
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar la relación', 'error'); }
  }

  const razon = config.razonSocial || 'La empresa';
  const retieneIva = puedePracticar('iva', config);

  const estadoCasilla = (r: RetencionPracticada) => r.anulada ? 'anulada' : r.estado === 'declarada' ? 'declarada' : r.estado === 'registrada' ? 'ok' : 'falta';
  const signoEstado: Record<string, string> = { ok: '✓', declarada: '◉', falta: '⏳', anulada: '⊘', nc: '—', pd: '?' };
  const textoEstado: Record<string, string> = { ok: 'Registrada', declarada: 'Declarada', falta: 'Pendiente', anulada: 'Anulada', nc: 'No aplica', pd: 'Por definir' };

  return (
    <div>
      {/* ── Búsqueda v8 ── */}
      <section className="lfv8-buscar" role="search">
        <label htmlFor="lfv8-q">Búsqueda: factura, proveedor, RIF, OC o comprobante</label>
        <span className="lfv8-lupa" aria-hidden="true">⌕</span>
        <input id="lfv8-q" type="text" value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej.: 000123, Alfa, J-00000002, OC-0045, 202609…" autoComplete="off" />
      </section>

      {/* ── Tarjetas de impuesto (totales v8) ── */}
      <section className="lfv8-totales" style={{ '--n': impuestosTarjeta.length } as React.CSSProperties}
        aria-label="Totales por impuesto">
        {impuestosTarjeta.map((t) => {
          const c = conteosPorImpuesto[t.key] ?? { pendientes: 0, registradas: 0, declaradas: 0, anuladas: 0 };
          const montoImp = visibles.filter((r) => r.tipo === t.key && !r.anulada).reduce((a, r) => a + enBs(r), 0);
          return (
            <div key={t.key} className="lfv8-total-imp">
              <h2>{t.corto} <span>Retenido: {monto(montoImp, 'Bs')}</span></h2>
              <div className="lfv8-botones">
                <button type="button" className={`lfv8-cuenta falta${tipo === t.key && estado === 'registrada' ? '' : ''}`}
                  aria-pressed={tipo === t.key && estado === ''} disabled={!c.pendientes}
                  onClick={() => { setTipo(tipo === t.key && estado === '' ? '' : t.key as TipoImpuesto); setEstado(''); }}>
                  <strong>{c.pendientes}</strong> {c.pendientes === 1 ? 'pendiente' : 'pendientes'}
                </button>
                <button type="button" className="lfv8-cuenta"
                  aria-pressed={tipo === t.key && estado === 'registrada'} disabled={!c.registradas}
                  onClick={() => { setTipo(t.key as TipoImpuesto); setEstado(estado === 'registrada' && tipo === t.key ? '' : 'registrada'); }}>
                  <strong>{c.registradas}</strong> {c.registradas === 1 ? 'registrada' : 'registradas'}
                </button>
                <button type="button" className="lfv8-cuenta"
                  aria-pressed={tipo === t.key && estado === 'declarada'} disabled={!c.declaradas}
                  onClick={() => { setTipo(t.key as TipoImpuesto); setEstado(estado === 'declarada' && tipo === t.key ? '' : 'declarada'); }}>
                  <strong>{c.declaradas}</strong> {c.declaradas === 1 ? 'declarada' : 'declaradas'}
                </button>
              </div>
            </div>
          );
        })}
      </section>
      <p className="lfv8-nota">El IGTF no se incluye en las tarjetas: es una percepción por pago en divisas, no una retención por factura.</p>

      {/* ── Filtros v8 (chips) ── */}
      <div className="lfv8-filtros">
        <div className="lfv8-filtros-cuerpo">
          <div className="lfv8-campo">
            <span>Fecha</span>
            <div className="lfv8-chips" role="group" aria-label="Fecha">
              {RANGOS_RAPIDOS.map((r) => (
                <button key={r.valor} type="button" className="lfv8-chip"
                  aria-pressed={rangoActivo(desde, hasta) === r.valor}
                  onClick={() => { const x = rangoRapido(r.valor); setDesde(x.desde); setHasta(x.hasta); }}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="lfv8-rango">
              <input className="lfv8-fecha" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
              <span className="muted">a</span>
              <input className="lfv8-fecha" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
            </div>
          </div>

          <div className="lfv8-campo">
            <span>Impuesto</span>
            <div className="lfv8-chips" role="group" aria-label="Impuesto">
              <button type="button" className="lfv8-chip" aria-pressed={tipo === ''} onClick={() => setTipo('')}>Todos</button>
              {TIPOS_IMPUESTO.map((t) => (
                <button key={t.key} type="button" className="lfv8-chip"
                  aria-pressed={tipo === t.key} onClick={() => setTipo(tipo === t.key ? '' : t.key as TipoImpuesto)}>
                  {t.corto}
                </button>
              ))}
            </div>
          </div>

          <div className="lfv8-campo">
            <span>Dirección</span>
            <div className="lfv8-chips" role="group" aria-label="Dirección">
              {[['', 'Todas'], ...DIRECCIONES.map((d): [string, string] => [d.key, d.label])].map(([v, t]) => (
                <button key={v} type="button" className="lfv8-chip"
                  aria-pressed={direccion === v} onClick={() => setDireccion(v as '' | DireccionRetencion)}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="lfv8-campo">
            <span>Estado</span>
            <select className="lfv8-select" value={estado}
              onChange={(e) => setEstado(e.target.value as '' | EstadoRetencion | 'anulada')}>
              <option value="">Todos</option>
              {ESTADOS_RETENCION.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
              <option value="anulada">Anuladas</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Barra vista + acciones ── */}
      <div className="lfv8-barra-vista">
        <div className="lfv8-view-switch" role="group" aria-label="Agrupar por">
          <button type="button" aria-pressed={vista === 'factura'} onClick={() => setVista('factura')}>Por factura</button>
          <button type="button" aria-pressed={vista === 'impuesto'} onClick={() => setVista('impuesto')}>Por impuesto</button>
        </div>
        <div className="lfv8-activos" aria-live="polite">
          {tipo && (
            <span className="lfv8-activo">
              Impuesto: {TIPOS_IMPUESTO.find((t) => t.key === tipo)?.corto ?? tipo}
              <button type="button" onClick={() => setTipo('')} aria-label="Quitar filtro de impuesto">✕</button>
            </span>
          )}
          {direccion && (
            <span className="lfv8-activo">
              {DIRECCIONES.find((d) => d.key === direccion)?.label ?? direccion}
              <button type="button" onClick={() => setDireccion('')} aria-label="Quitar filtro de dirección">✕</button>
            </span>
          )}
          {estado && (
            <span className="lfv8-activo">
              {estado === 'anulada' ? 'Anuladas' : ESTADOS_RETENCION.find((e) => e.key === estado)?.label ?? estado}
              <button type="button" onClick={() => setEstado('')} aria-label="Quitar filtro de estado">✕</button>
            </span>
          )}
        </div>
      </div>
      <div className="lfv8-acciones-libro">
        <button className="btn btn-ghost" onClick={() => void verLibroPdf()} disabled={!visibles.length}>↓ PDF del libro</button>
        <button className="btn btn-ghost" onClick={() => void verRelacion()} disabled={!tipo || !relacionables.length}
          title={!tipo ? 'Seleccionar un impuesto para generar la relación' : 'Relación por proveedor para el SENIAT'}>↓ Relación</button>
        <button className="btn btn-ghost" onClick={() => setParametros(true)}>⚙ Parámetros</button>
        {canWrite && <button className="btn btn-primary" onClick={() => setRegistrar({})}>+ Registrar retención</button>}
      </div>

      {/* ── Vista ── */}
      {loading && <EmptyState icon="◔" message="Cargando el libro…" />}
      {!loading && errorCarga && <EmptyState icon="⚠" message={`No se pudo leer el libro: ${errorCarga}`} />}
      {!loading && !errorCarga && !visibles.length && (
        <div className="lfv8-vacio">
          <p>{filas.length ? 'Ninguna retención coincide con la búsqueda o los filtros.' : 'Sin retenciones en ese rango de fechas.'}</p>
          <button className="btn" onClick={quitarFiltros}>Quitar filtros</button>
        </div>
      )}

      {/* ── Vista por factura (agrupada por proveedor) ── */}
      {!loading && !errorCarga && visibles.length > 0 && vista === 'factura' && (
        <>
          <p className="lfv8-contador">{visibles.length} retención(es) en {proveedores.length} proveedor(es).</p>
          {proveedores.map((prov) => {
            const pk = prov.rif ?? prov.nombre ?? 'sin';
            const MAX_VISIBLE = 5;
            const abierto = expandidos.has(pk) || prov.facturas.length <= MAX_VISIBLE;
            const facturasVis = abierto ? prov.facturas : prov.facturas.slice(0, MAX_VISIBLE);
            return (
              <section key={pk} className="lfv8-proveedor">
                <header>
                  <h3>{prov.nombre ?? 'Sin proveedor'}<span className="lfv8-rif">{prov.rif ?? ''}</span></h3>
                  <span className="lfv8-resumen">
                    {prov.facturas.length} factura(s)
                    {prov.pendientes > 0 && <> · <b>{prov.pendientes} pendiente(s)</b></>}
                    {!prov.pendientes && ' · sin pendientes'}
                  </span>
                </header>
                {facturasVis.map((f) => {
                  const nCasillas = impuestosTarjeta.length;
                  const totalRet = [...f.retenciones.values()].reduce((a, r) => a + (!r.anulada ? enBs(r) : 0), 0);
                  return (
                    <article key={f.key} className="lfv8-factura" aria-label={`Factura ${f.num}`}>
                      <div>
                        <div className="lfv8-num">Factura {f.num}</div>
                        <div className="lfv8-meta">
                          {f.fecha ? fechaCorta(f.fecha) : '—'}
                          {f.doc && <> · <span className="lfv8-doc">{f.doc}</span></>}
                          {' · '}{monto(f.total, f.moneda)}
                        </div>
                      </div>
                      <div className="lfv8-tira" style={{ '--n': nCasillas } as React.CSSProperties}
                        role="group" aria-label={`Retenciones de la factura ${f.num}`}>
                        {impuestosTarjeta.map((t) => {
                          const r = f.retenciones.get(t.key as TipoImpuesto);
                          if (!r) {
                            return (
                              <div key={t.key} className="lfv8-casilla nc">
                                <span className="lfv8-imp">{t.corto}</span>
                                <span className="lfv8-est">— Sin registro</span>
                              </div>
                            );
                          }
                          const est = estadoCasilla(r);
                          return (
                            <div key={t.key} className={`lfv8-casilla ${est}`}>
                              <span className="lfv8-imp">{t.corto}</span>
                              <span className="lfv8-est">{signoEstado[est]} {textoEstado[est]}</span>
                              {(est === 'ok' || est === 'declarada') && <span className="lfv8-monto">{monto(r.montoRetenido, r.moneda)}</span>}
                              {est === 'anulada' && <span className="lfv8-monto">{monto(r.montoRetenido, r.moneda)}</span>}
                              <span className="lfv8-por"><b>{r.porcentaje}%</b></span>
                              {r.numeroComprobante && <span className="lfv8-comp" title="Comprobante">N° {r.numeroComprobante}</span>}
                              <span className="lfv8-acciones">
                                {canWrite && !r.anulada && est === 'falta' && (
                                  <button type="button" className="lfv8-mini registrar"
                                    onClick={() => setRegistrar({ direccion: r.direccion, contraparteId: r.contraparteId, contraparteNombre: r.contraparteNombre, contraparteRif: r.contraparteRif })}>
                                    Registrar
                                  </button>
                                )}
                                <button type="button" className="lfv8-mini" onClick={() => void verComprobante(r)} title="Comprobante">📄</button>
                                {canWrite && !r.anulada && (
                                  <button type="button" className="lfv8-mini" onClick={() => { setAnular(r); setMotivo(''); }} title="Anular">⊘</button>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="lfv8-tot">
                        <small>Total retenido</small>
                        <span>{totalRet ? monto(totalRet, 'Bs') : '—'}</span>
                      </div>
                    </article>
                  );
                })}
                {prov.facturas.length > MAX_VISIBLE && (
                  <button type="button" className="lfv8-ver-restantes"
                    aria-expanded={abierto}
                    onClick={() => setExpandidos((prev) => {
                      const next = new Set(prev);
                      abierto ? next.delete(pk) : next.add(pk);
                      return next;
                    })}>
                    {abierto
                      ? `Mostrar menos (las primeras ${MAX_VISIBLE})`
                      : `Ver las ${prov.facturas.length - MAX_VISIBLE} facturas restantes de este proveedor`}
                  </button>
                )}
              </section>
            );
          })}
          {!loading && !errorCarga && (
            <Paginador pagina={pagina} tam={tam} unidad="retención(es)" onPagina={setPag} onTam={(t) => { setTam(t); setPag(1); }} />
          )}
        </>
      )}

      {/* ── Vista por impuesto (columnas) ── */}
      {!loading && !errorCarga && visibles.length > 0 && vista === 'impuesto' && (
        <div className="lfv8-columnas" style={{ '--n': impuestosTarjeta.length } as React.CSSProperties}>
          {impuestosTarjeta.map((t) => {
            const del = visibles.filter((r) => r.tipo === t.key);
            const pendientes = del.filter((r) => !r.anulada && r.estado !== 'registrada' && r.estado !== 'declarada');
            const registradas = del.filter((r) => !r.anulada && (r.estado === 'registrada' || r.estado === 'declarada'));
            return (
              <section key={t.key} className="lfv8-columna">
                <header>
                  <h3>{t.corto}</h3>
                  <span className="lfv8-contador">{pendientes.length} pendientes · {registradas.length} registradas</span>
                </header>
                <h4>Pendientes ({pendientes.length})</h4>
                {pendientes.map((r) => (
                  <div key={r.id} className="lfv8-item">
                    <span className="lfv8-quien">
                      {r.contraparteNombre ?? '—'}
                      <small>Factura {r.facturaNumero ?? r.docCodigo ?? '—'} · {r.facturaFecha ? fechaCorta(r.facturaFecha) : '—'}</small>
                    </span>
                    <span className="lfv8-cuanto">
                      <span className={`lfv8-pill falta`}>Pendiente</span>
                    </span>
                  </div>
                ))}
                {!pendientes.length && <div className="lfv8-item"><span className="lfv8-quien muted">Sin pendientes.</span><span /></div>}
                <h4>Registradas ({registradas.length})</h4>
                {registradas.map((r) => (
                  <div key={r.id} className="lfv8-item">
                    <span className="lfv8-quien">
                      {r.contraparteNombre ?? '—'}
                      <small>Factura {r.facturaNumero ?? r.docCodigo ?? '—'} · {r.facturaFecha ? fechaCorta(r.facturaFecha) : '—'}</small>
                    </span>
                    <span className="lfv8-cuanto">
                      <span className={`lfv8-pill ${r.estado === 'declarada' ? 'declarada' : 'ok'}`}>{r.estado === 'declarada' ? 'Declarada' : 'Registrada'}</span>
                      <br /><span className="lfv8-monto">{monto(r.montoRetenido, r.moneda)}</span>
                    </span>
                  </div>
                ))}
                {!registradas.length && <div className="lfv8-item"><span className="lfv8-quien muted">Sin registros en el período.</span><span /></div>}
              </section>
            );
          })}
        </div>
      )}

      {anular && (
        <Modal title={`Anular la retención ${anular.numeroComprobante ?? ''}`} compact onClose={() => setAnular(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setAnular(null)}>Cancelar</button>
              <button className="btn btn-danger" disabled={!motivo.trim()}
                onClick={async () => {
                  try {
                    await anularRetencion(anular.id, motivo);
                    toast('Retención anulada', 'success');
                    setAnular(null);
                    await reload();
                  } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo anular', 'error'); }
                }}>Anular</button>
            </>
          }>
          <p style={{ marginTop: 0 }}>
            Se anula <strong>{monto(anular.montoRetenido, anular.moneda)}</strong> de {labelImpuesto(anular.tipo)} de {anular.contraparteNombre ?? '—'}.
            El comprobante queda en el libro marcado como anulado, con su número.
          </p>
          <div className="form-row" style={{ margin: 0 }}>
            <label>¿Por qué se anula?</label>
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: la factura fue sustituida por el proveedor" />
          </div>
        </Modal>
      )}

      {registrar && (
        <RegistrarRetencionModal semilla={registrar} actor={actor} actorName={actorName}
          onClose={() => setRegistrar(null)}
          onHecho={async () => { setRegistrar(null); await reload().catch(() => { /* se reintenta al filtrar */ }); }} />
      )}
      {parametros && (
        <ConfiguracionFiscalModal puedeEditar={canWrite} onClose={() => { setParametros(false); void reload().catch(() => { /* idem */ }); }} />
      )}
    </div>
  );
}


/* ═══════════════ Registrar / practicar una retención ═══════════════ */

/** Datos con los que se abre el modal. Vacío = carga manual desde el libro. */
export interface SemillaRetencion {
  direccion?: DireccionRetencion;
  docKind?: DocKind;
  docId?: string | null;
  codigo?: string | null;
  /** Solo un proveedor: en una recibida la contraparte es un cliente. */
  contraparteId?: string | null;
  contraparteNombre?: string | null;
  contraparteRif?: string | null;
  moneda?: string;
  /** Total del documento: la base de partida para ISLR y municipal. */
  total?: number;
  /** IVA de la factura: la base de la retención de IVA. */
  iva?: number;
  /** Base imponible (total sin IVA). */
  baseImponible?: number;
}

export function RegistrarRetencionModal({ semilla, actor, actorName, onClose, onHecho }: {
  semilla: SemillaRetencion;
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [config, setConfig] = useState<ConfigRetencion>(CONFIG_RETENCION_DEFECTO);
  const [conceptos, setConceptos] = useState<ConceptoRetencion[]>([]);

  const [direccion, setDireccion] = useState<DireccionRetencion>(semilla.direccion ?? 'practicada');
  const [tipo, setTipo] = useState<TipoImpuesto>('iva');
  const [sujeto, setSujeto] = useState<SujetoRetenido>('pj_domiciliada');
  const [conceptoId, setConceptoId] = useState('');
  const [motivos, setMotivos] = useState<MotivosIvaCien>({});

  const [contraparte, setContraparte] = useState(semilla.contraparteNombre ?? '');
  const [rif, setRif] = useState(semilla.contraparteRif ?? '');
  const [moneda, setMoneda] = useState(semilla.moneda ?? 'Bs');
  const [tasaStr, setTasaStr] = useState('');
  const [numero, setNumero] = useState('');
  const [facturaNumero, setFacturaNumero] = useState('');
  const [facturaControl, setFacturaControl] = useState('');
  const [facturaFecha, setFacturaFecha] = useState(hoyIso());
  const [baseStr, setBaseStr] = useState(String(semilla.baseImponible ?? semilla.total ?? 0));
  const [ivaStr, setIvaStr] = useState(String(semilla.iva ?? 0));
  const [pctStr, setPctStr] = useState('');
  const [montoStr, setMontoStr] = useState('');
  const [observacion, setObservacion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { marcarSucio, pedirCierre, dialogo } = useDescartar(onClose, saving);

  useEffect(() => {
    void Promise.all([getConfigRetencion(), listConceptos(true)])
      .then(([c, cs]) => { setConfig(c); setConceptos(cs); })
      .catch((e) => setError(e instanceof Error ? `No se pudo leer la configuración: ${e.message}` : 'No se pudo leer la configuración.'));
    getTasaHoy().then((t) => { if (t.usd != null) setTasaStr(String(t.usd)); }).catch(() => { /* se escribe a mano */ });
  }, []);

  const conceptosDelTipo = useMemo(() => conceptos.filter((c) =>
    c.tipo === tipo && (c.sujeto === sujeto || c.sujeto === 'todos')), [conceptos, tipo, sujeto]);
  useEffect(() => { setConceptoId(conceptosDelTipo[0]?.id ?? ''); }, [conceptosDelTipo]);
  const concepto = conceptosDelTipo.find((c) => c.id === conceptoId) ?? null;

  // Cuando la practica la empresa, el sistema calcula. Cuando se la
  // practicaron, el número ya está en el comprobante: se copia, no se inventa.
  const calculo: CalculoRetencion = useMemo(() => {
    const base = nDec(baseStr);
    if (tipo === 'iva') return calcularRetencionIva({ baseImponible: base, ivaFactura: nDec(ivaStr), motivos }, config);
    if (tipo === 'islr') return calcularRetencionIslr({ montoPago: base, concepto }, config);
    if (tipo === 'igtf') return calcularIgtf({ montoPago: base, enDivisas: true }, config);
    return calcularRetencionLocal({ montoPago: base, concepto }, tipo);
  }, [tipo, baseStr, ivaStr, motivos, concepto, config]);

  const esManual = direccion === 'recibida';
  const bloqueo = direccion === 'practicada' ? motivoNoPuedePracticar(tipo, config) : null;
  const pctFinal = esManual ? nDec(pctStr) : calculo.porcentaje;
  const montoFinal = esManual
    ? (nDec(montoStr) || Math.round(nDec(baseStr) * nDec(pctStr)) / 100)
    : calculo.montoRetenido;
  const tasa = nDec(tasaStr);
  const montoBs = enBolivares(montoFinal, moneda, tasa);
  // Un 0% se registra solo con su motivo (D19 · v8 §4.10). El motivo es la observación.
  const esCero = montoFinal === 0;
  const ceroSinMotivo = esCeroSinMotivo(pctFinal, montoFinal, observacion);

  async function emitir() {
    setError(null);
    if (bloqueo) { setError(bloqueo); return; }
    if (montoFinal < 0) { setError('El monto no puede ser negativo.'); return; }
    if (ceroSinMotivo) { setError(validarMotivoCero(pctFinal, montoFinal, observacion, tipo).mensaje ?? 'Escriba el motivo del 0%.'); return; }
    if (esManual && !contraparte.trim()) { setError('Indicar la contraparte que practicó la retención.'); return; }
    if (moneda !== 'Bs' && !(tasa > 0)) { setError('Indicar la tasa de cambio para convertir la retención a bolívares.'); return; }
    const falta = faltaEnLaCarga({ tipo, facturaNumero, facturaFecha }); if (falta) { setError(falta); return; }
    setSaving(true);
    try {
      const periodo = periodoDe(facturaFecha);
      const r = await registrarRetencion({
        tipo, direccion,
        docKind: semilla.docKind ?? 'manual',
        docId: semilla.docId ?? null, docCodigo: semilla.codigo ?? null,
        contraparteId: semilla.contraparteId ?? null,
        contraparteRif: rif.trim() || null,
        contraparteNombre: contraparte.trim() || null,
        contraparteSujeto: tipo === 'iva' || tipo === 'igtf' ? null : sujeto,
        facturaNumero: facturaNumero.trim() || null,
        facturaControl: facturaControl.trim() || null,
        facturaFecha: facturaFecha || null,
        periodo, quincena: tipo === 'iva' ? quincenaDe(facturaFecha) : null,
        numeroComprobante: esManual ? (numero.trim() || null) : null,
        conceptoId: esManual ? null : (concepto?.id ?? null),
        conceptoNombre: esManual ? null : (concepto?.nombre ?? null),
        moneda, tasa: moneda === 'Bs' ? null : tasa,
        baseImponible: esManual ? nDec(baseStr) : calculo.baseImponible,
        alicuota: esManual ? 0 : calculo.alicuota,
        impuesto: esManual ? nDec(ivaStr) : calculo.impuesto,
        porcentaje: pctFinal,
        sustraendo: esManual ? 0 : calculo.sustraendo,
        montoRetenido: montoFinal,
        observacion: observacion.trim() || null,
        actor, actorName,
      }, config);
      if (archivo) await adjuntarComprobante(r.id, archivo).catch(() => toast('La retención quedó registrada, pero el adjunto no subió: se puede adjuntar después', 'error'));
      notify(
        `${labelDireccion(direccion)} · ${labelImpuesto(tipo)} · ${monto(r.montoRetenido, r.moneda)}${r.numeroComprobante ? ` · ${r.numeroComprobante}` : ''}`,
        'success', { link: '#/app/retenciones' },
      );
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la retención.');
      setSaving(false);
    }
  }

  return (
    <>
    <Modal title="Registrar retención" size="lg" onClose={pedirCierre}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={pedirCierre} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void emitir()} disabled={saving || montoFinal < 0 || ceroSinMotivo || !!bloqueo}>
            {saving ? 'Guardando…' : (esCero ? 'Registrar en 0 con motivo' : `Registrar · ${monto(montoFinal, moneda)}`)}
          </button>
        </>
      }>
      <div onChange={marcarSucio}>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      {/* La dirección primero: cambia el significado de todo lo demás */}
      <div className="form-row">
        <label>¿Quién retuvo?</label>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {DIRECCIONES.map((d) => (
            <label key={d.key} className="card" style={{
              margin: 0, padding: '.45rem .8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem',
              borderColor: direccion === d.key ? 'var(--primary)' : 'var(--border)',
            }}>
              <input type="radio" checked={direccion === d.key} onChange={() => setDireccion(d.key)} />
              <span style={{ fontWeight: 600 }}>{d.label}</span>
            </label>
          ))}
        </div>
        <small className="hint muted">{significadoRetencion(tipo, direccion)}</small>
      </div>

      {bloqueo && (
        <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: '.5rem' }}>
          <small>{bloqueo}</small>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <div className="form-row" style={{ flex: '2 1 240px' }}>
          <label>{direccion === 'recibida' ? 'Agente de retención' : 'Sujeto retenido'}</label>
          <input className="input" value={contraparte} onChange={(e) => setContraparte(e.target.value)} placeholder="Razón social" />
        </div>
        <div className="form-row" style={{ flex: '1 1 140px' }}>
          <label>RIF</label>
          <input className="input mono" value={rif} onChange={(e) => setRif(e.target.value)} placeholder="J-XXXXXXXX-X" />
        </div>
        <div className="form-row" style={{ flex: '0 1 110px' }}>
          <label>Moneda</label>
          <select className="select" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="Bs">Bs</option>
            <option value="USD">$</option>
          </select>
        </div>
        {moneda !== 'Bs' && (
          <div className="form-row" style={{ flex: '0 1 140px' }}>
            <label>Tasa (Bs por $)</label>
            <input className="input mono" value={tasaStr} onChange={(e) => setTasaStr(e.target.value)} inputMode="decimal" />
            <small className="hint muted">Para el equivalente en Bs, que es como se declara.</small>
          </div>
        )}
      </div>

      <div className="form-row">
        <label>Impuesto</label>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {TIPOS_IMPUESTO.map((t) => {
            const noPuede = direccion === 'practicada' && !puedePracticar(t.key, config);
            return (
              <label key={t.key} className="card" title={noPuede ? motivoNoPuedePracticar(t.key, config) ?? '' : undefined} style={{
                margin: 0, padding: '.4rem .7rem', cursor: noPuede ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem',
                borderColor: tipo === t.key ? 'var(--primary)' : 'var(--border)', opacity: noPuede ? 0.5 : 1,
              }}>
                <input type="radio" checked={tipo === t.key} onChange={() => setTipo(t.key)} />
                <span style={{ fontWeight: 600 }}>{t.corto}</span>
              </label>
            );
          })}
        </div>
      </div>

      {direccion === 'practicada' && tipo !== 'iva' && tipo !== 'igtf' && (
        <>
          {tipo === 'islr' && (
            <div className="form-row">
              <label>¿A quién se le retiene?</label>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="select" style={{ flex: '1 1 240px' }} value={sujeto} onChange={(e) => setSujeto(e.target.value as SujetoRetenido)}>
                  {SUJETOS.filter((s) => s.key !== 'todos').map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                {(() => { const sug = sugerirSujetoPorRif(rif); return sug ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSujeto(sug.sujeto)}
                    title={`Según el RIF: ${SUJETOS.find((s) => s.key === sug.sujeto)?.label ?? ''}`}>Sugerir por el RIF</button>
                ) : null; })()}
              </div>
              <small className="hint muted">El porcentaje del ISLR cambia según el sujeto: no es lo mismo una persona natural que una empresa. La letra del RIF sugiere el sujeto; verificar antes de registrar.</small>
            </div>
          )}
          <div className="form-row">
            <label>Concepto</label>
            <select className="select" value={conceptoId} onChange={(e) => setConceptoId(e.target.value)}>
              {!conceptosDelTipo.length && <option value="">— sin conceptos activos para este caso —</option>}
              {conceptosDelTipo.map((c) => (
                <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.nombre} — {c.porcentaje}%</option>
              ))}
            </select>
            {concepto?.fundamento && <small className="hint muted">{concepto.fundamento}</small>}
          </div>
        </>
      )}

      {direccion === 'practicada' && tipo === 'iva' && (
        <div className="form-row">
          <label>¿Corresponde retener el 100%? (Providencia SNAT/2015/0049, art. 5)</label>
          {([
            ['ivaNoDiscriminado', 'El IVA no está discriminado en la factura'],
            ['facturaNoCumple', 'La factura no cumple los requisitos de facturación'],
            ['proveedorNoInscrito', 'El proveedor está sujeto a retención del 100% según el Portal Fiscal, o no está inscrito en el RIF'],
            ['proveedorNoDomiciliado', 'El proveedor no está domiciliado en el país'],
            ['metalesPreciosos', 'Compra de metales o piedras preciosas'],
          ] as Array<[keyof MotivosIvaCien, string]>).map(([k, label]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.84rem', marginTop: '.2rem' }}>
              <input type="checkbox" checked={!!motivos[k]} onChange={(e) => setMotivos({ ...motivos, [k]: e.target.checked })} />
              {label}
            </label>
          ))}
          <small className="hint muted">Sin ninguna marcada se retiene el {config.pctIvaGeneral}%.</small>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        {esManual && (
          <div className="form-row" style={{ flex: '1 1 170px' }}>
            <label>N° del comprobante</label>
            <input className="input mono" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Según el comprobante recibido" />
            <small className="hint muted">Número asignado por el agente de retención. Transcribir como figura en el comprobante.</small>
          </div>
        )}
        <div className="form-row" style={{ flex: '1 1 150px' }}>
          <label>{tipo === 'iva' ? 'Base imponible' : 'Monto del pago (sin IVA)'}</label>
          <input className="input mono" value={baseStr} onChange={(e) => setBaseStr(e.target.value)} inputMode="decimal" />
        </div>
        {tipo === 'iva' && (
          <div className="form-row" style={{ flex: '1 1 130px' }}>
            <label>IVA de la factura</label>
            <input className="input mono" value={ivaStr} onChange={(e) => setIvaStr(e.target.value)} inputMode="decimal" />
          </div>
        )}
        {esManual && (
          <>
            <div className="form-row" style={{ flex: '0 1 110px' }}>
              <label>% retenido</label>
              <input className="input mono" value={pctStr} onChange={(e) => setPctStr(e.target.value)} inputMode="decimal" />
            </div>
            <div className="form-row" style={{ flex: '1 1 150px' }}>
              <label>Monto retenido</label>
              <input className="input mono" value={montoStr} onChange={(e) => setMontoStr(e.target.value)} inputMode="decimal"
                placeholder={String(Math.round(nDec(baseStr) * nDec(pctStr)) / 100)} />
              <small className="hint muted">Vacío: se toma base × %.</small>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <div className="form-row" style={{ flex: '1 1 140px' }}>
          <label>N° de factura</label>
          <input className="input mono" value={facturaNumero} onChange={(e) => setFacturaNumero(e.target.value)} placeholder="Número fiscal (no el código de la OC)" />
        </div>
        <div className="form-row" style={{ flex: '1 1 130px' }}>
          <label>N° de control</label>
          <input className="input mono" value={facturaControl} onChange={(e) => setFacturaControl(e.target.value)} />
        </div>
        <div className="form-row" style={{ flex: '1 1 150px' }}>
          <label>Fecha de la factura</label>
          <input className="input" type="date" value={facturaFecha} onChange={(e) => setFacturaFecha(e.target.value)} />
          <small className="hint muted">Define el período{tipo === 'iva' ? ' y la quincena' : ''}.</small>
        </div>
      </div>

      <div className="form-row">
        <label>Comprobante (PDF o imagen)</label>
        <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        {archivo && <small className="muted">{archivo.name}</small>}
      </div>

      {esCero ? (
        <div className="lfv8-motivo-0">
          <label htmlFor="lf-motivo-0">Motivo del 0 %: ¿por qué no se retiene? (obligatorio)</label>
          <textarea id="lf-motivo-0" className="input" value={observacion} onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej.: el pago no supera el mínimo exento del ISLR" />
          {ceroSinMotivo && <small className="hint" style={{ color: 'var(--warning)' }}>{validarMotivoCero(pctFinal, montoFinal, observacion, tipo).mensaje}</small>}
        </div>
      ) : (
        <div className="form-row">
          <label>Observación</label>
          <input className="input" value={observacion} onChange={(e) => setObservacion(e.target.value)} />
        </div>
      )}

      {/* El resultado, con la cuenta a la vista */}
      <div className="card" style={{ borderColor: montoFinal > 0 ? 'var(--primary)' : 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <div className="muted" style={{ fontSize: '.72rem' }}>{direccion === 'recibida' ? 'Retención recibida' : 'Monto a retener'}</div>
            <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
              {monto(montoFinal, moneda)}
            </div>
            {moneda !== 'Bs' && (
              <div className="muted mono" style={{ fontSize: '.78rem' }}>{montoBs > 0 ? monto(montoBs, 'Bs') : 'Sin tasa: falta el equivalente en Bs'}</div>
            )}
          </div>
          <div className="muted mono" style={{ fontSize: '.78rem', textAlign: 'right' }}>
            <div>Base {monto(esManual ? nDec(baseStr) : calculo.baseImponible, moneda)}</div>
            {!esManual && calculo.impuesto > 0 && <div>Impuesto {monto(calculo.impuesto, moneda)}</div>}
            <div>Retención {pctFinal}%</div>
            {!esManual && calculo.sustraendo > 0 && <div>Sustraendo −{monto(calculo.sustraendo, moneda)}</div>}
          </div>
        </div>
        <p className="muted" style={{ margin: '.4rem 0 0', fontSize: '.8rem' }}>
          {esManual ? significadoRetencion(tipo, direccion) : calculo.explicacion}
        </p>
      </div>
      <div className="hint muted" style={{ fontSize: '.74rem' }}>
        {direccion === 'practicada' && tipo !== 'igtf'
          ? `Al registrar, la base le asigna el número de comprobante AAAAMM + 8 dígitos. El número no se reusa.${facturaFecha ? ` Entregar el comprobante hasta el ${fechaCorta(limiteEntregaComprobante(facturaFecha))}.` : ''}`
          : 'Queda en el libro fiscal del período, con su comprobante imprimible.'}
      </div>
      </div>
    </Modal>
    {dialogo}
    </>
  );
}

/* ═══════════════════ Parámetros fiscales ═══════════════════ */

export function ConfiguracionFiscalModal({ puedeEditar, onClose }: { puedeEditar: boolean; onClose: () => void }) {
  const [cfg, setCfg] = useState<ConfigRetencion>(CONFIG_RETENCION_DEFECTO);
  const [locales, setLocales] = useState<AlicuotasLocales>({ municipal: 0, estadal: 0 });
  const [conceptos, setConceptos] = useState<ConceptoRetencion[]>([]);
  const [tab, setTab] = useState<'agente' | 'catalogo'>('agente');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { marcarSucio, pedirCierre, dialogo } = useDescartar(onClose, saving);

  const recargar = useCallback(async () => {
    const [c, l, cs] = await Promise.all([getConfigRetencion(), getAlicuotasLocales(), listConceptos(false)]);
    setCfg(c); setLocales(l); setConceptos(cs);
  }, []);
  useEffect(() => {
    void recargar().catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron leer los parámetros.'));
  }, [recargar]);

  const set = <K extends keyof ConfigRetencion>(k: K, v: ConfigRetencion[K]) => setCfg((p) => ({ ...p, [k]: v }));
  const soloLectura = !puedeEditar;

  async function guardar() {
    setSaving(true); setError(null);
    try {
      await guardarConfigRetencion(cfg, locales);
      toast('Parámetros fiscales guardados', 'success');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setSaving(false);
    }
  }

  return (
    <>
    <Modal title="⚙ Parámetros fiscales" size="xl" onClose={pedirCierre}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={pedirCierre} disabled={saving}>Cerrar</button>
          {tab === 'agente' && puedeEditar && (
            <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          )}
        </>
      }>
      <div onChange={marcarSucio}>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
      {soloLectura && (
        <div className="hint muted" style={{ marginBottom: '.6rem', fontSize: '.82rem' }}>
          Para cambiar los parámetros fiscales hace falta permiso de escritura en Retenciones.
        </div>
      )}

      <div className="view-toggle" role="tablist" style={{ marginBottom: '.75rem' }}>
        <button className={tab === 'agente' ? 'active' : ''} onClick={() => setTab('agente')}>Datos de la empresa</button>
        <button className={tab === 'catalogo' ? 'active' : ''} onClick={() => setTab('catalogo')}>Catálogo de conceptos ({conceptos.length})</button>
      </div>

      {tab === 'agente' ? (
        <fieldset disabled={soloLectura} style={{ border: 0, padding: 0, margin: 0 }}>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <div className="form-row" style={{ flex: '1 1 220px' }}>
              <label>Razón social</label>
              <input className="input" value={cfg.razonSocial ?? ''} onChange={(e) => set('razonSocial', e.target.value)} />
            </div>
            <div className="form-row" style={{ flex: '1 1 150px' }}>
              <label>RIF</label>
              <input className="input mono" value={cfg.rif ?? ''} onChange={(e) => set('rif', e.target.value)} placeholder="J-XXXXXXXX-X" />
            </div>
          </div>
          <div className="form-row">
            <label>Dirección fiscal</label>
            <input className="input" value={cfg.direccionFiscal ?? ''} onChange={(e) => set('direccionFiscal', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <div className="form-row" style={{ flex: '1 1 180px' }}>
              <label>Municipio</label>
              <input className="input" value={cfg.municipio ?? ''} onChange={(e) => set('municipio', e.target.value)} />
              <small className="hint muted">Define qué ordenanza de ISAE aplica.</small>
            </div>
            <div className="form-row" style={{ flex: '1 1 140px' }}>
              <label>Alícuota municipal (ISAE, %)</label>
              <input className="input mono" value={String(locales.municipal)} onChange={(e) => setLocales((l) => ({ ...l, municipal: nDec(e.target.value) }))} inputMode="decimal" />
            </div>
            <div className="form-row" style={{ flex: '1 1 140px' }}>
              <label>Timbre fiscal estadal (%)</label>
              <input className="input mono" value={String(locales.estadal)} onChange={(e) => setLocales((l) => ({ ...l, estadal: nDec(e.target.value) }))} inputMode="decimal" />
            </div>
          </div>

          <div className="card" style={{ background: 'var(--bg-2)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontWeight: 600 }}>
              <input type="checkbox" checked={cfg.esAgenteRetencionIva} onChange={(e) => set('esAgenteRetencionIva', e.target.checked)} />
              La empresa está designada agente de retención de IVA
            </label>
            <p className="muted" style={{ margin: '.3rem 0 .6rem', fontSize: '.82rem' }}>
              Hoy está en <strong>{cfg.esAgenteRetencionIva ? 'sí' : 'no'}</strong>. Con la casilla marcada se calcula y se registra la retención de IVA que la empresa practica.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontWeight: 600 }}>
              <input type="checkbox" checked={cfg.esContribuyenteEspecial} onChange={(e) => set('esContribuyenteEspecial', e.target.checked)} />
              La empresa es contribuyente especial
            </label>
            <p className="muted" style={{ margin: '.3rem 0 .5rem', fontSize: '.82rem' }}>
              Hoy está en <strong>{cfg.esContribuyenteEspecial ? 'sí' : 'no'}</strong>. El contribuyente especial también retiene IVA y, además, percibe el IGTF.
            </p>
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
              <div className="form-row" style={{ flex: '1 1 140px', margin: 0 }}>
                <label>% general</label>
                <select className="select" value={cfg.pctIvaGeneral} onChange={(e) => set('pctIvaGeneral', Number(e.target.value))}>
                  {PORCENTAJES_IVA.map((p) => <option key={p} value={p}>{p}%</option>)}
                </select>
              </div>
              <div className="form-row" style={{ flex: '1 1 200px', margin: 0 }}>
                <label>% en los supuestos del art. 5</label>
                <select className="select" value={cfg.pctIvaEspecial} onChange={(e) => set('pctIvaEspecial', Number(e.target.value))}>
                  {PORCENTAJES_IVA.map((p) => <option key={p} value={p}>{p}%</option>)}
                </select>
              </div>
            </div>
            <small className="hint muted">La Providencia SNAT/2015/0049 solo admite 75% y 100%.</small>
          </div>

          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <div className="form-row" style={{ flex: '1 1 180px' }}>
              <label>Valor de la Unidad Tributaria (Bs)</label>
              <input className="input mono" value={String(cfg.valorUt)} onChange={(e) => set('valorUt', nDec(e.target.value))} inputMode="decimal" />
              <small className="hint muted">Define el <strong>sustraendo</strong> y el mínimo del ISLR de personas naturales. Sin esto, el sustraendo queda en cero.</small>
            </div>
            <div className="form-row" style={{ flex: '1 1 140px' }}>
              <label>% de IGTF</label>
              <input className="input mono" value={String(cfg.pctIgtf)} onChange={(e) => set('pctIgtf', nDec(e.target.value))} inputMode="decimal" />
              <small className="hint muted">3% vigente; la ley admite entre 2% y 8%.</small>
            </div>
          </div>
        </fieldset>
      ) : (
        <CatalogoConceptos conceptos={conceptos} puedeEditar={puedeEditar} onCambio={() => void recargar().catch(() => { /* se reintenta */ })} />
      )}
      </div>
    </Modal>
    {dialogo}
    </>
  );
}

function CatalogoConceptos({ conceptos, puedeEditar, onCambio }: {
  conceptos: ConceptoRetencion[]; puedeEditar: boolean; onCambio: () => void;
}) {
  const [edit, setEdit] = useState<ConceptoRetencion | null>(null);
  const [pct, setPct] = useState('');
  const [busca, setBusca] = useState('');
  const visiblesCat = conceptos.filter((c) => buscaEn(busca, c.codigo, c.nombre, labelSujeto(c.sujeto),
    TIPOS_IMPUESTO.find((t) => t.key === c.tipo)?.corto));

  async function guardarPct(c: ConceptoRetencion) {
    try {
      await guardarConcepto({ ...c, porcentaje: nDec(pct) });
      toast(`«${c.nombre}» quedó en ${nDec(pct)}% para ${labelSujeto(c.sujeto).toLowerCase()}`, 'success');
      setEdit(null);
      onCambio();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
  }

  async function activar(c: ConceptoRetencion) {
    const hermanos = conceptos.filter((x) => x.tipo === 'islr' && x.codigo === c.codigo).length;
    if (c.activo && hermanos > 1
      && !window.confirm(`El código ${c.codigo} se desactiva entero: deja de ofrecerse para sus ${hermanos} sujetos. ¿Continuar?`)) return;
    try { await activarConcepto(c.id, !c.activo); onCambio(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }

  return (
    <>
      <p className="hint muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
        Los conceptos de <strong>ISLR</strong> vienen del <strong>Decreto 1.808</strong>, un porcentaje por sujeto. El
        <strong> ISAE</strong> y el <strong>timbre estadal</strong> salen de la ordenanza del municipio y de la ley del estado:
        su alícuota se cambia en «Datos de la empresa».
      </p>
      <div className="lf-campo-q" style={{ marginBottom: '.5rem', maxWidth: 360 }}>
        <input type="search" className="input" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar en el catálogo: código, concepto o sujeto" aria-label="Buscar en el catálogo" />
        {busca && <button type="button" className="lf-limpiar" aria-label="Limpiar la búsqueda" onClick={() => setBusca('')}>×</button>}
      </div>
      <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead>
            <tr><th>Tipo</th><th>Concepto</th><th>Sujeto</th><th style={{ textAlign: 'right' }}>%</th><th>Nota</th><th></th></tr>
          </thead>
          <tbody>
            {!visiblesCat.length && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: '.6rem' }}>Ningún concepto coincide con la búsqueda</td></tr>
            )}
            {visiblesCat.map((c) => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
                <td><span className="badge">{TIPOS_IMPUESTO.find((t) => t.key === c.tipo)?.corto ?? c.tipo}</span></td>
                <td>{c.codigo ? <span className="muted mono">{c.codigo} · </span> : null}{c.nombre}
                  {c.aplicaSustraendo && <div className="muted" style={{ fontSize: '.7rem' }}>con sustraendo · mínimo {c.baseMinimaUt} UT</div>}
                  {c.basePct !== 100 && <div className="muted" style={{ fontSize: '.7rem' }}>base: {c.basePct}% del pago</div>}
                </td>
                <td className="muted" style={{ fontSize: '.76rem' }}>{labelSujeto(c.sujeto)}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                  {edit?.id === c.id ? (
                    <input className="input mono" style={{ width: 80 }} value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" autoFocus />
                  ) : `${c.porcentaje}%`}
                </td>
                <td className="muted" style={{ fontSize: '.72rem' }}>{c.fundamento ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {puedeEditar && c.tipo === 'islr' && (edit?.id === c.id ? (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => void guardarPct(c)}>✓</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEdit(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEdit(c); setPct(String(c.porcentaje)); }} title="Cambiar el porcentaje">✎</button>
                      <button className="btn btn-sm btn-ghost" title={c.activo ? 'Desactivar el código' : 'Activar el código'}
                        onClick={() => void activar(c)}>{c.activo ? '🚫' : '✓'}</button>
                    </>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
