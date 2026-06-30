import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import {
  listRecepciones, crearRecepcion, actualizarRecepcion, eliminarRecepcion,
  promElemento, promedioLote, ELEMENTOS_LAB,
  type RecepcionLab, type AnalisisElemento,
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

export function RecepcionesPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('recepciones', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [filas, setFilas] = useState<RecepcionLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<RecepcionLab | null>(null);

  // Espejo de las filas para leer el estado vigente desde onBlur sin closures viejos.
  const filasRef = useRef<RecepcionLab[]>([]);
  filasRef.current = filas;

  const reload = useCallback(async () => {
    try { setFilas(await listRecepciones()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar las recepciones', 'error'); }
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reload().finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);

  useRealtime(['recepciones_lab'], () => { void reload(); });

  /** Edita una celda A/B/C de un elemento (vivo, para recalcular el Prom al instante). */
  function setCeldaAbc(id: string, key: string, sub: 'a' | 'b' | 'c', value: string) {
    setFilas((prev) => prev.map((f) => {
      if (f.id !== id) return f;
      const prevEl = (f.analisis?.[key] && typeof f.analisis[key] === 'object') ? f.analisis[key] as AnalisisElemento : {};
      const el: AnalisisElemento = { ...prevEl, [sub]: value === '' ? null : Number(value) };
      return { ...f, analisis: { ...f.analisis, [key]: el } };
    }));
  }
  function setCeldaUcv(id: string, value: string) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, analisis: { ...f.analisis, ucv: value === '' ? null : Number(value) } } : f)));
  }

  /** Persiste el análisis vigente de una fila (al salir de una celda). */
  async function guardarAnalisis(id: string) {
    const fila = filasRef.current.find((f) => f.id === id);
    if (!fila) return;
    try { await actualizarRecepcion(id, { analisis: fila.analisis }); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar el análisis', 'error'); void reload(); }
  }

  /** Persiste un campo de cabecera (peso, procedencia, fecha, item, n° análisis). */
  async function guardarCampo(id: string, patch: Parameters<typeof actualizarRecepcion>[1]) {
    try { await actualizarRecepcion(id, patch); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); void reload(); }
  }

  async function nueva() {
    setCreando(true);
    try {
      await crearRecepcion({ actor, actorName });
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo crear la recepción', 'error'); }
    finally { setCreando(false); }
  }

  async function borrar(f: RecepcionLab) {
    try { await eliminarRecepcion(f.id); setFilas((prev) => prev.filter((x) => x.id !== f.id)); toast('Recepción eliminada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setABorrar(null); }
  }

  // Total de columnas de la sección de laboratorio (para el ancho de las cabeceras).
  const colsCab = 6; // Ítem, Fecha/Hora, Peso KG, Procedencia, N° Análisis, (acciones)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>📋 Recepciones</h1>
          <p className="muted" style={{ margin: '.2rem 0 0', fontSize: '.85rem' }}>
            Cada cierre de caja del Centro de Acopio genera una recepción con el saldo de KG de casiterita.
            El laboratorio carga el análisis por elemento (A/B/C → Promedio). <strong>No entra al inventario al cerrar la caja.</strong>
          </p>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => void nueva()} disabled={creando}>
            {creando ? 'Creando…' : '＋ Nueva recepción'}
          </button>
        )}
      </div>

      {loading ? (
        <EmptyState message="Cargando recepciones…" icon="◔" />
      ) : !filas.length ? (
        <EmptyState message="Aún no hay recepciones. Se crean al cerrar la caja del Centro de Acopio, o con «Nueva recepción»." icon="📋" />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>
              {/* Título de la sección de laboratorio, centrado, encima de los elementos. */}
              <thead>
                <tr>
                  <th colSpan={colsCab} style={{ background: 'var(--surface-2)' }}></th>
                  <th colSpan={ELEMENTOS_LAB.reduce((a, e) => a + (e.abc ? 4 : 1), 0)}
                    style={{ textAlign: 'center', background: '#f7d9b0', color: '#1a1a1a', fontWeight: 800, letterSpacing: '.04em' }}>
                    RECEPCIÓN GLOBAL LABORATORIO
                  </th>
                </tr>
                <tr>
                  <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Ítem</th>
                  <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Fecha y hora</th>
                  <th rowSpan={2} className="num" style={{ verticalAlign: 'bottom' }}>Peso KG</th>
                  <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Procedencia</th>
                  <th rowSpan={2} className="num" style={{ verticalAlign: 'bottom' }}>N° Análisis</th>
                  {ELEMENTOS_LAB.map((e) => (
                    <th key={e.key} colSpan={e.abc ? 4 : 1}
                      style={{ textAlign: 'center', background: e.color, color: '#1a1a1a', fontWeight: 700 }}>
                      {e.label}{e.sub ? <div style={{ fontSize: '.66rem', fontWeight: 600 }}>{e.sub}</div> : null}
                    </th>
                  ))}
                  {canWrite && <th rowSpan={2} style={{ verticalAlign: 'bottom' }}></th>}
                </tr>
                <tr>
                  {ELEMENTOS_LAB.map((e) => (
                    e.abc
                      ? ['A', 'B', 'C', 'Prom.'].map((s) => (
                          <th key={`${e.key}-${s}`} className="num" style={{ background: e.color, color: '#1a1a1a' }}>{s}</th>
                        ))
                      : <th key={`${e.key}-prom`} className="num" style={{ background: e.color, color: '#1a1a1a' }}>Prom.</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    {/* Ítem */}
                    <td className="num">
                      <input className="input mono" type="number" min={1} defaultValue={f.item} disabled={!canWrite}
                        onBlur={(e) => { const v = Math.max(1, Math.round(Number(e.target.value) || 1)); if (v !== f.item) void guardarCampo(f.id, { item: v }); }}
                        style={{ width: 56, textAlign: 'right' }} />
                    </td>
                    {/* Fecha y hora */}
                    <td>
                      <input className="input" type="datetime-local" defaultValue={isoToLocal(f.fecha_hora)} disabled={!canWrite}
                        onBlur={(e) => { if (e.target.value) void guardarCampo(f.id, { fecha_hora: localToIso(e.target.value) }); }}
                        style={{ width: 180 }} />
                    </td>
                    {/* Peso KG */}
                    <td className="num">
                      <input className="input mono" type="number" min={0} step="any" defaultValue={f.peso_kg} disabled={!canWrite}
                        onBlur={(e) => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== Number(f.peso_kg)) void guardarCampo(f.id, { peso_kg: v }); }}
                        style={{ width: 90, textAlign: 'right' }} />
                    </td>
                    {/* Procedencia */}
                    <td>
                      <input className="input" defaultValue={f.procedencia} disabled={!canWrite}
                        onBlur={(e) => { const v = e.target.value.trim() || 'PERAMANAL'; if (v !== f.procedencia) void guardarCampo(f.id, { procedencia: v }); }}
                        style={{ width: 140 }} />
                    </td>
                    {/* N° Análisis */}
                    <td className="num">
                      <input className="input mono" type="number" min={1} defaultValue={f.n_analisis ?? ''} disabled={!canWrite}
                        onBlur={(e) => { const raw = e.target.value; const v = raw === '' ? null : Math.max(1, Math.round(Number(raw) || 1)); if (v !== f.n_analisis) void guardarCampo(f.id, { n_analisis: v }); }}
                        style={{ width: 64, textAlign: 'right' }} />
                    </td>

                    {/* Elementos: A/B/C + Prom (o Prom único para UCV) */}
                    {ELEMENTOS_LAB.map((e) => {
                      const prom = promElemento(f.analisis, e.key, e.abc);
                      if (!e.abc) {
                        const val = (typeof f.analisis?.[e.key] === 'number') ? f.analisis[e.key] as number : '';
                        return (
                          <td key={`${f.id}-${e.key}`} className="num">
                            <input className="input mono" type="number" step="any" value={val ?? ''} disabled={!canWrite}
                              onChange={(ev) => setCeldaUcv(f.id, ev.target.value)} onBlur={() => void guardarAnalisis(f.id)}
                              style={{ width: 64, textAlign: 'right' }} />
                          </td>
                        );
                      }
                      const el = (f.analisis?.[e.key] && typeof f.analisis[e.key] === 'object') ? f.analisis[e.key] as AnalisisElemento : {};
                      return (
                        <td key={`${f.id}-${e.key}`} className="num" style={{ padding: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {(['a', 'b', 'c'] as const).map((s) => (
                              <input key={s} className="input mono" type="number" step="any" value={(el[s] ?? '') as number | ''} disabled={!canWrite}
                                onChange={(ev) => setCeldaAbc(f.id, e.key, s, ev.target.value)} onBlur={() => void guardarAnalisis(f.id)}
                                style={{ width: 52, textAlign: 'right', borderRadius: 0 }} />
                            ))}
                            <span className="mono" style={{ width: 56, textAlign: 'right', padding: '0 .3rem', fontWeight: 700, color: 'var(--primary-3)' }}>
                              {prom == null ? '—' : fmt(prom)}
                            </span>
                          </div>
                        </td>
                      );
                    })}

                    {canWrite && (
                      <td>
                        <button className="btn btn-sm btn-ghost" title="Eliminar recepción" onClick={() => setABorrar(f)}>🗑</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>

              {/* Promedio del lote: promedio de los Prom de cada elemento en todas las recepciones. */}
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={colsCab - 1} style={{ textAlign: 'right' }}>Promedio del lote</td>
                  <td className="num"></td>
                  {ELEMENTOS_LAB.map((e) => {
                    const pl = promedioLote(filas, e.key, e.abc);
                    if (!e.abc) {
                      return <td key={`pl-${e.key}`} className="num mono" style={{ background: e.color, color: '#1a1a1a' }}>{pl == null ? '—' : fmt(pl)}</td>;
                    }
                    return (
                      <td key={`pl-${e.key}`} className="num" style={{ padding: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ width: 52 }} /><span style={{ width: 52 }} /><span style={{ width: 52 }} />
                          <span className="mono" style={{ width: 56, textAlign: 'right', padding: '0 .3rem', background: e.color, color: '#1a1a1a', fontWeight: 800 }}>
                            {pl == null ? '—' : fmt(pl)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  {canWrite && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="muted" style={{ fontSize: '.74rem', padding: '.5rem .75rem' }}>
            Prom. = (A + B + C) / 3 · Promedio del lote = promedio de los Prom. de todas las recepciones con valor · {num(filas.length)} recepción(es).
            Los cambios se guardan al salir de cada celda y se sincronizan en tiempo real.
          </div>
        </div>
      )}

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar recepción"
          message={`¿Eliminar la recepción Ítem ${aBorrar.item} (${fmt(Number(aBorrar.peso_kg))} kg)? Se borra su análisis de laboratorio.`}
          confirmText="Eliminar"
          danger
          onConfirm={() => void borrar(aBorrar)}
          onCancel={() => setABorrar(null)}
        />
      )}
    </div>
  );
}
