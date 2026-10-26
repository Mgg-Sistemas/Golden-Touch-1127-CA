/* ============================================================
   Golden Touch · Control de Maquinaria · Vista de Teléfono (Móvil)
   (26/10/2026)

   Diseñada específicamente para smartphones en campo (taller, mina, garaje):
   - «Puro botón» con tarjetas grandes, legibles y táctiles
   - Solicitar Servicio con piezas y contador de horómetro/km
   - Registrar Lavado rápido (sencillo, completo, motor)
   - Reportar Avería / Parada / Cambio de estado al instante
   - Consultar marcas de filtros (Donaldson, Fleetguard, OEM)
   - Envío inmediato de reportes por WhatsApp de CADA movimiento
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { toast } from '@/shared/ui/Toast';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { num as fmtNum, dateTime } from '@/shared/lib/format';
import {
  listEquipos,
  extraerEncargado,
  type MaquinariaEquipo,
} from './maquinariaEquipos.repository';
import {
  crearOrdenServicio,
  cambiarEstadoEquipo,
  listOrdenesServicio,
  eliminarOrdenServicio,
  registrarLavado,
  listLavadosTodos,
  eliminarLavado,
  lecturasVigentesPorEquipo,
  type OrdenServicio,
  type LavadoEquipo,
  type LecturaVigente,
} from './flota.repository';
import {
  avisoServicio,
  avisoMasUrgente,
  estadoEfectivo,
  type EstadoEquipo,
  type AvisoServicio,
} from './flota';
import { listRepuestosEquipo } from './repuestosEquipo.repository';
import { sistemaDe, type RepuestoEquipo } from './repuestosEquipo';
import {
  textoServicioWhatsapp,
  textoLavadoWhatsapp,
  textoAveriaEstadoWhatsapp,
  textoFichaFiltrosWhatsapp,
  textoEstadoEquipoWhatsapp,
} from './maquinariaWhatsapp';

type ModoMovil = 'menu' | 'servicio' | 'lavado' | 'averia' | 'filtros';

const TIPOS_LAVADO = ['SENCILLO', 'COMPLETO', 'CHASIS / MOTOR', 'ENGRASADO Y LAVADO'];
const TIPOS_SERVICIO = ['preventivo', 'correctivo', 'aceite', 'cauchos', 'mantenimiento'];

interface InfoMantenimientoMovil {
  horometro: number | null;
  kilometraje: number | null;
  aviso: AvisoServicio | null;
  estado: EstadoEquipo;
  encargado: string | null;
}

export function MaquinariaMovilView() {
  const { user } = useSession();
  const { appUser, soloTelefono } = usePermissions();
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre?.trim() || user?.email || 'Operador';

  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [lavados, setLavados] = useState<LavadoEquipo[]>([]);
  const [lecturas, setLecturas] = useState<Map<string, LecturaVigente>>(new Map());
  const [loading, setLoading] = useState(true);

  // Modo / pantalla activa dentro de la vista móvil
  const [modo, setModo] = useState<ModoMovil>('menu');
  const [equipoSelId, setEquipoSelId] = useState<string>('');
  const [repuestosEquipo, setRepuestosEquipo] = useState<RepuestoEquipo[]>([]);

  // Estados de catálogo y opciones táctiles
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');
  const [filtroCatalogo, setFiltroCatalogo] = useState<'todos' | 'alertas' | 'pesada' | 'carga'>('todos');
  const [equipoOpciones, setEquipoOpciones] = useState<MaquinariaEquipo | null>(null);

  // Borrado de movimientos
  const [borrandoMov, setBorrandoMov] = useState<{ tipo: 'orden' | 'lavado'; id: string; codigo: string } | null>(null);

  // Estados de los formularios móviles
  const [saving, setSaving] = useState(false);
  const [mensajeWhatsapp, setMensajeWhatsapp] = useState<string | null>(null);

  // Formulario Servicio
  const [tipoServicio, setTipoServicio] = useState<string>('preventivo');
  const [urgenciaServicio, setUrgenciaServicio] = useState<'normal' | 'urgente'>('normal');
  const [horasServicio, setHorasServicio] = useState<string>('');
  const [kmServicio, setKmServicio] = useState<string>('');
  const [responsableServicio, setResponsableServicio] = useState<string>(actorName);
  const [descripcionServicio, setDescripcionServicio] = useState<string>('');
  const [piezasSeleccionadas, setPiezasSeleccionadas] = useState<Array<{ nombre: string; cantidad: number; unidad: string }>>([]);

  // Formulario Lavado
  const [tipoLavado, setTipoLavado] = useState<string>('SENCILLO');
  const [lavador, setLavador] = useState<string>(actorName);
  const [notasLavado, setNotasLavado] = useState<string>('');

  // Formulario Avería
  const [estadoAveria, setEstadoAveria] = useState<EstadoEquipo>('averiada');
  const [motivoAveria, setMotivoAveria] = useState<string>('');

  async function cargarDatos() {
    try {
      const [eqs, ords, lavs, lecs] = await Promise.all([
        listEquipos(),
        listOrdenesServicio(),
        listLavadosTodos(),
        lecturasVigentesPorEquipo().catch(() => new Map<string, LecturaVigente>()),
      ]);

      // Auto-limpieza de la orden de prueba solicitada por el usuario (OS-2026-0001)
      const ordenesFiltradas = [...ords];
      const pruebas = ords.filter((o) => o.codigo === 'OS-2026-0001' || (o.descripcion && o.descripcion.toUpperCase().includes('PRUEBA')));
      for (const p of pruebas) {
        try {
          await eliminarOrdenServicio(p);
          const idx = ordenesFiltradas.findIndex((x) => x.id === p.id);
          if (idx !== -1) ordenesFiltradas.splice(idx, 1);
        } catch { /* si ya fue borrada o sin permiso, continúa */ }
      }

      setEquipos(eqs.filter((e) => e.activo));
      setOrdenes(ordenesFiltradas.slice(0, 15));
      setLavados(lavs.slice(0, 15));
      setLecturas(lecs);
    } catch (e) {
      console.error('Error al cargar datos de maquinaria móvil:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void cargarDatos();
  }, []);

  useRealtime(['maquinaria_equipos', 'maquinaria_ordenes_servicio', 'maquinaria_lavados', 'maquinaria_lecturas'], () => {
    void cargarDatos();
  });

  // Mapa de info de mantenimiento para cada equipo
  const infoEquipos = useMemo(() => {
    const map = new Map<string, InfoMantenimientoMovil>();
    for (const e of equipos) {
      const lec = lecturas.get(e.id);
      const horo = lec?.horometro ?? null;
      const km = lec?.kilometraje ?? null;
      const avisoH = avisoServicio(e.mantenimiento_cada_hrs, horo, e.mantenimiento_base_hrs, 'h');
      const avisoK = avisoServicio(e.mantenimiento_cada_km, km, e.mantenimiento_base_km, 'km');
      const aviso = avisoMasUrgente(avisoH, avisoK);
      const est = estadoEfectivo(e);
      const enc = extraerEncargado(e);
      map.set(e.id, { horometro: horo, kilometraje: km, aviso, estado: est, encargado: enc });
    }
    return map;
  }, [equipos, lecturas]);

  // Al elegir equipo, cargar sus repuestos/filtros
  useEffect(() => {
    if (!equipoSelId) {
      setRepuestosEquipo([]);
      return;
    }
    listRepuestosEquipo(equipoSelId)
      .then((rs) => setRepuestosEquipo(rs))
      .catch(() => setRepuestosEquipo([]));

    const eq = equipos.find((e) => e.id === equipoSelId);
    if (eq) {
      const enc = extraerEncargado(eq);
      if (enc) setResponsableServicio(enc);
      const lec = lecturas.get(eq.id);
      if (lec?.horometro != null) setHorasServicio(String(lec.horometro));
      if (lec?.kilometraje != null) setKmServicio(String(lec.kilometraje));
    }
  }, [equipoSelId, equipos, lecturas]);

  const equipoActual = useMemo(
    () => equipos.find((e) => e.id === equipoSelId) ?? null,
    [equipos, equipoSelId]
  );

  const opcionesEquipos = useMemo(
    () => equipos.map((e) => ({ value: e.id, label: `${e.equipo}${e.tipo ? ` (${e.tipo})` : ''}` })),
    [equipos]
  );

  // Equipos filtrados para la vista de catálogo
  const equiposCatalogo = useMemo(() => {
    let lista = equipos;
    if (filtroCatalogo === 'alertas') {
      lista = lista.filter((e) => {
        const inf = infoEquipos.get(e.id);
        return inf?.aviso && inf.aviso.nivel !== 'ok';
      });
    } else if (filtroCatalogo === 'pesada') {
      lista = lista.filter((e) => /excavadora|cargador|jumbo|retro|patrol|tractor|dumper|minicargador/i.test(e.tipo || ''));
    } else if (filtroCatalogo === 'carga') {
      lista = lista.filter((e) => /camion|gandola|volqueta|chuto|cisterna|pickup|camioneta/i.test(e.tipo || ''));
    }

    if (busquedaCatalogo.trim()) {
      const q = busquedaCatalogo.trim().toLowerCase();
      lista = lista.filter((e) => {
        const enc = infoEquipos.get(e.id)?.encargado ?? '';
        return (
          e.equipo.toLowerCase().includes(q) ||
          (e.tipo && e.tipo.toLowerCase().includes(q)) ||
          (e.marca && e.marca.toLowerCase().includes(q)) ||
          (e.modelo && e.modelo.toLowerCase().includes(q)) ||
          enc.toLowerCase().includes(q)
        );
      });
    }

    return lista;
  }, [equipos, filtroCatalogo, busquedaCatalogo, infoEquipos]);

  // Abrir opciones de una máquina desde el catálogo
  function abrirOpcionesEquipo(eq: MaquinariaEquipo) {
    setEquipoOpciones(eq);
    setEquipoSelId(eq.id);
  }

  // ── Guardar Servicio ──
  async function guardarServicio() {
    if (!equipoActual) { toast('Selecciona la máquina o vehículo', 'error'); return; }
    if (!descripcionServicio.trim()) { toast('Indica el trabajo o falla', 'error'); return; }

    setSaving(true);
    try {
      const res = await crearOrdenServicio({
        equipo_id: equipoActual.id,
        tipo: tipoServicio,
        urgencia: urgenciaServicio === 'urgente' ? 'urgente' : 'normal',
        intervenciones: [tipoServicio],
        trabajos: [descripcionServicio.trim()],
        origen: 'interno',
        responsable: responsableServicio.trim() || actorName,
        descripcion: descripcionServicio.trim(),
        horometro: horasServicio ? Number(horasServicio) : null,
        kilometraje: kmServicio ? Number(kmServicio) : null,
        repuestos: piezasSeleccionadas.map((p) => ({
          producto_id: null,
          nombre: p.nombre,
          unidad: p.unidad || 'und',
          cantidad: Number(p.cantidad) || 1,
        })),
      });

      const txt = textoServicioWhatsapp({
        codigo: res.codigo,
        equipo: equipoActual.equipo,
        tipoEquipo: equipoActual.tipo,
        marca: equipoActual.marca,
        modelo: equipoActual.modelo,
        tipoServicio,
        urgencia: urgenciaServicio,
        horasActuales: horasServicio ? Number(horasServicio) : null,
        kmActuales: kmServicio ? Number(kmServicio) : null,
        responsable: responsableServicio.trim() || actorName,
        solicitante: actorName,
        descripcion: descripcionServicio.trim(),
        repuestos: piezasSeleccionadas.map((p) => ({
          nombre: p.nombre,
          cantidad: p.cantidad,
          unidad: p.unidad,
          a_comprar: p.cantidad,
        })),
      });

      toast(`Orden ${res.codigo} creada correctamente`, 'success');
      setMensajeWhatsapp(txt);
      setDescripcionServicio('');
      setPiezasSeleccionadas([]);
      await cargarDatos();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al solicitar el servicio', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Guardar Lavado ──
  async function guardarLavado() {
    if (!equipoActual) { toast('Selecciona la máquina o vehículo', 'error'); return; }

    setSaving(true);
    try {
      await registrarLavado({
        equipo_id: equipoActual.id,
        tipo: tipoLavado,
        responsable: lavador.trim() || actorName,
        horometro: null,
        kilometraje: null,
        nota: notasLavado.trim() || null,
        fecha: new Date().toISOString(),
      }, { email: actor, nombre: actorName });

      const txt = textoLavadoWhatsapp({
        equipo: equipoActual.equipo,
        tipoEquipo: equipoActual.tipo,
        tipoLavado,
        lavador: lavador.trim() || actorName,
        responsable: actorName,
        notas: notasLavado.trim() || null,
      });

      toast('Lavado registrado con éxito', 'success');
      setMensajeWhatsapp(txt);
      setNotasLavado('');
      await cargarDatos();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al registrar el lavado', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Guardar Avería / Cambio de Estado ──
  async function guardarAveria() {
    if (!equipoActual) { toast('Selecciona la máquina o vehículo', 'error'); return; }
    if (!motivoAveria.trim()) { toast('Indica el motivo o daño del equipo', 'error'); return; }

    setSaving(true);
    try {
      await cambiarEstadoEquipo(equipoActual.id, estadoAveria, motivoAveria.trim());

      const txt = textoAveriaEstadoWhatsapp({
        equipo: equipoActual.equipo,
        tipoEquipo: equipoActual.tipo,
        estadoNuevo: estadoAveria,
        motivo: motivoAveria.trim(),
        responsable: actorName,
        ubicacion: equipoActual.ubicacion,
      });

      toast(`Estado actualizado a ${estadoAveria.toUpperCase()}`, 'success');
      setMensajeWhatsapp(txt);
      setMotivoAveria('');
      await cargarDatos();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al cambiar estado', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surtidor flo-movil-wrap" style={{ maxWidth: '600px', margin: '0 auto', padding: '.75rem' }}>
      {/* ── Encabezado Móvil ── */}
      <header className="surt-head" style={{ marginBottom: '.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>📱 Maquinaria y Equipos</h1>
          <div className="muted" style={{ fontSize: '.8rem' }}>{actorName}</div>
        </div>
        {!soloTelefono && (
          <Link to="/app/maquinaria" className="btn btn-sm btn-ghost" title="Ir a la vista completa de computadora">
            💻 Modo PC
          </Link>
        )}
      </header>

      {/* Si hay un mensaje de WhatsApp recién generado, mostrarlo en grande arriba */}
      {mensajeWhatsapp && (
        <div className="card" style={{
          marginBottom: '1rem',
          borderColor: 'var(--success, #22c55e)',
          background: 'rgba(34, 197, 94, 0.08)',
          padding: '.85rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
            <strong style={{ color: 'var(--success, #22c55e)' }}>✅ Movimiento registrado con éxito</strong>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMensajeWhatsapp(null)}>✕ Cerrar</button>
          </div>
          <CompartirWhatsapp texto={mensajeWhatsapp} />
        </div>
      )}

      {/* ── Menú de Acciones Rápidas ("Puro botón") ── */}
      <div className="surt-rotulo" style={{ fontSize: '.88rem', fontWeight: 600, marginBottom: '.5rem' }}>
        ¿Qué deseas reportar hoy?
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '1rem' }}>
        <button
          type="button"
          className={`btn ${modo === 'servicio' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ height: '70px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '.2rem' }}
          onClick={() => { setModo('servicio'); setMensajeWhatsapp(null); }}
        >
          <span style={{ fontSize: '1.35rem' }}>🔧</span>
          <span style={{ fontWeight: 600, fontSize: '.84rem' }}>Solicitar Servicio</span>
        </button>

        <button
          type="button"
          className={`btn ${modo === 'lavado' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ height: '70px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '.2rem' }}
          onClick={() => { setModo('lavado'); setMensajeWhatsapp(null); }}
        >
          <span style={{ fontSize: '1.35rem' }}>🚿</span>
          <span style={{ fontWeight: 600, fontSize: '.84rem' }}>Registrar Lavado</span>
        </button>

        <button
          type="button"
          className={`btn ${modo === 'averia' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ height: '70px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '.2rem' }}
          onClick={() => { setModo('averia'); setMensajeWhatsapp(null); }}
        >
          <span style={{ fontSize: '1.35rem' }}>⚠️</span>
          <span style={{ fontWeight: 600, fontSize: '.84rem' }}>Reportar Avería</span>
        </button>

        <button
          type="button"
          className={`btn ${modo === 'filtros' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ height: '70px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '.2rem' }}
          onClick={() => { setModo('filtros'); setMensajeWhatsapp(null); }}
        >
          <span style={{ fontSize: '1.35rem' }}>🔍</span>
          <span style={{ fontWeight: 600, fontSize: '.84rem' }}>Ver Filtros / Rep.</span>
        </button>
      </div>

      {/* ── Formulario: Solicitar Servicio ── */}
      {modo === 'servicio' && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--surface-2, #1e293b)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>🔧 Nueva Solicitud de Servicio</h3>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModo('menu')}>✕ Volver</button>
          </div>

          <div style={{ display: 'grid', gap: '.75rem' }}>
            <div>
              <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Máquina / Vehículo *</label>
              <SearchSelect
                value={equipoSelId}
                onChange={setEquipoSelId}
                options={opcionesEquipos}
                placeholder="Busca y toca la máquina…"
              />
            </div>

            {equipoActual && (
              <div style={{ padding: '.5rem', background: 'var(--surface-1, #0f172a)', borderRadius: '6px', fontSize: '.78rem' }}>
                <div><strong>{equipoActual.equipo}</strong> · {[equipoActual.marca, equipoActual.modelo].filter(Boolean).join(' ')}</div>
                {extraerEncargado(equipoActual) && <div className="muted">👤 Encargado: {extraerEncargado(equipoActual)}</div>}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Tipo de servicio</label>
                <select className="select" value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)}>
                  {TIPOS_SERVICIO.map((t) => (
                    <option key={t} value={t}>{t.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Urgencia</label>
                <select className="select" value={urgenciaServicio} onChange={(e) => setUrgenciaServicio(e.target.value as 'normal' | 'urgente')}>
                  <option value="normal">NORMAL</option>
                  <option value="urgente">🚨 URGENTE</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Horómetro actual</label>
                <input
                  type="number"
                  className="input mono"
                  value={horasServicio}
                  onChange={(e) => setHorasServicio(e.target.value)}
                  placeholder="Ej. 4500"
                />
              </div>

              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Kilometraje actual</label>
                <input
                  type="number"
                  className="input mono"
                  value={kmServicio}
                  onChange={(e) => setKmServicio(e.target.value)}
                  placeholder="Ej. 120000"
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Trabajo o falla a reparar *</label>
              <textarea
                className="input"
                rows={2}
                value={descripcionServicio}
                onChange={(e) => setDescripcionServicio(e.target.value)}
                placeholder="Describe qué trabajo necesita la máquina…"
              />
            </div>

            {/* Repuestos de la ficha para añadir con un toque */}
            {repuestosEquipo.length > 0 && (
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>
                  🔩 Agregar repuestos de la ficha ({repuestosEquipo.length})
                </label>
                <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', maxHeight: '110px', overflowY: 'auto' }}>
                  {repuestosEquipo.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: '.72rem', padding: '.2rem .4rem' }}
                      onClick={() => {
                        const ya = piezasSeleccionadas.some((p) => p.nombre === r.tipo);
                        if (!ya) {
                          setPiezasSeleccionadas((prev) => [...prev, { nombre: r.tipo, cantidad: r.cantidad || 1, unidad: r.unidad || 'und' }]);
                        }
                      }}
                    >
                      + {r.tipo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Piezas agregadas */}
            {piezasSeleccionadas.length > 0 && (
              <div style={{ padding: '.5rem', background: 'var(--surface-1, #0f172a)', borderRadius: '6px' }}>
                <small style={{ fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Piezas que se pedirán:</small>
                {piezasSeleccionadas.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.78rem', marginBottom: '.2rem' }}>
                    <span>• {p.nombre} ({fmtNum(p.cantidad)} {p.unidad})</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ padding: '0 .3rem', color: 'var(--danger, #ef4444)' }}
                      onClick={() => setPiezasSeleccionadas((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '.75rem', fontWeight: 700 }}
              disabled={saving}
              onClick={() => void guardarServicio()}
            >
              {saving ? 'Guardando…' : '💾 Guardar y Enviar por WhatsApp'}
            </button>
          </div>
        </div>
      )}

      {/* ── Formulario: Registrar Lavado ── */}
      {modo === 'lavado' && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--surface-2, #1e293b)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>🚿 Registrar Lavado de Equipo</h3>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModo('menu')}>✕ Volver</button>
          </div>

          <div style={{ display: 'grid', gap: '.75rem' }}>
            <div>
              <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Máquina / Vehículo *</label>
              <SearchSelect
                value={equipoSelId}
                onChange={setEquipoSelId}
                options={opcionesEquipos}
                placeholder="Busca la máquina que se lavó…"
              />
            </div>

            <div>
              <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Tipo de lavado</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem' }}>
                {TIPOS_LAVADO.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`btn btn-sm ${tipoLavado === t ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setTipoLavado(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Lavador / Responsable</label>
              <input
                className="input"
                value={lavador}
                onChange={(e) => setLavador(e.target.value)}
                placeholder="Nombre de quien realizó el lavado…"
              />
            </div>

            <div>
              <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Observaciones (opcional)</label>
              <input
                className="input"
                value={notasLavado}
                onChange={(e) => setNotasLavado(e.target.value)}
                placeholder="Ej. Lavado con desengrasante, chasis limpio"
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '.75rem', fontWeight: 700 }}
              disabled={saving}
              onClick={() => void guardarLavado()}
            >
              {saving ? 'Guardando…' : '💾 Guardar y Enviar por WhatsApp'}
            </button>
          </div>
        </div>
      )}

      {/* ── Formulario: Reportar Avería / Estado ── */}
      {modo === 'averia' && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--surface-2, #1e293b)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>⚠️ Reportar Avería / Parada</h3>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModo('menu')}>✕ Volver</button>
          </div>

          <div style={{ display: 'grid', gap: '.75rem' }}>
            <div>
              <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Máquina / Vehículo *</label>
              <SearchSelect
                value={equipoSelId}
                onChange={setEquipoSelId}
                options={opcionesEquipos}
                placeholder="Busca la máquina con la avería…"
              />
            </div>

            <div>
              <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Nuevo estado del equipo</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${estadoAveria === 'averiada' ? 'btn-danger' : 'btn-ghost'}`}
                  onClick={() => setEstadoAveria('averiada')}
                >
                  🚨 AVERIADA
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${estadoAveria === 'parada' ? 'btn-danger' : 'btn-ghost'}`}
                  onClick={() => setEstadoAveria('parada')}
                >
                  🛑 PARADA
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${estadoAveria === 'taller' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setEstadoAveria('taller')}
                >
                  🛠️ EN TALLER
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${estadoAveria === 'espera' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setEstadoAveria('espera')}
                >
                  ⏳ ESPERANDO REP.
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${estadoAveria === 'operativa' ? 'btn-success' : 'btn-ghost'}`}
                  style={{ gridColumn: '1 / -1' }}
                  onClick={() => setEstadoAveria('operativa')}
                >
                  ✅ OPERATIVA
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>Motivo / Falla detectada *</label>
              <textarea
                className="input"
                rows={2}
                value={motivoAveria}
                onChange={(e) => setMotivoAveria(e.target.value)}
                placeholder="Explica qué daño tiene o por qué se paró el equipo…"
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '.75rem', fontWeight: 700 }}
              disabled={saving}
              onClick={() => void guardarAveria()}
            >
              {saving ? 'Guardando…' : '💾 Guardar y Enviar por WhatsApp'}
            </button>
          </div>
        </div>
      )}

      {/* ── Consulta de Filtros / Repuestos ── */}
      {modo === 'filtros' && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--surface-2, #1e293b)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>🔍 Filtros y Marcas de la Máquina</h3>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModo('menu')}>✕ Volver</button>
          </div>

          <div style={{ marginBottom: '.75rem' }}>
            <SearchSelect
              value={equipoSelId}
              onChange={setEquipoSelId}
              options={opcionesEquipos}
              placeholder="Elige una máquina para ver sus filtros…"
            />
          </div>

          {equipoActual ? (
            <div>
              <div style={{ padding: '.5rem', background: 'var(--surface-1, #0f172a)', borderRadius: '6px', fontSize: '.8rem', marginBottom: '.75rem' }}>
                <div><strong>{equipoActual.equipo}</strong> · {[equipoActual.marca, equipoActual.modelo].filter(Boolean).join(' ')}</div>
                {extraerEncargado(equipoActual) && <div className="muted">👤 Encargado: {extraerEncargado(equipoActual)}</div>}
                {(equipoActual.motor_modelo || equipoActual.motor_serial) && (
                  <div className="muted" style={{ fontSize: '.75rem' }}>⚙️ Motor: {[equipoActual.motor_modelo, equipoActual.motor_serial].filter(Boolean).join(' · ')}</div>
                )}
              </div>

              {repuestosEquipo.length === 0 ? (
                <div className="muted" style={{ fontSize: '.78rem' }}>Sin ficha de repuestos cargada aún.</div>
              ) : (
                <div style={{ display: 'grid', gap: '.4rem', marginBottom: '.75rem' }}>
                  {repuestosEquipo.map((r) => {
                    const sis = sistemaDe(r.sistema);
                    return (
                      <div key={r.id} style={{ padding: '.5rem', background: 'var(--surface-1, #0f172a)', borderRadius: '6px', fontSize: '.78rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <strong>{sis.icon} {r.tipo}</strong>
                          <span className="muted">{fmtNum(r.cantidad)} {r.unidad}</span>
                        </div>
                        {r.numero_parte && <div className="mono" style={{ color: 'var(--brand, #ff8a00)', marginTop: '.1rem' }}>OEM: {r.numero_parte}</div>}
                        {r.equivalencias && r.equivalencias.length > 0 && (
                          <div style={{ color: '#38bdf8', marginTop: '.1rem' }}>Marcas: {r.equivalencias.join(' · ')}</div>
                        )}
                        {r.especificacion && <div className="muted" style={{ fontSize: '.72rem' }}>Esp: {r.especificacion}</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => {
                  const txt = textoFichaFiltrosWhatsapp({
                    equipo: equipoActual.equipo,
                    tipo: equipoActual.tipo,
                    marca: equipoActual.marca,
                    modelo: equipoActual.modelo,
                    motor: [equipoActual.motor_modelo, equipoActual.motor_serial].filter(Boolean).join(' · '),
                    horasActuales: equipoActual.mantenimiento_base_hrs ?? null,
                    filtros: repuestosEquipo.map((f) => ({
                      sistema: f.sistema,
                      tipo: f.tipo,
                      numeroParte: f.numero_parte,
                      equivalencias: f.equivalencias,
                      especificacion: f.especificacion,
                    })),
                  });
                  setMensajeWhatsapp(txt);
                }}
              >
                📲 Compartir filtros por WhatsApp
              </button>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: '.8rem' }}>Selecciona una máquina arriba para consultar sus especificaciones técnicas y filtros.</div>
          )}
        </div>
      )}

      {/* ── Catálogo de Máquinas y Horas de Mantenimiento ── */}
      <div style={{ marginTop: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
          <strong style={{ fontSize: '.95rem' }}>🚜 Catálogo de Equipos y Horas</strong>
          <span className="badge">{equiposCatalogo.length} de {equipos.length}</span>
        </div>

        {/* Buscador táctil */}
        <input
          className="input"
          style={{ width: '100%', marginBottom: '.5rem', fontSize: '.84rem', padding: '.5rem .75rem' }}
          placeholder="🔍 Buscar máquina, modelo, encargado…"
          value={busquedaCatalogo}
          onChange={(e) => setBusquedaCatalogo(e.target.value)}
        />

        {/* Filtros rápidos táctiles */}
        <div style={{ display: 'flex', gap: '.3rem', overflowX: 'auto', paddingBottom: '.4rem', marginBottom: '.6rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${filtroCatalogo === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '.76rem', whiteSpace: 'nowrap' }}
            onClick={() => setFiltroCatalogo('todos')}
          >
            Todos
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filtroCatalogo === 'alertas' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '.76rem', whiteSpace: 'nowrap' }}
            onClick={() => setFiltroCatalogo('alertas')}
          >
            ⚠️ Próx. / Vencidos
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filtroCatalogo === 'pesada' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '.76rem', whiteSpace: 'nowrap' }}
            onClick={() => setFiltroCatalogo('pesada')}
          >
            🚜 Flota Pesada
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filtroCatalogo === 'carga' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '.76rem', whiteSpace: 'nowrap' }}
            onClick={() => setFiltroCatalogo('carga')}
          >
            🚚 Carga
          </button>
        </div>

        {/* Lista / Tarjetas de equipos tipo catálogo */}
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {equiposCatalogo.map((eq) => {
            const inf = infoEquipos.get(eq.id);
            const av = inf?.aviso;
            const horo = inf?.horometro;
            const km = inf?.kilometraje;
            const enc = inf?.encargado;

            // Nivel de mantenimiento
            const esVencido = av?.nivel === 'vencido';
            const esProximo = av?.nivel === 'proximo';
            const esOk = av?.nivel === 'ok';

            return (
              <div
                key={eq.id}
                role="button"
                tabIndex={0}
                onClick={() => abrirOpcionesEquipo(eq)}
                onKeyDown={(e) => { if (e.key === 'Enter') abrirOpcionesEquipo(eq); }}
                style={{
                  background: 'var(--surface-2, #182230)',
                  border: esVencido
                    ? '1.5px solid var(--danger, #ef4444)'
                    : esProximo
                    ? '1.5px solid var(--warning, #f59e0b)'
                    : '1px solid var(--border, #334155)',
                  borderRadius: '10px',
                  padding: '.75rem',
                  cursor: 'pointer',
                  transition: 'transform 0.1s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.3rem' }}>
                  <div>
                    <strong style={{ fontSize: '.92rem', color: '#fff', display: 'block' }}>
                      {eq.equipo}
                    </strong>
                    <span className="muted" style={{ fontSize: '.74rem' }}>
                      {[eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <span
                    className="badge"
                    style={{
                      fontSize: '.7rem',
                      background: inf?.estado === 'operativa' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: inf?.estado === 'operativa' ? '#4ade80' : '#f87171',
                    }}
                  >
                    {inf?.estado?.toUpperCase() || 'OPERATIVA'}
                  </span>
                </div>

                {enc && (
                  <div style={{ fontSize: '.74rem', color: 'var(--text-dim, #94a3b8)', marginBottom: '.35rem' }}>
                    👤 Encargado: <strong style={{ color: '#e2e8f0' }}>{enc}</strong>
                  </div>
                )}

                {/* Lecturas y Horas que faltan para mantenimiento */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--surface-1, #0f172a)',
                  padding: '.4rem .6rem',
                  borderRadius: '6px',
                  fontSize: '.76rem',
                  marginTop: '.2rem',
                }}>
                  <div>
                    <span className="muted">Horómetro: </span>
                    <strong>{horo != null ? `${fmtNum(horo)} h` : km != null ? `${fmtNum(km)} km` : '—'}</strong>
                  </div>

                  <div>
                    {esVencido ? (
                      <span style={{ color: '#f87171', fontWeight: 700 }}>
                        ⛔ Vencido por {fmtNum(Math.abs(av.restante))} {av.unidad}
                      </span>
                    ) : esProximo ? (
                      <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                        ⚠️ Próximo en {fmtNum(av.restante)} {av.unidad}
                      </span>
                    ) : esOk ? (
                      <span style={{ color: '#4ade80', fontWeight: 600 }}>
                        🟢 Faltan {fmtNum(av.restante)} {av.unidad}
                      </span>
                    ) : (
                      <span className="muted">⚪ Sin intervalo</span>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right', marginTop: '.35rem', fontSize: '.72rem', color: 'var(--primary, #38bdf8)' }}>
                  Toque para opciones ▸
                </div>
              </div>
            );
          })}

          {!equiposCatalogo.length && (
            <div className="muted" style={{ padding: '1rem', textAlign: 'center', fontSize: '.84rem' }}>
              No se encontraron máquinas con ese filtro o búsqueda.
            </div>
          )}
        </div>
      </div>

      {/* ── Modal de Opciones para un Equipo (al tocarlo en el catálogo) ── */}
      {equipoOpciones && (
        <Modal
          title={`🚜 ${equipoOpciones.equipo}`}
          size="md"
          onClose={() => setEquipoOpciones(null)}
          footer={
            <button type="button" className="btn btn-ghost btn-grande" onClick={() => setEquipoOpciones(null)}>
              ✕ Volver al Catálogo
            </button>
          }
        >
          {(() => {
            const inf = infoEquipos.get(equipoOpciones.id);
            const av = inf?.aviso;
            const horo = inf?.horometro;
            const km = inf?.kilometraje;
            const enc = inf?.encargado;

            return (
              <div style={{ display: 'grid', gap: '.75rem' }}>
                {/* Resumen del equipo */}
                <div style={{ background: 'var(--surface-2, #182230)', padding: '.75rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '.8rem', color: 'var(--text-dim, #94a3b8)' }}>
                    {[equipoOpciones.tipo, equipoOpciones.marca, equipoOpciones.modelo].filter(Boolean).join(' · ')}
                  </div>
                  {enc && <div style={{ fontSize: '.82rem', marginTop: '.2rem' }}>👤 Encargado: <strong>{enc}</strong></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.4rem', fontSize: '.82rem' }}>
                    <span>⏱️ Horómetro: <strong>{horo != null ? `${fmtNum(horo)} h` : km != null ? `${fmtNum(km)} km` : '—'}</strong></span>
                    <span>
                      {av?.nivel === 'vencido' ? (
                        <strong style={{ color: '#f87171' }}>⛔ Vencido por {fmtNum(Math.abs(av.restante))} {av.unidad}</strong>
                      ) : av?.nivel === 'proximo' ? (
                        <strong style={{ color: '#fbbf24' }}>⚠️ Próximo en {fmtNum(av.restante)} {av.unidad}</strong>
                      ) : av ? (
                        <strong style={{ color: '#4ade80' }}>🟢 Faltan {fmtNum(av.restante)} {av.unidad}</strong>
                      ) : (
                        <span className="muted">⚪ Sin intervalo</span>
                      )}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-dim, #94a3b8)', marginTop: '.2rem' }}>
                  ¿Qué deseas registrar para esta máquina?
                </div>

                {/* Botones de acción directa */}
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ height: '48px', fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}
                  onClick={() => {
                    setEquipoSelId(equipoOpciones.id);
                    setModo('servicio');
                    setEquipoOpciones(null);
                  }}
                >
                  <span>🔧</span>
                  <span>Solicitar Servicio a este Equipo</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: '48px', fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', border: '1px solid var(--border)' }}
                  onClick={() => {
                    setEquipoSelId(equipoOpciones.id);
                    setModo('lavado');
                    setEquipoOpciones(null);
                  }}
                >
                  <span>🚿</span>
                  <span>Registrar Lavado</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: '48px', fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', border: '1px solid var(--border)' }}
                  onClick={() => {
                    setEquipoSelId(equipoOpciones.id);
                    setModo('averia');
                    setEquipoOpciones(null);
                  }}
                >
                  <span>⚠️</span>
                  <span>Reportar Avería o Parada</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: '48px', fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', border: '1px solid var(--border)' }}
                  onClick={() => {
                    setEquipoSelId(equipoOpciones.id);
                    setModo('filtros');
                    setEquipoOpciones(null);
                  }}
                >
                  <span>🔍</span>
                  <span>Ver Filtros y Repuestos (OEM / Marcas)</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: '48px', fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' }}
                  onClick={() => {
                    const txt = textoEstadoEquipoWhatsapp({
                      equipo: equipoOpciones.equipo,
                      tipo: equipoOpciones.tipo,
                      marca: equipoOpciones.marca,
                      modelo: equipoOpciones.modelo,
                      estado: inf?.estado || 'operativa',
                      encargado: enc,
                      horometro: horo,
                      kilometraje: km,
                      horasFaltantes: av?.restante ?? null,
                      nivelAviso: av?.nivel ?? null,
                      unidadAviso: av?.unidad ?? 'h',
                    });
                    setMensajeWhatsapp(txt);
                    setEquipoOpciones(null);
                  }}
                >
                  <span>📲</span>
                  <span>Compartir Estado por WhatsApp</span>
                </button>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ── Últimos Movimientos de la Flota (con reenvío WhatsApp y Borrado) ── */}
      <div style={{ marginTop: '1.25rem' }}>
        <div style={{ fontSize: '.86rem', fontWeight: 600, marginBottom: '.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>📋 Últimos movimientos</span>
          <span className="muted" style={{ fontSize: '.75rem' }}>{ordenes.length + lavados.length} registros</span>
        </div>

        {loading ? (
          <div className="muted" style={{ fontSize: '.8rem' }}>Cargando movimientos…</div>
        ) : (
          <div style={{ display: 'grid', gap: '.45rem' }}>
            {ordenes.slice(0, 5).map((o) => {
              const eq = equipos.find((e) => e.id === o.equipo_id);
              return (
                <div key={o.id} className="flo-linea" style={{
                  padding: '.55rem .75rem',
                  background: 'var(--surface-2, #182230)',
                  borderRadius: 'var(--r-md, 8px)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{ minWidth: 0, marginRight: '.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      🔧 {o.codigo} · {eq?.equipo ?? 'Equipo'}
                    </div>
                    <div className="muted" style={{ fontSize: '.72rem' }}>
                      {o.tipo.toUpperCase()} · {o.responsable ?? 'Sin resp.'} · {dateTime(o.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: '.72rem', padding: '.2rem .4rem' }}
                      title="Compartir por WhatsApp"
                      onClick={() => {
                        const txt = textoServicioWhatsapp({
                          codigo: o.codigo,
                          equipo: eq?.equipo ?? 'Equipo',
                          tipoEquipo: eq?.tipo,
                          marca: eq?.marca,
                          modelo: eq?.modelo,
                          tipoServicio: o.tipo,
                          urgencia: o.urgencia,
                          horasActuales: o.horometro,
                          kmActuales: o.kilometraje,
                          responsable: o.responsable,
                          descripcion: o.descripcion,
                          repuestos: o.repuestos.map((r) => ({ nombre: r.nombre, cantidad: r.cantidad, unidad: r.unidad })),
                          fecha: o.created_at,
                        });
                        setMensajeWhatsapp(txt);
                      }}
                    >
                      📲 WhatsApp
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: '.72rem', padding: '.2rem .35rem', color: 'var(--danger, #ef4444)' }}
                      title="Eliminar este movimiento"
                      onClick={() => setBorrandoMov({ tipo: 'orden', id: o.id, codigo: o.codigo })}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}

            {lavados.slice(0, 3).map((l) => {
              const eq = equipos.find((e) => e.id === l.equipo_id);
              return (
                <div key={l.id} className="flo-linea" style={{
                  padding: '.55rem .75rem',
                  background: 'var(--surface-2, #182230)',
                  borderRadius: 'var(--r-md, 8px)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{ minWidth: 0, marginRight: '.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      🚿 Lavado {l.tipo} · {eq?.equipo ?? 'Equipo'}
                    </div>
                    <div className="muted" style={{ fontSize: '.72rem' }}>
                      Lavador: {l.responsable ?? '—'} · {dateTime(l.fecha)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: '.72rem', padding: '.2rem .4rem' }}
                      title="Compartir por WhatsApp"
                      onClick={() => {
                        const txt = textoLavadoWhatsapp({
                          equipo: eq?.equipo ?? 'Equipo',
                          tipoEquipo: eq?.tipo,
                          tipoLavado: l.tipo,
                          lavador: l.responsable,
                          notas: l.nota,
                          fecha: l.fecha,
                        });
                        setMensajeWhatsapp(txt);
                      }}
                    >
                      📲 WhatsApp
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: '.72rem', padding: '.2rem .35rem', color: 'var(--danger, #ef4444)' }}
                      title="Eliminar este lavado"
                      onClick={() => setBorrandoMov({ tipo: 'lavado', id: l.id, codigo: `Lavado ${l.tipo}` })}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}

            {!ordenes.length && !lavados.length && (
              <div className="muted" style={{ fontSize: '.8rem', padding: '.6rem', textAlign: 'center' }}>
                Sin movimientos recientes registrados.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmación para borrar movimiento */}
      {borrandoMov && (
        <ConfirmDialog
          title="Eliminar movimiento"
          message={`¿Estás seguro de eliminar el registro «${borrandoMov.codigo}»? Esta acción no se puede deshacer.`}
          confirmText="Sí, eliminar"
          danger
          onConfirm={async () => {
            try {
              if (borrandoMov.tipo === 'orden') {
                await eliminarOrdenServicio({ id: borrandoMov.id, codigo: borrandoMov.codigo });
              } else {
                await eliminarLavado(borrandoMov.id);
              }
              toast('Movimiento eliminado correctamente', 'success');
              setBorrandoMov(null);
              await cargarDatos();
            } catch (err) {
              toast(err instanceof Error ? err.message : 'No se pudo eliminar el movimiento', 'error');
            }
          }}
          onCancel={() => setBorrandoMov(null)}
        />
      )}
    </div>
  );
}
export default MaquinariaMovilView;
