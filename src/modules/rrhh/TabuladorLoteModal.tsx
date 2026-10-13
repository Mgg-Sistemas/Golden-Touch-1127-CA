/* ============================================================
   Golden Touch · RRHH · Tabulador desde los cargos (13/10/2026)

   Arma el tabulador de una vez a partir de los cargos que ya tiene el
   personal activo de la nómina (más los que ya están en el tabulador):
   cada cargo muestra su sueldo anterior y se le escribe el NUEVO (a mano o
   con un ajuste en % para todos). Antes de guardar se puede imprimir la
   propuesta en PDF o sacarla en Excel (sueldo anterior y nuevo). Guardar
   no cambia el sueldo de nadie: para eso sigue «Aplicar tabulador».
   ============================================================ */
import { useMemo, useState } from 'react';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { money } from '@/shared/lib/format';
import type { EmpresaRrhh, Personal } from '@/shared/lib/types';
import {
  ajustarPorcentaje, claveCargo, filasDesdeCargos, leerMonto, loteParaGuardar,
  type EntradaLote, type FilaReporteTabulador, type TabuladorCargo,
} from './tabulador';
import { guardarTabuladorLote } from './tabulador.repository';
import { etiquetaVariacion, variacionSueldo } from './sueldos';

const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const texto = (n: number | null) => (n == null ? '' : String(n));

