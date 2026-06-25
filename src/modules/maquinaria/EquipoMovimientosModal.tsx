import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import { num as fmtNum, date as fmtDate } from '@/shared/lib/format';
import { listMantenimientos, etiquetaTipoMant, type MantenimientoCalc } from './maquinariaMant.repository';
import { listServiciosDeEquipo, type ServicioDeEquipo } from '@/modules/pedidos/servicios.repository';
import { listServiciosDirectosDeEquipo, type ServicioDirecto } from '@/modules/pedidos/serviciosDirectos.repository';
import { descargarMovimientosEquipoPdf, type MovimientoEquipoRow } from './servicioMantenimientoPdf';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';

/** Detalle de consumo de un registro de bitácora (aceite/gasoil/refrigerante/km/trabajo). */
function detalleBitacora(r: MantenimientoCalc): string {
  const partes: string[] = [];
  if (r.aceite_lts) partes.push(`Aceite ${fmtNum(r.aceite_lts)} L`);
  if (r.gasoil_lts) partes.push(`Gasoil ${fmtNum(r.gasoil_lts)} L`);
  if (r.refrigerante_lts) partes.push(`Refrig. ${fmtNum(r.refrigerante_lts)} L`);
  const km = (r as unknown as { kilometraje?: number | null }).kilometraje;
  if (km != null) partes.push(`Km ${fmtNum(km)}`);
  if (r.horometro != null) partes.push(`Horóm. ${fmtNum(r.horometro)}`);
  if (r.trabajo) partes.push(r.trabajo);
  if (r.consumibles) partes.push(r.consumibles);
  return partes.join(' · ') || '—';
}

/**
 * Historial de movimientos/consumos de UN equipo: une la bitácora (cambios de
 * aceite/filtro, trabajos…) con las solicitudes de servicio (cauchos, repuestos…)
 * en una línea de tiempo por fecha, filtrable por rango y con descarga a PDF.
 */
export function EquipoMovimientosModal({ equipo, onClose }: { equipo: MaquinariaEquipo; onClose: () => void }) {
  const [bitacora, setBitacora] = useState<MantenimientoCalc[]>([]);
  const [servicios, setServicios] = useState<ServicioDeEquipo[]>([]);
  const [directos, setDirectos] = useState<ServicioDirecto[]>([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s, d] = await Promise.all([
        listMantenimientos(equipo.id).catch(() => [] as MantenimientoCalc[]),
        listServiciosDeEquipo(equipo.id).catch(() => [] as ServicioDeEquipo[]),
        listServiciosDirectosDeEquipo(equipo.id).catch(() => [] as ServicioDirecto[]),
      ]);
      setBitacora(b); setServicios(s); setDirectos(d);
    } finally { setLoading(false); }
  }, [equipo.id]);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['maquinaria_mantenimientos', 'ordenes', 'servicios_directos'], () => { void cargar(); });

  // Timeline unificado (bitácora + solicitudes de servicio), ordenado por fecha desc.
  const rows: MovimientoEquipoRow[] = useMemo(() => {
    const out: MovimientoEquipoRow[] = [];
    for (const r of bitacora) {
      out.push({ fecha: r.fecha, origen: 'Bitácora', tipo: etiquetaTipoMant(r.tipo), detalle: detalleBitacora(r) });
    }
    for (const s of servicios) {
      const detalle = (s.servicios ?? []).map((x) => `${x.nombre}${x.cantidad ? ` ×${x.cantidad}` : ''}`).join(', ') || '—';
      out.push({ fecha: s.created_at, origen: 'Servicio', tipo: `${s.codigo}${s.estado ? ` (${s.estado})` : ''}`, detalle });
    }
    for (const d of directos) {
      // Solo los renglones casados a ESTE equipo (o todos si el servicio es de cabecera del equipo).
      const propios = (d.items ?? []).filter((x) => x.equipo_id === equipo.id);
      const lineas = propios.length ? propios : (d.equipo_id === equipo.id ? (d.items ?? []) : []);
      if (!lineas.length) continue;
      const detalle = lineas.map((x) => `${x.descripcion}${x.cantidad ? ` ×${fmtNum(x.cantidad)}` : ''}`).join(', ') || d.descripcion;
      out.push({ fecha: d.finalizada_at ?? d.created_at, origen: 'Servicio', tipo: `${d.codigo ?? 'Servicio directo'} (${d.estado === 'finalizada' ? 'pagado' : 'en proceso'})`, detalle });
    }
    return out.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }, [bitacora, servicios, directos]);

  const rowsFiltradas = useMemo(() => rows.filter((r) => {
    const f = (r.fecha || '').slice(0, 10);
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  }), [rows, desde, hasta]);

  async function pdf() {
    try { await descargarMovimientosEquipoPdf(equipo.equipo, rowsFiltradas, { desde, hasta }); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      <button className="btn btn-primary" disabled={!rowsFiltradas.length} onClick={() => void pdf()}>↓ PDF del historial</button>
    </>
  );

  return (
    <Modal title={`🔧 Movimientos · ${equipo.equipo}`} size="xl" onClose={onClose} footer={footer}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.7rem' }}>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
          Desde <input className="input" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
          Hasta <input className="input" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} />
        </label>
        {(desde || hasta) && <button className="btn btn-sm btn-ghost" onClick={() => { setDesde(''); setHasta(''); }}>✕ Fechas</button>}
        <span className="muted" style={{ fontSize: '.78rem', marginLeft: 'auto' }}>{rowsFiltradas.length} movimiento(s){loading ? ' · cargando…' : ''}</span>
      </div>

      <div className="table-wrap" style={{ maxHeight: 460, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Fecha</th><th>Origen</th><th>Tipo</th><th>Detalle / consumo</th></tr></thead>
          <tbody>
            {!rowsFiltradas.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Sin movimientos en el período.</td></tr>}
            {rowsFiltradas.map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.fecha)}</td>
                <td><span className="badge" style={{ background: r.origen === 'Servicio' ? '#0ea5e9' : 'var(--surface-2)', color: r.origen === 'Servicio' ? '#fff' : undefined }}>{r.origen}</span></td>
                <td>{r.tipo}</td>
                <td>{r.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: '.72rem', margin: '.4rem 0 0' }}>
        Une la <strong>bitácora</strong> del equipo (aceite, gasoil, filtros, trabajos) con las <strong>solicitudes de servicio</strong> (cauchos, repuestos…). Ej.: «25/06 · Cambio de cauchos ×6».
      </p>
    </Modal>
  );
}
