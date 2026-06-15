import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import type { CajaMovimiento, ClasificacionAcopio, CostoClase, GrupoClasificacion } from '@/shared/lib/types';
import {
  GRUPOS, grupoColor, esCategoriaVehiculo,
  crearMovimientoCaja, actualizarMovimientoCaja, eliminarMovimientoCaja, addClasificacion, addCostoClase,
  type CajaMovimientoInput,
} from './caja.repository';
import { listCatalogos } from '@/modules/combustible/tanques.repository';

/**
 * Alta/edición de un movimiento de la caja de Acopio (acopio_caja_movimientos).
 * Mismo formulario para crear y editar TODOS los campos (clasificación de caja,
 * clasificación de costo en 2 niveles, descripción y montos). Compartido entre la
 * vista de Caja y la lista de Movimientos del Centro de Acopio.
 */
export function MovimientoCajaModal({ mov, cajaId, clasificaciones, costoClases, actor, actorName, onClose, onSaved }: {
  mov: CajaMovimiento | null;
  cajaId: string | null;
  clasificaciones: ClasificacionAcopio[];
  costoClases: CostoClase[];
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esNuevo = !mov;
  const [fecha, setFecha] = useState(mov?.fecha ?? new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState(mov?.descripcion ?? '');
  const [grupo, setGrupo] = useState<GrupoClasificacion | ''>(mov?.clasif_grupo ?? '');
  const [valor, setValor] = useState(mov?.clasif_valor ?? '');
  const [costoCl, setCostoCl] = useState(mov?.costo_clasificacion ?? '');
  const [costoSub, setCostoSub] = useState(mov?.costo_subclasificacion ?? '');
  const [usdEntregado, setUsdEntregado] = useState(mov?.usd_entregado ? String(mov.usd_entregado) : '');
  const [kgCerrados, setKgCerrados] = useState(mov?.kg_cerrados ? String(mov.kg_cerrados) : '');
  const [facturados, setFacturados] = useState(mov?.facturados ? String(mov.facturados) : '');
  const [gastos, setGastos] = useState(mov?.gastos ? String(mov.gastos) : '');
  const [nominas, setNominas] = useState(mov?.nominas ? String(mov.nominas) : '');
  const [traslado, setTraslado] = useState(mov?.traslado ? String(mov.traslado) : '');
  const [kgRecibidos, setKgRecibidos] = useState(mov?.kg_recibidos ? String(mov.kg_recibidos) : '');
  const [equipo, setEquipo] = useState(mov?.equipo ?? '');
  const [equipos, setEquipos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevoValor, setNuevoValor] = useState('');
  // Bump al agregar categoría/sub para remontar los inputs no-controlados y limpiarlos.
  const [nuevoValorKey, setNuevoValorKey] = useState(0);

  const valoresGrupo = useMemo(() => clasificaciones.filter((c) => c.grupo === grupo), [clasificaciones, grupo]);
  const clasifCosto = useMemo(() => [...new Set(costoClases.map((c) => c.clasificacion))], [costoClases]);
  const subsCosto = useMemo(() => costoClases.filter((c) => c.clasificacion === costoCl), [costoClases, costoCl]);
  // El gasto está "atado a un vehículo" cuando es del grupo Gastos Caja y la categoría
  // termina en "REPUESTOS - REPARACIONES - SERVICIOS" → se despliega la lista de equipos.
  const pideEquipo = grupo === 'gastos_caja' && esCategoriaVehiculo(valor);

  // Lista de equipos del catálogo de combustible (la misma que se usa en los tanques).
  useEffect(() => {
    let cancel = false;
    listCatalogos()
      .then((cats) => { if (!cancel) setEquipos(cats.filter((c) => c.tipo === 'equipo' && c.activo).map((c) => c.valor)); })
      .catch(() => { /* sin red/RLS: queda vacío */ });
    return () => { cancel = true; };
  }, []);

  async function agregarValor() {
    if (!grupo) { setError('Elegí primero el grupo.'); return; }
    const v = nuevoValor.trim();
    if (!v) return;
    try { await addClasificacion(grupo, v); setValor(v); setNuevoValor(''); setNuevoValorKey((k) => k + 1); toast('Clasificación agregada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
  }
  async function agregarSub() {
    if (!costoCl.trim()) { setError('Indicá la clasificación de costo.'); return; }
    const v = nuevoValor.trim();
    if (!v) return;
    try { await addCostoClase(costoCl, v); setCostoSub(v); setNuevoValor(''); setNuevoValorKey((k) => k + 1); toast('Sub-clasificación agregada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
  }

  function buildInput(): CajaMovimientoInput {
    return {
      fecha, descripcion,
      usd_entregado: Number(usdEntregado) || 0, kg_cerrados: Number(kgCerrados) || 0,
      facturados: Number(facturados) || 0, gastos: Number(gastos) || 0, nominas: Number(nominas) || 0,
      traslado: Number(traslado) || 0, kg_recibidos: Number(kgRecibidos) || 0,
      clasif_grupo: grupo || null, clasif_valor: valor || null,
      costo_clasificacion: costoCl || null, costo_subclasificacion: costoSub || null,
      equipo: pideEquipo ? (equipo || null) : null, // solo se guarda en categorías de vehículo
      caja_id: cajaId,
    };
  }
  async function guardar() {
    setError(null); setSaving(true);
    try {
      if (esNuevo) { await crearMovimientoCaja(buildInput(), actor, actorName); toast('Movimiento registrado', 'success'); }
      else { await actualizarMovimientoCaja(mov!.id, buildInput()); toast('Movimiento actualizado', 'success'); }
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); setSaving(false); }
  }
  async function eliminar() {
    if (!mov) return;
    if (!window.confirm('¿Eliminar este movimiento?')) return;
    setSaving(true);
    try { await eliminarMovimientoCaja(mov.id); toast('Eliminado', 'success'); onSaved(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); setSaving(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      {!esNuevo && <button className="btn btn-danger" onClick={eliminar} disabled={saving}>Eliminar</button>}
      <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : (esNuevo ? 'Registrar' : 'Guardar')}</button>
    </>
  );
  const fld = (label: string, name: string, val: string, set: (v: string) => void, hint?: string) => (
    <div className="form-row"><label>{label}</label><input className="input mono" name={name} type="number" min={0} step="any" defaultValue={val} onChange={(e) => set(e.target.value)} />{hint && <small className="muted">{hint}</small>}</div>
  );

  return (
    <Modal title={esNuevo ? 'Nuevo movimiento de caja' : 'Editar movimiento de caja'} size="lg" onClose={onClose} footer={footer}>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
      <div className="form-grid">
        <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="form-row">
          <label>Clasificación (grupo de caja)</label>
          <select className="select" value={grupo} onChange={(e) => { setGrupo(e.target.value as GrupoClasificacion); setValor(''); }}>
            <option value="">— sin clasificar —</option>
            {GRUPOS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
      </div>
      {grupo && (
        <div className="form-row">
          <label>Categoría <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: grupoColor(grupo), verticalAlign: 'middle' }} /></label>
          <select className="select" value={valor} onChange={(e) => setValor(e.target.value)}>
            <option value="">— elegí —</option>
            {valoresGrupo.map((c) => <option key={c.id} value={c.valor}>{c.valor}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
            <input key={`nv-cat-${nuevoValorKey}`} className="input" name="f-nueva-categoria" style={{ flex: 1 }} defaultValue={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} placeholder="+ nueva categoría a este grupo" />
            <button type="button" className="btn btn-sm btn-ghost" onClick={agregarValor}>Agregar</button>
          </div>
        </div>
      )}

      {/* Equipo/vehículo (solo para gastos de "…REPUESTOS - REPARACIONES - SERVICIOS"). */}
      {pideEquipo && (
        <div className="form-row">
          <label>🚜 Equipo / vehículo <span className="muted" style={{ fontWeight: 400 }}>(opcional · lista de combustible)</span></label>
          <SearchSelect
            value={equipo}
            onChange={setEquipo}
            options={equipos.map((e) => ({ value: e, label: e }))}
            placeholder="Buscar equipo…"
            emptyText="Sin equipos en el catálogo de combustible"
          />
          {equipo && <small className="muted">El gasto quedará atado a <strong>{equipo}</strong> y se verá en su consumo desde el resumen.</small>}
        </div>
      )}

      {/* Clasificación de costo (2 niveles) — análisis del cierre */}
      <div className="form-grid">
        <div className="form-row">
          <label>Costo · Clasificación</label>
          <select className="select" value={costoCl} onChange={(e) => { setCostoCl(e.target.value); setCostoSub(''); }}>
            <option value="">— sin costo —</option>
            {clasifCosto.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>Costo · Sub-clasificación</label>
          <select className="select" value={costoSub} onChange={(e) => setCostoSub(e.target.value)} disabled={!costoCl}>
            <option value="">— elegí —</option>
            {subsCosto.map((c) => <option key={c.id} value={c.subclasificacion}>{c.subclasificacion}</option>)}
          </select>
          {costoCl && (
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
              <input key={`nv-sub-${nuevoValorKey}`} className="input" name="f-nueva-subclasificacion" style={{ flex: 1 }} defaultValue={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} placeholder="+ nueva sub-clasificación" />
              <button type="button" className="btn btn-sm btn-ghost" onClick={agregarSub}>Agregar</button>
            </div>
          )}
        </div>
      </div>

      <div className="form-row">
        <label>Descripción</label>
        <textarea className="input" name="f-descripcion" rows={2} defaultValue={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle del movimiento…" />
      </div>
      <div className="form-grid">
        {fld('$ Entregado (entrada)', 'f-usd-entregado', usdEntregado, setUsdEntregado)}
        {fld('Kg Cerrados', 'f-kg-cerrados', kgCerrados, setKgCerrados)}
        {fld('$ Facturados', 'f-facturados', facturados, setFacturados)}
        {fld('Gastos GT', 'f-gastos', gastos, setGastos, 'suma a la tasa')}
        {fld('Nóminas GT', 'f-nominas', nominas, setNominas, 'suma a la tasa')}
        {fld('Traslado de caja', 'f-traslado', traslado, setTraslado)}
        {fld('Kg Recibidos por MGG', 'f-kg-recibidos', kgRecibidos, setKgRecibidos)}
      </div>
    </Modal>
  );
}
