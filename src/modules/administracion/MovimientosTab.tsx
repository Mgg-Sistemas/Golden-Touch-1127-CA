/* ============================================================
   Golden Touch · Administración · pestaña «Movimientos / Histórico»
   El histórico de egresos de gastos fijos: la lista, «Generar pendientes del
   período» (motor en administracionGenerar.ts → repo), alta manual e
   importación (parser en administracionImport.ts). Un pendiente generado se
   materializa en Tesorería (servicio directo «por pagar»). Estilo del sistema.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { tokenPeriodo, type Moneda } from './administracionCalculo';
import { parseImportacion } from './administracionImport';
import type { AdminRepo, Empresa, Movimiento, OpcionRef } from './admin.repository';

const fFecha = new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const montoFmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ORIGEN_LABEL: Record<Movimiento['origen'], string> = { generado: 'Generado', importado: 'Importado', manual: 'Manual' };
const periodoLabel = (() => {
  const s = new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(new Date()).replace(' de ', ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
})();

export function MovimientosTab({ repo, empresaClave, empresas, puedeEscribir = true }: {
  repo: AdminRepo;
  empresaClave: string | null;
  empresas: Empresa[];
  /** Sin escritura: lista de solo lectura (sin generar/importar/registrar/pagar). */
  puedeEscribir?: boolean;
}) {
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [categorias, setCategorias] = useState<OpcionRef[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [modal, setModal] = useState<'manual' | 'importar' | null>(null);

  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias]);
  const nombreEmp = useMemo(() => new Map(empresas.map((e) => [e.clave, e.nombre])), [empresas]);
  const mostrarEmpresa = empresaClave == null;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [ms, cats] = await Promise.all([repo.listMovimientos(empresaClave ?? undefined), repo.listCategorias().catch(() => [] as OpcionRef[])]);
      setMovs(ms);
      setCategorias(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer los movimientos.');
    } finally {
      setCargando(false);
    }
  }, [repo, empresaClave]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function generar() {
    setGenerando(true);
    try {
      const { creados } = await repo.generarPendientes(empresaClave ?? undefined);
      toast(creados ? `Se generaron ${creados} pendiente(s) y van a Tesorería.` : 'No había pendientes nuevos para este período.', creados ? 'success' : 'info');
      if (creados) await cargar();
    } catch (e) {
      toast(`No se pudieron generar: ${e instanceof Error ? e.message : 'error'}`, 'error');
    } finally {
      setGenerando(false);
    }
  }
  async function pagar(m: Movimiento) {
    try { await repo.marcarPagado(m.id); toast('Marcado como pagado.', 'success'); await cargar(); }
    catch (e) { toast(`No se pudo: ${e instanceof Error ? e.message : 'error'}`, 'error'); }
  }

  return (
    <>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
          <span>Movimientos / Histórico {empresaClave ? `· ${nombreEmp.get(empresaClave) ?? empresaClave}` : '· todas las empresas'}</span>
          {puedeEscribir && (
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void generar()} disabled={generando}
                title={`Crea los pendientes que falten hasta ${periodoLabel} y los manda a Tesorería`}>⚙ Generar pendientes</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal('importar')}>⬆ Importar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal('manual')}>+ Registrar</button>
            </div>
          )}
        </div>

        {error && <div className="adm-aviso" style={{ marginTop: '.5rem' }}>No se pudo leer: {/sesi|jwt|auth|401|permission|relation|does not exist/i.test(error) ? 'inicia sesión o la base aún no tiene las tablas del módulo.' : error}</div>}

        {cargando ? (
          <p className="muted" style={{ marginTop: '.5rem' }}>Leyendo movimientos…</p>
        ) : movs.length === 0 && !error ? (
          <EmptyState icon="📒" message="No hay movimientos. Usá «Generar pendientes», «Importar» o «Registrar»." />
        ) : (
          <div className="adm-tabla" style={{ marginTop: '.6rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  {mostrarEmpresa && <th>Empresa</th>}
                  <th>Concepto</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th>Período</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                  <th>Origen</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fFecha.format(new Date(`${m.fecha}T00:00:00`))}</td>
                    {mostrarEmpresa && <td className="mono">{m.empresaClave}</td>}
                    <td>{m.concepto}</td>
                    <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{montoFmt(m.monto)} {m.moneda}</td>
                    <td className="mono">{m.periodo}</td>
                    <td>{m.categoriaGastoId && nombreCat.get(m.categoriaGastoId) ? <span className="adm-chip">{nombreCat.get(m.categoriaGastoId)}</span> : '—'}</td>
                    <td><span className={`adm-badge pago-${m.estadoPago}`}>{m.estadoPago === 'pagado' ? 'Pagado' : m.estadoPago === 'pendiente' ? 'Pendiente' : 'Anulado'}</span></td>
                    <td className="muted" style={{ fontSize: '.82rem' }}>{ORIGEN_LABEL[m.origen]}{m.servicioDirectoId ? ' · en Tesorería' : ''}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {puedeEscribir && m.estadoPago === 'pendiente' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => void pagar(m)}>Marcar pagado</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === 'manual' && (
        <MovimientoManualModal repo={repo} empresas={empresas} empresaClaveFija={empresaClave} categorias={categorias}
          onClose={() => setModal(null)} onSaved={() => void cargar()} />
      )}
      {modal === 'importar' && (
        <ImportarModal repo={repo} empresas={empresas} categorias={categorias}
          onClose={() => setModal(null)} onSaved={() => void cargar()} />
      )}
    </>
  );
}

