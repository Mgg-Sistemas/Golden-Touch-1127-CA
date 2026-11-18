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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { notify } from '@/shared/lib/notify';
import { toast } from '@/shared/ui/Toast';
import { playNotificationSound } from '@/shared/lib/sound';
import { emitirWebPush } from '@/shared/lib/webpush';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { num as fmtNum, dateTime } from '@/shared/lib/format';
import { ExportarEquiposModal } from './ExportarEquiposModal';
import {
  listEquipos,
  extraerEncargado,
  reiniciarMantenimientoDeEquipo,
  type MaquinariaEquipo,
} from './maquinariaEquipos.repository';
import {
  crearOrdenServicio,
  cambiarEstadoEquipo,
  listOrdenesServicio,
  eliminarOrdenServicio,
  registrarLavado,
  listLavadosTodos,
  lecturasVigentesPorEquipo,
  solicitarCompraDeOrden,
  fotosDeEquipos,
  type OrdenServicio,
  type LavadoEquipo,
  type LecturaVigente,
  type FotoEquipo,
} from './flota.repository';
import {
  estadoEfectivo,
  claseEquipo,
  iconoDeClase,
  SERVICIOS,
  type EstadoEquipo,
  type AvisoServicio,
} from './flota';
import { AlertasMantenimientoBanner, type EquipoConAviso } from './AlertasMantenimiento';
import { EntregasAlmacenAviso } from './EntregasAlmacenPanel';
import { TABLAS_ALERTAS_MANT } from './alertasMantenimiento.repository';
import { listRepuestosEquipo } from './repuestosEquipo.repository';
import { sistemaDe, type RepuestoEquipo } from './repuestosEquipo';
import { EquipoFormModal } from './EquipoFormModal';
import { SubirFotoEquipoModal } from './SubirFotoEquipoModal';
import { BitacoraModal } from './BitacoraModal';
import {
  addMantenimiento,
  eliminarMantenimiento,
  etiquetaTipoMant,
  listMantenimientosDeActor,
  ultimosMantenimientosPorEquipo,
  type MantenimientoMaquinaria,
  type UltimoMantenimientoEquipo,
} from './maquinariaMant.repository';
import { MAX_FOTOS_MANTENIMIENTO, subirFotosMantenimiento } from './entregasAlmacen.repository';
import { prepararFotoOrden, subirFotosOrden } from './osFotos.repository';
import { avisoDeEquipo } from './avisoEquipo';
import {
  textoServicioWhatsapp,
  textoMantenimientoBitacoraWhatsapp,
  tiposBitacoraDeIntervenciones,
  textoLavadoWhatsapp,
  textoAveriaEstadoWhatsapp,
  textoFichaFiltrosWhatsapp,
  textoEstadoEquipoWhatsapp,
} from './maquinariaWhatsapp';

type ModoMovil = 'menu' | 'servicio' | 'lavado' | 'averia' | 'filtros' | 'solicitudes';
type TipoAccionServicio = 'solicitar' | 'registrar';

const hoyVE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

const TIPOS_LAVADO = ['SENCILLO', 'COMPLETO', 'CHASIS / MOTOR', 'ENGRASADO Y LAVADO'];

/** Badge del estado del servicio (verde OK · ámbar próximo · rojo vencido) para la tarjeta y la ventana de opciones. */
function BadgeServicio({ av }: { av: AvisoServicio | null | undefined }) {
  if (!av) return <span className="badge" title="Sin intervalo de mantenimiento">Sin intervalo</span>;
  if (av.nivel === 'vencido') {
    return <span className="badge danger" title="Mantenimiento vencido">Vencido +{fmtNum(Math.abs(av.restante))} {av.unidad}</span>;
  }
  if (av.nivel === 'proximo') {
    return <span className="badge warning" title="Mantenimiento próximo">Próx. {fmtNum(av.restante)} {av.unidad}</span>;
  }
  return <span className="badge success" title={`Faltan ${fmtNum(av.restante)} ${av.unidad} para el servicio`}>OK</span>;
}

interface InfoMantenimientoMovil {
  horometro: number | null;
  kilometraje: number | null;
  aviso: AvisoServicio | null;
  estado: EstadoEquipo;
  encargado: string | null;
}

