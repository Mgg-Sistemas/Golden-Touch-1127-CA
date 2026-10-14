/* ============================================================
   Golden Touch · Choferes / Conductores · Rutas y viajes (traído de MGG, 13/10/2026)

   Una orden de ruta nace PROGRAMADA (chofer, vehículo, origen, destino,
   paradas, carga y hora de salida). Se INICIA cuando el chofer sale (hora y
   km reales), se van marcando las paradas, y se FINALIZA al llegar (hora y
   km). Cancelar deja el motivo; nada se borra. Un viaje que ya pasó (histórico
   o que no se cargó a tiempo) se carga con «Viaje ya realizado»: entra directo
   como FINALIZADO con sus horas y km reales, y se corrige con ✎.
   En GT no hay pagos ni viáticos: solo las rutas.

   Switch Camión / Volqueta (14/10/2026): el camión es la orden de ruta de
   arriba (con empresa y cantidad de viajes, como su planilla); la volqueta se
   anota por día como en su planilla: chofer, vehículo, material, origen,
   destino, fecha y VIAJES. Todo registro se puede eliminar (🗑).

   Avisos al programar: chofer de descanso ese día, documentos vencidos,
   vehículo en taller. La base no deja dos rutas EN RUTA del mismo chofer o
   del mismo vehículo.
   ============================================================ */
