import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { SearchCreateSelect } from '@/shared/ui/SearchSelect';
import { getNombresAlmacenes, crearAlmacen } from '@/modules/inventario/almacenes.repository';
import { tasaActualAcopio } from '@/modules/acopio/caja.repository';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import {
  listRecepciones, crearRecepcion, actualizarRecepcion, eliminarRecepcion,
  listAnalisis, crearAnalisis, actualizarAnalisisRow, eliminarAnalisis,
  listMinerales, addMineral, updateMineral, setMineralActivo,
  promElemento, promedioLote, nLecturas, LETRAS_LECTURA, labelLectura,
  listHumedadProv, crearHumedadProv, actualizarHumedadProv, eliminarHumedadProv,
  pctHumedadProv, mermaH2OProv, promedioHumedadProv,
  listHumedadFinal, crearHumedadFinal, actualizarHumedadFinal, eliminarHumedadFinal, mermaH2OFinal, pctHumedadFinal,
  listBigbags, crearBigbag, actualizarBigbag, eliminarBigbag, totalesBigbags,
  TARA_TIPO, TIPO_LABEL, TIPO_SINGULAR, tipoValido, type TipoPesaje,
  guardarPesada, listPesadas, recomputarPesada, actualizarPesada, eliminarPesada,
  listConciliaciones, crearConciliacion, actualizarConciliacion, eliminarConciliacion, calcConciliacion,
  listTotales, crearTotales, actualizarTotales, eliminarTotales, calcTotales,
  listCierres, cerrarRecepcion, eliminarCierre,
  type RecepcionLab, type AnalisisRow, type AnalisisElemento, type AnalisisLab, type MineralLab,
  type HumedadProvRow, type HumedadFinalRow, type BigbagRow, type PesadaRow,
  type Conciliacion, type ConciliacionCentro, type TotalesDoc, type TotalCentro,
  type CierreRecepcion,
} from './recepciones.repository';

/** ISO → valor de <input type="datetime-local"> (hora local). */
function isoToLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}
/** Valor de <input datetime-local> → ISO. */
function localToIso(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('es-VE', { maximumFractionDigits: 2 }));
/** Ley del mineral en porcentaje (2 decimales). */
const fmtPct = (n: number | null | undefined) =>
  (n == null ? '—' : `${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`);