export function MaquinariaMovilView() {
  const { user } = useSession();
  const { appUser, soloTelefono, can } = usePermissions();
  const correoUsuario = user?.email;
  const actor = correoUsuario ?? 'sistema';
  const actorName = appUser?.nombre?.trim() || user?.email || 'Operador';
  // Permiso de escritura del módulo: habilita responder las alertas de mantenimiento desde el teléfono.
  const canWrite = can('maquinaria', 'escritura');

  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [ordenesCargadas, setOrdenes] = useState<OrdenServicio[]>([]);
  const ordenes = useMemo(
    () => correoUsuario ? ordenesCargadas.filter((orden) => orden.created_by === correoUsuario) : [],
    [correoUsuario, ordenesCargadas],
  );
  const [lavados, setLavados] = useState<LavadoEquipo[]>([]);
  const [mantenimientosPropios, setMantenimientosPropios] = useState<MantenimientoMaquinaria[]>([]);
  const [lecturas, setLecturas] = useState<Map<string, LecturaVigente>>(new Map());
  const [fotos, setFotos] = useState<Map<string, string>>(new Map());
  const [ultimosMant, setUltimosMant] = useState<Map<string, UltimoMantenimientoEquipo>>(new Map());
  const [subirFotoEq, setSubirFotoEq] = useState<MaquinariaEquipo | null>(null);
  const [equipoBitacoraMovil, setEquipoBitacoraMovil] = useState<MaquinariaEquipo | null>(null);
  const [loading, setLoading] = useState(true);

  // Modo / pantalla activa dentro de la vista móvil
  const [modo, setModo] = useState<ModoMovil>('menu');
  const [equipoSelId, setEquipoSelId] = useState<string>('');
  const [repuestosEquipo, setRepuestosEquipo] = useState<RepuestoEquipo[]>([]);

  // Catálogo oculto por defecto: solo se despliega al tocar «Ver Catálogo»
  const [verCatalogo, setVerCatalogo] = useState(false);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');
  const [filtroCatalogo, setFiltroCatalogo] = useState<'todos' | 'alertas' | 'lanchas' | 'pesada' | 'vehiculos' | 'motos' | 'herramientas'>('todos');
  const [equipoOpciones, setEquipoOpciones] = useState<MaquinariaEquipo | null>(null);
  const [nuevoEquipoMovilOpen, setNuevoEquipoMovilOpen] = useState(false);
  const [exportarPdfMovilOpen, setExportarPdfMovilOpen] = useState(false);

  // Borrado de movimientos
  const [borrandoMov, setBorrandoMov] = useState<{ tipo: 'orden' | 'bitacora'; id: string; codigo: string } | null>(null);

  // Estados de los formularios móviles
  const [saving, setSaving] = useState(false);
  const [mensajeWhatsapp, setMensajeWhatsapp] = useState<string | null>(null);
  const [fotosWhatsapp, setFotosWhatsapp] = useState<File[]>([]);

  function mostrarWhatsapp(texto: string, archivos: File[] = []) {
    setMensajeWhatsapp(texto);
    setFotosWhatsapp(archivos);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Formulario Servicio: modo 'solicitar' (va a Compras) o 'registrar' (ya realizado, solo Bitácora)
  const [tipoAccionServicio, setTipoAccionServicio] = useState<TipoAccionServicio>('solicitar');
  const [fechaServicioBitacora, setFechaServicioBitacora] = useState<string>(hoyVE);
  const [reiniciarContadorBitacora, setReiniciarContadorBitacora] = useState<boolean>(true);
  const [fotosServicio, setFotosServicio] = useState<File[]>([]);
  const previasFotosServicio = useMemo(() => fotosServicio.map((f) => URL.createObjectURL(f)), [fotosServicio]);
  useEffect(() => () => { previasFotosServicio.forEach((u) => URL.revokeObjectURL(u)); }, [previasFotosServicio]);

  const [tipoServicio, setTipoServicio] = useState<string>('preventivo');
  const [intervencionesServicio, setIntervencionesServicio] = useState<string[]>(['preventivo']);
  const [urgenciaServicio, setUrgenciaServicio] = useState<'normal' | 'urgente'>('normal');
  const [horasServicio, setHorasServicio] = useState<string>('');
  const [kmServicio, setKmServicio] = useState<string>('');
  const [responsableServicio, setResponsableServicio] = useState<string>(actorName);
  const [descripcionServicio, setDescripcionServicio] = useState<string>('');
  const [piezasSeleccionadas, setPiezasSeleccionadas] = useState<Array<{ nombre: string; cantidad: number; unidad: string }>>([]);
  const [nombrePiezaLibre, setNombrePiezaLibre] = useState<string>('');
  const [cantPiezaLibre, setCantPiezaLibre] = useState<string>('1');
  const [unidadPiezaLibre, setUnidadPiezaLibre] = useState<string>('und');

  // Formulario Lavado
  const [tipoLavado, setTipoLavado] = useState<string>('SENCILLO');
  const [lavador, setLavador] = useState<string>(actorName);
  const [notasLavado, setNotasLavado] = useState<string>('');

  // Formulario Avería
  const [estadoAveria, setEstadoAveria] = useState<EstadoEquipo>('averiada');
  const [motivoAveria, setMotivoAveria] = useState<string>('');

  async function cargarDatos() {
    try {
      const [eqs, ords, lavs, lecs, fts, um, mantsPropios] = await Promise.all([
        listEquipos(),
        correoUsuario ? listOrdenesServicio(undefined, correoUsuario) : Promise.resolve([]),
        listLavadosTodos(),
        lecturasVigentesPorEquipo().catch(() => new Map<string, LecturaVigente>()),
        fotosDeEquipos().catch(() => [] as FotoEquipo[]),
        ultimosMantenimientosPorEquipo().catch(() => new Map<string, UltimoMantenimientoEquipo>()),
        correoUsuario ? listMantenimientosDeActor(correoUsuario, 25).catch(() => [] as MantenimientoMaquinaria[]) : Promise.resolve([] as MantenimientoMaquinaria[]),
      ]);

      const mapFotos = new Map<string, string>();
      for (const f of fts) {
        if (!mapFotos.has(f.equipo_id)) mapFotos.set(f.equipo_id, f.url);
      }

      setEquipos(eqs.filter((e) => e.activo));
      setOrdenes(ords);
      setLavados(lavs);
      setLecturas(lecs);
      setFotos(mapFotos);
      setUltimosMant(um);
      setMantenimientosPropios(mantsPropios);
    } catch (e) {
      console.error('Error al cargar datos de maquinaria móvil:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void cargarDatos();
  }, [correoUsuario]);

  // Un surtido de combustible (horómetro/km), una anotación en la bitácora o una respuesta a la
  // alerta deben refrescar el aviso de mantenimiento sin recargar la página.
  useRealtime([
    'maquinaria_equipos', 'maquinaria_ordenes_servicio', 'maquinaria_lavados', 'maquinaria_lecturas',
    'combustible_tanque_movimientos', 'maquinaria_mantenimientos', ...TABLAS_ALERTAS_MANT,
  ], () => {
    void cargarDatos();
  });

  // Mapa de info de mantenimiento para cada equipo
  const infoEquipos = useMemo(() => {
    const map = new Map<string, InfoMantenimientoMovil>();
    for (const e of equipos) {
      const lec = lecturas.get(e.id);
      const avEq = avisoDeEquipo(e, lec, ultimosMant.get(e.id));
      const horo = avEq.esVehiculo ? null : (lec?.horometro ?? null);
      const km = avEq.esVehiculo ? avEq.lecturaPrincipal : (lec?.kilometraje ?? null);
      const est = estadoEfectivo(e);
      const enc = extraerEncargado(e);
      map.set(e.id, { horometro: horo, kilometraje: km, aviso: avEq.aviso, estado: est, encargado: enc });
    }
    return map;
  }, [equipos, lecturas, ultimosMant]);

  // Equipos activos (no retirados) con el servicio PRÓXIMO o VENCIDO para el banner de alertas
  // (26/10/2026). La lectura va en la unidad del aviso más urgente (horas o km).
  const alertasMant = useMemo<EquipoConAviso[]>(() => {
    const out: EquipoConAviso[] = [];
    for (const e of equipos) {
      if (!e.activo) continue;
      const inf = infoEquipos.get(e.id);
      if (!inf || inf.estado === 'retirada' || !inf.aviso || inf.aviso.nivel === 'ok') continue;
      out.push({ equipo: e, aviso: inf.aviso, lectura: inf.aviso.unidad === 'h' ? inf.horometro : inf.kilometraje });
    }
    return out;
  }, [equipos, infoEquipos]);

  // Alerta sonora y push nativo al vencer el mantenimiento de un equipo
  const prevVencidosRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    const vencidos = alertasMant.filter((a) => a.aviso.nivel === 'vencido');
    const ids = vencidos.map((v) => v.equipo.id);
    if (prevVencidosRef.current !== null) {
      const nuevos = vencidos.filter((v) => !prevVencidosRef.current!.has(v.equipo.id));
      if (nuevos.length > 0) {
        const primero = nuevos[0];
        const titulo = '🚨 Maquinaria: Servicio Vencido';
        const cuerpo = nuevos.length === 1
          ? `${primero.equipo.equipo}${primero.equipo.placa ? ` (${primero.equipo.placa})` : ''}: servicio vencido por +${fmtNum(Math.abs(primero.aviso.restante))} ${primero.aviso.unidad}.`
          : `Hay ${nuevos.length} equipos con servicio de mantenimiento vencido.`;

        try { playNotificationSound(); } catch { /* ignore */ }
        void emitirWebPush({
          modulo: 'maquinaria',
          titulo,
          cuerpo,
          url: '/app/maquinaria/telefono',
          tag: `gt-maq-${primero.equipo.id}`,
          vibrar: true,
        });
        toast(cuerpo, 'warning');
      }
    }
    prevVencidosRef.current = new Set(ids);
  }, [loading, alertasMant]);

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
    } else if (filtroCatalogo === 'lanchas') {
      lista = lista.filter((e) => claseEquipo(e) === 'lancha');
    } else if (filtroCatalogo === 'pesada') {
      lista = lista.filter((e) => claseEquipo(e) === 'maquinaria');
    } else if (filtroCatalogo === 'vehiculos') {
      lista = lista.filter((e) => claseEquipo(e) === 'vehiculo');
    } else if (filtroCatalogo === 'motos') {
      lista = lista.filter((e) => claseEquipo(e) === 'moto');
    } else if (filtroCatalogo === 'herramientas') {
      lista = lista.filter((e) => claseEquipo(e) === 'herramienta');
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

  // Contadores por categoría para los botones táctiles
  const conteosCatalogo = useMemo(() => {
    let lanchas = 0;
    let pesada = 0;
    let vehiculos = 0;
    let motos = 0;
    let herramientas = 0;
    let alertas = 0;

    for (const e of equipos) {
      const c = claseEquipo(e);
      if (c === 'lancha') lanchas++;
      else if (c === 'maquinaria') pesada++;
      else if (c === 'vehiculo') vehiculos++;
      else if (c === 'moto') motos++;
      else if (c === 'herramienta') herramientas++;

      const inf = infoEquipos.get(e.id);
      if (inf?.aviso && inf.aviso.nivel !== 'ok') alertas++;
    }

    return { lanchas, pesada, vehiculos, motos, herramientas, alertas, total: equipos.length };
  }, [equipos, infoEquipos]);

  // Abrir opciones de una máquina desde el catálogo
  function abrirOpcionesEquipo(eq: MaquinariaEquipo) {
    setEquipoOpciones(eq);
    setEquipoSelId(eq.id);
  }

  function agregarFotosServicio(lista: FileList | null) {
    if (!lista?.length) return;
    const max = tipoAccionServicio === 'registrar' ? MAX_FOTOS_MANTENIMIENTO : 4;
    const imagenes = Array.from(lista).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name));
    if (!imagenes.length) {
      toast('Selecciona archivos de imagen válidos.', 'warning');
      return;
    }
    setFotosServicio((actual) => {
      const juntos = [...actual, ...imagenes].slice(0, max);
      if (actual.length + imagenes.length > max) {
        toast(`Se permiten hasta ${max} fotos de soporte.`, 'info');
      }
      return juntos;
    });
  }

  // ── Guardar Servicio (Solicitud Directa a Compras + Bitácora) ──
  async function guardarServicio() {
    if (!equipoActual) { toast('Selecciona la máquina o vehículo', 'error'); return; }
    if (!descripcionServicio.trim()) { toast('Indica el trabajo o falla', 'error'); return; }

    setSaving(true);
    try {
      // 1. Crear Orden de Servicio (sin tocar inventario: nombres generales para compras)
      const res = await crearOrdenServicio({
        equipo_id: equipoActual.id,
        tipo: tipoServicio,
        urgencia: urgenciaServicio === 'urgente' ? 'urgente' : 'normal',
        intervenciones: intervencionesServicio.length ? intervencionesServicio : [tipoServicio],
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

      // 2. Si hay piezas/repuestos, entran a Compras como SOLICITUD DE SERVICIO (SS-…) con sus
      //    nombres generales: el analista les pone el producto del inventario al cotizar.
      let spCodigo: string | null = null;
      if (piezasSeleccionadas.length > 0) {
        try {
          spCodigo = await solicitarCompraDeOrden(res);
        } catch (errCompras) {
          // Igual que en la PC (OrdenServicioModal): la orden ya quedó guardada; si no se pudo
          // abrir la Solicitud de Servicio, se avisa que queda pendiente (se genera desde la orden).
          const motivo = errCompras instanceof Error ? errCompras.message : (errCompras as { message?: string })?.message || 'error';
          notify(`🔧 ${res.codigo} creada — ${equipoActual.equipo}`, 'warning', {
            link: `#/app/maquinaria/equipo/${equipoActual.id}?tab=servicios`,
            detail: `Queda por pedir la Solicitud de Servicio (${motivo})`,
          });
          toast(`Queda por pedir la Solicitud de Servicio (${motivo}). Se puede generar después desde la orden.`, 'warning');
        }
      }

      // 2b. Si se adjuntaron fotos de soporte, subirlas tanto a la orden como a la bitácora
      let fotosPreparadas: File[] = [];
      let fotosBitacora: Array<{ path: string; filename: string }> = [];
      if (fotosServicio.length > 0) {
        fotosPreparadas = await Promise.all(fotosServicio.map((f) => prepararFotoOrden(f).catch(() => f)));
        await subirFotosOrden(res.id, fotosPreparadas.slice(0, 4), actor, actorName).catch(() => null);
        fotosBitacora = await subirFotosMantenimiento(equipoActual.id, fotosPreparadas).catch(() => []);
      }

      // 3. Registrar todo en la Bitácora del equipo (historial completo de mantenimientos)
      const tiposBit = tiposBitacoraDeIntervenciones(
        intervencionesServicio.length ? intervencionesServicio : [tipoServicio],
        piezasSeleccionadas,
      );
      try {
        await addMantenimiento({
          equipo_id: equipoActual.id,
          fecha: hoyVE(),
          tipo: tiposBit[0] ?? tipoServicio,
          tipos: tiposBit,
          pieza: piezasSeleccionadas.map((p) => `${p.nombre} (${fmtNum(p.cantidad)} ${p.unidad})`).join(', ') || null,
          horometro: horasServicio ? Number(horasServicio) : null,
          kilometraje: kmServicio ? Number(kmServicio) : null,
          trabajo: descripcionServicio.trim(),
          fotos: fotosBitacora.length ? fotosBitacora : undefined,
          observacion: `Orden de servicio ${res.codigo}${spCodigo ? ` · Solicitud de Servicio ${spCodigo}` : ''}. Piezas solicitadas con nombres generales: Compras les pone el producto del inventario al cotizar.`,
          mecanico: responsableServicio.trim() || actorName,
        }, actor, actorName);
      } catch (errBit) {
        console.warn('Registro en bitácora:', errBit);
      }

      // 4. Cambiar estado a 'repuestos' si es correctivo o tiene piezas pendientes
      if (piezasSeleccionadas.length > 0 || urgenciaServicio === 'urgente') {
        try {
          await cambiarEstadoEquipo(equipoActual.id, 'repuestos', `Esperando repuestos solicitados a Compras (${res.codigo}${spCodigo ? ` · ${spCodigo}` : ''})`);
        } catch { /* continua */ }
      }

      // 5. Mensaje formateado para WhatsApp
      const txt = textoServicioWhatsapp({
        codigo: `${res.codigo}${spCodigo ? ` (Solicitud de Servicio ${spCodigo})` : ''}`,
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

      toast(`Orden ${res.codigo} creada ${spCodigo ? `· Solicitud de Servicio ${spCodigo}` : ''}`, 'success');
      mostrarWhatsapp(txt, fotosPreparadas.length ? fotosPreparadas : [...fotosServicio]);
      setDescripcionServicio('');
      setPiezasSeleccionadas([]);
      setFotosServicio([]);
      setModo('solicitudes');
      await cargarDatos();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al solicitar el servicio', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Registrar Servicio / Mantenimiento YA REALIZADO (Solo Bitácora, SIN ir a Compras) ──
  async function guardarServicioBitacora() {
    if (!equipoActual) { toast('Selecciona la máquina o vehículo', 'error'); return; }
    if (intervencionesServicio.length === 0) { toast('Selecciona al menos un sistema o intervención realizada', 'error'); return; }
    if (!fechaServicioBitacora) { toast('Indica la fecha en que se realizó el servicio', 'error'); return; }
    if (!descripcionServicio.trim()) { toast('Describe el mantenimiento o servicio realizado', 'error'); return; }

    setSaving(true);
    try {
      // 1. Preparar y comprimir fotos de soporte para el bucket de bitácora (JPG <= 2 MB)
      let fotosPreparadas: File[] = [];
      let fotosSubidas: Array<{ path: string; filename: string }> = [];
      if (fotosServicio.length > 0) {
        fotosPreparadas = await Promise.all(fotosServicio.map((f) => prepararFotoOrden(f).catch(() => f)));
        fotosSubidas = await subirFotosMantenimiento(equipoActual.id, fotosPreparadas);
      }

      // 2. Clasificar segmentos de bitácora y consolidar repuestos/consumibles utilizados
      const tiposBit = tiposBitacoraDeIntervenciones(intervencionesServicio, piezasSeleccionadas);
      const piezasTexto = piezasSeleccionadas.length > 0
        ? piezasSeleccionadas.map((p) => `${p.nombre} (${fmtNum(p.cantidad)} ${p.unidad})`).join(', ')
        : null;

      const aceiteLts = piezasSeleccionadas
        .filter((p) => p.unidad === 'lts' && /aceite/i.test(p.nombre))
        .reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0);
      const refrigLts = piezasSeleccionadas
        .filter((p) => p.unidad === 'lts' && /refrigerante|anticongelante/i.test(p.nombre))
        .reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0);

      const horoNum = horasServicio ? Number(horasServicio) : null;
      const kmNum = kmServicio ? Number(kmServicio) : null;

      // 3. Guardar directamente en maquinaria_mantenimientos (NO crea Orden de Servicio ni va a Compras)
      await addMantenimiento({
        equipo_id: equipoActual.id,
        fecha: fechaServicioBitacora,
        tipo: tiposBit[0] ?? 'servicio',
        tipos: tiposBit,
        pieza: piezasTexto,
        consumibles: piezasTexto,
        aceite_lts: aceiteLts > 0 ? aceiteLts : null,
        refrigerante_lts: refrigLts > 0 ? refrigLts : null,
        horometro: horoNum,
        kilometraje: kmNum,
        trabajo: descripcionServicio.trim(),
        mecanico: responsableServicio.trim() || actorName,
        ubicacion: equipoActual.ubicacion ?? null,
        fotos: fotosSubidas.length > 0 ? fotosSubidas : undefined,
        observacion: 'Servicio / mantenimiento ya realizado registrado desde teléfono (solo Bitácora, sin enviar a Compras).',
      }, actor, actorName, { reiniciarContador: reiniciarContadorBitacora });

      if (reiniciarContadorBitacora && (horoNum != null || kmNum != null)) {
        try {
          await reiniciarMantenimientoDeEquipo(equipoActual.id, {
            horas: horoNum,
            km: kmNum,
          });
        } catch { /* best-effort */ }
      }

      // 4. Generar reporte de WhatsApp con las fotos adjuntas
      const txt = textoMantenimientoBitacoraWhatsapp({
        equipo: equipoActual.equipo,
        tipoEquipo: equipoActual.tipo,
        marca: equipoActual.marca,
        modelo: equipoActual.modelo,
        placa: equipoActual.placa,
        fechaServicio: fechaServicioBitacora,
        intervenciones: intervencionesServicio,
        horasActuales: horoNum,
        kmActuales: kmNum,
        responsable: responsableServicio.trim() || actorName,
        registradoPor: actorName,
        descripcion: descripcionServicio.trim(),
        repuestos: piezasSeleccionadas,
        fotosCount: fotosSubidas.length,
      });

      toast('Servicio registrado en la Bitácora del equipo (sin enviar a Compras)', 'success');
      mostrarWhatsapp(txt, fotosPreparadas.length ? fotosPreparadas : [...fotosServicio]);
      setDescripcionServicio('');
      setPiezasSeleccionadas([]);
      setFotosServicio([]);
      setModo('solicitudes');
      await cargarDatos();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al registrar el servicio en la bitácora', 'error');
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
      mostrarWhatsapp(txt);
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
      mostrarWhatsapp(txt);
      setMotivoAveria('');
      await cargarDatos();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al cambiar estado', 'error');
    } finally {
      setSaving(false);
    }
  }

  const agregarPiezaLibre = () => {
    if (!nombrePiezaLibre.trim()) return;
    setPiezasSeleccionadas((prev) => [
      ...prev,
      {
        nombre: nombrePiezaLibre.trim().toUpperCase(),
        cantidad: Number(cantPiezaLibre) || 1,
        unidad: unidadPiezaLibre,
      },
    ]);
    setNombrePiezaLibre('');
    setCantPiezaLibre('1');
  };

  const formatoEtiquetaServicio = (label: string): string => {
    return label
      .replace('Mantenimiento preventivo', 'Mantenimiento\npreventivo')
      .replace('Cambio de piezas', 'Cambio de\npiezas')
      .replace('Cauchos / neumáticos', 'Cauchos /\nneumáticos')
      .replace('Aceite y filtros', 'Aceite y\nfiltros')
      .replace('Sistema eléctrico', 'Sistema\neléctrico')
      .replace('Sistema hidráulico', 'Sistema\nhidráulico');
  };

  return (
    <div className="surtidor flo-movil-wrap" style={{ maxWidth: '540px', margin: '0 auto' }}>
      {/* ── Encabezado Móvil ── */}
      <header className="surt-head" style={{ marginBottom: '.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.22rem', margin: 0, fontWeight: 800 }}>📱 Maquinaria y Equipos</h1>
          <div className="muted" style={{ fontSize: '.78rem' }}>{actorName}</div>
        </div>
        {!soloTelefono && (
          <Link to="/app/maquinaria" className="btn btn-sm btn-ghost" style={{ padding: '.3rem .65rem', fontSize: '.78rem', border: '1px solid var(--border)' }} title="Ir a la vista completa de computadora">
            💻 Modo PC
          </Link>
        )}
      </header>

      {/* ── Modal flotante de WhatsApp: aparece al instante centrado en pantalla ── */}
      {mensajeWhatsapp && (
        <Modal title="📲 Compartir por WhatsApp" size="md" onClose={() => { setMensajeWhatsapp(null); setFotosWhatsapp([]); }}>
          <div style={{ marginBottom: '.75rem', fontSize: '.84rem', color: 'var(--text-muted)' }}>
            Reporte generado listo para enviar por WhatsApp o copiar:
          </div>
          <CompartirWhatsapp texto={mensajeWhatsapp} fotos={fotosWhatsapp} />
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setMensajeWhatsapp(null); setFotosWhatsapp([]); }}
            >
              Cerrar
            </button>
          </div>
        </Modal>
      )}

      {/* Si hay un mensaje de WhatsApp reciente, banner superior de respaldo */}
      {mensajeWhatsapp && (
        <div className="card" style={{
          marginBottom: '.65rem',
          borderColor: 'var(--success)',
          background: 'rgba(41, 192, 129, 0.08)',
          padding: '.65rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
            <strong style={{ color: 'var(--success)', fontSize: '.82rem' }}>✅ Movimiento registrado con éxito</strong>
            <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: '.74rem', padding: '.15rem .45rem' }} onClick={() => { setMensajeWhatsapp(null); setFotosWhatsapp([]); }}>✕ Cerrar</button>
          </div>
          <CompartirWhatsapp texto={mensajeWhatsapp} fotos={fotosWhatsapp} />
        </div>
      )}

      {/* ── Menú de Acciones Rápidas (Compacto con colores institucionales) ── */}
      <div className="surt-rotulo" style={{ fontSize: '.78rem', fontWeight: 700, margin: '.25rem 0 .5rem', color: 'var(--text-muted)', letterSpacing: '.04em' }}>
        ¿QUÉ DESEAS REPORTAR HOY?
      </div>

      <div className="flo-mv-acciones">
        <button
          type="button"
          className="btn btn-ghost flo-mv-accion"
          aria-pressed={modo === 'servicio'}
          onClick={() => { setModo(modo === 'servicio' ? 'menu' : 'servicio'); setMensajeWhatsapp(null); setFotosWhatsapp([]); }}
        >
          <span className="ico">🔧</span>
          <strong>Solicitar Servicio</strong>
        </button>

        <button
          type="button"
          className="btn btn-ghost flo-mv-accion tone-info"
          aria-pressed={modo === 'lavado'}
          onClick={() => { setModo(modo === 'lavado' ? 'menu' : 'lavado'); setMensajeWhatsapp(null); setFotosWhatsapp([]); }}
        >
          <span className="ico">🚿</span>
          <strong>Registrar Lavado</strong>
        </button>

        <button
          type="button"
          className="btn btn-ghost flo-mv-accion tone-danger"
          aria-pressed={modo === 'averia'}
          onClick={() => { setModo(modo === 'averia' ? 'menu' : 'averia'); setMensajeWhatsapp(null); setFotosWhatsapp([]); }}
        >
          <span className="ico">⚠️</span>
          <strong>Reportar Avería</strong>
        </button>

        <button
          type="button"
          className="btn btn-ghost flo-mv-accion tone-primary-3"
          aria-pressed={modo === 'filtros'}
          onClick={() => { setModo(modo === 'filtros' ? 'menu' : 'filtros'); setMensajeWhatsapp(null); setFotosWhatsapp([]); }}
        >
          <span className="ico">🔍</span>
          <strong>Ver Filtros / Rep.</strong>
        </button>
      </div>

      {/* Botón de acceso directo a Solicitudes / Órdenes y Bitácora (Compacto) */}
      {(() => {
        const ordenesActivas = ordenes.filter((o) => o.estado !== 'cancelada' && o.estado !== 'anulada' && o.estado !== 'realizada');
        const bitacoraDirectos = mantenimientosPropios.filter((m) => !(m.observacion ?? '').startsWith('Orden de servicio '));
        return (
          <button
            type="button"
            className="btn btn-ghost flo-mv-solicitudes"
            aria-pressed={modo === 'solicitudes'}
            onClick={() => { setModo(modo === 'solicitudes' ? 'menu' : 'solicitudes'); setMensajeWhatsapp(null); setFotosWhatsapp([]); }}
          >
            <span>
              <span className="ico">📋</span>
              <span>Mis Solicitudes y Órdenes de Servicio</span>
            </span>
            <span className={`badge ${ordenesActivas.length > 0 ? 'primary' : ''}`}>
              {ordenesActivas.length} {ordenesActivas.length === 1 ? 'activa' : 'activas'}
              {bitacoraDirectos.length > 0 ? ` · ${bitacoraDirectos.length} bit.` : ''}
            </span>
          </button>
        );
      })()}

      {/* Botón para mostrar u ocultar el Catálogo de Equipos (oculto por defecto) */}
      <button
        type="button"
        className="btn btn-ghost flo-mv-solicitudes"
        aria-pressed={verCatalogo}
        onClick={() => setVerCatalogo((v) => !v)}
      >
        <span>
          <span className="ico">🚜</span>
          <span>{verCatalogo ? 'Ocultar Catálogo' : 'Ver Catálogo'}</span>
        </span>
        <span className={`badge ${verCatalogo ? 'primary' : ''}`}>
          {equipos.length} {equipos.length === 1 ? 'equipo' : 'equipos'}
        </span>
      </button>

      {/* ── Vista: Lista de Solicitudes y Registros de Bitácora ── */}
      {modo === 'solicitudes' && (
        <div className="card" style={{ padding: '.65rem', marginBottom: '.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.55rem' }}>
            <h3 style={{ margin: 0, fontSize: '.92rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
              <span>📋</span> Mis Solicitudes y Servicios Registrados
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ color: 'var(--text-muted)', padding: '.15rem .45rem', fontSize: '.74rem' }}
              onClick={() => setModo('menu')}
            >
              ✕ Volver
            </button>
          </div>

          {(() => {
            const bitacoraDirectos = mantenimientosPropios.filter((m) => !(m.observacion ?? '').startsWith('Orden de servicio '));
            if (ordenes.length === 0 && bitacoraDirectos.length === 0) {
              return (
                <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: '.35rem' }}>📭</div>
                  <div style={{ fontSize: '.82rem' }}>No hay solicitudes ni servicios registrados todavía.</div>
                  <div style={{ display: 'flex', gap: '.45rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '.65rem' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: '.76rem', padding: '.25rem .6rem' }}
                      onClick={() => { setTipoAccionServicio('solicitar'); setModo('servicio'); }}
                    >
                      + Solicitar servicio a Compras
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: '.76rem', padding: '.25rem .6rem', border: '1px solid var(--border)' }}
                      onClick={() => { setTipoAccionServicio('registrar'); setModo('servicio'); }}
                    >
                      📒 Registrar en Bitácora
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div style={{ display: 'grid', gap: '.75rem' }}>
                {ordenes.length > 0 && (
                  <div style={{ display: 'grid', gap: '.5rem' }}>
                    <div className="muted" style={{ fontSize: '.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                      🛒 Solicitudes enviadas a Compras ({ordenes.length})
                    </div>
                    {ordenes.map((o) => {
                      const eq = equipos.find((e) => e.id === o.equipo_id);
                      const foto = eq ? fotos.get(eq.id) : null;
                      const isCancelada = o.estado === 'cancelada';
                      const isRepuestos = o.estado === 'repuestos';
                      const isRealizada = o.estado === 'realizada';
                      return (
                        <div
                          key={o.id}
                          style={{
                            padding: '.65rem',
                            background: 'var(--bg-1)',
                            borderRadius: 'var(--r-md)',
                            border: isCancelada
                              ? '1px solid rgba(239, 79, 94, 0.4)'
                              : isRepuestos
                              ? '1px solid rgba(245, 177, 51, 0.4)'
                              : '1px solid var(--border)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.3rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap' }}>
                              <span className="mono" style={{ fontWeight: 800, fontSize: '.88rem', color: 'var(--primary-3)' }}>
                                {o.codigo}
                              </span>
                              <span
                                className={`badge ${isCancelada ? 'danger' : isRepuestos ? 'warning' : isRealizada ? 'success' : 'info'}`}
                                style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase' }}
                              >
                                {isCancelada ? '❌ CANCELADA (COMPRAS)' : o.estado}
                              </span>
                              {o.urgencia === 'urgente' && (
                                <span className="badge danger" style={{ fontSize: '.66rem' }}>
                                  🚨 URGENTE
                                </span>
                              )}
                            </div>
                            <div className="muted" style={{ fontSize: '.7rem' }}>
                              {dateTime(o.created_at)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', margin: '.4rem 0' }}>
                            {foto ? (
                              <img src={foto} alt={eq?.equipo ?? 'Equipo'} style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                                {eq ? iconoDeClase(claseEquipo(eq)) : '🚜'}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{eq?.equipo ?? 'Equipo'}</div>
                              <div className="muted" style={{ fontSize: '.74rem' }}>
                                {[eq?.marca, eq?.modelo].filter(Boolean).join(' · ')}
                                {eq?.placa && <span style={{ marginLeft: '.4rem', padding: '1px 5px', background: 'var(--surface-3)', borderRadius: 'var(--r-sm)', fontWeight: 600 }}>🚗 {eq.placa}</span>}
                              </div>
                            </div>
                          </div>

                          <div style={{ fontSize: '.82rem', marginBottom: '.35rem', color: 'var(--text)' }}>
                            <strong>Trabajo / Falla:</strong> {o.descripcion || 'Sin descripción'}
                          </div>

                          {(o.horometro != null || o.kilometraje != null || o.responsable) && (
                            <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.4rem', display: 'flex', flexWrap: 'wrap', gap: '.6rem' }}>
                              {o.responsable && <span>👤 Responsable: {o.responsable}</span>}
                              {o.horometro != null && <span>⏱️ Horómetro: {fmtNum(o.horometro)} h</span>}
                              {o.kilometraje != null && <span>🚗 Km: {fmtNum(o.kilometraje)} km</span>}
                            </div>
                          )}

                          {o.repuestos && o.repuestos.length > 0 && (
                            <div style={{ fontSize: '.75rem', padding: '.35rem .5rem', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', marginBottom: '.5rem' }}>
                              <strong style={{ display: 'block', marginBottom: '.15rem', color: 'var(--warning)' }}>
                                🛒 Piezas enviadas a Compras ({o.repuestos.length}):
                              </strong>
                              {o.repuestos.map((r, ri) => (
                                <div key={ri} className="muted">
                                  • {r.nombre} ({fmtNum(r.cantidad)} {r.unidad})
                                </div>
                              ))}
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.45rem' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              style={{
                                fontSize: '.78rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '.35rem',
                              }}
                              onClick={() => {
                                const txt = textoServicioWhatsapp({
                                  codigo: o.codigo,
                                  equipo: eq?.equipo ?? 'Equipo',
                                  tipoEquipo: eq?.tipo,
                                  marca: eq?.marca,
                                  modelo: eq?.modelo,
                                  tipoServicio: o.tipo,
                                  urgencia: o.urgencia === 'urgente' ? 'urgente' : 'normal',
                                  horasActuales: o.horometro,
                                  kmActuales: o.kilometraje,
                                  responsable: o.responsable,
                                  descripcion: o.descripcion,
                                  repuestos: o.repuestos.map((r) => ({ nombre: r.nombre, cantidad: r.cantidad, unidad: r.unidad })),
                                  fecha: o.created_at,
                                });
                                mostrarWhatsapp(txt);
                              }}
                            >
                              <span>📲</span> Compartir por WhatsApp
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              style={{
                                fontSize: '.75rem',
                                fontWeight: 600,
                              }}
                              title="Eliminar orden"
                              onClick={() => setBorrandoMov({ tipo: 'orden', id: o.id, codigo: o.codigo })}
                            >
                              🗑 Borrar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {bitacoraDirectos.length > 0 && (
                  <div style={{ display: 'grid', gap: '.5rem' }}>
                    <div className="muted" style={{ fontSize: '.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                      📒 Servicios / Mantenimientos registrados en Bitácora ({bitacoraDirectos.length})
                    </div>
                    {bitacoraDirectos.map((m) => {
                      const eq = equipos.find((e) => e.id === m.equipo_id);
                      const foto = eq ? fotos.get(eq.id) : null;
                      const tiposLista = m.tipos && m.tipos.length > 0 ? m.tipos : (m.tipo ? [m.tipo] : ['servicio']);
                      const numFotos = m.fotos?.length ?? 0;
                      return (
                        <div
                          key={m.id}
                          style={{
                            padding: '.65rem',
                            background: 'var(--bg-1)',
                            borderRadius: 'var(--r-md)',
                            border: '1px solid color-mix(in srgb, var(--info) 40%, var(--border))',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.3rem', gap: '.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap' }}>
                              <span className="badge info" style={{ fontSize: '.68rem', fontWeight: 700 }}>
                                📒 BITÁCORA · SIN COMPRAS
                              </span>
                              {numFotos > 0 && (
                                <span className="badge success" style={{ fontSize: '.68rem', fontWeight: 700 }}>
                                  📷 {numFotos} {numFotos === 1 ? 'foto' : 'fotos'}
                                </span>
                              )}
                            </div>
                            <div className="mono muted" style={{ fontSize: '.74rem', fontWeight: 700 }}>
                              📅 {String(m.fecha).slice(0, 10)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', margin: '.4rem 0' }}>
                            {foto ? (
                              <img src={foto} alt={eq?.equipo ?? 'Equipo'} style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                                {eq ? iconoDeClase(claseEquipo(eq)) : '🚜'}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{eq?.equipo ?? 'Equipo'}</div>
                              <div className="muted" style={{ fontSize: '.74rem' }}>
                                {tiposLista.map((tp) => etiquetaTipoMant(tp)).join(' · ')}
                              </div>
                            </div>
                          </div>

                          <div style={{ fontSize: '.82rem', marginBottom: '.35rem', color: 'var(--text)' }}>
                            <strong>Trabajo realizado:</strong> {m.trabajo || 'Sin descripción'}
                          </div>

                          {(m.pieza || m.consumibles) && (
                            <div style={{ fontSize: '.75rem', padding: '.35rem .5rem', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', marginBottom: '.45rem' }}>
                              <strong style={{ display: 'block', marginBottom: '.15rem', color: 'var(--info)' }}>
                                ⚙️ Repuestos / piezas utilizadas:
                              </strong>
                              <div className="muted">{m.pieza || m.consumibles}</div>
                            </div>
                          )}

                          {(m.horometro != null || m.kilometraje != null || m.mecanico) && (
                            <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.4rem', display: 'flex', flexWrap: 'wrap', gap: '.6rem' }}>
                              {m.mecanico && <span>👤 Mecánico: {m.mecanico}</span>}
                              {m.horometro != null && <span>⏱️ Horómetro: {fmtNum(m.horometro)} h</span>}
                              {m.kilometraje != null && <span>🚗 Km: {fmtNum(m.kilometraje)} km</span>}
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap', marginTop: '.45rem' }}>
                            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-success"
                                style={{ fontSize: '.76rem', fontWeight: 700 }}
                                onClick={() => {
                                  const txt = textoMantenimientoBitacoraWhatsapp({
                                    equipo: eq?.equipo ?? 'Equipo',
                                    tipoEquipo: eq?.tipo,
                                    marca: eq?.marca,
                                    modelo: eq?.modelo,
                                    placa: eq?.placa,
                                    fechaServicio: String(m.fecha).slice(0, 10),
                                    intervenciones: tiposLista,
                                    horasActuales: m.horometro,
                                    kmActuales: m.kilometraje,
                                    responsable: m.mecanico,
                                    registradoPor: m.actor_name,
                                    descripcion: m.trabajo ?? '',
                                    repuestos: (m.pieza || m.consumibles)
                                      ? [{ nombre: m.pieza || m.consumibles || '', cantidad: 1, unidad: 'lote' }]
                                      : [],
                                    fotosCount: numFotos,
                                  });
                                  mostrarWhatsapp(txt);
                                }}
                              >
                                📲 WhatsApp
                              </button>
                              {eq && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  style={{ fontSize: '.76rem', border: '1px solid var(--border)' }}
                                  onClick={() => setEquipoBitacoraMovil(eq)}
                                >
                                  📒 Ver Bitácora
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              style={{ fontSize: '.74rem', fontWeight: 600 }}
                              onClick={() => setBorrandoMov({ tipo: 'bitacora', id: m.id, codigo: `Bitácora ${String(m.fecha).slice(0, 10)} · ${eq?.equipo ?? ''}` })}
                            >
                              🗑 Borrar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Formulario: Solicitar Servicio (a Compras) o Registrar Servicio / Mantenimiento (Bitácora) ── */}
      {modo === 'servicio' && (
        <div className="card flo-mv-form-card" style={{ marginBottom: '1rem', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', gap: '.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.02rem', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: '.35rem', minWidth: 0 }}>
              <span>{tipoAccionServicio === 'registrar' ? '📒' : '🔧'}</span>
              <span>{tipoAccionServicio === 'registrar' ? 'Registrar Servicio / Mant.' : 'Solicitar Servicio a Compras'}</span>
            </h3>
            <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: '.82rem', flexShrink: 0, padding: '.25rem .55rem' }} onClick={() => setModo('menu')}>✕ Volver</button>
          </div>

          {/* Selector táctil de modalidad en 2 columnas parejo: Solicitar a Compras vs Registrar en Bitácora */}
          <div className="flo-mv-modo-grid" role="tablist" aria-label="Tipo de registro de servicio">
            <button
              type="button"
              role="tab"
              aria-selected={tipoAccionServicio === 'solicitar'}
              className={`flo-mv-modo-btn ${tipoAccionServicio === 'solicitar' ? 'activa' : ''}`}
              onClick={() => setTipoAccionServicio('solicitar')}
            >
              <span className="ico">🛒</span>
              <span className="tit">Solicitar Servicio</span>
              <span className="sub">Enviar a Compras</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tipoAccionServicio === 'registrar'}
              className={`flo-mv-modo-btn ${tipoAccionServicio === 'registrar' ? 'activa' : ''}`}
              onClick={() => setTipoAccionServicio('registrar')}
            >
              <span className="ico">📒</span>
              <span className="tit">Registrar Servicio</span>
              <span className="sub">Solo Bitácora</span>
            </button>
          </div>

          {tipoAccionServicio === 'registrar' && (
            <div style={{
              padding: '.6rem .75rem',
              marginBottom: '.85rem',
              borderRadius: 'var(--r-md)',
              background: 'color-mix(in srgb, var(--info) 12%, var(--bg-1))',
              border: '1px solid color-mix(in srgb, var(--info) 45%, var(--border))',
              fontSize: '.82rem',
              lineHeight: 1.35,
            }}>
              📒 <strong>Servicio / mantenimiento ya realizado:</strong> queda guardado directo en la <strong>Bitácora</strong> del equipo con sus repuestos y fotos de soporte (<strong>no va a Compras</strong>).
            </div>
          )}

          <div style={{ display: 'grid', gap: '.85rem' }}>
            <div>
              <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Máquina / Vehículo *</label>
              <SearchSelect
                value={equipoSelId}
                onChange={setEquipoSelId}
                options={opcionesEquipos}
                placeholder="Busca y toca la máquina…"
              />
            </div>

            {equipoActual && (
              <div style={{ padding: '.55rem .75rem', background: 'var(--bg-1)', borderRadius: 'var(--r-md)', fontSize: '.86rem', display: 'flex', gap: '.65rem', alignItems: 'center' }}>
                {fotos.has(equipoActual.id) ? (
                  <img src={fotos.get(equipoActual.id)} alt={equipoActual.equipo} style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                    {iconoDeClase(claseEquipo(equipoActual))}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div><strong>{equipoActual.equipo}</strong> · {[equipoActual.marca, equipoActual.modelo].filter(Boolean).join(' ')}</div>
                  {equipoActual.placa && <div><span className="badge" style={{ fontSize: '.75rem', padding: '2px 6px' }}>🚗 Placa: {equipoActual.placa}</span></div>}
                  {extraerEncargado(equipoActual) && <div className="muted" style={{ fontSize: '.8rem' }}>👤 Encargado: {extraerEncargado(equipoActual)}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '.76rem', padding: '.25rem .5rem' }}
                    onClick={() => setEquipoBitacoraMovil(equipoActual)}
                  >
                    📒 Bitácora
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '.76rem', padding: '.25rem .5rem' }}
                    onClick={() => setSubirFotoEq(equipoActual)}
                  >
                    📷 Foto
                  </button>
                </div>
              </div>
            )}

            {/* Opciones de Intervención / Tipo de Falla (Aceite, Pieza, Sistema Hidráulico, etc.) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                <label style={{ fontSize: '.9rem', fontWeight: 600, margin: 0 }}>
                  {tipoAccionServicio === 'registrar' ? 'Sistema / Intervención realizada *' : 'Sistema / Intervención requerida *'}
                </label>
                {intervencionesServicio.length > 0 && (
                  <span className="badge" style={{ fontSize: '.78rem', padding: '2px 8px' }}>
                    {intervencionesServicio.length} {intervencionesServicio.length === 1 ? 'seleccionado' : 'seleccionados'}
                  </span>
                )}
              </div>

              <div className="flo-mv-servicios-grid">
                {SERVICIOS.slice(0, 9).map((s) => {
                  const activa = intervencionesServicio.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`flo-mv-servicio-btn ${activa ? 'activa' : ''}`}
                      onClick={() => {
                        setTipoServicio(s.id);
                        if (activa) {
                          setIntervencionesServicio((prev) => prev.filter((x) => x !== s.id));
                        } else {
                          setIntervencionesServicio((prev) => [...prev, s.id]);
                        }
                        if (!descripcionServicio.trim()) {
                          if (s.id === 'aceite') setDescripcionServicio('Cambio de aceite de motor y filtros');
                          else if (s.id === 'hidraulico') setDescripcionServicio('Revisión de fuga / manguera hidráulica y reposición');
                          else if (s.id === 'cambio_pieza') setDescripcionServicio('Reemplazo de pieza / repuesto');
                          else if (s.id === 'frenos') setDescripcionServicio('Mantenimiento de sistema de frenos');
                          else if (s.id === 'electrico') setDescripcionServicio('Revisión sistema eléctrico / batería');
                          else if (s.id === 'cauchos') setDescripcionServicio('Reparación / cambio de cauchos');
                        }
                      }}
                    >
                      <span className="ico">{s.icon}</span>
                      <span className="lbl">{formatoEtiquetaServicio(s.label)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="surt-grid2">
              {tipoAccionServicio === 'registrar' ? (
                <div>
                  <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Fecha del servicio *</label>
                  <input
                    type="date"
                    className="input mono"
                    style={{ fontSize: '.92rem' }}
                    max={hoyVE()}
                    value={fechaServicioBitacora}
                    onChange={(e) => {
                      const nuevaFecha = e.target.value;
                      setFechaServicioBitacora(nuevaFecha);
                      setReiniciarContadorBitacora(nuevaFecha >= hoyVE());
                    }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Urgencia</label>
                  <select className="select" style={{ fontSize: '.92rem' }} value={urgenciaServicio} onChange={(e) => setUrgenciaServicio(e.target.value as 'normal' | 'urgente')}>
                    <option value="normal">NORMAL</option>
                    <option value="urgente">🚨 URGENTE</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Responsable / Mecánico</label>
                <input
                  type="text"
                  className="input"
                  style={{ fontSize: '.92rem' }}
                  value={responsableServicio}
                  onChange={(e) => setResponsableServicio(e.target.value)}
                  placeholder={tipoAccionServicio === 'registrar' ? 'Quién realizó el trabajo…' : 'Nombre de quien revisa…'}
                />
              </div>
            </div>

            <div className="surt-grid2">
              <div>
                <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
                  {tipoAccionServicio === 'registrar' ? 'Horómetro en el servicio' : 'Horómetro actual'}
                </label>
                <input
                  type="number"
                  className="input mono"
                  style={{ fontSize: '.92rem' }}
                  value={horasServicio}
                  onChange={(e) => setHorasServicio(e.target.value)}
                  placeholder="Ej. 4500"
                />
              </div>

              <div>
                <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
                  {tipoAccionServicio === 'registrar' ? 'Kilometraje en el servicio' : 'Kilometraje actual'}
                </label>
                <input
                  type="number"
                  className="input mono"
                  style={{ fontSize: '.92rem' }}
                  value={kmServicio}
                  onChange={(e) => setKmServicio(e.target.value)}
                  placeholder="Ej. 120000"
                />
              </div>
            </div>

            {tipoAccionServicio === 'registrar' && (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.55rem',
                padding: '.55rem .7rem',
                background: 'var(--bg-1)',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                fontSize: '.84rem',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={reiniciarContadorBitacora}
                  onChange={(e) => setReiniciarContadorBitacora(e.target.checked)}
                />
                <span>
                  🔄 Actualizar contador de próximo mantenimiento con esta lectura
                  {fechaServicioBitacora < hoyVE() && (
                    <small className="muted" style={{ display: 'block', fontSize: '.74rem' }}>
                      Desmárcalo si es un mantenimiento viejo para no alterar el horómetro/km actual.
                    </small>
                  )}
                </span>
              </label>
            )}

            <div>
              <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
                {tipoAccionServicio === 'registrar' ? 'Trabajo o mantenimiento realizado *' : 'Trabajo o falla a reparar *'}
              </label>
              <textarea
                className="input"
                rows={3}
                style={{ fontSize: '.92rem' }}
                value={descripcionServicio}
                onChange={(e) => setDescripcionServicio(e.target.value)}
                placeholder={
                  tipoAccionServicio === 'registrar'
                    ? 'Detalla el servicio o mantenimiento que se le realizó al equipo…'
                    : 'Describe qué trabajo necesita la máquina o qué repuesto hace falta…'
                }
              />
            </div>

            {/* Repuestos de la ficha para añadir con un toque */}
            {repuestosEquipo.length > 0 && (
              <div>
                <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.35rem' }}>
                  🔩 Agregar repuestos de la ficha ({repuestosEquipo.length})
                </label>
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', maxHeight: '110px', overflowY: 'auto' }}>
                  {repuestosEquipo.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: '.82rem', padding: '.25rem .55rem' }}
                      onClick={() => {
                        const etiqueta = r.numero_parte && tipoAccionServicio === 'registrar' ? `${r.tipo} (${r.numero_parte})` : r.tipo;
                        const ya = piezasSeleccionadas.some((p) => p.nombre === etiqueta);
                        if (!ya) {
                          setPiezasSeleccionadas((prev) => [...prev, { nombre: etiqueta, cantidad: r.cantidad || 1, unidad: r.unidad || 'und' }]);
                        }
                      }}
                    >
                      + {r.tipo}{r.numero_parte && tipoAccionServicio === 'registrar' ? ` · ${r.numero_parte}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Agregar repuestos / piezas (para Compras o cambiadas/utilizadas en el servicio) */}
            <div style={{ padding: '.85rem', background: 'var(--bg-1)', borderRadius: 'var(--r-md)', border: '1px dashed var(--border-strong)' }}>
              <label style={{ fontSize: '.92rem', fontWeight: 700, display: 'block', marginBottom: '.5rem', color: 'var(--text)' }}>
                {tipoAccionServicio === 'registrar'
                  ? '⚙️ Repuestos o piezas que cambiaron / utilizaron:'
                  : '🛒 Pedir pieza o repuesto a Compras (nombre general):'}
              </label>

              {/* Fila 1: Campo de texto con ancho completo para el nombre o descripción */}
              <div style={{ marginBottom: '.55rem' }}>
                <input
                  type="text"
                  className="input"
                  style={{ fontSize: '.92rem', padding: '.6rem .75rem', width: '100%', boxSizing: 'border-box' }}
                  placeholder={
                    tipoAccionServicio === 'registrar'
                      ? 'Ej. Filtro de aceite 1R-0716, Aceite 15W40, Pastillas…'
                      : 'Ej. Filtro de aceite, Manguera 1/2, Correa…'
                  }
                  value={nombrePiezaLibre}
                  onChange={(e) => setNombrePiezaLibre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      agregarPiezaLibre();
                    }
                  }}
                />
              </div>

              {/* Fila 2: Cantidad, unidad y botón Agregar espacioso y táctil */}
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flex: '0 0 auto' }}>
                  <span style={{ fontSize: '.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Cant:</span>
                  <input
                    type="number"
                    className="input mono"
                    style={{ fontSize: '.92rem', padding: '.5rem .4rem', width: '65px', textAlign: 'center', boxSizing: 'border-box' }}
                    placeholder="1"
                    value={cantPiezaLibre}
                    onChange={(e) => setCantPiezaLibre(e.target.value)}
                  />
                </div>
                <div style={{ flex: '0 0 auto' }}>
                  <select
                    className="select"
                    style={{ fontSize: '.88rem', padding: '.5rem .5rem', minWidth: '78px' }}
                    value={unidadPiezaLibre}
                    onChange={(e) => setUnidadPiezaLibre(e.target.value)}
                  >
                    <option value="und">und</option>
                    <option value="lts">lts</option>
                    <option value="jgo">jgo</option>
                    <option value="mts">mts</option>
                    <option value="cuñ">cuñ</option>
                    <option value="gal">gal</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    fontSize: '.9rem',
                    fontWeight: 700,
                    padding: '.55rem .75rem',
                    minHeight: '42px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '.35rem',
                  }}
                  onClick={agregarPiezaLibre}
                >
                  + Agregar
                </button>
              </div>

              <small className="muted" style={{ fontSize: '.78rem', display: 'block', marginTop: '.5rem', lineHeight: 1.35 }}>
                {tipoAccionServicio === 'registrar'
                  ? '💡 Anota cada repuesto, filtro o consumible que cambiaron o usaron para que quede detallado en la bitácora.'
                  : '💡 Escribe nombres generales. Compras recibirá la solicitud directa para cotizar y asignar el N° de parte oficial.'}
              </small>
            </div>

            {/* Piezas agregadas */}
            {piezasSeleccionadas.length > 0 && (
              <div style={{ padding: '.65rem', background: 'var(--bg-1)', borderRadius: 'var(--r-md)' }}>
                <small style={{ fontWeight: 700, fontSize: '.88rem', display: 'block', marginBottom: '.35rem', color: tipoAccionServicio === 'registrar' ? 'var(--info)' : 'var(--warning)' }}>
                  {tipoAccionServicio === 'registrar'
                    ? `Repuestos / piezas cambiadas o utilizadas (${piezasSeleccionadas.length}):`
                    : `Piezas que se enviarán a Compras (${piezasSeleccionadas.length}):`}
                </small>
                {piezasSeleccionadas.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.86rem', marginBottom: '.3rem' }}>
                    <span>• {p.nombre} ({fmtNum(p.cantidad)} {p.unidad})</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ padding: '0 .4rem', color: 'var(--danger)' }}
                      onClick={() => setPiezasSeleccionadas((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Fotos de soporte para la Bitácora */}
            <div style={{ padding: '.85rem', background: 'var(--bg-1)', borderRadius: 'var(--r-md)', border: '1px dashed var(--border-strong)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.45rem' }}>
                <label style={{ fontSize: '.92rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  📷 {tipoAccionServicio === 'registrar' ? 'Fotos de soporte para la bitácora' : 'Fotos de soporte (opcional)'}
                </label>
                <span className="badge" style={{ fontSize: '.75rem' }}>
                  {fotosServicio.length} / {tipoAccionServicio === 'registrar' ? MAX_FOTOS_MANTENIMIENTO : 4}
                </span>
              </div>

              <label
                className="btn btn-ghost"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  justifyContent: 'center',
                  gap: '.45rem',
                  fontSize: '.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              >
                <span>📸</span>
                <span>Tomar o seleccionar fotos de soporte</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    agregarFotosServicio(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>

              {fotosServicio.length > 0 && (
                <div className="flo-mv-fotos-grid">
                  {fotosServicio.map((f, idx) => (
                    <div
                      key={`${f.name}-${idx}`}
                      style={{
                        position: 'relative',
                        aspectRatio: '1 / 1',
                        borderRadius: 'var(--r-sm)',
                        overflow: 'hidden',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-2)',
                      }}
                    >
                      <img
                        src={previasFotosServicio[idx]}
                        alt={f.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <button
                        type="button"
                        title="Quitar foto"
                        onClick={() => setFotosServicio((prev) => prev.filter((_, i) => i !== idx))}
                        style={{
                          position: 'absolute',
                          top: 3,
                          right: 3,
                          width: 22,
                          height: 22,
                          borderRadius: '999px',
                          border: 'none',
                          background: 'rgba(0,0,0,0.72)',
                          color: '#fff',
                          fontSize: '.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <small className="muted" style={{ fontSize: '.77rem', display: 'block', marginTop: '.45rem', lineHeight: 1.35 }}>
                {tipoAccionServicio === 'registrar'
                  ? 'Adjunta fotos de los repuestos cambiados, filtros o del mantenimiento realizado como respaldo en la Bitácora.'
                  : 'Opcional: adjunta fotos de la falla o de la pieza requerida.'}
              </small>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '.85rem', fontWeight: 700, fontSize: '.98rem', whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25 }}
              disabled={saving}
              onClick={() => void (tipoAccionServicio === 'registrar' ? guardarServicioBitacora() : guardarServicio())}
            >
              {saving
                ? (tipoAccionServicio === 'registrar' ? 'Guardando en Bitácora…' : 'Enviando a Compras…')
                : (tipoAccionServicio === 'registrar' ? '📒 Guardar en Bitácora' : '🛒 Guardar y Enviar a Compras')}
            </button>
          </div>
        </div>
      )}

      {/* ── Formulario: Registrar Lavado ── */}
      {modo === 'lavado' && (
        <div className="card" style={{ padding: '1.1rem', marginBottom: '1rem', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.85rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>🚿 Registrar Lavado de Equipo</h3>
            <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: '.84rem' }} onClick={() => setModo('menu')}>✕ Volver</button>
          </div>

          <div style={{ display: 'grid', gap: '.85rem' }}>
            <div>
              <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Máquina / Vehículo *</label>
              <SearchSelect
                value={equipoSelId}
                onChange={setEquipoSelId}
                options={opcionesEquipos}
                placeholder="Busca la máquina que se lavó…"
              />
            </div>

            <div>
              <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.35rem' }}>Tipo de lavado</label>
              <div className="flo-mv-grid2">
                {TIPOS_LAVADO.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`btn ${tipoLavado === t ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: '.9rem', minHeight: '44px', fontWeight: 600 }}
                    onClick={() => setTipoLavado(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Lavador / Responsable</label>
              <input
                className="input"
                style={{ fontSize: '.92rem' }}
                value={lavador}
                onChange={(e) => setLavador(e.target.value)}
                placeholder="Nombre de quien realizó el lavado…"
              />
            </div>

            <div>
              <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Observaciones (opcional)</label>
              <input
                className="input"
                style={{ fontSize: '.92rem' }}
                value={notasLavado}
                onChange={(e) => setNotasLavado(e.target.value)}
                placeholder="Ej. Lavado con desengrasante, chasis limpio"
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '.85rem', fontWeight: 700, fontSize: '1rem' }}
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
        <div className="card" style={{ padding: '1.1rem', marginBottom: '1rem', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.85rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>⚠️ Reportar Avería / Parada</h3>
            <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: '.84rem' }} onClick={() => setModo('menu')}>✕ Volver</button>
          </div>

          <div style={{ display: 'grid', gap: '.85rem' }}>
            <div>
              <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Máquina / Vehículo *</label>
              <SearchSelect
                value={equipoSelId}
                onChange={setEquipoSelId}
                options={opcionesEquipos}
                placeholder="Busca la máquina con la avería…"
              />
            </div>

            <div>
              <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.35rem' }}>Nuevo estado del equipo</label>
              <div className="flo-mv-grid2">
                <button
                  type="button"
                  className={`btn ${estadoAveria === 'averiada' ? 'btn-danger' : 'btn-ghost'}`}
                  style={{ minHeight: '44px', fontSize: '.88rem', fontWeight: 600 }}
                  onClick={() => setEstadoAveria('averiada')}
                >
                  🚨 AVERIADA
                </button>
                <button
                  type="button"
                  className={`btn ${estadoAveria === 'parada' ? 'btn-danger' : 'btn-ghost'}`}
                  style={{ minHeight: '44px', fontSize: '.88rem', fontWeight: 600 }}
                  onClick={() => setEstadoAveria('parada')}
                >
                  🛑 PARADA
                </button>
                <button
                  type="button"
                  className={`btn ${estadoAveria === 'taller' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ minHeight: '44px', fontSize: '.88rem', fontWeight: 600 }}
                  onClick={() => setEstadoAveria('taller')}
                >
                  🛠️ EN TALLER
                </button>
                <button
                  type="button"
                  className={`btn ${estadoAveria === 'espera' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ minHeight: '44px', fontSize: '.88rem', fontWeight: 600 }}
                  onClick={() => setEstadoAveria('espera')}
                >
                  ⏳ ESPERANDO REP.
                </button>
                <button
                  type="button"
                  className={`btn ${estadoAveria === 'operativa' ? 'btn-success' : 'btn-ghost'}`}
                  style={{ gridColumn: '1 / -1', minHeight: '44px', fontSize: '.92rem', fontWeight: 700 }}
                  onClick={() => setEstadoAveria('operativa')}
                >
                  ✅ OPERATIVA
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Motivo / Falla detectada *</label>
              <textarea
                className="input"
                rows={3}
                style={{ fontSize: '.92rem' }}
                value={motivoAveria}
                onChange={(e) => setMotivoAveria(e.target.value)}
                placeholder="Explica qué daño tiene o por qué se paró el equipo…"
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '.85rem', fontWeight: 700, fontSize: '1rem' }}
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
        <div className="card" style={{ padding: '1.1rem', marginBottom: '1rem', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.85rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>🔍 Filtros y Marcas de la Máquina</h3>
            <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: '.84rem' }} onClick={() => setModo('menu')}>✕ Volver</button>
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
              <div style={{ padding: '.65rem .75rem', background: 'var(--bg-1)', borderRadius: 'var(--r-md)', fontSize: '.86rem', marginBottom: '.75rem' }}>
                <div><strong>{equipoActual.equipo}</strong> · {[equipoActual.marca, equipoActual.modelo].filter(Boolean).join(' ')}</div>
                {extraerEncargado(equipoActual) && <div className="muted" style={{ fontSize: '.8rem' }}>👤 Encargado: {extraerEncargado(equipoActual)}</div>}
                {(equipoActual.motor_modelo || equipoActual.motor_serial) && (
                  <div className="muted" style={{ fontSize: '.8rem' }}>⚙️ Motor: {[equipoActual.motor_modelo, equipoActual.motor_serial].filter(Boolean).join(' · ')}</div>
                )}
              </div>

              {repuestosEquipo.length === 0 ? (
                <div className="muted" style={{ fontSize: '.84rem' }}>Sin ficha de repuestos cargada aún.</div>
              ) : (
                <div style={{ display: 'grid', gap: '.45rem', marginBottom: '.75rem' }}>
                  {repuestosEquipo.map((r) => {
                    const sis = sistemaDe(r.sistema);
                    return (
                      <div key={r.id} style={{ padding: '.6rem .75rem', background: 'var(--bg-1)', borderRadius: 'var(--r-md)', fontSize: '.86rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <strong>{sis.icon} {r.tipo}</strong>
                          <span className="muted">{fmtNum(r.cantidad)} {r.unidad}</span>
                        </div>
                        {r.numero_parte && <div className="mono" style={{ color: 'var(--primary-2)', marginTop: '.15rem', fontSize: '.84rem' }}>OEM: {r.numero_parte}</div>}
                        {r.equivalencias && r.equivalencias.length > 0 && (
                          <div style={{ color: 'var(--info)', marginTop: '.15rem', fontSize: '.82rem' }}>Marcas: {r.equivalencias.join(' · ')}</div>
                        )}
                        {r.especificacion && <div className="muted" style={{ fontSize: '.78rem' }}>Esp: {r.especificacion}</div>}
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

      {/* ── Catálogo de Máquinas y Horas de Mantenimiento (solo se muestra al tocar «Ver Catálogo») ── */}
      {verCatalogo && (
        <>
          <EntregasAlmacenAviso canWrite={canWrite} actorName={actorName} />
          <AlertasMantenimientoBanner compacto items={alertasMant} actor={actor} actorName={actorName} canWrite={canWrite} onChanged={() => void cargarDatos()} />

          <div className="flo-mv-cat">
            <div className="flo-mv-cat-head">
              <div>
                <strong>🚜 Catálogo de Equipos y Horas</strong>
                <span className="badge">{equiposCatalogo.length} de {equipos.length}</span>
              </div>
              <div className="flo-mv-cat-acc">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  title="Descargar Catálogo y Fichas Técnicas en PDF"
                  onClick={() => setExportarPdfMovilOpen(true)}
                >
                  📄 PDF
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setNuevoEquipoMovilOpen(true)}
                >
                  {filtroCatalogo === 'motos' ? '+ Nueva moto' : filtroCatalogo === 'lanchas' ? '+ Nueva lancha' : filtroCatalogo === 'vehiculos' ? '+ Nuevo vehículo' : filtroCatalogo === 'pesada' ? '+ Nueva maquinaria' : '+ Nuevo equipo'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setVerCatalogo(false)}
                >
                  ✕ Ocultar
                </button>
              </div>
            </div>

            {/* Buscador táctil */}
            <input
              className="input"
              placeholder="🔍 Buscar máquina, modelo, placa, encargado…"
              value={busquedaCatalogo}
              onChange={(e) => setBusquedaCatalogo(e.target.value)}
            />

            {/* Filtros rápidos por categoría: chips deslizables (sin scroll horizontal de la página) */}
            <div className="flo-pills solido" role="tablist" aria-label="Filtrar catálogo por categoría">
              <button type="button" className="flo-pill" aria-pressed={filtroCatalogo === 'todos'} onClick={() => setFiltroCatalogo('todos')}>
                Todos<span className="n">{conteosCatalogo.total}</span>
              </button>
              <button type="button" className="flo-pill" aria-pressed={filtroCatalogo === 'lanchas'} onClick={() => setFiltroCatalogo('lanchas')}>
                🚤 Lanchas<span className="n">{conteosCatalogo.lanchas}</span>
              </button>
              <button type="button" className="flo-pill" aria-pressed={filtroCatalogo === 'pesada'} onClick={() => setFiltroCatalogo('pesada')}>
                🚜 Maquinaria<span className="n">{conteosCatalogo.pesada}</span>
              </button>
              <button type="button" className="flo-pill" aria-pressed={filtroCatalogo === 'vehiculos'} onClick={() => setFiltroCatalogo('vehiculos')}>
                🚚 Vehículos<span className="n">{conteosCatalogo.vehiculos}</span>
              </button>
              <button type="button" className="flo-pill" aria-pressed={filtroCatalogo === 'motos'} onClick={() => setFiltroCatalogo('motos')}>
                🏍️ Motos<span className="n">{conteosCatalogo.motos}</span>
              </button>
              <button type="button" className="flo-pill" aria-pressed={filtroCatalogo === 'herramientas'} onClick={() => setFiltroCatalogo('herramientas')}>
                🛠️ Herramientas<span className="n">{conteosCatalogo.herramientas}</span>
              </button>
              <button type="button" className="flo-pill" aria-pressed={filtroCatalogo === 'alertas'} onClick={() => setFiltroCatalogo('alertas')}>
                ⚠️ Próx. / Vencidos<span className="n">{conteosCatalogo.alertas}</span>
              </button>
            </div>

            {/* Lista / Tarjetas de equipos tipo catálogo */}
            <div className="flo-mv-lista">
              {equiposCatalogo.map((eq) => {
                const inf = infoEquipos.get(eq.id);
                const av = inf?.aviso;
                const horo = inf?.horometro;
                const km = inf?.kilometraje;
                const enc = inf?.encargado;
                const foto = fotos.get(eq.id);
                const operativa = !inf?.estado || inf.estado === 'operativa';

                return (
                  <div
                    key={eq.id}
                    role="button"
                    tabIndex={0}
                    className={`flo-mv-card${av?.nivel === 'vencido' ? ' vencido' : av?.nivel === 'proximo' ? ' proximo' : ''}`}
                    onClick={() => abrirOpcionesEquipo(eq)}
                    onKeyDown={(e) => { if (e.key === 'Enter') abrirOpcionesEquipo(eq); }}
                  >
                    <div className="flo-mv-card-top">
                      {/* Foto miniatura o icono de clase */}
                      <div className="flo-mv-thumb">
                        <div className="flo-thumb">
                          {foto ? (
                            <img src={foto} alt={eq.equipo} />
                          ) : (
                            iconoDeClase(claseEquipo(eq))
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost flo-mv-foto-btn"
                          title="Cambiar foto del equipo"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSubirFotoEq(eq);
                          }}
                        >
                          📷
                        </button>
                      </div>

                      {/* Datos del equipo */}
                      <div className="flo-mv-datos">
                        <div className="flo-mv-nombre">
                          <strong>{eq.equipo}</strong>
                          <span className={`badge ${operativa ? 'success' : 'danger'}`}>
                            {inf?.estado?.toUpperCase() || 'OPERATIVA'}
                          </span>
                        </div>

                        <div className="flo-mv-sub muted">
                          <span>{[eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' · ') || 'Sin tipo'}</span>
                          {eq.placa && <span className="flo-mv-placa mono">{eq.placa}</span>}
                        </div>

                        {enc && (
                          <div className="flo-mv-enc">
                            👤 Encargado: <strong>{enc}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lectura vigente + estado del servicio en una sola fila */}
                    <div className="flo-mv-lectura">
                      <span>
                        <span className="muted">{horo == null && km != null ? 'Kilometraje: ' : 'Horómetro: '}</span>
                        <span className="mono">{horo != null ? `${fmtNum(horo)} h` : km != null ? `${fmtNum(km)} km` : '—'}</span>
                      </span>
                      <BadgeServicio av={av} />
                    </div>

                    <div className="flo-mv-card-acc">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          const txt = textoEstadoEquipoWhatsapp({
                            equipo: eq.equipo,
                            tipo: eq.tipo,
                            marca: eq.marca,
                            modelo: eq.modelo,
                            estado: inf?.estado || 'operativa',
                            encargado: enc,
                            horometro: horo,
                            kilometraje: km,
                            horasFaltantes: av?.restante ?? null,
                            nivelAviso: av?.nivel ?? null,
                            unidadAviso: av?.unidad ?? 'h',
                          });
                          mostrarWhatsapp(txt);
                        }}
                      >
                        📲 WhatsApp
                      </button>
                      <span className="ayuda">Toque para ver opciones ▸</span>
                    </div>
                  </div>
                );
              })}

              {!equiposCatalogo.length && (
                <div className="muted" style={{ padding: '1rem', textAlign: 'center', fontSize: '.84rem' }}>
                  No se encontraron equipos con ese filtro o búsqueda.
                </div>
              )}
            </div>
          </div>
        </>
      )}

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
            const horo = inf?.horometro ?? null;
            const km = inf?.kilometraje ?? null;
            const enc = inf?.encargado;

            return (
              <div style={{ display: 'grid', gap: '.75rem' }}>
                {/* Resumen del equipo (mismo patrón que la tarjeta del catálogo) */}
                <div className="flo-mv-resumen">
                  <div className="flo-mv-card-top">
                    <div className="flo-thumb">
                      {fotos.has(equipoOpciones.id) ? (
                        <img src={fotos.get(equipoOpciones.id)} alt={equipoOpciones.equipo} />
                      ) : (
                        iconoDeClase(claseEquipo(equipoOpciones))
                      )}
                    </div>
                    <div className="flo-mv-datos">
                      <div className="flo-mv-sub muted">
                        <span>{[equipoOpciones.tipo, equipoOpciones.marca, equipoOpciones.modelo].filter(Boolean).join(' · ') || 'Sin tipo'}</span>
                        {equipoOpciones.placa && <span className="flo-mv-placa mono">{equipoOpciones.placa}</span>}
                      </div>
                      {enc && <div className="flo-mv-enc">👤 Encargado: <strong>{enc}</strong></div>}
                    </div>
                  </div>

                  <div className="flo-mv-lectura">
                    <span>
                      <span className="muted">{horo == null && km != null ? '⏱️ Kilometraje: ' : '⏱️ Horómetro: '}</span>
                      <span className="mono">{horo != null ? `${fmtNum(horo)} h` : km != null ? `${fmtNum(km)} km` : '—'}</span>
                    </span>
                    <BadgeServicio av={av} />
                  </div>
                </div>

                <div className="muted" style={{ fontSize: '.82rem', fontWeight: 600, marginTop: '.2rem' }}>
                  ¿Qué deseas registrar para esta máquina?
                </div>

                {/* Botones de acción directa */}
                <button
                  type="button"
                  className="btn btn-primary flo-mv-opcion"
                  onClick={() => {
                    setEquipoSelId(equipoOpciones.id);
                    setTipoAccionServicio('solicitar');
                    setModo('servicio');
                    setEquipoOpciones(null);
                  }}
                >
                  <span>🔧</span>
                  <span>Solicitar Servicio (Enviar a Compras)</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost flo-mv-opcion ficha"
                  onClick={() => {
                    setEquipoSelId(equipoOpciones.id);
                    setTipoAccionServicio('registrar');
                    setModo('servicio');
                    setEquipoOpciones(null);
                  }}
                >
                  <span>📒</span>
                  <span>Registrar Servicio / Mant. (Solo Bitácora)</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost flo-mv-opcion"
                  onClick={() => {
                    const eq = equipoOpciones;
                    setEquipoOpciones(null);
                    setEquipoBitacoraMovil(eq);
                  }}
                >
                  <span>📖</span>
                  <span>Ver Bitácora Completa del Equipo</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost flo-mv-opcion"
                  onClick={() => {
                    setSubirFotoEq(equipoOpciones);
                    setEquipoOpciones(null);
                  }}
                >
                  <span>📷</span>
                  <span>{fotos.has(equipoOpciones.id) ? 'Ver / Actualizar Foto del Equipo' : 'Subir Foto de la Máquina'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost flo-mv-opcion"
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
                  className="btn btn-ghost flo-mv-opcion"
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
                  className="btn btn-ghost flo-mv-opcion"
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
                  className="btn btn-ghost flo-mv-opcion ficha"
                  onClick={async () => {
                    try {
                      const fts = await fotosDeEquipos(equipoOpciones.id).catch(() => []);
                      const { fichaEquipoPdf } = await import('./flotaPdf');
                      await fichaEquipoPdf(
                        equipoOpciones,
                        {
                          horometro: horo ?? null,
                          km: km ?? null,
                          restantesHrs: (av?.unidad === 'h' && av.restante != null) ? av.restante : null,
                          restantesKm: (av?.unidad === 'km' && av.restante != null) ? av.restante : null,
                          ultimoSurtido: null,
                        },
                        ordenes.filter((o) => o.equipo_id === equipoOpciones.id),
                        fts,
                        lavados.filter((l) => l.equipo_id === equipoOpciones.id)
                      );
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Error al generar ficha técnica', 'error');
                    }
                  }}
                >
                  <span>📄</span>
                  <span>Descargar Ficha Técnica Oficial (PDF)</span>
                </button>

                <button
                  type="button"
                  className="btn btn-success flo-mv-opcion"
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
                    mostrarWhatsapp(txt);
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

      {/* Confirmación para borrar movimiento */}
      {borrandoMov && (
        <ConfirmDialog
          title="Eliminar registro"
          message={`¿Estás seguro de eliminar el registro «${borrandoMov.codigo}»? Esta acción no se puede deshacer.`}
          confirmText="Sí, eliminar"
          danger
          onConfirm={async () => {
            try {
              if (borrandoMov.tipo === 'orden') {
                await eliminarOrdenServicio({ id: borrandoMov.id, codigo: borrandoMov.codigo });
              } else {
                await eliminarMantenimiento(borrandoMov.id);
              }
              toast('Registro eliminado correctamente', 'success');
              setBorrandoMov(null);
              await cargarDatos();
            } catch (err) {
              toast(err instanceof Error ? err.message : 'No se pudo eliminar el registro', 'error');
            }
          }}
          onCancel={() => setBorrandoMov(null)}
        />
      )}

      {/* Modal de Bitácora del Equipo desde Móvil */}
      {equipoBitacoraMovil && (
        <BitacoraModal
          equipo={equipoBitacoraMovil}
          canWrite={canWrite}
          actor={actor}
          actorName={actorName}
          onClose={() => {
            setEquipoBitacoraMovil(null);
            void cargarDatos();
          }}
        />
      )}

      {/* Modal para Subir / Actualizar Foto del Equipo desde Móvil */}
      {subirFotoEq && (
        <SubirFotoEquipoModal
          equipoId={subirFotoEq.id}
          equipoNombre={subirFotoEq.equipo}
          fotos={fotos.has(subirFotoEq.id) ? 1 : 0}
          actor={actor}
          actorName={actorName}
          onClose={() => setSubirFotoEq(null)}
          onSubida={cargarDatos}
          onVerFotos={() => {}}
          onDocumentos={() => {}}
        />
      )}

      {/* Modal para Crear Nuevo Equipo / Moto / Lancha desde Móvil */}
      {nuevoEquipoMovilOpen && (
        <EquipoFormModal
          equipo={null}
          actor={actor}
          claseInicial={
            filtroCatalogo === 'lanchas' ? 'lancha' :
            filtroCatalogo === 'motos' ? 'moto' :
            filtroCatalogo === 'vehiculos' ? 'vehiculo' :
            filtroCatalogo === 'pesada' ? 'maquinaria' : null
          }
          tipoInicial={
            filtroCatalogo === 'lanchas' ? 'LANCHA' :
            filtroCatalogo === 'motos' ? 'MOTO' :
            filtroCatalogo === 'vehiculos' ? 'VEHÍCULO' :
            filtroCatalogo === 'pesada' ? 'MAQUINARIA PESADA' : null
          }
          onClose={() => setNuevoEquipoMovilOpen(false)}
          onSaved={cargarDatos}
        />
      )}

      {/* Modal para Exportar Catálogo y Fichas Técnicas en PDF desde Móvil */}
      {exportarPdfMovilOpen && (
        <ExportarEquiposModal
          equipos={equiposCatalogo}
          total={equipos.length}
          fotosMap={fotos}
          contextoMap={new Map(
            equiposCatalogo.map((e) => {
              const inf = infoEquipos.get(e.id);
              return [
                e.id,
                {
                  horometro: inf?.horometro ?? null,
                  kilometraje: inf?.kilometraje ?? null,
                  encargado: inf?.encargado ?? null,
                  avisoServicio: inf?.aviso
                    ? `${inf.aviso.nivel === 'vencido' ? '⛔ Vencido' : inf.aviso.nivel === 'proximo' ? '⚠️ Próximo' : '🟢 Al día'} (${fmtNum(Math.abs(inf.aviso.restante))} ${inf.aviso.unidad})`
                    : null,
                },
              ];
            })
          )}
          onClose={() => setExportarPdfMovilOpen(false)}
        />
      )}
    </div>
  );
}
export default MaquinariaMovilView;
