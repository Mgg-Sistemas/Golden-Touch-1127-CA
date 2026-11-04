/* ============================================================
   Golden Touch · Administración · pestaña «Configuración»
   Lo que el módulo deja configurar de verdad + la referencia que ata todo:
   · Categorías contables de gasto fijo (plan de cuentas PROPIO del módulo):
     agregar, renombrar, activar/desactivar. Gestionarlas aquí (full control).
   · Tasa BCV del día en uso (la misma de Tesorería) — referencia.
   · Base legal de los parafiscales FAOV — referencia.
   · Empresas del módulo (conteo + acceso a «Gestionar empresas»).
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { FAOV_TIERS } from './administracionParafiscal';
import type { AdminCategoria, AdminRepo, Empresa } from './admin.repository';

const num2 = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fFecha = (s: string | null) => (s ? new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${s}T00:00:00`)) : '—');

export function ConfiguracionTab({ repo, empresas, puedeFull = true, onGestionarEmpresas }: {
  repo: AdminRepo;
  empresas: Empresa[];
  puedeFull?: boolean;
  onGestionarEmpresas?: () => void;
}) {
  const [tasa, setTasa] = useState<{ usd: number; eur: number; fecha: string | null } | null>(null);
  const [cargandoTasa, setCargandoTasa] = useState(true);

  const [cats, setCats] = useState<AdminCategoria[]>([]);
  const [cargandoCats, setCargandoCats] = useState(true);
  const [nueva, setNueva] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    getTasaHoy()
      .then((t) => { if (vivo) setTasa({ usd: Number(t?.usd) || 0, eur: Number(t?.eur) || 0, fecha: t?.fecha ?? null }); })
      .catch(() => { if (vivo) setTasa(null); })
      .finally(() => { if (vivo) setCargandoTasa(false); });
    return () => { vivo = false; };
  }, []);

  const cargarCats = useCallback(async () => {
    setCargandoCats(true);
    try { setCats(await repo.listAdminCategorias()); }
    catch { setCats([]); }
    finally { setCargandoCats(false); }
  }, [repo]);
  useEffect(() => { void cargarCats(); }, [cargarCats]);

  async function agregar() {
    const n = nueva.trim();
    if (!n) { toast('Escriba el nombre de la categoría.', 'warning', { silent: true }); return; }
    if (cats.some((c) => c.nombre.toLowerCase() === n.toLowerCase())) { toast('Ya existe una categoría con ese nombre.', 'warning', { silent: true }); return; }
    setOcupado(true);
    try { await repo.crearAdminCategoria(n); setNueva(''); toast('Categoría agregada.', 'success'); await cargarCats(); }
    catch (e) { toast(`No se pudo agregar: ${e instanceof Error ? e.message : 'error'}`, 'error'); }
    finally { setOcupado(false); }
  }
  async function guardarNombre() {
    if (!editId) return;
    const n = editNombre.trim();
    if (!n) { toast('El nombre no puede quedar vacío.', 'warning', { silent: true }); return; }
    setOcupado(true);
    try { await repo.renombrarAdminCategoria(editId, n); setEditId(null); setEditNombre(''); toast('Categoría renombrada.', 'success'); await cargarCats(); }
    catch (e) { toast(`No se pudo renombrar: ${e instanceof Error ? e.message : 'error'}`, 'error'); }
    finally { setOcupado(false); }
  }
  async function alternar(c: AdminCategoria) {
    setOcupado(true);
    try { await repo.setActivaAdminCategoria(c.id, !c.activa); await cargarCats(); }
    catch (e) { toast(`No se pudo cambiar el estado: ${e instanceof Error ? e.message : 'error'}`, 'error'); }
    finally { setOcupado(false); }
  }

  const activas = empresas.filter((e) => e.activa).length;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Categorías del módulo (lo que se configura de verdad) */}
      <div className="card">
        <div className="card-title">🗂 Categorías de gasto del módulo</div>
        <p className="muted hint" style={{ marginTop: '.2rem' }}>
          El plan de cuentas propio de Administración: lo que aparece al clasificar un gasto fijo o un movimiento. Es independiente del catálogo general del sistema.
        </p>
        {puedeFull && (
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', margin: '.6rem 0' }}>
            <input className="input" style={{ flex: '1 1 220px' }} value={nueva} onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }} placeholder="Nueva categoría (p. ej. Seguros)" disabled={ocupado} />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void agregar()} disabled={ocupado}>+ Agregar</button>
          </div>
        )}
        {cargandoCats ? (
          <p className="muted" style={{ marginTop: '.4rem' }}>Leyendo categorías…</p>
        ) : cats.length === 0 ? (
          <EmptyState icon="🗂" message={puedeFull ? 'Sin categorías todavía. Agregue la primera arriba.' : 'El módulo no tiene categorías cargadas.'} />
        ) : (
          <div className="adm-tabla" style={{ marginTop: '.2rem' }}>
            <table>
              <thead><tr><th>Categoría</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id} className={c.activa ? undefined : 'adm-fila-off'}>
                    <td>
                      {editId === c.id ? (
                        <input className="input" value={editNombre} onChange={(e) => setEditNombre(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void guardarNombre(); if (e.key === 'Escape') setEditId(null); }} autoFocus disabled={ocupado} />
                      ) : c.nombre}
                    </td>
                    <td><span className={`adm-badge ${c.activa ? 'activo' : 'suspendido'}`}>{c.activa ? 'Activa' : 'Inactiva'}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {puedeFull ? (
                        editId === c.id ? (
                          <>
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => void guardarNombre()} disabled={ocupado}>Guardar</button>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEditId(null); setEditNombre(''); }} disabled={ocupado}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEditId(c.id); setEditNombre(c.nombre); }}>Renombrar</button>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void alternar(c)} disabled={ocupado}>{c.activa ? 'Desactivar' : 'Activar'}</button>
                          </>
                        )
                      ) : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tasa BCV en uso */}
      <div className="card">
        <div className="card-title">💱 Tasa BCV del día</div>
        <p className="muted hint" style={{ marginTop: '.2rem' }}>
          La tasa que usan los equivalentes del tablero, el reporte y la calculadora de parafiscales. Sale de Tesorería (la misma de todo el sistema).
        </p>
        {cargandoTasa ? (
          <p className="muted" style={{ marginTop: '.4rem' }}>Leyendo la tasa…</p>
        ) : tasa && (tasa.usd > 0 || tasa.eur > 0) ? (
          <div className="adm-kpis" style={{ marginTop: '.6rem', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="adm-kpi oro"><span className="adm-kpi-lbl">USD</span><span className="adm-kpi-num">{num2(tasa.usd)}</span><span className="adm-kpi-sub">Bs por dólar</span></div>
            <div className="adm-kpi oro"><span className="adm-kpi-lbl">EUR</span><span className="adm-kpi-num">{num2(tasa.eur)}</span><span className="adm-kpi-sub">Bs por euro</span></div>
            <div className="adm-kpi"><span className="adm-kpi-lbl">Fecha</span><span className="adm-kpi-num" style={{ fontSize: '1.05rem' }}>{fFecha(tasa.fecha)}</span><span className="adm-kpi-sub">última publicada</span></div>
          </div>
        ) : (
          <div className="adm-aviso" style={{ marginTop: '.5rem' }}>No hay tasa cargada (inicie sesión o cárguela en Tesorería). Mientras tanto, los equivalentes usan 40 Bs/USD de respaldo.</div>
        )}
      </div>

      {/* Parafiscales (FAOV) */}
      <div className="card">
        <div className="card-title">⚖ Parafiscales · FAOV / BANAVIH</div>
        <p className="muted hint" style={{ marginTop: '.2rem' }}>
          Base de la calculadora (pestaña Movimientos → «Parafiscal»). Según Gaceta Extra 6.805, art. 98, la multa = <b>factor × la tasa BCV de mayor valor</b>, según el tamaño de la nómina. Los factores son fijos por ley.
        </p>
        <div className="adm-tabla" style={{ marginTop: '.6rem' }}>
          <table>
            <thead><tr><th>Tamaño de la nómina</th><th style={{ textAlign: 'right' }}>Factor</th></tr></thead>
            <tbody>
              {FAOV_TIERS.map((t) => (
                <tr key={t.nivel}><td>{t.label}</td><td className="mono" style={{ textAlign: 'right' }}><span className="adm-chip">{t.factor}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {tasa && (tasa.usd > 0 || tasa.eur > 0) && (
          <p className="muted hint" style={{ marginTop: '.5rem', fontSize: '.78rem' }}>
            Ejemplo hoy (≤50 trabajadores): 165 × {num2(Math.max(tasa.usd, tasa.eur))} = <b>Bs {num2(165 * Math.max(tasa.usd, tasa.eur))}</b>.
          </p>
        )}
      </div>

      {/* Empresas y proveedores */}
      <div className="card">
        <div className="card-title">🏢 Empresas y proveedores</div>
        <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem', display: 'grid', gap: '.4rem', lineHeight: 1.5 }}>
          <li><b>Empresas del módulo</b>: {empresas.length} registrada(s), {activas} activa(s). Es la lista propia de Administración (razón social, RIF, moneda, logo).</li>
          <li><b>Proveedores</b>: se comparten con Pedidos; se agregan y editan desde allá para que todo el sistema use los mismos.</li>
        </ul>
        {puedeFull && onGestionarEmpresas && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '.4rem' }} onClick={onGestionarEmpresas}>⚙ Gestionar empresas</button>
        )}
      </div>
    </div>
  );
}