/* ───────── Alta manual ───────── */
function MovimientoManualModal({ repo, empresas, empresaClaveFija, categorias, onClose, onSaved }: {
  repo: AdminRepo; empresas: Empresa[]; empresaClaveFija: string | null; categorias: OpcionRef[]; onClose: () => void; onSaved: () => void;
}) {
  const activas = empresas.filter((e) => e.activa);
  const [empresaClave, setEmpresaClave] = useState(empresaClaveFija ?? activas[0]?.clave ?? '');
  const [concepto, setConcepto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [categoriaGastoId, setCategoria] = useState('');
  const [estadoPago, setEstado] = useState<'pagado' | 'pendiente'>('pagado');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const m = Number(monto.replace(',', '.'));
    if (!empresaClave) return toast('Elegí una empresa.', 'error');
    if (!concepto.trim()) return toast('Poné un concepto.', 'error');
    if (!Number.isFinite(m) || m < 0) return toast('Monto inválido.', 'error');
    setGuardando(true);
    try {
      await repo.crearMovimiento({
        empresaClave, gastoFijoId: null, concepto: concepto.trim(), proveedorNombre: proveedor.trim() || null,
        categoriaGastoId: categoriaGastoId || null, periodo: tokenPeriodo(fecha, 'mensual'), fecha,
        monto: Math.round(m * 100) / 100, moneda, tasaRef: null, estadoPago, origen: 'manual', servicioDirectoId: null,
      });
      toast('Movimiento registrado.', 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast(`No se pudo registrar: ${e instanceof Error ? e.message : 'error'}`, 'error');
    } finally {
      setGuardando(false);
    }
    return undefined;
  }

  return (
    <Modal title="📒 Registrar movimiento" onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>Registrar</button>
      </>}>
      <div className="form-grid-2">
        <div className="form-row">
          <label htmlFor="mv-empresa">Empresa</label>
          <select id="mv-empresa" className="input" value={empresaClave} onChange={(e) => setEmpresaClave(e.target.value)}>{activas.map((e) => <option key={e.id} value={e.clave}>{e.nombre}</option>)}</select>
        </div>
        <div className="form-row">
          <label htmlFor="mv-fecha">Fecha</label>
          <input id="mv-fecha" type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="form-row" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="mv-concepto">Concepto</label>
          <input id="mv-concepto" className="input" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Agua, alquiler, honorarios…" autoFocus />
        </div>
        <div className="form-row">
          <label htmlFor="mv-prov">Proveedor / beneficiario <span className="muted">(opcional)</span></label>
          <input id="mv-prov" className="input" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="mv-cat">Categoría</label>
          <select id="mv-cat" className="input" value={categoriaGastoId} onChange={(e) => setCategoria(e.target.value)}><option value="">Sin categoría</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        </div>
        <div className="form-row">
          <label htmlFor="mv-monto">Monto</label>
          <input id="mv-monto" className="input" type="number" min="0" step="0.01" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0,00" />
        </div>
        <div className="form-row">
          <label htmlFor="mv-moneda">Moneda</label>
          <select id="mv-moneda" className="input" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}><option value="USD">USD</option><option value="Bs">Bs</option></select>
        </div>
        <div className="form-row">
          <label htmlFor="mv-estado">Estado</label>
          <select id="mv-estado" className="input" value={estadoPago} onChange={(e) => setEstado(e.target.value as 'pagado' | 'pendiente')}><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option></select>
        </div>
      </div>
    </Modal>
  );
}

/* ───────── Importación ───────── */
function ImportarModal({ repo, empresas, categorias, onClose, onSaved }: {
  repo: AdminRepo; empresas: Empresa[]; categorias: OpcionRef[]; onClose: () => void; onSaved: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [importando, setImportando] = useState(false);
  const res = useMemo(() => (texto.trim() ? parseImportacion(texto, { empresas, categorias }) : null), [texto, empresas, categorias]);

  function leerArchivo(file: File | undefined) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setTexto(String(r.result ?? ''));
    r.onerror = () => toast('No se pudo leer el archivo.', 'error');
    r.readAsText(file);
  }
  async function importar() {
    if (!res || !res.filas.length) return;
    setImportando(true);
    try {
      for (const f of res.filas) await repo.crearMovimiento(f);
      toast(`Se importaron ${res.filas.length} movimiento(s)${res.errores.length ? `, ${res.errores.length} con error` : ''}.`, 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast(`No se pudo importar: ${e instanceof Error ? e.message : 'error'}`, 'error');
    } finally {
      setImportando(false);
    }
  }

  return (
    <Modal title="⬆ Importar histórico" onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={() => void importar()} disabled={importando || !res || !res.filas.length}>
          Importar {res?.filas.length ? `${res.filas.length} fila(s)` : ''}
        </button>
      </>}>
      <p className="muted hint" style={{ marginTop: 0 }}>
        CSV con encabezado. Columnas: <b>empresa, fecha, concepto, monto, moneda</b> (obligatorias) · proveedor, periodo, categoria, estado, nota (opcionales).
      </p>
      <input type="file" accept=".csv,.txt" className="input" onChange={(e) => leerArchivo(e.target.files?.[0])} />
      <textarea className="input" style={{ width: '100%', minHeight: 120, marginTop: '.5rem', fontFamily: 'monospace', fontSize: '.82rem' }}
        value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'empresa,fecha,concepto,monto,moneda\nGT,2026-10-05,Agua,"1.800,00",Bs'} />
      {res && (
        <div className="adm-aviso demo" style={{ marginTop: '.6rem' }}>
          Listas para importar: <b>{res.filas.length}</b>. {res.errores.length > 0 && <>Con error: <b>{res.errores.length}</b> — {res.errores.slice(0, 5).map((e) => `fila ${e.fila}: ${e.motivo}`).join(' · ')}{res.errores.length > 5 ? '…' : ''}</>}
        </div>
      )}
    </Modal>
  );
}