import { useMemo, useState, type FormEvent } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { listadoFlotaPdf, type ListadoFlota } from '@/modules/maquinaria/flotaPdf';
import { listadoFlotaExcel } from '@/modules/maquinaria/flotaExcel';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { EmptyState } from '@/shared/ui/EmptyState';
import { DecimalInput } from '@/shared/ui/DecimalInput';
import { toast } from '@/shared/ui/Toast';
import {
  ESTADO_VIAJE, TIPOS_VIAJE, alertasDocumentos, errorViajeRealizado, progresoParadas, textoRuta, totalViajes, textoViajes,
  diaVE, horaVE, fechaCorta,
  type EstadoViaje, type Parada, type TipoViaje,
} from './choferes';
import {
  cancelarViaje, crearViaje, editarViaje, finalizarViaje, guardarParadas, iniciarViaje,
  crearViajeVolqueta, editarViajeVolqueta, eliminarViaje,
  type Conductor, type VehiculoFlota, type Viaje, type ViajeInput,
} from './choferes.repository';
import { FlotaModal } from './ExpedienteTab';
import { aDatetimeLocal, ahoraLocal, fechaHora, nombreConductor, textoVehiculo, type PropsTab } from './ChoferesPage';

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function ViajesTab({ datos, canWrite, actor, actorName }: PropsTab) {
  const { conductores, flota, viajes, descansos, hoy, loading, recargar } = datos;
  // Switch Camión / Volqueta (14/10/2026): cada uno con su planilla.
  const [tipo, setTipo] = useState<TipoViaje>(() => {
    try { return localStorage.getItem('gt-choferes-tipo-viaje') === 'volqueta' ? 'volqueta' : 'camion'; } catch { return 'camion'; }
  });
  const cambiarTipo = (t: TipoViaje) => { setTipo(t); setEstado(''); try { localStorage.setItem('gt-choferes-tipo-viaje', t); } catch { /* sin almacenamiento */ } };
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoViaje | ''>('');
  const [choferId, setChoferId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [form, setForm] = useState<Viaje | 'nuevo' | null>(null);
  const [formVolq, setFormVolq] = useState<Viaje | 'nuevo' | null>(null);
  const [detalle, setDetalle] = useState<Viaje | null>(null);
  const [accion, setAccion] = useState<{ tipo: 'iniciar' | 'finalizar' | 'cancelar'; viaje: Viaje } | null>(null);
  const [borrar, setBorrar] = useState<Viaje | null>(null);

  const porId = useMemo(() => new Map(conductores.map((c) => [c.id, c])), [conductores]);
  const vehPorId = useMemo(() => new Map(flota.map((v) => [v.id, v])), [flota]);

  const delTipo = useMemo(() => viajes.filter((v) => v.tipo_viaje === tipo), [viajes, tipo]);
  const filas = useMemo(() => {
    const t = normal(texto.trim());
    return delTipo.filter((v) => {
      const dia = diaVE(v.salida_real_at ?? v.fecha_salida);
      return (!estado || v.estado === estado)
        && (!choferId || v.chofer_id === choferId)
        && (!desde || dia >= desde) && (!hasta || dia <= hasta)
        && (!t || normal(`${v.numero} ${nombreConductor(porId.get(v.chofer_id))} ${v.origen} ${v.destino} ${v.carga ?? ''} ${v.empresa ?? ''} ${textoVehiculo(vehPorId.get(v.vehiculo_id ?? ''))} ${(v.paradas ?? []).map((p) => p.lugar).join(' ')}`).includes(t));
    });
  }, [delTipo, texto, estado, choferId, desde, hasta, porId, vehPorId]);

  const conteo = useMemo(() => {
    const m: Record<EstadoViaje, number> = { programado: 0, en_ruta: 0, finalizado: 0, cancelado: 0 };
    for (const v of delTipo) m[v.estado]++;
    return m;
  }, [delTipo]);
  const total = totalViajes(filas);

  function listado(): ListadoFlota & { numeros: number[] } {
    const filtro = [choferId ? nombreConductor(porId.get(choferId)) : null, desde ? `desde ${fechaCorta(desde)}` : null, hasta ? `hasta ${fechaCorta(hasta)}` : null, texto.trim() ? `«${texto.trim()}»` : null].filter(Boolean).join(' · ');
    const base = { subtitulo: `${filtro || 'Todos los registros'} · ${textoViajes(total)}`, archivo: `viajes-${tipo}-${hoy}` };
    if (tipo === 'volqueta') {
      return {
        ...base, titulo: 'VIAJES DE VOLQUETA',
        encabezados: ['Nombre y apellido', 'Vehículo', 'Material', 'Origen', 'Destino', 'Fecha', 'Viajes'],
        anchos: [3, 2.6, 2.4, 2.4, 2.4, 1.5, 1], numeros: [6],
        filas: [...filas].reverse().map((v) => [nombreConductor(porId.get(v.chofer_id)), textoVehiculo(vehPorId.get(v.vehiculo_id ?? '')), v.carga ?? '', v.origen, v.destino, fechaCorta(diaVE(v.fecha_salida)), v.cantidad_viajes]),
      };
    }
    return {
      ...base, titulo: 'VIAJES DE CAMIÓN',
      encabezados: ['Fecha', 'Hora', 'Empresa', 'Nombre y apellido', 'Carro', 'Desde', 'Hasta', 'Carga', 'Viajes', 'Estado'],
      anchos: [1.4, 1, 2, 2.8, 2.4, 2.2, 2.2, 2, .9, 1.3], numeros: [8],
      filas: [...filas].reverse().map((v) => {
        const at = v.salida_real_at ?? v.fecha_salida;
        return [fechaCorta(diaVE(at)), horaVE(at), v.empresa ?? '', nombreConductor(porId.get(v.chofer_id)), textoVehiculo(vehPorId.get(v.vehiculo_id ?? '')), v.origen, v.destino, v.carga ?? '', v.cantidad_viajes, ESTADO_VIAJE[v.estado].label];
      }),
    };
  }
  async function exportar(como: 'pdf' | 'excel') {
    try { if (como === 'pdf') await listadoFlotaPdf(listado()); else await listadoFlotaExcel(listado()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo exportar', 'error'); }
  }

  const hayActivos = conductores.some((c) => c.activo);
  const acciones = (v: Viaje) => (
    <td className="actions" style={{ whiteSpace: 'nowrap' }}>
      {v.tipo_viaje === 'camion' && <button className="btn btn-sm btn-ghost" onClick={() => setDetalle(v)} title="Ver detalle y paradas">👁</button>}
      {canWrite && v.tipo_viaje === 'volqueta' && <button className="btn btn-sm btn-ghost" onClick={() => setFormVolq(v)} title="Corregir">✎</button>}
      {canWrite && v.tipo_viaje === 'camion' && (v.estado === 'programado' || v.estado === 'en_ruta' || v.estado === 'finalizado') && <button className="btn btn-sm btn-ghost" onClick={() => setForm(v)} title={v.estado === 'finalizado' ? 'Corregir el viaje' : 'Editar'}>✎</button>}
      {canWrite && v.tipo_viaje === 'camion' && v.estado === 'programado' && <button className="btn btn-sm btn-primary" onClick={() => setAccion({ tipo: 'iniciar', viaje: v })} title="Iniciar ruta">▶</button>}
      {canWrite && v.tipo_viaje === 'camion' && v.estado === 'en_ruta' && <button className="btn btn-sm btn-success" onClick={() => setAccion({ tipo: 'finalizar', viaje: v })} title="Finalizar ruta">🏁</button>}
      {canWrite && v.tipo_viaje === 'camion' && (v.estado === 'programado' || v.estado === 'en_ruta') && <button className="btn btn-sm btn-ghost" onClick={() => setAccion({ tipo: 'cancelar', viaje: v })} title="Cancelar (queda en el histórico)">✖</button>}
      {canWrite && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setBorrar(v)} title="Eliminar">🗑</button>}
    </td>
  );

  return (
    <div>
      <div className="seg-control chf-tipo-viaje" role="radiogroup" aria-label="Tipo de viaje">
        {(Object.keys(TIPOS_VIAJE) as TipoViaje[]).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} className={tipo === t ? 'activo' : ''} onClick={() => cambiarTipo(t)} title={TIPOS_VIAJE[t].hint}>
            {TIPOS_VIAJE[t].icon} {TIPOS_VIAJE[t].label} <span className="n">{textoViajes(totalViajes(viajes.filter((v) => v.tipo_viaje === t)))}</span>
          </button>
        ))}
      </div>

      <div className="desc-barra">
        <input className="input desc-buscar" placeholder={tipo === 'volqueta' ? '🔍 Buscar por chofer, material, origen, destino, placa…' : '🔍 Buscar por N°, chofer, empresa, origen, destino, carga, placa…'} value={texto} onChange={(e) => setTexto(e.target.value)} />
        {tipo === 'camion' && (
          <select className="select" style={{ width: 'auto' }} value={estado} onChange={(e) => setEstado(e.target.value as EstadoViaje | '')} aria-label="Estado">
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_VIAJE).map(([k, e]) => <option key={k} value={k}>{e.icon} {e.label} ({conteo[k as EstadoViaje]})</option>)}
          </select>
        )}
        <select className="select" style={{ width: 'auto', maxWidth: 220 }} value={choferId} onChange={(e) => setChoferId(e.target.value)} aria-label="Chofer">
          <option value="">Todos los choferes</option>
          {conductores.map((c) => <option key={c.id} value={c.id}>{nombreConductor(c)}</option>)}
        </select>
        <input className="input" type="date" style={{ width: 'auto' }} value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" title="Desde" />
        <input className="input" type="date" style={{ width: 'auto' }} value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" title="Hasta" />
        <div className="desc-acciones">
          <span className="chip">{tipo === 'camion' ? `🚛 ${conteo.en_ruta} en ruta · 📅 ${conteo.programado} programados · ` : ''}Σ {textoViajes(total)}</span>
          <button className="btn btn-sm btn-ghost" disabled={!filas.length} onClick={() => void exportar('pdf')}>↓ PDF</button>
          <button className="btn btn-sm btn-ghost" disabled={!filas.length} onClick={() => void exportar('excel')}>↓ Excel</button>
          {canWrite && tipo === 'camion' && <button className="btn btn-sm btn-primary" onClick={() => setForm('nuevo')} disabled={!hayActivos} title={hayActivos ? 'Programar una ruta o cargar un viaje ya realizado' : 'Primero abre expedientes en «Expediente y flota»'}>+ Orden de ruta</button>}
          {canWrite && tipo === 'volqueta' && <button className="btn btn-sm btn-primary" onClick={() => setFormVolq('nuevo')} disabled={!hayActivos} title={hayActivos ? 'Anotar los viajes del día' : 'Primero abre expedientes en «Expediente y flota»'}>+ Viajes de volqueta</button>}
        </div>
      </div>

      {loading ? <div className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Cargando…</div>
        : !delTipo.length ? <EmptyState icon={TIPOS_VIAJE[tipo].icon} message={tipo === 'volqueta' ? 'Todavía no hay viajes de volqueta. Anota los del día con «+ Viajes de volqueta».' : 'Todavía no hay órdenes de ruta de camión. Crea la primera con «+ Orden de ruta».'} />
        : !filas.length ? <EmptyState icon="🔍" message="Ningún viaje coincide con el filtro." />
        : tipo === 'volqueta' ? (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr><th>Nombre y apellido</th><th>Vehículo</th><th>Material</th><th>Origen</th><th>Destino</th><th>Fecha</th><th style={{ textAlign: 'right' }}>Viajes</th><th></th></tr></thead>
              <tbody>
                {filas.map((v) => (
                  <tr key={v.id}>
                    <td>{nombreConductor(porId.get(v.chofer_id))}</td>
                    <td style={{ fontSize: '.8rem' }}>{textoVehiculo(vehPorId.get(v.vehiculo_id ?? ''))}</td>
                    <td>{v.carga ?? '—'}</td>
                    <td>{v.origen}</td>
                    <td>{v.destino}</td>
                    <td className="mono">{fechaCorta(diaVE(v.fecha_salida))}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{v.cantidad_viajes}</td>
                    {acciones(v)}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6} style={{ fontWeight: 700 }}>Total</td><td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{total}</td><td /></tr></tfoot>
            </table>
          </div>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr><th>N°</th><th>Salida</th><th>Empresa</th><th>Chofer</th><th>Carro</th><th>Ruta</th><th style={{ textAlign: 'right' }}>Viajes</th><th>Paradas</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filas.map((v) => {
                  const e = ESTADO_VIAJE[v.estado];
                  const pr = progresoParadas(v.paradas);
                  return (
                    <tr key={v.id}>
                      <td className="mono">{v.numero}</td>
                      <td className="mono" style={{ fontSize: '.8rem' }}>{fechaHora(v.salida_real_at ?? v.fecha_salida)}{v.estado === 'finalizado' && v.llegada_real_at ? <div className="muted">llegó {fechaHora(v.llegada_real_at)}</div> : null}</td>
                      <td style={{ fontSize: '.8rem' }}>{v.empresa ?? '—'}</td>
                      <td>{nombreConductor(porId.get(v.chofer_id))}</td>
                      <td style={{ fontSize: '.8rem' }}>{textoVehiculo(vehPorId.get(v.vehiculo_id ?? ''))}</td>
                      <td>{textoRuta(v)}{v.carga ? <div className="muted" style={{ fontSize: '.75rem' }}>{v.carga}</div> : null}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{v.cantidad_viajes}</td>
                      <td className="mono">{pr.total ? `${pr.hechas}/${pr.total}` : '—'}</td>
                      <td><span className={`badge ${e.clase}`}>{e.icon} {e.label}</span></td>
                      {acciones(v)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      {form && (
        <ViajeModal inicial={form === 'nuevo' ? null : form} conductores={conductores} flota={flota} viajes={viajes} descansos={descansos} hoy={hoy}
          canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await recargar(); }} />
      )}
      {formVolq && (
        <VolquetaModal inicial={formVolq === 'nuevo' ? null : formVolq} conductores={conductores} flota={flota} viajes={viajes} hoy={hoy}
          actor={actor} actorName={actorName} onClose={() => setFormVolq(null)} onSaved={recargar} />
      )}
      {detalle && (
        <DetalleViajeModal viaje={viajes.find((x) => x.id === detalle.id) ?? detalle} conductor={porId.get(detalle.chofer_id)} vehiculo={vehPorId.get(detalle.vehiculo_id ?? '')}
          canWrite={canWrite} onClose={() => setDetalle(null)} onChanged={recargar} />
      )}
      {accion && (
        <AccionViajeModal accion={accion.tipo} viaje={accion.viaje} conductor={porId.get(accion.viaje.chofer_id)}
          onClose={() => setAccion(null)} onDone={async () => { setAccion(null); await recargar(); }} />
      )}
      {borrar && (
        <ConfirmDialog title="Eliminar viaje" danger confirmText="Sí, eliminar"
          message="Se borra este registro de viaje. No se puede deshacer. Si la ruta solo no se hizo, usa ✖ Cancelar para que quede en el histórico."
          preview={<VistaPrevia>
            <Dato label="Tipo">{`${TIPOS_VIAJE[borrar.tipo_viaje].icon} ${TIPOS_VIAJE[borrar.tipo_viaje].label}`}</Dato>
            <Dato label="N°">{borrar.numero}</Dato>
            <Dato label="Chofer">{nombreConductor(porId.get(borrar.chofer_id))}</Dato>
            <Dato label="Fecha">{fechaCorta(diaVE(borrar.salida_real_at ?? borrar.fecha_salida))}</Dato>
            <Dato label="Ruta">{textoRuta(borrar)}</Dato>
            <Dato label={borrar.tipo_viaje === 'volqueta' ? 'Material' : 'Carga'}>{borrar.carga ?? undefined}</Dato>
            <Dato label="Viajes">{String(borrar.cantidad_viajes)}</Dato>
          </VistaPrevia>}
          onCancel={() => setBorrar(null)}
          onConfirm={() => {
            const v = borrar; setBorrar(null);
            void eliminarViaje(v.id).then(async () => { toast(`Viaje ${v.numero} eliminado`, 'success'); await recargar(); })
              .catch((e) => toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'));
          }} />
      )}
    </div>
  );
}

/* ───────── Viajes de volqueta (planilla del día) ───────── */
function VolquetaModal({ inicial, conductores, flota, viajes, hoy, actor, actorName, onClose, onSaved }: {
  inicial: Viaje | null; conductores: Conductor[]; flota: VehiculoFlota[]; viajes: Viaje[]; hoy: string;
  actor: string; actorName: string | null; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [choferId, setChoferId] = useState(inicial?.chofer_id ?? '');
  const [vehiculoId, setVehiculoId] = useState(inicial?.vehiculo_id ?? '');
  const [material, setMaterial] = useState(inicial?.carga ?? '');
  const [origen, setOrigen] = useState(inicial?.origen ?? '');
  const [destino, setDestino] = useState(inicial?.destino ?? '');
  const [fecha, setFecha] = useState(inicial ? diaVE(inicial.fecha_salida) : hoy);
  const [cantidad, setCantidad] = useState<number | null>(inicial?.cantidad_viajes ?? 1);
  const [nota, setNota] = useState(inicial?.nota ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anotados, setAnotados] = useState(0);

  // Sugerencias con lo que ya se anotó (materiales y lugares de las volquetas).
  const previos = useMemo(() => viajes.filter((v) => v.tipo_viaje === 'volqueta'), [viajes]);
  const unicos = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es'));
  const materiales = useMemo(() => unicos(previos.map((v) => v.carga)), [previos]);
  const lugares = useMemo(() => unicos(previos.flatMap((v) => [v.origen, v.destino])), [previos]);
  const activos = conductores.filter((c) => c.activo || c.id === inicial?.chofer_id);

  async function guardar(seguir: boolean) {
    setError(null);
    const input = { chofer_id: choferId, vehiculo_id: vehiculoId || null, carga: material, origen, destino, fecha, cantidad_viajes: cantidad ?? 0, nota };
    setSaving(true);
    try {
      if (inicial) { await editarViajeVolqueta(inicial.id, input); toast('Viajes corregidos', 'success'); }
      else { await crearViajeVolqueta(input, actor, actorName); toast(`${textoViajes(cantidad ?? 0)} de ${material.trim().toUpperCase()} anotados`, 'success'); }
      await onSaved();
      if (seguir && !inicial) {
        // Mismo chofer, vehículo y fecha: solo cambia el material o la ruta.
        setAnotados((n) => n + 1); setMaterial(''); setCantidad(1); setNota(''); setSaving(false);
        return;
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); setSaving(false); }
  }

  return (
    <Modal title={inicial ? `🚛 Corregir viajes de volqueta ${inicial.numero}` : '🚛 Viajes de volqueta'} size="lg" onClose={() => !saving && onClose()} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>{anotados ? 'Listo' : 'Cancelar'}</button>
        {!inicial && <button className="btn" onClick={() => void guardar(true)} disabled={saving}>Guardar y anotar otro</button>}
        <button className="btn btn-primary" onClick={() => void guardar(false)} disabled={saving}>{saving ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Guardar'}</button>
      </>
    }>
      {error && <div className="aviso danger" style={{ marginBottom: '.6rem' }}><span className="aviso-icono">⛔</span><div>{error}</div></div>}
      {anotados > 0 && <div className="aviso success sm" style={{ marginBottom: '.6rem' }}><span className="aviso-icono">✅</span><div>{anotados} registro(s) anotado(s). Si el mismo día llevó otro material (ej. 10 de cabilla y 6 de escombros), anótalo aparte.</div></div>}
      <div className="form-grid">
        <div className="form-row"><label htmlFor="vq-chofer">Nombre y apellido</label>
          <SearchSelect id="vq-chofer" value={choferId} onChange={setChoferId} placeholder="🔍 Buscar chofer…"
            options={activos.map((c) => ({ value: c.id, label: nombreConductor(c) }))} /></div>
        <div className="form-row"><label htmlFor="vq-veh">Vehículo</label>
          <SearchSelect id="vq-veh" value={vehiculoId} onChange={setVehiculoId} placeholder="🔍 Placa, marca, modelo…"
            options={flota.filter((v) => v.activo && v.estado_flota !== 'inactivo' || v.id === vehiculoId).map((v) => ({ value: v.id, label: textoVehiculo(v) }))} /></div>
        <div className="form-row"><label htmlFor="vq-mat">Material</label>
          <input id="vq-mat" className="input" list="vq-materiales" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Escombros, cabilla, arena, granzón…" />
          <datalist id="vq-materiales">{unicos(['ESCOMBROS', 'CABILLA', 'ARENA', 'GRANZÓN', 'TIERRA', 'PIEDRA', ...materiales]).map((m) => <option key={m} value={m} />)}</datalist></div>
        <div className="form-row"><label htmlFor="vq-fecha">Fecha</label>
          <input id="vq-fecha" className="input" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="form-row"><label htmlFor="vq-origen">Origen</label>
          <input id="vq-origen" className="input" list="vq-lugares" value={origen} onChange={(e) => setOrigen(e.target.value)} placeholder="Res Coral, Playa Escondida…" /></div>
        <div className="form-row"><label htmlFor="vq-destino">Destino</label>
          <input id="vq-destino" className="input" list="vq-lugares" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Parque, El Agua, Interno…" />
          <datalist id="vq-lugares">{lugares.map((l) => <option key={l} value={l} />)}</datalist></div>
        <div className="form-row"><label htmlFor="vq-cant">Viajes</label>
          <DecimalInput className="input" value={cantidad} onChange={(n) => setCantidad(n == null ? null : Math.round(n))} placeholder="12" aria-label="Cantidad de viajes" /></div>
        <div className="form-row"><label htmlFor="vq-nota">Nota</label>
          <input id="vq-nota" className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" /></div>
      </div>
    </Modal>
  );
}

/* ───────── Nueva / editar orden de ruta ───────── */
function ViajeModal({ inicial, conductores, flota, viajes, descansos, hoy, canWrite, actor, actorName, onClose, onSaved }: {
  inicial: Viaje | null; conductores: Conductor[]; flota: VehiculoFlota[]; viajes: Viaje[];
  descansos: { personal_id: string; desde: string; hasta: string }[]; hoy: string;
  canWrite: boolean; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [choferId, setChoferId] = useState(inicial?.chofer_id ?? '');
  const [vehiculoId, setVehiculoId] = useState(inicial?.vehiculo_id ?? '');
  const [origen, setOrigen] = useState(inicial?.origen ?? '');
  const [destino, setDestino] = useState(inicial?.destino ?? '');
  const [paradas, setParadas] = useState<Parada[]>(inicial?.paradas ?? []);
  const [carga, setCarga] = useState(inicial?.carga ?? '');
  const [salida, setSalida] = useState(inicial ? aDatetimeLocal(inicial.estado === 'finalizado' ? inicial.salida_real_at ?? inicial.fecha_salida : inicial.fecha_salida) : ahoraLocal());
  const [llegada, setLlegada] = useState(inicial?.llegada_prevista ? aDatetimeLocal(inicial.llegada_prevista) : '');
  const [nota, setNota] = useState(inicial?.nota ?? '');
  const [empresa, setEmpresa] = useState(inicial?.empresa ?? '');
  const [cantidad, setCantidad] = useState<number | null>(inicial?.cantidad_viajes ?? 1);
  const [verFlota, setVerFlota] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevaParada, setNuevaParada] = useState('');
  // «Viaje ya realizado» (12-10-2026): se carga un viaje pasado directo como finalizado, con horas y km reales.
  const [realizado, setRealizado] = useState(inicial?.estado === 'finalizado');
  const [llegadaReal, setLlegadaReal] = useState(inicial?.llegada_real_at ? aDatetimeLocal(inicial.llegada_real_at) : '');
  const [kmSalida, setKmSalida] = useState<number | null>(inicial?.km_salida ?? null);
  const [kmLlegada, setKmLlegada] = useState<number | null>(inicial?.km_llegada ?? null);

  const chofer = conductores.find((c) => c.id === choferId) ?? null;
  const vehiculo = flota.find((v) => v.id === vehiculoId) ?? null;
  const diaSalida = salida.slice(0, 10);

  function elegirChofer(id: string) {
    setChoferId(id);
  }

  const avisos = useMemo(() => {
    const out: string[] = [];
    if (chofer) {
      if (descansos.some((d) => d.personal_id === chofer.personal_id && d.desde <= diaSalida && diaSalida <= d.hasta)) out.push(`${nombreConductor(chofer)} está de descanso el ${diaSalida.split('-').reverse().join('/')}.`);
      for (const a of alertasDocumentos(chofer, hoy)) out.push(`${a.label} del chofer ${a.estado === 'vencido' ? 'VENCIDO' : 'por vencer'} (${a.vence?.split('-').reverse().join('/')}).`);
      if (!realizado && viajes.some((v) => v.id !== inicial?.id && v.chofer_id === chofer.id && v.estado === 'en_ruta')) out.push('Ese chofer está en ruta en otro viaje ahora mismo.');
    }
    if (vehiculo) {
      if (vehiculo.estado_flota === 'taller') out.push('El vehículo está en taller.');
      if (vehiculo.estado_flota === 'inactivo') out.push('El vehículo está inactivo.');
      if (vehiculo.seguro_vence && vehiculo.seguro_vence < hoy) out.push('El seguro del vehículo está vencido.');
      if (!realizado && viajes.some((v) => v.id !== inicial?.id && v.vehiculo_id === vehiculo.id && v.estado === 'en_ruta')) out.push('Ese vehículo está en ruta en otro viaje ahora mismo.');
    }
    return out;
  }, [chofer, vehiculo, descansos, diaSalida, hoy, viajes, inicial, realizado]);

  function agregarParada() {
    const l = nuevaParada.trim();
    if (!l) return;
    setParadas((p) => [...p, { lugar: l, nota: null, hecha_at: null }]);
    setNuevaParada('');
  }
  function moverParada(i: number, d: number) {
    setParadas((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault(); setError(null);
    const input: ViajeInput = {
      chofer_id: choferId, vehiculo_id: vehiculoId || null, origen, destino, paradas, carga,
      fecha_salida: salida, llegada_prevista: llegada || null, nota, empresa, cantidad_viajes: cantidad ?? 0,
      realizado: realizado ? { salida_real_at: salida, llegada_real_at: llegadaReal, km_salida: kmSalida, km_llegada: kmLlegada } : null,
    };
    if (realizado) {
      const e = errorViajeRealizado({ salida, llegada: llegadaReal, kmSalida, kmLlegada, ahora: ahoraLocal() });
      if (e) { setError(e); return; }
    } else if (llegada && llegada < salida) { setError('La llegada prevista no puede ser antes de la salida.'); return; }
    setSaving(true);
    try {
      if (inicial) { await editarViaje(inicial.id, input); toast(realizado ? 'Viaje corregido' : 'Orden de ruta guardada', 'success'); }
      else {
        const v = await crearViaje(input, actor, actorName);
        toast(realizado ? `Viaje ${v.numero} cargado como finalizado.` : `Orden de ruta ${v.numero} creada`, 'success');
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); setSaving(false); }
  }

  const activos = conductores.filter((c) => c.activo || c.id === inicial?.chofer_id);

  return (
    <Modal title={inicial ? `🗺 ${inicial.estado === 'finalizado' ? 'Corregir viaje' : 'Orden de ruta'} ${inicial.numero}` : realizado ? '🕓 Cargar viaje ya realizado' : '🗺 Nueva orden de ruta'} size="lg" onClose={() => !saving && onClose()} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        {canWrite && <button type="submit" form="viaje-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : inicial ? 'Guardar cambios' : realizado ? 'Cargar viaje finalizado' : 'Crear orden'}</button>}
      </>
    }>
      <form id="viaje-form" onSubmit={guardar}>
        {error && <div className="aviso danger" style={{ marginBottom: '.6rem' }}><span className="aviso-icono">⛔</span><div>{error}</div></div>}
        {!inicial && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.45rem', marginBottom: '.6rem', fontSize: '.88rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={realizado} onChange={(e) => setRealizado(e.target.checked)} style={{ marginTop: 3 }} />
            <span><strong>🕓 Viaje ya realizado</strong> <span className="muted">· para cargar un viaje pasado: entra directo como <em>finalizado</em>, con sus horas y kilometraje reales.</span></span>
          </label>
        )}
        {inicial?.estado === 'finalizado' && (
          <div className="aviso info sm" style={{ marginBottom: '.6rem' }}><span className="aviso-icono">ℹ</span><div>Viaje finalizado: se puede corregir cualquier dato, incluidas las horas y el kilometraje reales.</div></div>
        )}
        <div className="form-grid">
          <div className="form-row"><label htmlFor="vj-chofer">Chofer</label>
            <SearchSelect id="vj-chofer" value={choferId} onChange={elegirChofer} placeholder="🔍 Buscar chofer…"
              options={activos.map((c) => ({ value: c.id, label: nombreConductor(c), hint: [c.personal?.cedula, c.licencia_grado ? `Lic. ${c.licencia_grado}` : null].filter(Boolean).join(' · ') }))} /></div>
          <div className="form-row"><label htmlFor="vj-veh">Vehículo</label>
            <div style={{ display: 'flex', gap: '.35rem' }}>
              <SearchSelect id="vj-veh" value={vehiculoId} onChange={setVehiculoId} placeholder="🔍 Placa, marca, modelo…" style={{ flex: 1 }}
                options={flota.filter((v) => v.activo && v.estado_flota !== 'inactivo' || v.id === vehiculoId).map((v) => ({ value: v.id, label: textoVehiculo(v), hint: v.capacidad ?? undefined }))} />
              <button type="button" className="btn btn-ghost" onClick={() => setVerFlota(true)} title="Ver la flota / agregar vehículo">🚚</button>
            </div></div>
          <div className="form-row"><label htmlFor="vj-origen">Origen</label><input id="vj-origen" className="input" value={origen} onChange={(e) => setOrigen(e.target.value)} required placeholder="Galpón Los Pinos" /></div>
          <div className="form-row"><label htmlFor="vj-destino">Destino</label><input id="vj-destino" className="input" value={destino} onChange={(e) => setDestino(e.target.value)} required placeholder="Centro de Fundición Matanzas" /></div>
          <div className="form-row"><label htmlFor="vj-salida">{realizado ? 'Salida real (fecha y hora)' : 'Salida programada'}</label><input id="vj-salida" className="input" type="datetime-local" value={salida} max={realizado ? ahoraLocal() : undefined} onChange={(e) => setSalida(e.target.value)} required /></div>
          {realizado ? (
            <>
              <div className="form-row"><label htmlFor="vj-llegada-real">Llegada real (fecha y hora)</label><input id="vj-llegada-real" className="input" type="datetime-local" value={llegadaReal} min={salida || undefined} max={ahoraLocal()} onChange={(e) => setLlegadaReal(e.target.value)} required /></div>
              <div className="form-row"><label>Kilometraje de salida</label><DecimalInput className="input" value={kmSalida} onChange={setKmSalida} placeholder="opcional" aria-label="Kilometraje de salida" /></div>
              <div className="form-row"><label>Kilometraje de llegada</label><DecimalInput className="input" value={kmLlegada} onChange={setKmLlegada} placeholder="opcional" aria-label="Kilometraje de llegada" /></div>
            </>
          ) : (
            <div className="form-row"><label htmlFor="vj-llegada">Llegada prevista</label><input id="vj-llegada" className="input" type="datetime-local" value={llegada} min={salida || undefined} onChange={(e) => setLlegada(e.target.value)} /></div>
          )}
          <div className="form-row"><label htmlFor="vj-carga">Carga / motivo</label><input id="vj-carga" className="input" value={carga} onChange={(e) => setCarga(e.target.value)} placeholder="Escombros · cabilla · casiterita 20 t…" /></div>
          <div className="form-row"><label htmlFor="vj-empresa">Empresa</label><input id="vj-empresa" className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Para quién se hizo (opcional)" /></div>
          <div className="form-row"><label htmlFor="vj-cant">Cantidad de viajes</label><DecimalInput className="input" value={cantidad} onChange={(n) => setCantidad(n == null ? null : Math.round(n))} placeholder="1" aria-label="Cantidad de viajes" /></div>
          <div className="form-row" style={{ gridColumn: '1 / -1' }}>
            <label>Puntos de parada (en orden){realizado && <span className="muted" style={{ fontWeight: 400 }}> · en un viaje ya realizado quedan marcadas como cumplidas a la hora de llegada</span>}</label>
            <div className="chf-paradas">
              {paradas.map((p, i) => (
                <div key={i} className={`chf-parada${p.hecha_at ? ' hecha' : ''}`}>
                  <span className="orden">{i + 1}</span>
                  <input className="input lugar" value={p.lugar} onChange={(e) => setParadas((ps) => ps.map((x, j) => j === i ? { ...x, lugar: e.target.value } : x))} style={{ padding: '.2rem .4rem' }} />
                  <input className="input" value={p.nota ?? ''} placeholder="nota" onChange={(e) => setParadas((ps) => ps.map((x, j) => j === i ? { ...x, nota: e.target.value } : x))} style={{ padding: '.2rem .4rem', width: 160 }} />
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => moverParada(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => moverParada(i, 1)} disabled={i === paradas.length - 1} aria-label="Bajar">↓</button>
                  <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setParadas((ps) => ps.filter((_, j) => j !== i))} aria-label="Quitar">✖</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '.35rem' }}>
                <input className="input" value={nuevaParada} onChange={(e) => setNuevaParada(e.target.value)} placeholder="Agregar parada: lugar…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarParada(); } }} />
                <button type="button" className="btn btn-ghost" onClick={agregarParada} disabled={!nuevaParada.trim()}>+ Parada</button>
              </div>
            </div>
          </div>
          <div className="form-row" style={{ gridColumn: '1 / -1' }}><label htmlFor="vj-nota">Nota</label><input id="vj-nota" className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Instrucciones, contacto en destino…" /></div>
        </div>
        {!!avisos.length && (
          <div className="aviso warning sm" style={{ marginTop: '.6rem' }}><span className="aviso-icono">⚠</span>
            <div>{avisos.map((a) => <div key={a}>{a}</div>)}<div className="muted" style={{ marginTop: '.2rem' }}>Se puede guardar igual; queda a criterio de quien programa.</div></div></div>
        )}
      </form>
      {verFlota && <FlotaModal flota={flota} canWrite={canWrite} actor={actor} hoy={hoy} onClose={() => setVerFlota(false)} onChanged={() => undefined}
        onElegir={(v) => { setVehiculoId(v.id); setVerFlota(false); }} />}
    </Modal>
  );
}

/* ───────── Detalle + paradas ───────── */
function DetalleViajeModal({ viaje: v, conductor, vehiculo, canWrite, onClose, onChanged }: {
  viaje: Viaje; conductor?: Conductor; vehiculo?: VehiculoFlota; canWrite: boolean; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const e = ESTADO_VIAJE[v.estado];
  async function alternarParada(i: number) {
    setSaving(true);
    try {
      const ps = v.paradas.map((p, j) => j === i ? { ...p, hecha_at: p.hecha_at ? null : new Date().toISOString() } : p);
      await guardarParadas(v.id, ps); await onChanged();
    } catch (err) { toast(err instanceof Error ? err.message : 'No se pudo guardar', 'error'); }
    finally { setSaving(false); }
  }
  const km = v.km_salida != null && v.km_llegada != null ? v.km_llegada - v.km_salida : null;
  return (
    <Modal title={`🗺 ${v.numero} · ${textoRuta(v)}`} size="md" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="form-grid" style={{ fontSize: '.88rem' }}>
        <div><span className="muted">Estado</span><div><span className={`badge ${e.clase}`}>{e.icon} {e.label}</span></div></div>
        <div><span className="muted">Chofer</span><div><strong>{nombreConductor(conductor)}</strong></div></div>
        <div><span className="muted">Vehículo</span><div>{textoVehiculo(vehiculo)}</div></div>
        <div><span className="muted">Carga</span><div>{v.carga ?? '—'}</div></div>
        <div><span className="muted">Viajes</span><div className="mono"><strong>{v.cantidad_viajes}</strong></div></div>
        <div><span className="muted">Empresa</span><div>{v.empresa ?? '—'}</div></div>
        <div><span className="muted">Salida programada</span><div className="mono">{fechaHora(v.fecha_salida)}</div></div>
        <div><span className="muted">Llegada prevista</span><div className="mono">{fechaHora(v.llegada_prevista)}</div></div>
        <div><span className="muted">Salida real</span><div className="mono">{fechaHora(v.salida_real_at)}{v.km_salida != null ? ` · ${v.km_salida.toLocaleString('es-VE')} km` : ''}</div></div>
        <div><span className="muted">Llegada real</span><div className="mono">{fechaHora(v.llegada_real_at)}{v.km_llegada != null ? ` · ${v.km_llegada.toLocaleString('es-VE')} km` : ''}</div></div>
        <div><span className="muted">Recorrido</span><div className="mono">{km != null ? `${km.toLocaleString('es-VE')} km` : '—'}</div></div>
      </div>
      <div style={{ marginTop: '.8rem' }}>
        <strong style={{ fontSize: '.88rem' }}>Paradas ({progresoParadas(v.paradas).hechas}/{v.paradas.length})</strong>
        {!v.paradas.length ? <div className="muted" style={{ fontSize: '.82rem' }}>Sin paradas intermedias.</div> : (
          <div className="chf-paradas" style={{ marginTop: '.35rem' }}>
            {v.paradas.map((p, i) => (
              <div key={i} className={`chf-parada${p.hecha_at ? ' hecha' : ''}`}>
                <span className="orden">{i + 1}</span>
                <span className="lugar">{p.lugar}{p.nota ? <span className="muted"> · {p.nota}</span> : null}</span>
                {p.hecha_at && <span className="mono muted" style={{ fontSize: '.72rem' }}>{fechaHora(p.hecha_at)}</span>}
                {canWrite && v.estado === 'en_ruta' && (
                  <button type="button" className={`btn btn-sm ${p.hecha_at ? 'btn-ghost' : 'btn-success'}`} disabled={saving} onClick={() => void alternarParada(i)}>
                    {p.hecha_at ? 'Desmarcar' : '✔ Llegó'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {v.nota && <p className="muted" style={{ fontSize: '.82rem', marginTop: '.6rem' }}>📝 {v.nota}</p>}
      <p className="muted" style={{ fontSize: '.75rem', marginTop: '.4rem' }}>Creada {fechaHora(v.created_at)}{v.actor_name ? ` por ${v.actor_name}` : ''}.</p>
    </Modal>
  );
}

/* ───────── Iniciar / finalizar / cancelar ───────── */
function AccionViajeModal({ accion, viaje: v, conductor, onClose, onDone }: {
  accion: 'iniciar' | 'finalizar' | 'cancelar'; viaje: Viaje; conductor?: Conductor; onClose: () => void; onDone: () => Promise<void>;
}) {
  const [cuando, setCuando] = useState(ahoraLocal());
  const [km, setKm] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar() {
    setError(null); setSaving(true);
    try {
      if (accion === 'iniciar') { await iniciarViaje(v.id, { km_salida: km, salida_real_at: cuando }); toast(`${v.numero} en ruta`, 'success'); }
      else if (accion === 'finalizar') {
        if (km != null && v.km_salida != null && km < v.km_salida) throw new Error(`El kilometraje de llegada no puede ser menor que el de salida (${v.km_salida.toLocaleString('es-VE')} km).`);
        await finalizarViaje(v.id, { km_llegada: km, llegada_real_at: cuando }); toast(`${v.numero} finalizado.`, 'success');
      } else { await cancelarViaje(v.id, motivo); toast(`${v.numero} cancelado`, 'success'); }
      await onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar'); setSaving(false); }
  }

  if (accion === 'cancelar') {
    return (
      <Modal title={`✖ Cancelar ${v.numero}`} compact onClose={() => !saving && onClose()} footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Volver</button>
          <button className="btn btn-danger" onClick={() => void ejecutar()} disabled={saving || !motivo.trim()}>{saving ? 'Cancelando…' : 'Sí, cancelar la ruta'}</button>
        </>
      }>
        {error && <div className="aviso danger sm" style={{ marginBottom: '.5rem' }}><span className="aviso-icono">⛔</span><div>{error}</div></div>}
        <p style={{ fontSize: '.88rem', marginTop: 0 }}>{textoRuta(v)} · {nombreConductor(conductor)}. La orden queda en el histórico como cancelada.</p>
        <div className="form-row"><label htmlFor="vj-motivo">Motivo</label><input id="vj-motivo" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Vehículo dañado, cliente canceló…" /></div>
      </Modal>
    );
  }

  const titulo = accion === 'iniciar' ? `▶ Iniciar ruta ${v.numero}` : `🏁 Finalizar ruta ${v.numero}`;
  return (
    <Modal title={titulo} compact onClose={() => !saving && onClose()} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className={`btn ${accion === 'iniciar' ? 'btn-primary' : 'btn-success'}`} onClick={() => void ejecutar()} disabled={saving}>{saving ? 'Guardando…' : accion === 'iniciar' ? 'Salió' : 'Llegó'}</button>
      </>
    }>
      {error && <div className="aviso danger sm" style={{ marginBottom: '.5rem' }}><span className="aviso-icono">⛔</span><div>{error}</div></div>}
      <p style={{ fontSize: '.88rem', marginTop: 0 }}>{textoRuta(v)} · <strong>{nombreConductor(conductor)}</strong></p>
      <div className="form-grid">
        <div className="form-row"><label htmlFor="vj-cuando">{accion === 'iniciar' ? 'Hora de salida' : 'Hora de llegada'}</label>
          <input id="vj-cuando" className="input" type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} /></div>
        <div className="form-row"><label>{accion === 'iniciar' ? 'Kilometraje de salida' : 'Kilometraje de llegada'}</label>
          <DecimalInput className="input" value={km} onChange={setKm} placeholder={accion === 'finalizar' && v.km_salida != null ? `salió con ${v.km_salida.toLocaleString('es-VE')} km` : 'opcional'} aria-label="Kilometraje" /></div>
      </div>
    </Modal>
  );
}

