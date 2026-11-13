/* ============================================================
   Conciliación · validación y cruce del archivo del Drive (12/11/2026).
   Misma validación que la importación de Inventario: estado general, tarjetas
   de conteo, errores por columna y detalle por fila con filtro. Con filas con
   error no se aplica: hay que corregir el archivo y volver a cargarlo.
   ============================================================ */
import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { aplicarCruceDrive } from './conciliacion.repository';
import { TOLERANCIA_BS, type CruceDrive, type FilaCruce, type ResultadoFila } from './cruceDrive';

const ESTADO: Record<CruceDrive['estado'], { color: string; icono: string; texto: string }> = {
  Validado: { color: '#10b981', icono: '✅', texto: 'Todas las filas se cruzaron y cuadran.' },
  'Con observaciones': { color: '#f59e0b', icono: '⚠', texto: 'Hay filas que no cuadran o que no están en Conciliación. Se puede aplicar.' },
  Error: { color: '#ef4444', icono: '❌', texto: 'El archivo trae filas con error de datos. Corrígelas y vuelve a cargarlo.' },
};

const RESULTADO: Record<ResultadoFila, { label: string; clase: string }> = {
  cuadra: { label: 'CUADRA', clase: 'success' },
  no_cuadra: { label: 'NO CUADRA', clase: 'danger' },
  no_encontrada: { label: 'No encontrada', clase: 'warning' },
  error: { label: 'Error', clase: 'danger' },
  ignorada: { label: 'Ignorada', clase: 'muted' },
};

type Filtro = 'todos' | ResultadoFila;
const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'todos', label: 'Todas' },
  { key: 'cuadra', label: 'Cuadra' },
  { key: 'no_cuadra', label: 'No cuadra' },
  { key: 'no_encontrada', label: 'No encontradas' },
  { key: 'error', label: 'Con error' },
  { key: 'ignorada', label: 'Ignoradas' },
];

