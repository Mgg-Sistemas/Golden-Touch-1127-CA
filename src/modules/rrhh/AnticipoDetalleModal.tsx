/* ============================================================
   Golden Touch · RRHH · Detalle de un préstamo / anticipo

   Todo lo de UN préstamo: a quién, cuándo, cuánto, qué se abonó (por nómina,
   a mano o del histórico) y cuánto falta. Desde acá se abona a mano, se
   corrige el dato mal cargado y se saca el estado de cuenta en PDF.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { toast } from '@/shared/ui/Toast';
import { money, date, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { AnticipoPago, AnticipoPrestamo, EmpresaRrhh, Personal } from '@/shared/lib/types';
import {
  ETIQUETA_ORIGEN, ETIQUETA_TIPO, errorAbono, nombreCompleto, pagadoDe, r2,
} from './anticiposResumen';
import { editarAnticipo, eliminarAbono, listPagos, registrarAbono } from './anticipos.repository';
import { descargarPrestamosPdf, nombreArchivo } from './prestamosPdf';

const hoy = () => new Date().toISOString().slice(0, 10);

const numOrNull = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

export function AnticipoDetalleModal({
  anticipo, persona, empresa, canWrite, actor, actorName, onClose,
}: {
  anticipo: AnticipoPrestamo;
  persona: Personal | undefined;
  empresa: EmpresaRrhh;
  canWrite: boolean;
  actor: string;
  actorName: string | null;
  onClose: () => void;
}) {
  const [pagos, setPagos] = useState<AnticipoPago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [modo, setModo] = useState<'ver' | 'abonar' | 'editar'>('ver');
  const [porBorrar, setPorBorrar] = useState<AnticipoPago | null>(null);

  // Abono a mano
  const [abFecha, setAbFecha] = useState(hoy());
  const [abMonto, setAbMonto] = useState('');
  const [abNota, setAbNota] = useState('');

  // Edición
  const [edTipo, setEdTipo] = useState<AnticipoPrestamo['tipo']>(anticipo.tipo);
  const [edFecha, setEdFecha] = useState(String(anticipo.fecha ?? '').slice(0, 10));
  const [edMonto, setEdMonto] = useState(String(anticipo.monto_total ?? ''));
  const [edCuota, setEdCuota] = useState(anticipo.cuota_sugerida != null ? String(anticipo.cuota_sugerida) : '');
  const [edMotivo, setEdMotivo] = useState(anticipo.motivo ?? '');

  const recargar = useCallback(async () => {
    try { setPagos(await listPagos(anticipo.id)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los abonos'); }
    finally { setCargando(false); }
  }, [anticipo.id]);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['anticipos_pagos'], () => { void recargar(); });

  const saldo = Number(anticipo.saldo) || 0;
  const pagado = pagadoDe(anticipo);
  const abMontoNum = useMemo(() => numOrNull(abMonto), [abMonto]);
  const problemaAbono = modo === 'abonar'
    ? errorAbono(saldo, abMontoNum != null && Number.isFinite(abMontoNum) ? abMontoNum : null, abFecha, anticipo.fecha)
    : null;

  const edMontoNum = numOrNull(edMonto);
  const edCuotaNum = numOrNull(edCuota);
  const problemaEdicion = modo === 'editar'
    ? (edMontoNum == null || !Number.isFinite(edMontoNum) || edMontoNum <= 0) ? 'Indicá el monto total.'
      : r2(edMontoNum) < pagado ? `El total no puede ser menor que lo ya abonado (${money(pagado)}).`
        : !/^\d{4}-\d{2}-\d{2}$/.test(edFecha) ? 'Indicá la fecha del préstamo.'
          : (edCuotaNum != null && (Number.isNaN(edCuotaNum) || edCuotaNum < 0)) ? 'La cuota no puede ser negativa.'
            : null
    : null;

  async function abonar() {
    if (problemaAbono) { setError(problemaAbono); return; }
    setGuardando(true); setError(null);
    try {
      await registrarAbono(anticipo.id, { fecha: abFecha, monto: Number(abMontoNum), nota: abNota }, actor, actorName);
      toast('Abono registrado', 'success');
      setAbMonto(''); setAbNota(''); setAbFecha(hoy()); setModo('ver');
      await recargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el abono'); }
    finally { setGuardando(false); }
  }

  async function guardarEdicion() {
    if (problemaEdicion) { setError(problemaEdicion); return; }
    setGuardando(true); setError(null);
    try {
      await editarAnticipo(anticipo.id, {
        tipo: edTipo, fecha: edFecha, monto_total: Number(edMontoNum),
        cuota_sugerida: edCuotaNum != null && Number.isFinite(edCuotaNum) ? edCuotaNum : null, motivo: edMotivo,
      });
      toast('Préstamo actualizado', 'success');
      setModo('ver');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  }

  async function borrarAbono(p: AnticipoPago) {
    setPorBorrar(null);
    try { await eliminarAbono(p.id); toast('Abono eliminado: el saldo volvió a subir', 'success'); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar el abono', 'error'); }
  }

  async function pdf() {
    if (!persona) { toast('No se encontró el trabajador de este préstamo', 'error'); return; }
    try {
      await descargarPrestamosPdf({
        titulo: 'Estado de cuenta · ' + ETIQUETA_TIPO[anticipo.tipo],
        empresa,
        detalle: `${nombreCompleto(persona)} · ${ETIQUETA_TIPO[anticipo.tipo]} del ${date(anticipo.fecha)}`,
        grupos: [{ persona, anticipos: [anticipo], pagos }],
        archivo: nombreArchivo(`prestamo-${nombreCompleto(persona)}-${anticipo.fecha}`),
      });
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  }

  const nombre = nombreCompleto(persona);
  const activo = saldo > 0;

  return (
    <Modal
      title={`${ETIQUETA_TIPO[anticipo.tipo]} · ${nombre}`}
      size="lg"
      onClose={() => { if (!guardando) onClose(); }}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cerrar</button>
          <button className="btn btn-ghost" onClick={() => void pdf()} title="Estado de cuenta de este préstamo">↓ PDF</button>
          {canWrite && modo === 'ver' && (
            <>
              <button className="btn btn-ghost" onClick={() => { setError(null); setModo('editar'); }}>✏ Corregir</button>
              {activo && <button className="btn btn-primary" onClick={() => { setError(null); setModo('abonar'); }}>💵 Registrar abono</button>}
            </>
          )}
          {canWrite && modo === 'abonar' && (
            <button className="btn btn-primary" onClick={() => void abonar()} disabled={guardando || !!problemaAbono}>
              {guardando ? 'Guardando…' : 'Guardar el abono'}
            </button>
          )}
          {canWrite && modo === 'editar' && (
            <button className="btn btn-primary" onClick={() => void guardarEdicion()} disabled={guardando || !!problemaEdicion}>
              {guardando ? 'Guardando…' : 'Guardar los cambios'}
            </button>
          )}
        </>
      }
    >
      {error && (
        <div className="aviso danger" style={{ marginBottom: '.6rem' }}>
          <span className="aviso-icono">⛔</span><div><strong>Error:</strong> {error}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
        <div className="tira" style={{ flex: '1 1 140px' }}>
          <div className="tira-titulo">Total del préstamo</div>
          <div className="tira-valor mono">{money(anticipo.monto_total)}</div>
        </div>
        <div className="tira" style={{ flex: '1 1 140px' }}>
          <div className="tira-titulo">Total pagado</div>
          <div className="tira-valor mono" style={{ color: 'var(--success)' }}>{money(pagado)}</div>
        </div>
        <div className={`tira${activo ? ' danger' : ''}`} style={{ flex: '1 1 140px' }}>
          <div className="tira-titulo">Lo que debe</div>
          <div className="tira-valor mono">{money(saldo)}</div>
        </div>
        <div className="tira" style={{ flex: '1 1 140px' }}>
          <div className="tira-titulo">Estado</div>
          <div className="tira-valor" style={{ color: activo ? 'var(--warning)' : 'var(--success)' }}>{activo ? 'Activo' : 'Saldado'}</div>
        </div>
      </div>

      {modo !== 'editar' && (
        <VistaPrevia titulo="Datos del préstamo">
          <Dato label="Trabajador">{nombre}{persona?.ficha_nro ? ` · Ficha ${persona.ficha_nro}` : ''}{persona?.cedula ? ` · C.I. ${persona.cedula}` : ''}</Dato>
          <Dato label="Tipo">{ETIQUETA_TIPO[anticipo.tipo]}{anticipo.historico ? ' · cargado como histórico' : ''}</Dato>
          <Dato label="Fecha del préstamo"><span className="mono">{date(anticipo.fecha)}</span></Dato>
          <Dato label="Cuota sugerida por quincena">{anticipo.cuota_sugerida != null ? <span className="mono">{money(anticipo.cuota_sugerida)}</span> : undefined}</Dato>
          <Dato label="Motivo">{anticipo.motivo || undefined}</Dato>
          <Dato label="Registrado">{dateTime(anticipo.created_at)}{anticipo.actor_name || anticipo.creado_por ? ` · ${anticipo.actor_name || anticipo.creado_por}` : ''}</Dato>
        </VistaPrevia>
      )}

      {modo === 'editar' && (
        <div className="card" style={{ margin: '.6rem 0 .8rem', padding: '.8rem' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>Corregir el préstamo</div>
          <div className="form-grid">
            <div className="form-row">
              <label>Tipo</label>
              <select className="select" value={edTipo} onChange={(e) => setEdTipo(e.target.value as AnticipoPrestamo['tipo'])}>
                <option value="prestamo">Préstamo</option>
                <option value="anticipo">Anticipo</option>
              </select>
            </div>
            <div className="form-row">
              <label>Fecha del préstamo *</label>
              <input className="input" type="date" value={edFecha} onChange={(e) => setEdFecha(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Monto total (USD) *</label>
              <input className="input mono" type="number" min={0} step="any" value={edMonto} onChange={(e) => setEdMonto(e.target.value)} />
              <small className="muted">Ya abonado: {money(pagado)}. El saldo se rehace solo.</small>
            </div>
            <div className="form-row">
              <label>Cuota sugerida por quincena</label>
              <input className="input mono" type="number" min={0} step="any" value={edCuota} onChange={(e) => setEdCuota(e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label>Motivo</label>
              <input className="input" value={edMotivo} onChange={(e) => setEdMotivo(e.target.value)} placeholder="Adelanto de quincena, préstamo personal…" />
            </div>
          </div>
          {problemaEdicion && <div className="aviso warning sm" style={{ marginTop: '.5rem' }}><span className="aviso-icono">⚠</span><div>{problemaEdicion}</div></div>}
          <button className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }} onClick={() => { setModo('ver'); setError(null); }} disabled={guardando}>Cancelar</button>
        </div>
      )}

      {modo === 'abonar' && (
        <div className="card" style={{ margin: '.6rem 0 .8rem', padding: '.8rem' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>Registrar un abono a mano</div>
          <div className="form-grid">
            <div className="form-row">
              <label>Monto (USD) *</label>
              <input className="input mono" type="number" min={0} step="any" autoFocus value={abMonto} onChange={(e) => setAbMonto(e.target.value)} placeholder="0,00" />
              <small className="muted">Falta por pagar: {money(saldo)}</small>
            </div>
            <div className="form-row">
              <label>Fecha del abono *</label>
              <input className="input" type="date" value={abFecha} onChange={(e) => setAbFecha(e.target.value)} />
            </div>
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label>Nota (opcional)</label>
              <input className="input" value={abNota} onChange={(e) => setAbNota(e.target.value)} placeholder="Ej. pagó en efectivo en la oficina" />
            </div>
          </div>
          {problemaAbono && <div className="aviso warning sm" style={{ marginTop: '.5rem' }}><span className="aviso-icono">⚠</span><div>{problemaAbono}</div></div>}
          <small className="muted" style={{ display: 'block', marginTop: '.4rem' }}>
            Los descuentos de nómina se registran solos al pagar la quincena; esto es para un pago por fuera.
          </small>
          <button className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }} onClick={() => { setModo('ver'); setError(null); }} disabled={guardando}>Cancelar</button>
        </div>
      )}

      <div className="card-title" style={{ margin: '.8rem 0 .4rem' }}>Abonos <span className="badge">{pagos.length}</span></div>
      {cargando && <p className="muted">Cargando…</p>}
      {!cargando && !pagos.length && <p className="muted" style={{ fontSize: '.85rem' }}>Todavía no tiene abonos.</p>}
      {!cargando && !!pagos.length && (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Nota</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Cargado</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{date(p.fecha)}</td>
                  <td><span className="badge">{ETIQUETA_ORIGEN[p.origen] ?? p.origen}</span></td>
                  <td className="muted">{p.nota || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--success)' }}>{money(p.monto)}</td>
                  <td className="muted" style={{ fontSize: '.76rem' }}>{dateTime(p.created_at)}{(p.actor_name || p.created_by) && <div>{p.actor_name || p.created_by}</div>}</td>
                  {canWrite && (
                    <td style={{ textAlign: 'center' }}>
                      {p.origen !== 'nomina' && (
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Eliminar este abono" onClick={() => setPorBorrar(p)}>🗑</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Total pagado</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(pagado)}</td>
                <td colSpan={canWrite ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <small className="muted" style={{ display: 'block', marginTop: '.6rem' }}>
        Los abonos de <strong>nómina</strong> no se borran desde acá: quedan casados con la quincena pagada. Los abonos a mano y los históricos sí.
      </small>

      {porBorrar && (
        <ConfirmDialog
          title="Eliminar abono"
          danger
          confirmText="Sí, eliminar"
          message={<>El saldo del préstamo <strong>vuelve a subir</strong> en el monto de este abono.</>}
          preview={
            <VistaPrevia titulo="Se va a eliminar">
              <Dato label="Fecha"><span className="mono">{date(porBorrar.fecha)}</span></Dato>
              <Dato label="Origen">{ETIQUETA_ORIGEN[porBorrar.origen]}</Dato>
              <Dato label="Monto"><strong className="mono">{money(porBorrar.monto)}</strong></Dato>
              <Dato label="Nota">{porBorrar.nota || undefined}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void borrarAbono(porBorrar); }}
          onCancel={() => setPorBorrar(null)}
        />
      )}
    </Modal>
  );
}