export function TabuladorLoteModal({ empresa, personal, tabulador, onClose, onGuardado }: {
  empresa: EmpresaRrhh;
  personal: Personal[];
  tabulador: TabuladorCargo[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  // Las filas se arman una vez al abrir: si alguien cambia el tabulador mientras
  // tanto, lo que aquí se escribió no se pisa.
  const [filas] = useState(() => filasDesdeCargos(personal, tabulador, empresa));
  const [nuevos, setNuevos] = useState<Record<string, string>>(
    () => Object.fromEntries(filas.map((f) => [claveCargo(f.cargo), texto(f.anterior)])),
  );
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState('');
  const [pct, setPct] = useState('');
  const [motivo, setMotivo] = useState(tabulador.length ? 'Ajuste del tabulador' : 'Tabulador por cargo');
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ocupado, setOcupado] = useState<'pdf' | 'xlsx' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const k = (cargo: string) => claveCargo(cargo);
  const visibles = useMemo(() => {
    const q = claveCargo(buscar);
    return q ? filas.filter((f) => k(f.cargo).includes(q)) : filas;
  }, [filas, buscar]);
  const entradas: EntradaLote[] = filas.filter((f) => !fuera.has(k(f.cargo)))
    .map((f) => ({ fila: f, nuevo: leerMonto(nuevos[k(f.cargo)] ?? '') }));
  const lote = loteParaGuardar(entradas);
  const nuevosCargos = lote.guardar.filter((g) => !g.id).length;

  // Lo que va al PDF / Excel: lo marcado, con lo escrito (o el anterior si quedó vacío).
  const reporte: FilaReporteTabulador[] = entradas.map(({ fila, nuevo }) => ({
    cargo: fila.cargo, activos: fila.activos, anterior: fila.anterior,
    nuevo: nuevo != null && Number.isFinite(nuevo) ? Math.round(nuevo * 100) / 100 : (fila.anterior ?? 0),
    minHoy: fila.minHoy, maxHoy: fila.maxHoy, nota: fila.nota,
  }));

  function aplicarPct() {
    const p = leerMonto(pct);
    if (p == null || !Number.isFinite(p)) { toast('Escribe el porcentaje (ej.: 10 o -5).', 'warning'); return; }
    setNuevos((prev) => {
      const n = { ...prev };
      for (const f of filas) if (!fuera.has(k(f.cargo)) && f.anterior != null) n[k(f.cargo)] = String(ajustarPorcentaje(f.anterior, p));
      return n;
    });
  }

  function alternar(cargo: string) {
    setFuera((s) => { const n = new Set(s); if (n.has(k(cargo))) n.delete(k(cargo)); else n.add(k(cargo)); return n; });
  }

  async function bajar(formato: 'pdf' | 'xlsx') {
    setOcupado(formato);
    try {
      const rep = await import('./tabuladorReportes');
      const o = { empresa, tipo: 'propuesta' as const, motivo };
      if (formato === 'pdf') await rep.descargarTabuladorPdf(reporte, o);
      else await rep.descargarTabuladorExcel(reporte, o);
    } catch (e) { toast(errMsg(e, 'No se pudo generar el archivo'), 'error'); }
    finally { setOcupado(null); }
  }

  async function guardar() {
    setConfirmar(false);
    if (lote.error) { setError(lote.error); return; }
    setGuardando(true); setError(null);
    try {
      await guardarTabuladorLote(empresa, lote.guardar, motivo);
      toast(`Tabulador guardado: ${lote.guardar.length} cargo(s). Para que el personal cobre el sueldo nuevo, usa «Aplicar tabulador».`, 'success');
      onGuardado();
    } catch (e) {
      setError(errMsg(e, 'No se pudo guardar el tabulador'));
    } finally { setGuardando(false); }
  }

  return (
    <Modal
      title={`Tabulador desde los cargos · Nómina ${empresa}`}
      size="xl"
      onClose={() => { if (!guardando) onClose(); }}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn btn-ghost" disabled={!reporte.length || !!ocupado} onClick={() => void bajar('xlsx')}
            title="La propuesta en Excel: sueldo anterior y nuevo de cada cargo">{ocupado === 'xlsx' ? 'Generando…' : '📊 Excel'}</button>
          <button className="btn btn-ghost" disabled={!reporte.length || !!ocupado} onClick={() => void bajar('pdf')}
            title="La propuesta en PDF: sueldo anterior y nuevo de cada cargo, con firmas">{ocupado === 'pdf' ? 'Generando…' : '📄 PDF'}</button>
          <button className="btn btn-primary" disabled={guardando || !!lote.error || !motivo.trim()} onClick={() => setConfirmar(true)}
            title={lote.error ?? 'Guardar estos sueldos en el tabulador'}>
            {guardando ? 'Guardando…' : `Guardar en el tabulador${lote.guardar.length ? ` (${lote.guardar.length})` : ''}`}
          </button>
        </>
      }
    >
      {error && <div className="aviso danger sm" style={{ marginBottom: '.5rem' }}><span className="aviso-icono">⛔</span><div>{error}</div></div>}
      <p className="muted" style={{ marginTop: 0, fontSize: '.86rem' }}>
        Están todos los cargos del <strong>personal activo</strong> de la nómina y los que ya tiene el tabulador. Escribe el
        <strong> sueldo nuevo</strong> de cada uno (o súbelos todos en un %). El <strong>sueldo anterior</strong> es el del tabulador o,
        si el cargo no estaba, el que más se repite entre sus activos. Guardar no cambia el sueldo de nadie hasta usar <strong>⚖ Aplicar tabulador</strong>.
      </p>

      <div className="form-grid" style={{ marginBottom: '.6rem' }}>
        <div className="form-row">
          <label htmlFor="tab-lote-buscar">Buscar cargo</label>
          <input id="tab-lote-buscar" className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Ej. operador" />
        </div>
        <div className="form-row">
          <label htmlFor="tab-lote-pct">Ajuste general (%)</label>
          <div style={{ display: 'flex', gap: '.35rem' }}>
            <input id="tab-lote-pct" className="input mono" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)}
              placeholder="10 · -5" style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={aplicarPct}
              title="Sueldo nuevo = sueldo anterior + el %, en todos los cargos marcados">Aplicar a todos</button>
          </div>
        </div>
        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <label htmlFor="tab-lote-motivo">Motivo (va al historial del tabulador) *</label>
          <input id="tab-lote-motivo" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      </div>

      {!filas.length ? (
        <EmptyState icon="📊" message="No hay personal activo con cargo en esta nómina." />
      ) : (
        <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input type="checkbox" aria-label="Marcar todos" checked={!fuera.size}
                    onChange={() => setFuera(fuera.size ? new Set() : new Set(filas.map((f) => k(f.cargo))))} />
                </th>
                <th>Cargo</th>
                <th style={{ textAlign: 'center' }}>Activos</th>
                <th style={{ textAlign: 'right' }}>Sueldo anterior</th>
                <th style={{ textAlign: 'right', minWidth: 130 }}>Sueldo nuevo (USD)</th>
                <th style={{ textAlign: 'right' }}>Variación</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const key = k(f.cargo);
                const off = fuera.has(key);
                const n = leerMonto(nuevos[key] ?? '');
                const valido = n != null && Number.isFinite(n) && n >= 0;
                const v = valido && f.anterior != null ? variacionSueldo(f.anterior, n) : null;
                return (
                  <tr key={key} style={off ? { opacity: .5 } : undefined}>
                    <td><input type="checkbox" aria-label={`Incluir ${f.cargo}`} checked={!off} onChange={() => alternar(f.cargo)} /></td>
                    <td>
                      <strong>{f.cargo}</strong>
                      {!f.id && <span className="badge" style={{ marginLeft: '.4rem', color: 'var(--info, var(--accent))' }}>nuevo en el tabulador</span>}
                    </td>
                    <td className="mono" style={{ textAlign: 'center' }}>{f.activos}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {f.anterior == null ? '—' : money(f.anterior)}
                      {f.minHoy != null && f.maxHoy != null && f.minHoy !== f.maxHoy && (
                        <div className="muted" style={{ fontSize: '.72rem' }}>hoy: {money(f.minHoy)} – {money(f.maxHoy)}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input className="input mono" inputMode="decimal" value={nuevos[key] ?? ''} disabled={off}
                        aria-label={`Sueldo nuevo de ${f.cargo}`}
                        style={{ textAlign: 'right', maxWidth: 130, borderColor: !off && !valido ? 'var(--danger)' : undefined }}
                        onChange={(e) => setNuevos((prev) => ({ ...prev, [key]: e.target.value }))} />
                    </td>
                    <td className="mono" style={{ textAlign: 'right', color: !v || v.sentido === 'igual' ? undefined : v.sentido === 'sube' ? 'var(--success)' : 'var(--warning)' }}>
                      {v ? etiquetaVariacion(v) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>
        {entradas.length} cargo(s) marcados · {lote.error ? lote.error : `${lote.guardar.length} se guardan (${nuevosCargos} nuevo(s) en el tabulador)`}.
        Desmarca un cargo para dejarlo fuera del tabulador y del PDF.
      </small>

      {confirmar && (
        <ConfirmDialog
          title="Guardar en el tabulador"
          confirmText={`Sí, guardar ${lote.guardar.length} cargo(s)`}
          message={<>Cada cargo queda en el historial del tabulador con el motivo. <strong>No cambia el sueldo de nadie</strong> hasta usar «Aplicar tabulador».</>}
          preview={
            <VistaPrevia titulo="Se va a guardar">
              <Dato label="Cargos"><span className="mono">{lote.guardar.length}</span> ({nuevosCargos} nuevo(s) · {lote.guardar.length - nuevosCargos} con sueldo cambiado)</Dato>
              <Dato label="Motivo">{motivo.trim()}</Dato>
              <Dato label="Cuáles">
                <div style={{ maxHeight: 160, overflow: 'auto', fontSize: '.8rem' }}>
                  {lote.guardar.map((g) => {
                    const f = filas.find((x) => k(x.cargo) === k(g.cargo));
                    return <div key={g.cargo}>{g.cargo}: <span className="mono">{f?.anterior == null ? '—' : money(f.anterior)} → <strong>{money(g.monto)}</strong></span></div>;
                  })}
                </div>
              </Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void guardar(); }}
          onCancel={() => setConfirmar(false)}
        />
      )}
    </Modal>
  );
}