export function CruceDriveModal({ cruce, archivo, actor, onClose, onAplicado }: {
  cruce: CruceDrive;
  archivo: File;
  actor: { email: string; nombre?: string | null };
  onClose: () => void;
  onAplicado: () => void;
}) {
  const [aplicando, setAplicando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>(
    cruce.conError ? 'error' : cruce.noCuadran ? 'no_cuadra' : cruce.noEncontradas ? 'no_encontrada' : 'todos',
  );
  const filas = cruce.filas.filter((f) => filtro === 'todos' || f.resultado === filtro);
  const est = ESTADO[cruce.estado];
  const docsCuadran = [...cruce.porDoc.values()].filter((d) => d.estado === 'cuadra').length;
  const puedeAplicar = cruce.estado !== 'Error' && cruce.porDoc.size > 0;

  async function aplicar() {
    setAplicando(true);
    try {
      const n = await aplicarCruceDrive(cruce, archivo, actor);
      toast(`DRIVE/BANCO: ${n} documento${n === 1 ? '' : 's'} cruzado${n === 1 ? '' : 's'} (${docsCuadran} cuadra${docsCuadran === 1 ? '' : 'n'}).`, 'success');
      onAplicado();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar el cruce', 'error');
      setAplicando(false);
    }
  }

  return (
    <Modal title={`📂 Cruce con el Drive/Banco · ${archivo.name}`} size="xl" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={aplicando}>Cancelar</button>
        {puedeAplicar
          ? <button className="btn btn-primary" onClick={() => void aplicar()} disabled={aplicando}>
              {aplicando ? 'Guardando…' : `✓ Aplicar a ${cruce.porDoc.size} documento${cruce.porDoc.size === 1 ? '' : 's'}`}
            </button>
          : <button className="btn btn-danger" disabled title="Corrige el archivo antes de aplicar">
              ✖ {cruce.estado === 'Error' ? 'No se puede aplicar' : 'Nada que aplicar'}
            </button>}
      </>}>
      <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: '1rem' }}>
        <Tarjeta big icono={est.icono} color={est.color} titulo={`Estado: ${cruce.estado}`} subtitulo={est.texto} />
        <Tarjeta icono="∑" color="#64748b" titulo="Filas con datos" subtitulo={String(cruce.total)} />
        <Tarjeta icono="✓" color="#10b981" titulo="Cuadran" subtitulo={String(cruce.cuadran)} />
        <Tarjeta icono="≠" color="#ef4444" titulo="No cuadran" subtitulo={String(cruce.noCuadran)} />
        <Tarjeta icono="?" color="#f59e0b" titulo="No encontradas" subtitulo={String(cruce.noEncontradas)} />
        <Tarjeta icono="❌" color="#ef4444" titulo="Con error" subtitulo={String(cruce.conError)} />
      </div>

      {cruce.hojas && cruce.hojas.length > 1 && (
        <div className="card" style={{ padding: '.6rem .9rem', marginBottom: '1rem', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
          <div style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--primary-2, #60a5fa)', marginBottom: '.3rem' }}>
            📑 Se procesaron {cruce.hojas.length} hojas del libro de Excel:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
            {cruce.hojas.map((h) => (
              <span key={h} className="badge" style={{ background: '#1e293b', color: '#93c5fd', border: '1px solid #3b82f6', fontSize: '.75rem' }}>
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      {Object.keys(cruce.errorPorColumna).length > 0 && (
        <div className="card" style={{ padding: '.75rem 1rem', marginBottom: '1rem' }}>
          <strong>Errores por columna</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.4rem' }}>
            {Object.entries(cruce.errorPorColumna).map(([col, n]) => <span key={col} className="badge danger">{col}: {n}</span>)}
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: '.8rem', marginTop: 0 }}>
        Se cruza por <strong>código de OC</strong> y, si no viene o no existe, por <strong>referencia</strong>. CUADRA cuando la referencia es la
        del pago y el monto en Bs coincide (±{TOLERANCIA_BS} Bs). Al aplicar, la columna <strong>DRIVE/BANCO</strong> de cada documento cruzado
        queda en CUADRA o NO CUADRA; los que no vienen en el archivo no cambian.
        {cruce.ignoradas > 0 && <> Se ignoran {cruce.ignoradas} fila(s) sin código ni referencia (saldos, totales…).</>}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.5rem', alignItems: 'center' }}>
        <strong>Detalle de filas</strong>
        <div className="view-switch" style={{ marginTop: 0, padding: '.15rem' }}>
          {FILTROS.map((x) => (
            <button key={x.key} type="button" className={`view-switch-tab${filtro === x.key ? ' active' : ''}`}
              onClick={() => setFiltro(x.key)} style={{ padding: '.25rem .65rem', fontSize: '.74rem' }}>{x.label}</button>
          ))}
        </div>
        <span className="muted mono" style={{ marginLeft: 'auto', fontSize: '.75rem' }}>{filas.length} fila(s)</span>
      </div>
      <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.8rem' }}>
          <thead>
            <tr><th style={{ width: 50 }}>Fila</th><th>Código OC</th><th>Referencia</th><th style={{ textAlign: 'right' }}>Monto Bs</th><th>Resultado</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            {filas.map((f) => <FilaTr key={f.fila} f={f} />)}
            {!filas.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin filas para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function FilaTr({ f }: { f: FilaCruce }) {
  const r = RESULTADO[f.resultado];
  return (
    <tr style={{ opacity: f.resultado === 'ignorada' ? 0.55 : 1 }}>
      <td className="mono">
        {f.fila}
        {f.hoja && <div className="muted" style={{ fontSize: '.68rem', whiteSpace: 'nowrap' }}>{f.hoja}</div>}
      </td>
      <td className="mono">{f.oc || '—'}{f.doc && f.doc.codigo !== f.oc && <div className="muted" style={{ fontSize: '.7rem' }}>→ {f.doc.codigo}</div>}</td>
      <td className="mono">{f.referencia || '—'}</td>
      <td className="mono" style={{ textAlign: 'right' }}>
        {f.montoBs != null ? f.montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (f.montoTexto || '—')}
      </td>
      <td><span className={`badge ${r.clase}`}>{r.label}</span></td>
      <td style={{ fontSize: '.76rem' }}>{f.detalle}</td>
    </tr>
  );
}

function Tarjeta({ icono, color, titulo, subtitulo, big }: { icono: string; color: string; titulo: string; subtitulo: string; big?: boolean }) {
  return (
    <div className="card" style={{ margin: 0, padding: '.7rem .85rem', borderLeft: `4px solid ${color}`, gridColumn: big ? '1 / -1' : undefined }}>
      <div style={{ fontWeight: 700, fontSize: big ? '1rem' : '.82rem' }}><span style={{ color }}>{icono}</span> {titulo}</div>
      <div className={big ? 'muted' : 'mono'} style={{ fontSize: big ? '.84rem' : '1.2rem', marginTop: '.2rem' }}>{subtitulo}</div>
    </div>
  );
}