/** Humedad en porcentaje (2 decimales). */
const fmtH = (n: number | null | undefined) =>
  (n == null ? '—' : `${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);


export function RecepcionesPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('recepciones', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [filas, setFilas] = useState<RecepcionLab[]>([]);       // tabla de arriba (kg por cierre)
  const [analisis, setAnalisis] = useState<AnalisisRow[]>([]);  // tabla de abajo (análisis químicos)
  const [minerales, setMinerales] = useState<MineralLab[]>([]);
  const [humProv, setHumProv] = useState<HumedadProvRow[]>([]); // humedad provisional
  const [humFin, setHumFin] = useState<HumedadFinalRow[]>([]);  // humedad final
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [anadiendo, setAnadiendo] = useState(false);
  const [guardandoLab, setGuardandoLab] = useState(false);
  const [addProv, setAddProv] = useState(false);
  const [addFin, setAddFin] = useState(false);
  const [aBorrar, setABorrar] = useState<RecepcionLab | null>(null);
  const [anaBorrar, setAnaBorrar] = useState<AnalisisRow | null>(null);
  const [provBorrar, setProvBorrar] = useState<HumedadProvRow | null>(null);
  const [finBorrar, setFinBorrar] = useState<HumedadFinalRow | null>(null);
  const [config, setConfig] = useState(false);
  const [pesos, setPesos] = useState(false);
  const [seccion, setSeccion] = useState<'resumenes' | null>(null);
  const [concilOpen, setConcilOpen] = useState(false);
  const [totalesOpen, setTotalesOpen] = useState(false);
  const [cierresOpen, setCierresOpen] = useState(false);
  // Tasa actual del centro de acopio (fallback para Totales cuando la recepción no la trae).
  const [tasaAcopioLive, setTasaAcopioLive] = useState(0);
  useEffect(() => { tasaActualAcopio().then(setTasaAcopioLive).catch(() => setTasaAcopioLive(0)); }, []);

  // Espejo del análisis para leer el estado vigente desde onBlur sin closures viejos.
  const analisisRef = useRef<AnalisisRow[]>([]);
  analisisRef.current = analisis;

  const reload = useCallback(async () => {
    try {
      const [recs, anas, mins, hp, hf] = await Promise.all([
        listRecepciones(), listAnalisis(), listMinerales(true), listHumedadProv(), listHumedadFinal(),
      ]);
      setFilas(recs); setAnalisis(anas); setMinerales(mins); setHumProv(hp); setHumFin(hf);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar las recepciones', 'error'); }
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reload().finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);

  useRealtime(['recepciones_lab', 'recepciones_analisis', 'recepciones_minerales', 'recepciones_humedad_prov', 'recepciones_humedad_final'], () => { void reload(); });

  /* ── Tabla de arriba: recepciones (kg) ── */
  async function guardarCampo(id: string, patch: Parameters<typeof actualizarRecepcion>[1]) {
    try { await actualizarRecepcion(id, patch); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); void reload(); }
  }
  async function nueva() {
    setCreando(true);
    try { await crearRecepcion({ actor, actorName }); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo crear la recepción', 'error'); }
    finally { setCreando(false); }
  }
  async function borrar(f: RecepcionLab) {
    try { await eliminarRecepcion(f.id); setFilas((prev) => prev.filter((x) => x.id !== f.id)); toast('Recepción eliminada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setABorrar(null); }
  }

  /* ── Tabla de abajo: análisis químicos (independiente) ── */
  function setCeldaAbc(id: string, key: string, sub: string, value: string) {
    setAnalisis((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const prevEl = (r.analisis?.[key] && typeof r.analisis[key] === 'object') ? r.analisis[key] as AnalisisElemento : {};
      const el: AnalisisElemento = { ...prevEl, [sub]: value === '' ? null : Number(value) };
      return { ...r, analisis: { ...r.analisis, [key]: el } };
    }));
  }
  function setCeldaUnica(id: string, key: string, value: string) {
    setAnalisis((prev) => prev.map((r) => (r.id === id ? { ...r, analisis: { ...r.analisis, [key]: value === '' ? null : Number(value) } } : r)));
  }
  async function guardarAnalisis(id: string) {
    const row = analisisRef.current.find((r) => r.id === id);
    if (!row) return;
    try { await actualizarAnalisisRow(id, { analisis: row.analisis }); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar el análisis', 'error'); void reload(); }
  }
  // Guarda de una vez TODOS los análisis cargados (sin borrar lo recién ingresado).
  async function guardarTodoLab() {
    setGuardandoLab(true);
    try {
      for (const row of analisisRef.current) await actualizarAnalisisRow(row.id, { analisis: row.analisis });
      toast('Datos de laboratorio guardados', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron guardar los datos', 'error'); void reload(); }
    finally { setGuardandoLab(false); }
  }
  async function nuevoAnalisis() {
    setAnadiendo(true);
    try { await crearAnalisis({ actor, actorName }); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo añadir el análisis', 'error'); }
    finally { setAnadiendo(false); }
  }
  async function borrarAnalisis(r: AnalisisRow) {
    try { await eliminarAnalisis(r.id); setAnalisis((prev) => prev.filter((x) => x.id !== r.id)); toast('Análisis eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setAnaBorrar(null); }
  }

  /* ── Humedad Provisional ── */
  async function nuevaProv() {
    setAddProv(true);
    try { await crearHumedadProv({ actor, actorName }); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar la fila', 'error'); }
    finally { setAddProv(false); }
  }
  async function guardarProv(id: string, patch: Parameters<typeof actualizarHumedadProv>[1]) {
    try { await actualizarHumedadProv(id, patch); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); void reload(); }
  }
  async function borrarProv(r: HumedadProvRow) {
    try { await eliminarHumedadProv(r.id); setHumProv((prev) => prev.filter((x) => x.id !== r.id)); toast('Fila eliminada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setProvBorrar(null); }
  }

  /* ── Humedad Final ── */
  async function nuevaFin() {
    setAddFin(true);
    try { await crearHumedadFinal({ actor, actorName }); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar la fila', 'error'); }
    finally { setAddFin(false); }
  }
  async function guardarFin(id: string, patch: Parameters<typeof actualizarHumedadFinal>[1]) {
    try { await actualizarHumedadFinal(id, patch); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); void reload(); }
  }
  async function borrarFin(r: HumedadFinalRow) {
    try { await eliminarHumedadFinal(r.id); setHumFin((prev) => prev.filter((x) => x.id !== r.id)); toast('Fila eliminada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setFinBorrar(null); }
  }

  const pesoTotal = filas.reduce((a, f) => a + (Number(f.peso_kg) || 0), 0);
  // Tasa del centro de acopio para los Totales: la guardada en el cierre (recepción) o,
  // si no hay (recepciones previas a la columna), la tasa ACTUAL del acopio en vivo.
  const tasaRecep = [...filas].reverse().find((f) => f.tasa != null)?.tasa ?? null;
  const cajaTasa = tasaRecep ?? tasaAcopioLive;

  // Humedad provisional: promedio del lote (%) y merma total (suma).
  const provPctLote = promedioHumedadProv(humProv);
  const provMermaTotal = humProv.reduce((a, r) => a + (mermaH2OProv(r) ?? 0), 0);
  // Humedad final: Merma = Peso KG (recepciones) − Peso recogido; % Humedad final = Merma / Peso KG × 100.
  const finRecogidoTotal = humFin.reduce((a, r) => a + (Number(r.peso_recogido) || 0), 0);
  const finMermaTotal = humFin.reduce((a, r) => a + (mermaH2OFinal(pesoTotal, r.peso_recogido) ?? 0), 0);
  const finPcts = humFin.map((r) => pctHumedadFinal(pesoTotal, r.peso_recogido)).filter((x): x is number => x != null);
  const finPctLote = finPcts.length ? finPcts.reduce((a, b) => a + b, 0) / finPcts.length : null;

  /**
   * Renderiza UN mineral como bloque vertical (tipo columna): título arriba y, debajo,
   * una mini-tabla con una fila por N° Análisis y las casillas A, B, C, D… (las que tenga
   * configuradas) + Prom. (= promedio de las casillas con dato). Pie con Promedio del lote.
   */
  function mineralBlock(m: MineralLab) {
    const abc = m.columnas === 'abc';
    const n = nLecturas(m);
    const letras = LETRAS_LECTURA.slice(0, n);
    const pl = promedioLote(analisis, m.clave, abc, n);
    return (
      <div key={m.id} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '.6rem', borderTop: `3px solid ${m.color || '#888'}` }}>
        <div style={{ fontWeight: 700, textAlign: 'center', padding: '.4rem .6rem', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
          {m.nombre}{m.subtitulo ? <div className="muted" style={{ fontSize: '.66rem', fontWeight: 600 }}>{m.subtitulo}</div> : null}
        </div>
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th>N°</th>
                {abc && letras.map((L, i) => <th key={L} className="num">{labelLectura(i)}</th>)}
                <th className="num">Prom.</th>
              </tr>
            </thead>
            <tbody>
              {!analisis.length && (
                <tr><td colSpan={abc ? n + 2 : 2} className="muted" style={{ textAlign: 'center' }}>Sin análisis.</td></tr>
              )}
              {analisis.map((r) => {
                const prom = promElemento(r.analisis, m.clave, abc, n);
                const el = (r.analisis?.[m.clave] && typeof r.analisis[m.clave] === 'object') ? r.analisis[m.clave] as AnalisisElemento : {};
                const valUnica = (typeof r.analisis?.[m.clave] === 'number') ? r.analisis[m.clave] as number : '';
                return (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontWeight: 700 }}>{r.n_analisis ?? '—'}</td>
                    {abc
                      ? letras.map((L) => (
                          <td key={L} className="num">
                            <input className="input mono" type="number" step="any" value={(el[L] ?? '') as number | ''} disabled={!canWrite}
                              onChange={(ev) => setCeldaAbc(r.id, m.clave, L, ev.target.value)} onBlur={() => void guardarAnalisis(r.id)}
                              style={{ width: '100%', minWidth: 96, textAlign: 'right' }} />
                          </td>
                        ))
                      : (
                          <td className="num">
                            <input className="input mono" type="number" step="any" value={valUnica ?? ''} disabled={!canWrite}
                              onChange={(ev) => setCeldaUnica(r.id, m.clave, ev.target.value)} onBlur={() => void guardarAnalisis(r.id)}
                              style={{ width: '100%', minWidth: 110, textAlign: 'right' }} />
                          </td>
                        )}
                    {abc && <td className="mono" style={{ fontWeight: 800, color: 'var(--primary-3)', textAlign: 'center' }}>{prom == null ? '—' : fmtPct(prom)}</td>}
                  </tr>
                );
              })}
            </tbody>
            {analisis.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={abc ? n + 2 : 2} style={{ textAlign: 'center' }}>
                    Promedio del lote <span className="mono" style={{ color: 'var(--primary-3)', marginLeft: '.35rem' }}>{pl == null ? '—' : fmtPct(pl)}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  }

  /** Barra superior: gestiona los N° de análisis (editar el número y eliminar la fila). */
  function barraAnalisis() {
    return (
      <div className="card" style={{ padding: '.5rem .75rem', marginBottom: '.6rem' }}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '.78rem', fontWeight: 700 }}>Análisis cargados:</span>
          {!analisis.length && <span className="muted" style={{ fontSize: '.78rem' }}>Ninguno. Usá «＋ Añadir valores».</span>}
          {analisis.map((r) => (
            <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', border: '1px solid var(--border, #2a2f3a)', borderRadius: 8, padding: '.1rem .35rem' }}>
              <span className="muted" style={{ fontSize: '.72rem' }}>N°</span>
              <input className="input mono" type="number" min={1} defaultValue={r.n_analisis ?? ''} disabled={!canWrite}
                onBlur={(e) => { const raw = e.target.value; const v = raw === '' ? null : Math.max(1, Math.round(Number(raw) || 1)); if (v !== r.n_analisis) void actualizarAnalisisRow(r.id, { n_analisis: v }).catch(() => void reload()); }}
                style={{ width: 56, textAlign: 'right' }} />
              {canWrite && <button className="btn btn-sm btn-ghost" title="Eliminar este análisis" onClick={() => setAnaBorrar(r)}>🗑</button>}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // La tabla del laboratorio se muestra EN COLUMNA (cada mineral apilado uno bajo otro),
  // 5 de un lado y 5 del otro, para ver mejor los resultados sin scroll horizontal.
  const mitad = Math.ceil(minerales.length / 2);
  const colIzq = minerales.slice(0, mitad);
  const colDer = minerales.slice(mitad);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>📋 Recepciones</h1>
          <p className="muted" style={{ margin: '.2rem 0 0', fontSize: '.85rem' }}>
            Cada cierre de caja del Centro de Acopio genera una recepción con el saldo de KG de casiterita.
            El laboratorio carga aparte el análisis químico. <strong>No entra al inventario al cerrar la caja.</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setPesos(true)} title="Pesos de bigbags (húmedos y secos)">
            ⚖ Añadir pesos
          </button>
          {canWrite && (
            <button className="btn btn-primary" onClick={() => void nueva()} disabled={creando}>
              {creando ? 'Creando…' : '＋ Nueva recepción'}
            </button>
          )}
        </div>
      </div>

      {/* Secciones (a definir): Conciliación · Totales · Resúmenes */}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {([
          { key: 'conciliacion', label: '🔗 Conciliación' },
          { key: 'totales', label: '🧮 Totales' },
          { key: 'resumenes', label: '📊 Resúmenes' },
        ] as const).map((b) => (
          <button key={b.key} className="btn btn-primary"
            style={(b.key !== 'conciliacion' && seccion === b.key) ? { filter: 'brightness(0.82)' } : undefined}
            onClick={() => { if (b.key === 'conciliacion') setConcilOpen(true); else if (b.key === 'totales') setTotalesOpen(true); else setSeccion(seccion === b.key ? null : (b.key as 'resumenes')); }}>
            {b.label}
          </button>
        ))}
        <button className="btn" style={{ background: '#334155', color: '#fff', border: 'none' }} onClick={() => setCierresOpen(true)} title="Cerrar la recepción y guardar todo en el histórico">
          🔒 Cerrar recepción
        </button>
      </div>

      {seccion === 'resumenes' && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <EmptyState message="Sección «Resúmenes» — pendiente de definir." icon="🚧" />
        </div>
      )}

      {concilOpen && <ConciliacionModal canWrite={canWrite} actor={actor} actorName={actorName} pesoTotal={pesoTotal} pesoRecogidoFinal={finRecogidoTotal} onClose={() => setConcilOpen(false)} />}
      {totalesOpen && <TotalesModal canWrite={canWrite} actor={actor} actorName={actorName} pesoTotal={pesoTotal} cajaTasa={cajaTasa} onClose={() => setTotalesOpen(false)} />}
      {cierresOpen && <CierresModal canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setCierresOpen(false)} />}

      {loading ? (
        <EmptyState message="Cargando recepciones…" icon="◔" />
      ) : (
        <>
          {/* ───────── Tabla 1: Recepciones (kg) ───────── */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
            <div className="card-title" style={{ padding: '.6rem .85rem' }}>
              <span>Recepciones</span>
              <span className="muted mono">{num(filas.length)} recepción(es)</span>
            </div>
            {!filas.length ? (
              <EmptyState message="Aún no hay recepciones. Se crean al cerrar la caja del Centro de Acopio, o con «Nueva recepción»." icon="📋" />
            ) : (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ fontSize: '.85rem' }}>
                <thead>
                  <tr>
                    <th>Ítem</th><th>Fecha y hora</th><th className="num">Peso KG</th><th>Procedencia</th>{canWrite && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id}>
                      <td className="num">
                        <input className="input mono" type="number" min={1} defaultValue={f.item} disabled={!canWrite}
                          onBlur={(e) => { const v = Math.max(1, Math.round(Number(e.target.value) || 1)); if (v !== f.item) void guardarCampo(f.id, { item: v }); }}
                          style={{ width: 64, textAlign: 'right' }} />
                      </td>
                      <td>
                        <input className="input" type="datetime-local" defaultValue={isoToLocal(f.fecha_hora)} disabled={!canWrite}
                          onBlur={(e) => { if (e.target.value) void guardarCampo(f.id, { fecha_hora: localToIso(e.target.value) }); }}
                          style={{ width: 200 }} />
                      </td>
                      <td className="num">
                        <input className="input mono" type="number" min={0} step="any" defaultValue={f.peso_kg} disabled={!canWrite}
                          onBlur={(e) => { const v = Math.round(Math.max(0, Number(e.target.value) || 0) * 100) / 100; if (v !== Number(e.target.value)) e.target.value = String(v); if (v !== Number(f.peso_kg)) void guardarCampo(f.id, { peso_kg: v }); }}
                          style={{ width: 180, minWidth: 160, textAlign: 'right' }} />
                      </td>
                      <td>
                        <input className="input" defaultValue={f.procedencia} disabled={!canWrite}
                          onBlur={(e) => { const v = e.target.value.trim() || 'PERAMANAL'; if (v !== f.procedencia) void guardarCampo(f.id, { procedencia: v }); }}
                          style={{ width: 200 }} />
                      </td>
                      {canWrite && <td><button className="btn btn-sm btn-ghost" title="Eliminar recepción" onClick={() => setABorrar(f)}>🗑</button></td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2} style={{ textAlign: 'right' }}>Total</td>
                    <td className="num mono">{fmt(pesoTotal)}</td>
                    <td colSpan={canWrite ? 2 : 1}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            )}
          </div>

          {/* ───────── Tabla 2: RECEPCIÓN GLOBAL LABORATORIO (análisis químicos, independientes) ───────── */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', padding: '.55rem .85rem', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
              <div style={{ minWidth: 150 }}>
                {canWrite && (
                  <button className="btn btn-sm btn-ghost" onClick={() => setConfig(true)} title="Agregar, editar u ocultar los minerales (columnas) del análisis">
                    ⚙ Configurar minerales
                  </button>
                )}
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontWeight: 700, letterSpacing: '.04em' }}>RECEPCIÓN GLOBAL LABORATORIO</div>
                <div className="muted" style={{ fontSize: '.72rem' }}>Todos los valores de minerales son leyes en porcentaje (%)</div>
              </div>
              <div style={{ minWidth: 150, textAlign: 'right', display: 'flex', gap: '.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {canWrite && analisis.length > 0 && (
                  <button className="btn btn-sm btn-ghost" onClick={() => void guardarTodoLab()} disabled={guardandoLab}
                    title="Guardar todos los datos de laboratorio cargados">
                    {guardandoLab ? 'Guardando…' : '💾 Guardar datos'}
                  </button>
                )}
                {canWrite && (
                  <button className="btn btn-sm btn-primary" onClick={() => void nuevoAnalisis()} disabled={anadiendo}
                    title="Agregar una fila nueva de análisis químico (no afecta la tabla de recepciones)">
                    {anadiendo ? 'Añadiendo…' : '＋ Añadir valores'}
                  </button>
                )}
              </div>
            </div>

            {!minerales.length ? (
              <EmptyState message="No hay minerales configurados. Usá «Configurar minerales» para agregarlos." icon="⚗" />
            ) : (
              <div style={{ padding: '.6rem .75rem' }}>
                {barraAnalisis()}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 360px', minWidth: 300 }}>{colIzq.map(mineralBlock)}</div>
                  <div style={{ flex: '1 1 360px', minWidth: 300 }}>{colDer.map(mineralBlock)}</div>
                </div>
              </div>
            )}

            <div className="muted" style={{ fontSize: '.74rem', padding: '.5rem .75rem' }}>
              Prom. = promedio de las casillas con dato (si cargás 2 lecturas, divide entre 2). Promedio del lote = promedio de los Prom. de todos los análisis con valor.
              Esta tabla es <strong>independiente</strong> de la de recepciones: «＋ Añadir valores» agrega solo análisis químicos.
              Cada mineral se muestra en columna (uno bajo otro), 5 de un lado y 5 del otro. El N° de lecturas (A, B, C, D…) se ajusta por mineral en «⚙ Configurar minerales». Los cambios se guardan al salir de cada celda (tiempo real) o con «💾 Guardar datos».
            </div>
          </div>

          {/* ───────── Humedad: Provisional y Final (una al lado de la otra) ───────── */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1.25rem', alignItems: 'flex-start' }}>
            {/* Humedad Provisional */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', flex: '1 1 460px', minWidth: 360 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', padding: '.55rem .85rem', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                <span style={{ fontWeight: 700, letterSpacing: '.03em' }}>Humedad Provisional</span>
                {canWrite && (
                  <button className="btn btn-sm btn-primary" onClick={() => void nuevaProv()} disabled={addProv}
                    title="Agregar una fila a Humedad Provisional">
                    {addProv ? 'Añadiendo…' : '＋ Humedad Provisional'}
                  </button>
                )}
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th className="num">Peso (Gr) Húmedos</th>
                      <th className="num">Peso (Gr) seco</th>
                      <th className="num">% Humedad</th>
                      <th className="num">Merma peso H2O</th>
                      {canWrite && <th style={{ width: 34 }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {!humProv.length && (
                      <tr><td colSpan={canWrite ? 5 : 4} className="muted" style={{ textAlign: 'center' }}>
                        Sin filas. Usá «＋ Humedad Provisional».
                      </td></tr>
                    )}
                    {humProv.map((r) => {
                      const pct = pctHumedadProv(r);
                      const merma = mermaH2OProv(r);
                      return (
                        <tr key={r.id}>
                          <td className="num">
                            <input className="input mono" type="number" min={0} step="any" defaultValue={r.peso_humedo ?? ''} disabled={!canWrite}
                              onBlur={(e) => { const v = e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0); if (v !== r.peso_humedo) void guardarProv(r.id, { peso_humedo: v }); }}
                              style={{ width: 110, textAlign: 'right' }} />
                          </td>
                          <td className="num">
                            <input className="input mono" type="number" min={0} step="any" defaultValue={r.peso_seco ?? ''} disabled={!canWrite}
                              onBlur={(e) => { const v = e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0); if (v !== r.peso_seco) void guardarProv(r.id, { peso_seco: v }); }}
                              style={{ width: 110, textAlign: 'right' }} />
                          </td>
                          <td className="num mono" style={{ fontWeight: 700, color: 'var(--primary-3)' }}>{fmtH(pct)}</td>
                          <td className="num mono">{merma == null ? '—' : fmt(merma)}</td>
                          {canWrite && <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-ghost" title="Eliminar fila" onClick={() => setProvBorrar(r)}>🗑</button></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                  {humProv.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: 700 }}>
                        <td colSpan={2} style={{ textAlign: 'right' }}>Promedio del lote</td>
                        <td className="num mono" style={{ fontWeight: 800 }}>{fmtH(provPctLote)}</td>
                        <td className="num mono" style={{ fontWeight: 800 }}>{fmt(provMermaTotal)}</td>
                        {canWrite && <td></td>}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Humedad Final */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', flex: '1 1 380px', minWidth: 320 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', padding: '.55rem .85rem', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                <span style={{ fontWeight: 700, letterSpacing: '.03em' }}>Humedad Final</span>
                {canWrite && (
                  <button className="btn btn-sm btn-primary" onClick={() => void nuevaFin()} disabled={addFin}
                    title="Agregar una fila a Humedad Final">
                    {addFin ? 'Añadiendo…' : '＋ Humedad Final'}
                  </button>
                )}
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th className="num">Peso (Kg) recogido</th>
                      <th className="num">Merma peso H2O</th>
                      <th className="num">% Humedad final</th>
                      {canWrite && <th style={{ width: 34 }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {!humFin.length && (
                      <tr><td colSpan={canWrite ? 4 : 3} className="muted" style={{ textAlign: 'center' }}>
                        Sin filas. Usá «＋ Humedad Final».
                      </td></tr>
                    )}
                    {humFin.map((r) => {
                      const merma = mermaH2OFinal(pesoTotal, r.peso_recogido);
                      const pct = pctHumedadFinal(pesoTotal, r.peso_recogido);
                      return (
                        <tr key={r.id}>
                          <td className="num">
                            <input className="input mono" type="number" min={0} step="any" defaultValue={r.peso_recogido ?? ''} disabled={!canWrite}
                              onBlur={(e) => { const v = e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0); if (v !== r.peso_recogido) void guardarFin(r.id, { peso_recogido: v }); }}
                              style={{ width: 120, textAlign: 'right' }} />
                          </td>
                          <td className="num mono">{merma == null ? '—' : fmt(merma)}</td>
                          <td className="num mono" style={{ fontWeight: 700, color: 'var(--primary-3)' }}>{fmtH(pct)}</td>
                          {canWrite && <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-ghost" title="Eliminar fila" onClick={() => setFinBorrar(r)}>🗑</button></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                  {humFin.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: 700 }}>
                        <td className="num mono" style={{ fontWeight: 800 }}>{fmt(finRecogidoTotal)}</td>
                        <td className="num mono" style={{ fontWeight: 800 }}>{fmt(finMermaTotal)}</td>
                        <td className="num mono" style={{ fontWeight: 800 }}>{fmtH(finPctLote)}</td>
                        {canWrite && <td></td>}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div className="muted" style={{ fontSize: '.72rem', padding: '.5rem .75rem' }}>
Merma peso H2O = Peso KG (recepciones) − Peso recogido ·
                <strong>% Humedad final</strong> = Merma peso H2O / Peso KG × 100.
              </div>
            </div>
          </div>
        </>
      )}

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar recepción"
          message={`¿Eliminar la recepción Ítem ${aBorrar.item} (${fmt(Number(aBorrar.peso_kg))} kg)?`}
          confirmText="Eliminar" danger
          onConfirm={() => void borrar(aBorrar)} onCancel={() => setABorrar(null)}
        />
      )}
      {anaBorrar && (
        <ConfirmDialog
          title="Eliminar análisis químico"
          message={`¿Eliminar el análisis N° ${anaBorrar.n_analisis ?? '—'}? Se borran sus leyes por elemento.`}
          confirmText="Eliminar" danger
          onConfirm={() => void borrarAnalisis(anaBorrar)} onCancel={() => setAnaBorrar(null)}
        />
      )}

      {provBorrar && (
        <ConfirmDialog
          title="Eliminar fila de Humedad Provisional"
          message="¿Eliminar esta fila de humedad provisional?"
          confirmText="Eliminar" danger
          onConfirm={() => void borrarProv(provBorrar)} onCancel={() => setProvBorrar(null)}
        />
      )}
      {finBorrar && (
        <ConfirmDialog
          title="Eliminar fila de Humedad Final"
          message="¿Eliminar esta fila de humedad final?"
          confirmText="Eliminar" danger
          onConfirm={() => void borrarFin(finBorrar)} onCancel={() => setFinBorrar(null)}
        />
      )}

      {config && <ConfigMineralesModal onClose={() => setConfig(false)} onChanged={reload} />}
      {pesos && <PesosBigbagsModal canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setPesos(false)} />}
    </div>
  );
}

/* ───────────── Modal: Configurar minerales (columnas del laboratorio) ───────────── */
function ConfigMineralesModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void | Promise<void> }) {
  const [minerales, setMinerales] = useState<MineralLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [columnas, setColumnas] = useState<'abc' | 'prom'>('abc');
  const [nLect, setNLect] = useState(3);
  const [color, setColor] = useState('#6db8ff');
  const [edit, setEdit] = useState<{ nombre: string; subtitulo: string; columnas: 'abc' | 'prom'; nLecturas: number; color: string }>({ nombre: '', subtitulo: '', columnas: 'abc', nLecturas: 3, color: '#6db8ff' });

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setMinerales(await listMinerales(false)); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar los minerales', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function agregar() {
    if (!nombre.trim()) { toast('Indicá el nombre del mineral.', 'error'); return; }
    setSaving(true);
    try {
      await addMineral({ nombre, subtitulo, columnas, n_lecturas: nLect, color });
      setNombre(''); setSubtitulo(''); setColumnas('abc'); setNLect(3); setColor('#6db8ff');
      await cargar(); await onChanged();
      toast('Mineral agregado', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
    finally { setSaving(false); }
  }
  function abrirEdicion(m: MineralLab) {
    setEditId(m.id);
    setEdit({ nombre: m.nombre, subtitulo: m.subtitulo ?? '', columnas: m.columnas, nLecturas: nLecturas(m), color: m.color });
  }
  async function guardarEdicion(id: string) {
    setSaving(true);
    try {
      await updateMineral(id, { nombre: edit.nombre, subtitulo: edit.subtitulo, columnas: edit.columnas, n_lecturas: edit.nLecturas, color: edit.color });
      setEditId(null); await cargar(); await onChanged();
      toast('Mineral actualizado', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setSaving(false); }
  }
  async function toggleActivo(m: MineralLab) {
    try { await setMineralActivo(m.id, !m.activo); await cargar(); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }

  return (
    <Modal title="⚙ Configurar minerales" size="xl" onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title" style={{ marginBottom: '.5rem' }}><span>Nuevo mineral</span></div>
        <div className="form-grid">
          <div className="form-row">
            <label>Nombre</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cu (Cobre)" />
          </div>
          <div className="form-row">
            <label>Subtítulo (opcional)</label>
            <input className="input" value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} placeholder="Laboratorio…" />
          </div>
          <div className="form-row">
            <label>Columnas</label>
            <select className="select" value={columnas} onChange={(e) => setColumnas(e.target.value as 'abc' | 'prom')}>
              <option value="abc">A / B / C / … / Prom.</option>
              <option value="prom">Solo Prom.</option>
            </select>
          </div>
          {columnas === 'abc' && (
            <div className="form-row">
              <label>N° de lecturas (A, B, C, D…)</label>
              <input className="input mono" type="number" min={1} max={8} value={nLect}
                onChange={(e) => setNLect(Math.min(8, Math.max(1, Math.round(Number(e.target.value) || 1))))} />
              <small className="muted">Cantidad de casillas por análisis: {LETRAS_LECTURA.slice(0, nLect).map((_, i) => labelLectura(i)).join(' · ')}</small>
            </div>
          )}
          <div className="form-row">
            <label>Color</label>
            <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 38, padding: 2 }} />
          </div>
        </div>
        <div style={{ marginTop: '.5rem' }}>
          <button className="btn btn-primary" onClick={() => void agregar()} disabled={saving}>＋ Agregar mineral</button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead>
              <tr><th>Orden</th><th>Mineral</th><th>Columnas</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {minerales.map((m) => (
                editId === m.id ? (
                  <tr key={m.id}>
                    <td className="mono">{m.orden}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input className="input" value={edit.nombre} onChange={(e) => setEdit((p) => ({ ...p, nombre: e.target.value }))} style={{ width: 160 }} placeholder="Nombre" />
                        <input className="input" value={edit.subtitulo} onChange={(e) => setEdit((p) => ({ ...p, subtitulo: e.target.value }))} style={{ width: 160 }} placeholder="Subtítulo" />
                        <input className="input" type="color" value={edit.color} onChange={(e) => setEdit((p) => ({ ...p, color: e.target.value }))} style={{ width: 44, height: 34, padding: 2 }} />
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select className="select" value={edit.columnas} onChange={(e) => setEdit((p) => ({ ...p, columnas: e.target.value as 'abc' | 'prom' }))}>
                          <option value="abc">A/B/C/…/Prom.</option>
                          <option value="prom">Solo Prom.</option>
                        </select>
                        {edit.columnas === 'abc' && (
                          <input className="input mono" type="number" min={1} max={8} value={edit.nLecturas} title="N° de lecturas"
                            onChange={(e) => setEdit((p) => ({ ...p, nLecturas: Math.min(8, Math.max(1, Math.round(Number(e.target.value) || 1))) }))} style={{ width: 64 }} />
                        )}
                      </div>
                    </td>
                    <td><span className={`badge ${m.activo ? 'success' : ''}`}>{m.activo ? 'Activo' : 'Oculto'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => void guardarEdicion(m.id)} disabled={saving}>Guardar</button>{' '}
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)} disabled={saving}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} style={{ opacity: m.activo ? 1 : 0.55 }}>
                    <td className="mono">{m.orden}</td>
                    <td>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: m.color, marginRight: '.4rem', verticalAlign: 'middle' }} />
                      <strong>{m.nombre}</strong>{m.subtitulo ? <span className="muted"> · {m.subtitulo}</span> : null}
                    </td>
                    <td>{m.columnas === 'abc' ? `${LETRAS_LECTURA.slice(0, nLecturas(m)).map((_, i) => labelLectura(i)).join('/')}/Prom.` : 'Solo Prom.'}</td>
                    <td><span className={`badge ${m.activo ? 'success' : ''}`}>{m.activo ? 'Activo' : 'Oculto'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => abrirEdicion(m)}>✎</button>{' '}
                      <button className="btn btn-sm btn-ghost" onClick={() => void toggleActivo(m)}>{m.activo ? 'Ocultar' : 'Mostrar'}</button>
                    </td>
                  </tr>
                )
              ))}
              {!minerales.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Sin minerales. Agregá el primero arriba.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ───────────── Modal: Añadir pesos (Bigbags · Pesos Húmedos / Pesos Secos) ───────────── */
function PesosBigbagsModal({ canWrite, actor, actorName, onClose }: {
  canWrite: boolean; actor: string; actorName: string | null; onClose: () => void;
}) {
  // vista: null = set de trabajo (sin guardar); o el id de una pesada del histórico.
  const [vista, setVista] = useState<string | null>(null);
  const [rows, setRows] = useState<BigbagRow[]>([]);
  const [pesadas, setPesadas] = useState<PesadaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState<TipoPesaje>('bigbag');
  const [aBorrar, setABorrar] = useState<BigbagRow | null>(null);
  const [pesadaBorrar, setPesadaBorrar] = useState<PesadaRow | null>(null);
  const rowsRef = useRef<BigbagRow[]>([]);
  rowsRef.current = rows;
  const vistaRef = useRef<string | null>(null);
  vistaRef.current = vista;

  const cargar = useCallback(async (v: string | null) => {
    try {
      const [bb, ps] = await Promise.all([listBigbags(v), listPesadas()]);
      setRows(bb); setPesadas(ps);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar los pesos', 'error'); }
  }, []);
  useEffect(() => { setLoading(true); cargar(vista).finally(() => setLoading(false)); }, [cargar, vista]);
  useRealtime(['recepciones_bigbags', 'recepciones_pesadas'], () => { void cargar(vistaRef.current); });

  // Si se está editando una pesada del histórico, al cambiar sus bigbags se recalcula su cabecera.
  async function trasEditarPesada() {
    if (vistaRef.current) { try { await recomputarPesada(vistaRef.current); } catch { /* noop */ } }
  }

  function setCampo(id: string, campo: 'procedencia' | 'peso_humedo' | 'peso_seco', value: string) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (campo === 'procedencia') return { ...r, procedencia: value };
      return { ...r, [campo]: value === '' ? null : Number(value) };
    }));
  }
  // Guarda el valor tecleado (los inputs son NO controlados para que el refresh de
  // realtime no pise lo que se está escribiendo). Actualiza también el estado para
  // recalcular tara/totales y persiste en la BD.
  async function guardarCampo(id: string, campo: 'procedencia' | 'peso_humedo' | 'peso_seco', raw: string) {
    setCampo(id, campo, raw);
    const patch = campo === 'procedencia'
      ? { procedencia: raw.trim() || null }
      : { [campo]: raw === '' ? null : Number(raw) } as { peso_humedo?: number | null; peso_seco?: number | null };
    try { await actualizarBigbag(id, patch); await trasEditarPesada(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); void cargar(vistaRef.current); }
  }
  async function nuevo() {
    setAdding(true);
    try { await crearBigbag({ actor, actorName, pesadaId: vista, tipo: nuevoTipo }); await cargar(vista); await trasEditarPesada(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo añadir', 'error'); }
    finally { setAdding(false); }
  }
  async function borrar(r: BigbagRow) {
    try { await eliminarBigbag(r.id); setRows((prev) => prev.filter((x) => x.id !== r.id)); await trasEditarPesada(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setABorrar(null); }
  }
  async function guardarPesos() {
    setSaving(true);
    try {
      const p = await guardarPesada({ actor, actorName });
      toast(`PESOS GUARDADOS DÍA ${fmtDia(p.fecha)}`, 'success');
      await cargar(null); setVista(null);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron guardar los pesos', 'error'); }
    finally { setSaving(false); }
  }
  async function borrarPesada(p: PesadaRow) {
    try {
      await eliminarPesada(p.id);
      if (vista === p.id) setVista(null);
      await cargar(vista === p.id ? null : vista);
      toast('Pesada eliminada', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar la pesada', 'error'); }
    finally { setPesadaBorrar(null); }
  }
  async function toggleConsumida(p: PesadaRow) {
    try { await actualizarPesada(p.id, { consumida: !p.consumida }); await cargar(vista); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error'); }
  }

  // Cambia la CATEGORÍA de una fila (por fila: un mismo pesaje mezcla los 3 tipos).
  async function setTipoRow(id: string, t: TipoPesaje) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, tipo: t } : r)));
    try { await actualizarBigbag(id, { tipo: t }); await trasEditarPesada(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar la categoría', 'error'); void cargar(vistaRef.current); }
  }

  // Ordinal POR CATEGORÍA: el número se incrementa dentro de cada tipo (Bigbag 1, Saco 1…).
  const ordinal = new Map<string, number>();
  { const cont: Record<string, number> = {}; for (const r of rows) { const t = tipoValido(r.tipo); cont[t] = (cont[t] ?? 0) + 1; ordinal.set(r.id, cont[t]); } }

  // Totales: TARA por categoría (Σ por tipo); TOTAL NETO = suma + TARA. Permite negativos.
  const tot = totalesBigbags(rows);
  const formulaHum = tot.bigBagHumedo, formulaSec = tot.bigBagSeco;
  const netoHum = tot.netoHumedo, netoSec = tot.netoSeco;
  const pesadaActiva = vista ? pesadas.find((p) => p.id === vista) ?? null : null;

  /** Renderiza una tabla (húmedos o secos). `campo` = columna de peso editada. */
  function tabla(titulo: string, campo: 'peso_humedo' | 'peso_seco', formula: number, neto: number) {
    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden', flex: '1 1 360px', minWidth: 320 }}>
        <div style={{ fontWeight: 800, letterSpacing: '.04em', textAlign: 'center', padding: '.5rem', borderBottom: '1px solid var(--border, #2a2f3a)' }}>{titulo}</div>
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>
            <thead>
              <tr><th>Procedencia</th><th className="num">Peso</th><th>Categoría</th>{canWrite && <th style={{ width: 30 }}></th>}</tr>
            </thead>
            <tbody>
              {!rows.length && <tr><td colSpan={canWrite ? 4 : 3} className="muted" style={{ textAlign: 'center' }}>Sin pesajes. Usá «＋ Añadir».</td></tr>}
              {rows.map((r) => {
                const t = tipoValido(r.tipo);
                return (
                <tr key={r.id}>
                  <td>
                    <input key={`${r.id}-proc`} className="input" defaultValue={r.procedencia ?? ''} disabled={!canWrite}
                      onBlur={(e) => { const v = e.target.value.toUpperCase(); if (v !== e.target.value) e.target.value = v; if (v !== (r.procedencia ?? '')) void guardarCampo(r.id, 'procedencia', v); }}
                      placeholder="A, B, ALI…" style={{ width: 130 }} />
                  </td>
                  <td className="num">
                    <input key={`${r.id}-${campo}`} className="input mono" type="number" step="any" defaultValue={(r[campo] ?? '') as number | ''} disabled={!canWrite}
                      onBlur={(e) => { const raw = e.target.value; const cur = r[campo] == null ? '' : String(r[campo]); if (raw !== cur) void guardarCampo(r.id, campo, raw); }}
                      style={{ width: 110, textAlign: 'right' }} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                      <select className="select" value={t} disabled={!canWrite} onChange={(e) => void setTipoRow(r.id, e.target.value as TipoPesaje)} style={{ width: 140 }}>
                        {(['bigbag', 'saco', 'bolsa_hielo'] as TipoPesaje[]).map((k) => <option key={k} value={k}>{TIPO_LABEL[k]}</option>)}
                      </select>
                      <span className="mono muted" style={{ fontSize: '.78rem' }}>{TIPO_SINGULAR[t]} {ordinal.get(r.id)}</span>
                    </div>
                  </td>
                  {canWrite && <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-ghost" title="Eliminar pesaje" onClick={() => setABorrar(r)}>🗑</button></td>}
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td></td>
                <td className="num mono" style={{ background: 'rgba(120,200,140,.25)', color: 'var(--danger, #e5484d)', fontWeight: 800 }}>{fmt(formula)}</td>
                <td style={{ color: 'var(--danger, #e5484d)', fontWeight: 800 }}>TARA ENVASES</td>
                {canWrite && <td></td>}
              </tr>
              <tr style={{ fontWeight: 800 }}>
                <td></td>
                <td className="num mono">{fmt(neto)}</td>
                <td>TOTAL NETO</td>
                {canWrite && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  const fmtFecha = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }); };
  const fmtDia = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };

  return (
    <Modal title="⚖ Añadir pesos — Bigbags" size="xl" onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.75rem', flexWrap: 'wrap' }}>
        <div className="muted" style={{ fontSize: '.8rem' }}>
          TARA por categoría (un pesaje mezcla los 3): BIG BAG ×{fmt(TARA_TIPO.bigbag)} · SACO ×{fmt(TARA_TIPO.saco)} · BOLSA DE HIELO ×{fmt(TARA_TIPO.bolsa_hielo)}. TOTAL NETO = suma de pesos − tara (permite negativos).
        </div>
        {canWrite && (
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Selector de categoría para la fila nueva: el número se incrementa por categoría */}
            <select className="select" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as TipoPesaje)} style={{ width: 150 }} title="Categoría de la fila a añadir">
              {(['bigbag', 'saco', 'bolsa_hielo'] as TipoPesaje[]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
            </select>
            <button className="btn btn-ghost" onClick={() => void nuevo()} disabled={adding}>
              {adding ? 'Añadiendo…' : `＋ Añadir ${TIPO_LABEL[nuevoTipo]}`}
            </button>
            {!vista && (
              <button className="btn btn-primary" onClick={() => void guardarPesos()} disabled={saving || !rows.length}>
                {saving ? 'Guardando…' : '💾 Guardar pesos'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Banner de la vista activa */}
      <div className="card" style={{ padding: '.5rem .75rem', marginBottom: '.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap', borderLeft: `3px solid ${vista ? 'var(--primary)' : 'var(--border, #2a2f3a)'}` }}>
        <span style={{ fontWeight: 700, fontSize: '.85rem' }}>
          {vista ? `📦 PESOS GUARDADOS DÍA ${pesadaActiva ? fmtDia(pesadaActiva.fecha) : '—'} · ${pesadaActiva ? fmtFecha(pesadaActiva.fecha) : ''}` : '📝 Pesada actual (sin guardar)'}
        </span>
        {vista && <button className="btn btn-sm btn-ghost" onClick={() => setVista(null)}>← Volver a pesada actual</button>}
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {tabla('PESOS HÚMEDOS', 'peso_humedo', formulaHum, netoHum)}
          {tabla('PESOS SECOS', 'peso_seco', formulaSec, netoSec)}
        </div>
      )}

      {/* Histórico de pesadas guardadas (modificable) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: '1.25rem' }}>
        <div className="card-title" style={{ padding: '.55rem .85rem' }}>
          <span>Históricos de pesadas guardadas</span>
          <span className="muted mono">{num(pesadas.length)} pesada(s)</span>
        </div>
        {!pesadas.length ? (
          <EmptyState message="Aún no hay pesadas guardadas. Cargá bigbags y usá «Guardar pesos»." icon="📦" />
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th>Fecha</th><th className="num">Bigbags</th>
                  <th className="num">Neto húmedo</th><th className="num">Neto seco</th>
                  <th>Estado</th>{canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {pesadas.map((p) => (
                  <tr key={p.id} style={{ background: vista === p.id ? 'var(--primary-soft, rgba(255,138,0,.10))' : undefined }}>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVista(p.id)}
                        title="Ver y editar los detalles de este día"
                        style={{ fontWeight: 700, color: 'var(--primary-3, #ff8a00)', padding: '.1rem .2rem' }}>
                        PESOS GUARDADOS DÍA {fmtDia(p.fecha)}
                      </button>
                    </td>
                    <td className="num mono">{p.n_bigbags}</td>
                    <td className="num mono">{fmt(p.neto_humedo)}</td>
                    <td className="num mono">{fmt(p.neto_seco)}</td>
                    <td><span className={`badge ${p.consumida ? '' : 'success'}`}>{p.consumida ? 'Consumida' : 'Disponible'}</span></td>
                    {canWrite && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm btn-ghost" title="Editar esta pesada" onClick={() => setVista(p.id)}>✎ Editar</button>{' '}
                        <button className="btn btn-sm btn-ghost" title={p.consumida ? 'Marcar disponible' : 'Marcar consumida'} onClick={() => void toggleConsumida(p)}>
                          {p.consumida ? '↺ Disponible' : '✓ Consumida'}
                        </button>{' '}
                        <button className="btn btn-sm btn-ghost" title="Eliminar pesada" onClick={() => setPesadaBorrar(p)}>🗑</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aBorrar && (
        <ConfirmDialog
          title={`Eliminar ${TIPO_SINGULAR[tipoValido(aBorrar.tipo)].toLowerCase()}`}
          message={`¿Eliminar el ${TIPO_SINGULAR[tipoValido(aBorrar.tipo)]} ${ordinal.get(aBorrar.id) ?? ''}? Se quita de ambas tablas (húmedos y secos).`}
          confirmText="Eliminar" danger
          onConfirm={() => void borrar(aBorrar)} onCancel={() => setABorrar(null)}
        />
      )}
      {pesadaBorrar && (
        <ConfirmDialog
          title="Eliminar pesada"
          message={`¿Eliminar la pesada del ${fmtFecha(pesadaBorrar.fecha)}? Se borran sus ${pesadaBorrar.n_bigbags} bigbag(s).`}
          confirmText="Eliminar" danger
          onConfirm={() => void borrarPesada(pesadaBorrar)} onCancel={() => setPesadaBorrar(null)}
        />
      )}
    </Modal>
  );
}

/* ───────────── Modal: Conciliación (vs Centros de Acopio) ───────────── */
const ROJO = { color: 'var(--danger, #e5484d)', fontWeight: 800 };
const VERDE_BG = { background: 'rgba(120,200,140,.22)' };

interface ConcilDraft {
  id: string | null;
  numero: number;
  fecha: string | null;
  peso_kg_total: number;
  kg_bolsas: number;
  muestras_lab: number;
  centros: ConciliacionCentro[];
  observacion: string;
}

function ConciliacionModal({ canWrite, actor, actorName, pesoTotal, pesoRecogidoFinal, onClose }: {
  canWrite: boolean; actor: string; actorName: string | null; pesoTotal: number; pesoRecogidoFinal: number; onClose: () => void;
}) {
  const [lista, setLista] = useState<Conciliacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [draft, setDraft] = useState<ConcilDraft | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<Conciliacion | null>(null);

  const [almacenes, setAlmacenes] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    try { setLista(await listConciliaciones()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar las conciliaciones', 'error'); }
  }, []);
  useEffect(() => { setLoading(true); cargar().finally(() => setLoading(false)); }, [cargar]);
  useEffect(() => { getNombresAlmacenes().then(setAlmacenes).catch(() => setAlmacenes([])); }, []);
  useRealtime(['recepciones_conciliaciones'], () => { void cargar(); });

  const fmtFecha = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }); };

  function nueva() {
    const numero = lista.reduce((m, c) => Math.max(m, c.numero), 0) + 1;
    // Peso Kg Total = total de «Peso (Kg) recogido» de Humedad Final.
    // Centro «Peramanal» = Saldo Kg de casiterita reportado por la caja del acopio (= peso de las recepciones del cierre).
    setDraft({ id: null, numero, fecha: null, peso_kg_total: pesoRecogidoFinal || 0, kg_bolsas: 0, muestras_lab: 0,
      centros: [{ nombre: 'Peramanal', kg: pesoTotal || null, categoria: null, entra_inventario: false, almacen: null }], observacion: '' });
    setMode('form');
  }
  // Si no hay conciliaciones guardadas, abrir directamente el formulario (no una lista vacía).
  const autoAbierto = useRef(false);
  useEffect(() => {
    if (!loading && !autoAbierto.current && canWrite && !lista.length) { autoAbierto.current = true; nueva(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lista.length, canWrite]);
  function abrir(c: Conciliacion) {
    setDraft({ id: c.id, numero: c.numero, fecha: c.fecha, peso_kg_total: Number(c.peso_kg_total) || 0, kg_bolsas: Number(c.kg_bolsas) || 0, muestras_lab: Number(c.muestras_lab) || 0, centros: c.centros.map((x) => ({ ...x })), observacion: c.observacion ?? '' });
    setMode('form');
  }
  function setLocal(patch: Partial<ConcilDraft>) { setDraft((p) => (p ? { ...p, ...patch } : p)); }
  function setCentro(i: number, campo: 'nombre' | 'kg', value: string) {
    setDraft((p) => p ? { ...p, centros: p.centros.map((x, j) => (j === i ? { ...x, [campo]: campo === 'kg' ? (value === '' ? null : Number(value)) : value } : x)) } : p);
  }
  function patchCentro(i: number, patch: Partial<ConciliacionCentro>) {
    setDraft((p) => p ? { ...p, centros: p.centros.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : p);
  }
  /** Almacén del centro RESGUARDO: si es nuevo, lo crea en el inventario REAL. */
  async function setAlmacenCentro(i: number, value: string) {
    patchCentro(i, { almacen: value });
    const v = value.trim();
    if (v && !almacenes.some((a) => a.toLowerCase() === v.toLowerCase())) {
      try { const a = await crearAlmacen({ nombre: v }, actor); setAlmacenes((prev) => prev.includes(a.nombre) ? prev : [...prev, a.nombre]); patchCentro(i, { almacen: a.nombre }); }
      catch (e) { toast(e instanceof Error ? e.message : 'No se pudo crear el almacén', 'error'); }
    }
  }
  function addCentro() { setDraft((p) => (p ? { ...p, centros: [...p.centros, { nombre: '', kg: null, categoria: null, entra_inventario: false, almacen: null }] } : p)); }
  function delCentro(i: number) { setDraft((p) => (p ? { ...p, centros: p.centros.filter((_, j) => j !== i) } : p)); }

  async function guardar() {
    const d = draft; if (!d) return;
    setGuardando(true);
    try {
      const campos = { peso_kg_total: d.peso_kg_total, kg_bolsas: d.kg_bolsas, muestras_lab: d.muestras_lab, centros: d.centros, observacion: d.observacion };
      if (d.id) {
        await actualizarConciliacion(d.id, { numero: d.numero, ...campos });
        toast(`Conciliación N° ${d.numero} actualizada`, 'success');
      } else {
        const c = await crearConciliacion({ numero: d.numero, actor, actorName });
        await actualizarConciliacion(c.id, campos);
        toast(`Conciliación N° ${d.numero} guardada`, 'success');
      }
      await cargar();
      setMode('list'); setDraft(null);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar la conciliación', 'error'); }
    finally { setGuardando(false); }
  }
  async function borrar(c: Conciliacion) {
    try { await eliminarConciliacion(c.id); await cargar(); toast(`Conciliación N° ${c.numero} eliminada`, 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setABorrar(null); }
  }

  const t = draft ? calcConciliacion(draft) : null;

  // Fila del RESUMEN: valor/input a la izquierda, etiqueta a la derecha.
  const resumenFila = (valor: ReactNode, label: ReactNode, opts?: { rojo?: boolean; verde?: boolean }) => (
    <tr>
      <td className="num mono" style={{ ...(opts?.verde ? VERDE_BG : {}), textAlign: 'right', width: 190, ...(opts?.rojo ? ROJO : { fontWeight: 700 }) }}>{valor}</td>
      <td style={opts?.rojo ? ROJO : { fontWeight: 700 }}>{label}</td>
    </tr>
  );

  const footer = mode === 'list' ? (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      {canWrite && <button className="btn btn-primary" onClick={nueva}>＋ Nueva conciliación</button>}
    </>
  ) : (
    <>
      <button className="btn btn-ghost" onClick={() => { setMode('list'); setDraft(null); }}>← Volver</button>
      {canWrite && <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : 'GUARDAR CONCILIACIÓN'}</button>}
    </>
  );

  return (
    <Modal title={mode === 'list' ? '⚖ Conciliación de Centros de Acopio' : (draft?.id ? `Conciliación N° ${draft.numero}` : 'Nueva conciliación')} size="xl" onClose={onClose} footer={footer}>
      {mode === 'list' ? (
        loading ? <p className="muted">Cargando…</p> : !lista.length ? (
          <EmptyState message="Sin conciliaciones. Usá «＋ Nueva conciliación»." icon="⚖" />
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr>
                <th>N° Recepción</th><th>Fecha</th><th className="num">Reportado (KG)</th>
                <th className="num">Kg No Llegó</th><th className="num">% No Llegó</th>{canWrite && <th></th>}
              </tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => abrir(c)} title="Ver / editar">
                    <td className="mono" style={{ fontWeight: 700 }}>N° {c.numero}</td>
                    <td>{fmtFecha(c.fecha)}</td>
                    <td className="num mono">{fmt(c.reportado)}</td>
                    <td className="num mono" style={ROJO}>{fmt(c.no_llego)}</td>
                    <td className="num mono" style={ROJO}>{fmt(c.porcentaje)}%</td>
                    {canWrite && <td><button className="btn btn-sm btn-ghost" title="Eliminar" onClick={(e) => { e.stopPropagation(); setABorrar(c); }}>🗑</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : draft && (
        <div>
          <div className="form-row" style={{ maxWidth: 260, marginBottom: '1rem' }}>
            <label>N° de recepción</label>
            <input className="input mono" type="number" min={1} value={draft.numero} disabled={!canWrite}
              onChange={(e) => setLocal({ numero: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Centros de acopio */}
            <div className="card" style={{ flex: '1 1 380px', minWidth: 320, padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', padding: '.5rem .75rem', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                <strong style={{ fontSize: '.85rem', letterSpacing: '.03em' }}>CENTROS DE ACOPIO</strong>
                {canWrite && <button className="btn btn-sm btn-ghost" onClick={addCentro}>＋ Añadir centro</button>}
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                  <thead><tr><th className="num">Saldo (KG)</th><th>Centro de Acopio / Aliado</th><th>Categoría</th>{canWrite && <th style={{ width: 30 }}></th>}</tr></thead>
                  <tbody>
                    {!draft.centros.length && <tr><td colSpan={canWrite ? 4 : 3} className="muted" style={{ textAlign: 'center' }}>Sin centros. Usá «＋ Añadir centro».</td></tr>}
                    {draft.centros.map((ce, i) => {
                      const esResguardo = (ce.categoria ?? '') === 'RESGUARDO';
                      return (
                      <Fragment key={i}>
                        <tr>
                          <td className="num">
                            <input className="input mono" type="number" step="any" value={ce.kg ?? ''} disabled={!canWrite}
                              onChange={(e) => setCentro(i, 'kg', e.target.value)} placeholder="0,00" style={{ width: 120, textAlign: 'right' }} />
                          </td>
                          <td>
                            <input className="input" value={ce.nombre} disabled={!canWrite}
                              onChange={(e) => setCentro(i, 'nombre', e.target.value.toUpperCase())} placeholder="P-MGG… / Aliado" style={{ width: 220 }} />
                          </td>
                          <td>
                            <select className="select" value={ce.categoria ?? ''} disabled={!canWrite}
                              onChange={(e) => patchCentro(i, { categoria: e.target.value || null, ...(e.target.value !== 'RESGUARDO' ? { entra_inventario: false, almacen: null } : {}) })} style={{ width: 140 }}>
                              <option value="">— Normal —</option>
                              <option value="RESGUARDO">RESGUARDO</option>
                            </select>
                          </td>
                          {canWrite && <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-ghost" title="Quitar centro" onClick={() => delCentro(i)}>🗑</button></td>}
                        </tr>
                        {esResguardo && (
                          <tr>
                            <td colSpan={canWrite ? 4 : 3} style={{ background: 'var(--bg-1, #11151c)' }}>
                              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center', padding: '.25rem 0' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem' }}>
                                  <input type="checkbox" checked={!!ce.entra_inventario} disabled={!canWrite}
                                    onChange={(e) => patchCentro(i, { entra_inventario: e.target.checked })} />
                                  ¿Entran estos KG al inventario? <span className="muted">(sin tasa)</span>
                                </label>
                                {ce.entra_inventario && (
                                  <div style={{ minWidth: 240, flex: '1 1 240px' }}>
                                    <SearchCreateSelect options={almacenes} value={ce.almacen ?? ''} disabled={!canWrite}
                                      onChange={(v) => void setAlmacenCentro(i, v.toUpperCase())}
                                      placeholder="🔍 Almacén destino… (escribí para crear)" emptyText="Escribí para crear un almacén" />
                                  </div>
                                )}
                                {ce.inventario_aplicado && <span className="badge success" style={{ fontSize: '.7rem' }}>✓ Ingresado</span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Resumen */}
            <div className="card" style={{ flex: '1 1 380px', minWidth: 320, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '.5rem .75rem', borderBottom: '1px solid var(--border, #2a2f3a)' }}><strong style={{ fontSize: '.85rem', letterSpacing: '.03em' }}>RESUMEN</strong></div>
              <table className="table" style={{ fontSize: '.85rem' }}>
                <tbody>
                  <tr>
                    <td className="num" style={{ width: 190 }}>
                      <input className="input mono" type="number" step="any" value={draft.peso_kg_total || ''} disabled={!canWrite}
                        onChange={(e) => setLocal({ peso_kg_total: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="Peso Kg Total" style={{ width: 160, textAlign: 'right' }} />
                    </td>
                    <td style={{ fontWeight: 700 }}>Peso Kg Total <span className="muted" style={{ fontWeight: 400 }}>(= Peso (Kg) recogido · Humedad Final)</span>
                      {canWrite && <div><button className="btn btn-sm btn-ghost" type="button" style={{ padding: '0 .3rem', fontSize: '.72rem' }} onClick={() => setLocal({ peso_kg_total: pesoRecogidoFinal })}>↺ Usar Humedad Final ({fmt(pesoRecogidoFinal)})</button></div>}
                    </td>
                  </tr>
                  {resumenFila(fmt(t!.reportado), 'Kg Reportado por Centros de Acopio')}
                  {resumenFila(fmt(t!.faltante), 'Kg Faltante', { rojo: true, verde: true })}
                  <tr>
                    <td className="num" style={{ width: 190 }}>
                      <input className="input mono" type="number" step="any" value={draft.kg_bolsas || ''} disabled={!canWrite}
                        onChange={(e) => setLocal({ kg_bolsas: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="0,00" style={{ width: 160, textAlign: 'right' }} />
                    </td>
                    <td style={{ fontWeight: 700 }}>Kg Peso de Bolsas</td>
                  </tr>
                  <tr>
                    <td className="num" style={{ width: 190 }}>
                      <input className="input mono" type="number" step="any" value={draft.muestras_lab || ''} disabled={!canWrite}
                        onChange={(e) => setLocal({ muestras_lab: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="0,00" style={{ width: 160, textAlign: 'right' }} />
                    </td>
                    <td style={{ fontWeight: 700 }}>Muestras tomadas por Laboratorio MGG</td>
                  </tr>
                  {resumenFila(fmt(t!.noLlego), 'Kg No Llegó', { rojo: true, verde: true })}
                  {resumenFila(`${fmt(t!.porcentaje)}%`, '% de lo que no llegó (descontando bolsas y muestras)', { rojo: true, verde: true })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="form-row" style={{ marginTop: '1rem' }}>
            <label>Nota <span className="muted">(opcional)</span></label>
            <textarea className="input" rows={2} value={draft.observacion} disabled={!canWrite}
              onChange={(e) => setLocal({ observacion: e.target.value })} placeholder="Observaciones de la conciliación…" />
          </div>
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.4rem' }}>
            Faltante = Peso Kg total − Reportado · No llegó = Faltante + Bolsas + Muestras · % = No llegó / Reportado × 100. Se guarda con «GUARDAR CONCILIACIÓN».
          </div>
        </div>
      )}

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar conciliación"
          message={`¿Eliminar la Conciliación N° ${aBorrar.numero}?`}
          confirmText="Eliminar" danger
          onConfirm={() => void borrar(aBorrar)} onCancel={() => setABorrar(null)}
        />
      )}
    </Modal>
  );
}

/* ───────────── Modal: Totales (precio de compra minas → recepcionada → costo final) ───────────── */
const fmt4 = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

interface TotalesDraft {
  id: string | null; numero: number; fecha: string | null;
  centros: TotalCentro[]; gastos: number; pesos_kg: number;
  humedad_prov: number; humedad_final: number; fe_esteril: number; observacion: string;
}

function TotalesModal({ canWrite, actor, actorName, pesoTotal, cajaTasa, onClose }: {
  canWrite: boolean; actor: string; actorName: string | null; pesoTotal: number; cajaTasa: number; onClose: () => void;
}) {
  const [lista, setLista] = useState<TotalesDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [draft, setDraft] = useState<TotalesDraft | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<TotalesDoc | null>(null);

  const cargar = useCallback(async () => {
    try { setLista(await listTotales()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar los totales', 'error'); }
  }, []);
  useEffect(() => { setLoading(true); cargar().finally(() => setLoading(false)); }, [cargar]);
  useRealtime(['recepciones_totales'], () => { void cargar(); });

  const fmtFecha = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }); };

  function nueva() {
    const numero = lista.reduce((m, c) => Math.max(m, c.numero), 0) + 1;
    // Primer centro tomado del cierre de caja: nombre Peramanal, Total SnO2 = Saldo Kg de
    // casiterita y Precio/Tasa = tasa del cierre.
    setDraft({ id: null, numero, fecha: null, centros: [{ nombre: 'Peramanal', sno2: pesoTotal || null, precio: cajaTasa || null }], gastos: 0, pesos_kg: pesoTotal || 0, humedad_prov: 0, humedad_final: 0, fe_esteril: 0, observacion: '' });
    setMode('form');
  }
  // Si no hay totales guardados, abrir directamente el formulario (no una lista vacía).
  const autoAbierto = useRef(false);
  useEffect(() => {
    if (!loading && !autoAbierto.current && canWrite && !lista.length) { autoAbierto.current = true; nueva(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lista.length, canWrite]);
  function abrir(d: TotalesDoc) {
    setDraft({ id: d.id, numero: d.numero, fecha: d.fecha, centros: d.centros.map((x) => ({ ...x })), gastos: Number(d.gastos) || 0, pesos_kg: Number(d.pesos_kg) || 0, humedad_prov: Number(d.humedad_prov) || 0, humedad_final: Number(d.humedad_final) || 0, fe_esteril: Number(d.fe_esteril) || 0, observacion: d.observacion ?? '' });
    setMode('form');
  }
  function setLocal(patch: Partial<TotalesDraft>) { setDraft((p) => (p ? { ...p, ...patch } : p)); }
  function setCentro(i: number, campo: 'nombre' | 'sno2' | 'precio', value: string) {
    setDraft((p) => p ? { ...p, centros: p.centros.map((x, j) => (j === i ? { ...x, [campo]: campo === 'nombre' ? value : (value === '' ? null : Number(value)) } : x)) } : p);
  }
  function addCentro() { setDraft((p) => (p ? { ...p, centros: [...p.centros, { nombre: '', sno2: null, precio: null }] } : p)); }
  function delCentro(i: number) { setDraft((p) => (p ? { ...p, centros: p.centros.filter((_, j) => j !== i) } : p)); }

  async function guardar() {
    const d = draft; if (!d) return;
    setGuardando(true);
    try {
      const campos = { centros: d.centros, gastos: d.gastos, pesos_kg: d.pesos_kg, humedad_prov: d.humedad_prov, humedad_final: d.humedad_final, fe_esteril: d.fe_esteril, observacion: d.observacion };
      if (d.id) { await actualizarTotales(d.id, { numero: d.numero, ...campos }); toast(`Totales N° ${d.numero} actualizados`, 'success'); }
      else { const c = await crearTotales({ numero: d.numero, actor, actorName }); await actualizarTotales(c.id, campos); toast(`Totales N° ${d.numero} guardados`, 'success'); }
      await cargar(); setMode('list'); setDraft(null);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron guardar los totales', 'error'); }
    finally { setGuardando(false); }
  }
  async function borrar(d: TotalesDoc) {
    try { await eliminarTotales(d.id); await cargar(); toast(`Totales N° ${d.numero} eliminados`, 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setABorrar(null); }
  }

  const t = draft ? calcTotales(draft) : null;

  const bloque = (sno2: ReactNode, precio: ReactNode, moneda: ReactNode, label: string) => (
    <tr style={{ fontWeight: 800 }}>
      <td className="num mono">{sno2}</td><td className="num mono">{precio}</td><td className="num mono">{moneda}</td><td>{label}</td>{canWrite && <td></td>}
    </tr>
  );

  const footer = mode === 'list' ? (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      {canWrite && <button className="btn btn-primary" onClick={nueva}>＋ Nuevos totales</button>}
    </>
  ) : (
    <>
      <button className="btn btn-ghost" onClick={() => { setMode('list'); setDraft(null); }}>← Volver</button>
      {canWrite && <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : 'GUARDAR TOTALES'}</button>}
    </>
  );

  return (
    <Modal title={mode === 'list' ? '🧮 Totales — Precio de compra' : (draft?.id ? `Totales N° ${draft.numero}` : 'Nuevos totales')} size="xl" onClose={onClose} footer={footer}>
      {mode === 'list' ? (
        loading ? <p className="muted">Cargando…</p> : !lista.length ? (
          <EmptyState message="Sin totales. Usá «＋ Nuevos totales»." icon="🧮" />
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr><th>N° Recepción</th><th>Fecha</th><th className="num">Total SnO2 (minas)</th><th className="num">Total Moneda</th><th className="num">Tasa final</th>{canWrite && <th></th>}</tr></thead>
              <tbody>
                {lista.map((d) => (
                  <tr key={d.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => abrir(d)} title="Ver / editar">
                    <td className="mono" style={{ fontWeight: 700 }}>N° {d.numero}</td>
                    <td>{fmtFecha(d.fecha)}</td>
                    <td className="num mono">{fmt(d.total_sno2_minas)}</td>
                    <td className="num mono">{fmt(d.total_moneda_minas)}</td>
                    <td className="num mono" style={{ fontWeight: 700 }}>${fmt4(d.tasa_final)}</td>
                    {canWrite && <td><button className="btn btn-sm btn-ghost" title="Eliminar" onClick={(e) => { e.stopPropagation(); setABorrar(d); }}>🗑</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : draft && t && (
        <div>
          <div className="form-row" style={{ maxWidth: 260, marginBottom: '1rem' }}>
            <label>N° de recepción</label>
            <input className="input mono" type="number" min={1} value={draft.numero} disabled={!canWrite}
              onChange={(e) => setLocal({ numero: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
          </div>

          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>
              <thead><tr>
                <th className="num" style={{ minWidth: 120 }}>Total SnO2</th>
                <th className="num" style={{ minWidth: 110 }}>Precio / Tasa</th>
                <th className="num" style={{ minWidth: 130 }}>Total Moneda</th>
                <th>Centro de costo</th>{canWrite && <th style={{ width: 30 }}></th>}
              </tr></thead>
              <tbody>
                {!draft.centros.length && <tr><td colSpan={canWrite ? 5 : 4} className="muted" style={{ textAlign: 'center' }}>Sin centros. Usá «＋ Añadir centro».</td></tr>}
                {draft.centros.map((c, i) => {
                  const moneda = (Number(c.sno2) || 0) * (Number(c.precio) || 0);
                  return (
                    <tr key={i}>
                      <td className="num"><input className="input mono" type="number" step="any" value={c.sno2 ?? ''} disabled={!canWrite} onChange={(e) => setCentro(i, 'sno2', e.target.value)} placeholder="0,00" style={{ width: 110, textAlign: 'right' }} /></td>
                      <td className="num"><input className="input mono" type="number" step="any" value={c.precio ?? ''} disabled={!canWrite} onChange={(e) => setCentro(i, 'precio', e.target.value)} placeholder="0,0000" style={{ width: 100, textAlign: 'right' }} /></td>
                      <td className="num mono">{fmt(moneda)}</td>
                      <td><input className="input" value={c.nombre} disabled={!canWrite} onChange={(e) => setCentro(i, 'nombre', e.target.value.toUpperCase())} placeholder="LOS PIJIGUAOS / P-MGG…" style={{ width: 240 }} /></td>
                      {canWrite && <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-ghost" title="Quitar" onClick={() => delCentro(i)}>🗑</button></td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {bloque(fmt(t.totalSnO2Minas), `$${fmt4(t.precioMinas)}`, fmt(t.totalMonedaMinas), 'PROMEDIO DE PRECIO DE COMPRA EN MINAS')}
                <tr style={{ fontWeight: 800 }}>
                  <td className="num">
                    <input className="input mono" type="number" step="any" value={draft.pesos_kg || ''} disabled={!canWrite} onChange={(e) => setLocal({ pesos_kg: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="Pesos Kg" style={{ width: 110, textAlign: 'right', ...VERDE_BG }} />
                  </td>
                  <td className="num mono">${fmt4(t.tasaRecep)}</td>
                  <td className="num mono">{fmt(t.totalMonedaRecep)}</td>
                  <td>PROMEDIO DE PRECIO DE COMPRA RECEPCIONADA
                    {canWrite && <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .3rem', fontSize: '.72rem', marginLeft: '.3rem' }} onClick={() => setLocal({ pesos_kg: pesoTotal })}>↺ recepciones ({fmt(pesoTotal)})</button>}
                  </td>{canWrite && <td></td>}
                </tr>
                <tr>
                  <td className="num"><input className="input mono" type="number" step="any" value={draft.humedad_prov || ''} disabled={!canWrite} onChange={(e) => setLocal({ humedad_prov: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="0,00" style={{ width: 110, textAlign: 'right', color: 'var(--danger)' }} /></td>
                  <td></td><td></td><td style={ROJO}>HUMEDAD PROVISIONAL (LABORATORIO)</td>{canWrite && <td></td>}
                </tr>
                <tr>
                  <td className="num"><input className="input mono" type="number" step="any" value={draft.humedad_final || ''} disabled={!canWrite} onChange={(e) => setLocal({ humedad_final: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="0,00" style={{ width: 110, textAlign: 'right', color: 'var(--danger)' }} /></td>
                  <td></td><td></td><td style={ROJO}>HUMEDAD ADICIONAL (FINAL)</td>{canWrite && <td></td>}
                </tr>
                <tr>
                  <td className="num"><input className="input mono" type="number" step="any" value={draft.fe_esteril || ''} disabled={!canWrite} onChange={(e) => setLocal({ fe_esteril: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="0,00" style={{ width: 110, textAlign: 'right' }} /></td>
                  <td></td><td></td><td style={{ fontWeight: 700 }}>Fe estéril</td>{canWrite && <td></td>}
                </tr>
                {bloque(fmt(t.totalSnO2Final), `$${fmt4(t.tasaFinal)}`, fmt(t.totalMonedaFinal), 'PROMEDIO DE PRECIO DE COSTO FINAL')}
              </tfoot>
            </table>
          </div>
          {canWrite && <button className="btn btn-sm btn-ghost" style={{ marginTop: '.4rem' }} onClick={addCentro}>＋ Añadir centro</button>}

          <div className="form-row" style={{ marginTop: '1rem' }}>
            <label>Nota <span className="muted">(opcional)</span></label>
            <textarea className="input" rows={2} value={draft.observacion} disabled={!canWrite} onChange={(e) => setLocal({ observacion: e.target.value })} placeholder="Observaciones…" />
          </div>
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.4rem' }}>
            Total Moneda (centro) = Total SnO2 × Precio/Tasa · MINAS: SnO2 = Σ kg, Moneda = Σ(kg×precio), Precio = Moneda/SnO2 ·
            RECEPCIONADA: SnO2 = Pesos Kg, Moneda = Moneda de MINAS, Tasa = Moneda/Pesos Kg ·
            COSTO FINAL: SnO2 = Pesos Kg + Humedad Prov + Humedad Final + Fe estéril, Moneda = Moneda RECEPCIONADA, Tasa = Moneda/SnO2.
          </div>
        </div>
      )}

      {aBorrar && (
        <ConfirmDialog title="Eliminar totales" message={`¿Eliminar los Totales N° ${aBorrar.numero}?`} confirmText="Eliminar" danger
          onConfirm={() => void borrar(aBorrar)} onCancel={() => setABorrar(null)} />
      )}
    </Modal>
  );
}

/* ───────────── Modal: Cerrar recepción (histórico de TODOS los datos) ───────────── */
function CierresModal({ canWrite, actor, actorName, onClose }: {
  canWrite: boolean; actor: string; actorName: string | null; onClose: () => void;
}) {
  const [lista, setLista] = useState<CierreRecepcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'list' | 'cerrar' | 'detalle'>('list');
  const [numero, setNumero] = useState(1);
  const [obs, setObs] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [subalmacen, setSubalmacen] = useState('');
  const [almacenes, setAlmacenes] = useState<string[]>([]);
  const [cerrando, setCerrando] = useState(false);
  const [ver, setVer] = useState<CierreRecepcion | null>(null);
  const [aBorrar, setABorrar] = useState<CierreRecepcion | null>(null);

  const cargar = useCallback(async () => {
    try { setLista(await listCierres()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar los cierres', 'error'); }
  }, []);
  useEffect(() => { setLoading(true); cargar().finally(() => setLoading(false)); }, [cargar]);
  useEffect(() => { getNombresAlmacenes().then(setAlmacenes).catch(() => setAlmacenes([])); }, []);
  useRealtime(['recepciones_cierres'], () => { void cargar(); });

  /** Almacén destino: si es nuevo, lo crea en el inventario REAL. */
  async function setAlmacenDestino(v: string) {
    const value = v.toUpperCase(); setAlmacen(value);
    const t = value.trim();
    if (t && !almacenes.some((a) => a.toLowerCase() === t.toLowerCase())) {
      try { const a = await crearAlmacen({ nombre: t }, actor); setAlmacenes((prev) => prev.includes(a.nombre) ? prev : [...prev, a.nombre]); setAlmacen(a.nombre); }
      catch (e) { toast(e instanceof Error ? e.message : 'No se pudo crear el almacén', 'error'); }
    }
  }

  const fmtFecha = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }); };

  function abrirCerrar() { setNumero(lista.reduce((m, c) => Math.max(m, c.numero), 0) + 1); setObs(''); setAlmacen(''); setSubalmacen(''); setMode('cerrar'); }
  async function confirmarCierre() {
    setCerrando(true);
    try {
      const c = await cerrarRecepcion({ numero, actor, actorName, observacion: obs, almacen: almacen.trim() || null, subalmacen: subalmacen.trim() || null });
      await cargar(); setMode('list');
      toast(`Recepción N° ${c.numero} cerrada`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cerrar la recepción', 'error'); }
    finally { setCerrando(false); }
  }
  async function borrar(c: CierreRecepcion) {
    try { await eliminarCierre(c.id); await cargar(); toast(`Cierre N° ${c.numero} eliminado`, 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setABorrar(null); }
  }

  const snap = (ver?.snapshot ?? {}) as Record<string, unknown>;
  const arr = (k: string): unknown[] => (Array.isArray(snap[k]) ? snap[k] as unknown[] : []);

  const footer = mode === 'cerrar' ? (
    <>
      <button className="btn btn-ghost" onClick={() => setMode('list')}>← Volver</button>
      {canWrite && <button className="btn btn-primary" onClick={() => void confirmarCierre()} disabled={cerrando}>{cerrando ? 'Cerrando…' : '🔒 CERRAR RECEPCIÓN'}</button>}
    </>
  ) : mode === 'detalle' ? (
    <button className="btn btn-primary" onClick={() => { setVer(null); setMode('list'); }}>← Volver</button>
  ) : (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      {canWrite && <button className="btn btn-primary" onClick={abrirCerrar}>🔒 Cerrar recepción</button>}
    </>
  );

  return (
    <Modal title={mode === 'cerrar' ? 'Cerrar recepción' : mode === 'detalle' ? `Recepción cerrada N° ${ver?.numero ?? ''}` : '🔒 Recepciones cerradas (histórico)'} size="xl" onClose={onClose} footer={footer}>
      {mode === 'list' && (
        loading ? <p className="muted">Cargando…</p> : !lista.length ? (
          <EmptyState message="Sin recepciones cerradas. Usá «🔒 Cerrar recepción»." icon="🔒" />
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr><th>N° Recepción</th><th>Fecha</th><th>Ingresos resguardo</th>{canWrite && <th></th>}</tr></thead>
              <tbody>
                {lista.map((c) => {
                  const ingArr = (c.snapshot as Record<string, unknown>).ingresos_resguardo;
                  const ing = Array.isArray(ingArr) ? ingArr.length : 0;
                  return (
                    <tr key={c.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => { setVer(c); setMode('detalle'); }} title="Ver detalle">
                      <td className="mono" style={{ fontWeight: 700 }}>N° {c.numero}</td>
                      <td>{fmtFecha(c.fecha)}</td>
                      <td className="mono">{ing}</td>
                      {canWrite && <td><button className="btn btn-sm btn-ghost" title="Eliminar" onClick={(e) => { e.stopPropagation(); setABorrar(c); }}>🗑</button></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {mode === 'cerrar' && (
        <div>
          <div className="form-row" style={{ maxWidth: 260 }}>
            <label>N° de recepción</label>
            <input className="input mono" type="number" min={1} value={numero} onChange={(e) => setNumero(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
          </div>
          <div className="form-grid" style={{ marginTop: '.75rem' }}>
            <div className="form-row">
              <label>Almacén destino <span className="muted">(neto seco)</span></label>
              <SearchCreateSelect options={almacenes} value={almacen} disabled={!canWrite}
                onChange={(v) => void setAlmacenDestino(v)}
                placeholder="🔍 Almacén… (escribí para crear)" emptyText="Escribí para crear un almacén" />
            </div>
            <div className="form-row">
              <label>Subalmacén <span className="muted">(opcional)</span></label>
              <input className="input" value={subalmacen} onChange={(e) => setSubalmacen(e.target.value.toUpperCase())} placeholder="Sub-ubicación…" />
            </div>
          </div>
          <div className="form-row" style={{ marginTop: '.75rem' }}>
            <label>Nota <span className="muted">(opcional)</span></label>
            <textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observaciones del cierre…" />
          </div>
          <div className="card" style={{ marginTop: '.75rem', borderColor: 'var(--warning)' }}>
            <small>Al cerrar se guarda una <strong>foto de todos los datos</strong> (recepciones, análisis, humedad, conciliación N° {numero} y totales N° {numero}). El <strong>NETO SECO</strong> de las pesadas disponibles ingresa al inventario (producto <strong>Casiterita</strong>) al <strong>almacén/subalmacén</strong> indicado con la <strong>tasa final de Totales</strong>. Los centros <strong>RESGUARDO «entra al inventario»</strong> ingresan <strong>sin tasa</strong>.</small>
          </div>
        </div>
      )}

      {mode === 'detalle' && ver && (
        <div style={{ display: 'grid', gap: '.5rem' }}>
          <div className="detail-row"><div className="k">N° Recepción</div><div className="v mono">N° {ver.numero}</div></div>
          <div className="detail-row"><div className="k">Fecha de cierre</div><div className="v">{fmtFecha(ver.fecha)}</div></div>
          {ver.observacion && <div className="detail-row"><div className="k">Nota</div><div className="v">{ver.observacion}</div></div>}
          <div className="detail-row"><div className="k">Recepciones (kg)</div><div className="v mono">{arr('recepciones').length}</div></div>
          <div className="detail-row"><div className="k">Análisis químicos</div><div className="v mono">{arr('analisis').length}</div></div>
          <div className="detail-row"><div className="k">Conciliaciones</div><div className="v mono">{arr('conciliaciones').length}</div></div>
          <div className="detail-row"><div className="k">Totales</div><div className="v mono">{arr('totales').length}</div></div>

          {/* Resultados de laboratorio guardados al cerrar (Prom. por mineral) */}
          {arr('analisis').length > 0 && (() => {
            const mins = (arr('minerales') as MineralLab[]).filter((m) => m.activo !== false);
            const anas = arr('analisis') as Array<{ n_analisis: number | null; analisis: AnalisisLab }>;
            if (!mins.length) return null;
            return (
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: '.4rem' }}>
                <div className="card-title" style={{ padding: '.45rem .7rem' }}><span>🧪 Resultados de laboratorio (Prom. por mineral)</span></div>
                <div className="table-wrap" style={{ overflowX: 'auto' }}><table className="table" style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>
                  <thead><tr><th>N° Análisis</th>{mins.map((m) => <th key={m.id} className="num">{m.nombre}</th>)}</tr></thead>
                  <tbody>
                    {anas.map((r, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontWeight: 700 }}>{r.n_analisis ?? '—'}</td>
                        {mins.map((m) => { const p = promElemento(r.analisis, m.clave, m.columnas === 'abc', nLecturas(m)); return <td key={m.id} className="num mono">{p == null ? '—' : fmtPct(p)}</td>; })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr style={{ fontWeight: 800 }}>
                    <td style={{ textAlign: 'right' }}>Promedio del lote</td>
                    {mins.map((m) => { const pl = promedioLote(anas, m.clave, m.columnas === 'abc', nLecturas(m)); return <td key={m.id} className="num mono" style={{ color: 'var(--primary-3)' }}>{pl == null ? '—' : fmtPct(pl)}</td>; })}
                  </tr></tfoot>
                </table></div>
              </div>
            );
          })()}

          {(() => {
            const ing = (snap as Record<string, unknown>).ingreso_casiterita as { almacen: string; kg: number; tasa: number } | null | undefined;
            return ing ? (
              <div className="detail-row"><div className="k">Neto seco → inventario</div>
                <div className="v mono">{fmt(ing.kg)} kg · {ing.almacen} · tasa {fmt4(ing.tasa)}</div></div>
            ) : null;
          })()}

          {arr('ingresos_resguardo').length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: '.4rem' }}>
              <div className="card-title" style={{ padding: '.45rem .7rem' }}><span>Ingresos al inventario por RESGUARDO (sin tasa)</span></div>
              <div className="table-wrap"><table className="table" style={{ fontSize: '.82rem' }}>
                <thead><tr><th>Centro</th><th>Almacén</th><th className="num">KG</th></tr></thead>
                <tbody>
                  {(arr('ingresos_resguardo') as Array<{ centro: string; almacen: string; kg: number }>).map((g, i) => (
                    <tr key={i}><td>{g.centro || '—'}</td><td>{g.almacen}</td><td className="num mono">{fmt(g.kg)}</td></tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
          <div className="muted" style={{ fontSize: '.72rem' }}>La foto guarda todos los datos de la recepción al momento del cierre.</div>
        </div>
      )}

      {aBorrar && (
        <ConfirmDialog title="Eliminar cierre" message={`¿Eliminar el cierre de la Recepción N° ${aBorrar.numero}? (no revierte el inventario ya ingresado)`}
          confirmText="Eliminar" danger onConfirm={() => void borrar(aBorrar)} onCancel={() => setABorrar(null)} />
      )}
    </Modal>
  );
}
