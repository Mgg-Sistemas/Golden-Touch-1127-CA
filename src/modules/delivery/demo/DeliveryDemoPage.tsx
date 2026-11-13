/* ============================================================
   TEMPORAL · Vista Previa Interactiva del Rediseño de Delivery
   Ruta: #/demo/delivery
   Validación de diseño móvil de calle y reglas operativas:
     1. Modo calle / alto contraste (legible bajo sol intenso).
     2. Botones táctiles grandes (aptos para guantes en moto y carga pesada).
     3. 4 Pantallas Protagonistas (Cero solapamientos):
        - 1: Pedidos / En Curso / Retorno a Sede.
        - 2: Mi GPS / Mapa (Google Maps exclusivo, conmutación automática al tomar).
        - 3: Analista (contacto interno directo de la orden sin intermediarios externos).
        - 4: Fotos / Evidencia (LOS 2 MOMENTOS OBLIGATORIOS).
     4. REGLA 1 (Fotos obligatorias):
        - Mínimo 1 foto al recibir para iniciar retorno a sede.
        - Mínimo 1 foto al entregar para confirmar y cerrar entrega.
     5. REGLA 2 (Re-toma de cancelados):
        - Si cancela/libera por avería o error, puede retomarlo en la lista.
     6. REGLA 3 (Navegación fluida a la lista):
        - Puede explorar pedidos disponibles sin cancelar su carrera activa.
     7. REGLA 4 (Dirección automática al mapa):
        - Al tomar una orden, el sistema le dirige al mapa automáticamente con su GPS y destino.
   ============================================================ */
import { useState } from 'react';
import '@/modules/delivery/deliveryMovil.css';

interface PedidoMock {
  id: string;
  codigo: string;
  tipo: 'compra' | 'retiro';
  urgente: boolean;
  origen: string;
  destino: string;
  items: string;
  analistaNombre: string;
  analistaTelefono: string;
  solicitanteNombre?: string;
  solicitanteTelefono?: string;
  distanciaM: number;
}

interface FotoEvidenciaMock {
  id: string;
  label: string;
  hora: string;
  icono: string;
}

const PEDIDOS_DISPONIBLES: PedidoMock[] = [
  {
    id: 'p1',
    codigo: 'RET-0892',
    tipo: 'retiro',
    urgente: true,
    origen: 'Almacén Los Pinos',
    destino: 'Mina Central (Unidad Molino)',
    items: '3 filtros de aceite CAT, 2 fajas 4L',
    analistaNombre: 'Carlos Méndez (Almacenista Los Pinos)',
    analistaTelefono: '+58 414 123 4567',
    solicitanteNombre: 'Ing. José Rivas (Jefe de Mina)',
    solicitanteTelefono: '+58 424 987 6543',
    distanciaM: 450,
  },
  {
    id: 'p2',
    codigo: 'OC-1044',
    tipo: 'compra',
    urgente: false,
    origen: 'Ferretería Industrial El Tornillo C.A.',
    destino: 'Almacén Los Pinos (Recepción)',
    items: '50 electrodos 7018, 1 disco de corte 9"',
    analistaNombre: 'Mariana López (Analista de Compras)',
    analistaTelefono: '+58 412 555 7890',
    distanciaM: 1200,
  },
  {
    id: 'p3',
    codigo: 'OC-1051',
    tipo: 'compra',
    urgente: false,
    origen: 'Repuestos Diesel Guayana',
    destino: 'Almacén Los Pinos (Recepción)',
    items: '1 alternador 24V Mack, 4 terminales',
    analistaNombre: 'Mariana López (Analista de Compras)',
    analistaTelefono: '+58 412 555 7890',
    distanciaM: 2800,
  },
];

type PantallaActiva = 'principal' | 'mapa' | 'analista' | 'fotos';
type FaseViaje = 'hacia_recogida' | 'retorno_sede';

export function DeliveryDemoPage() {
  const [flota, setFlota] = useState<'motorizado' | 'carga_pesada'>('motorizado');
  const [carreraActiva, setCarreraActiva] = useState<PedidoMock | null>(null);
  const [faseViaje, setFaseViaje] = useState<FaseViaje>('hacia_recogida');
  const [subVistaPrincipal, setSubVistaPrincipal] = useState<'viaje' | 'lista'>('viaje');
  const [chip, setChip] = useState<'por_tomar' | 'en_ruta' | 'entregados'>('por_tomar');
  const [pantallaActiva, setPantallaActiva] = useState<PantallaActiva>('principal');
  const [modalConfirmarEntrega, setModalConfirmarEntrega] = useState(false);
  const [modalComprobante, setModalComprobante] = useState(false);
  const [entregadosCount, setEntregadosCount] = useState(4);
  const [mensajeToast, setMensajeToast] = useState<string | null>(null);

  // Registro de pedidos liberados por error/avería para permitir retomarlos
  const [pedidosLiberados, setPedidosLiberados] = useState<Set<string>>(new Set());

  // Evidencias fotográficas en los DOS momentos clave
  const [fotosRecibo, setFotosRecibo] = useState<FotoEvidenciaMock[]>([]);
  const [fotosEntrega, setFotosEntrega] = useState<FotoEvidenciaMock[]>([]);
  const [mostrarDetalleM1, setMostrarDetalleM1] = useState(false);

  const notify = (msg: string) => {
    setMensajeToast(msg);
    setTimeout(() => setMensajeToast(null), 3800);
  };

  // Botón 1 en barra inferior
  const handleBoton1 = () => {
    if (pantallaActiva !== 'principal') {
      setPantallaActiva('principal');
      return;
    }
    if (carreraActiva) {
      if (faseViaje === 'hacia_recogida') {
        if (fotosRecibo.length === 0) {
          notify('📸 Foto obligatoria: toma al menos 1 foto al recibir para iniciar el traslado al destino.');
          setPantallaActiva('fotos');
        } else {
          setFaseViaje('retorno_sede');
          notify(`🚚 Carga a bordo: iniciando traslado hacia ${carreraActiva.destino}.`);
          setPantallaActiva('mapa');
        }
      } else {
        if (fotosEntrega.length === 0) {
          notify(`📸 Foto obligatoria: toma al menos 1 foto de entrega en ${carreraActiva.destino} para cerrar el pedido.`);
          setPantallaActiva('fotos');
        } else {
          setModalConfirmarEntrega(true);
        }
      }
    } else {
      setChip('por_tomar');
      const el = document.getElementById('lista-pedidos-demo');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      notify('📦 Mostrando pedidos disponibles: elige el de mayor prioridad.');
    }
  };

  // REGLA: Al tomar una orden, automáticamente dirigirle al mapa con su ubicación sincronizada y la del destino
  const handleAceptarPedido = (p: PedidoMock) => {
    setCarreraActiva(p);
    setFaseViaje('hacia_recogida');
    setSubVistaPrincipal('viaje');
    setChip('en_ruta');
    setFotosRecibo([]);
    setFotosEntrega([]);
    // Si estaba marcado como cancelado/liberado, se retira de liberados
    setPedidosLiberados((prev) => {
      const next = new Set(prev);
      next.delete(p.id);
      return next;
    });
    // REDIRECCIÓN AUTOMÁTICA AL MAPA
    setPantallaActiva('mapa');
    notify(`🧭 Aceptaste ${p.codigo}. Te dirigimos al mapa con ruta hacia: ${p.origen}`);
  };

  // Confirmar entrega formal
  const confirmarEntrega = () => {
    if (fotosEntrega.length === 0) {
      notify('⚠️ Foto obligatoria: Se requiere al menos 1 foto de entrega para cerrar.');
      return;
    }
    setModalConfirmarEntrega(false);
    setCarreraActiva(null);
    setEntregadosCount((c) => c + 1);
    setChip('entregados');
    setPantallaActiva('principal');
    notify('✅ Entrega confirmada con éxito. Almacén/Solicitante notificado.');
  };

  // Subir fotos
  const agregarFotoRecibo = () => {
    const n = fotosRecibo.length + 1;
    if (n > 5) {
      notify('⚠️ Límite de 5 fotos al recibir alcanzado.');
      return;
    }
    const nueva: FotoEvidenciaMock = {
      id: `fr-${Date.now()}`,
      label: n === 1 ? 'Remisión sellada proveedor' : `Carga cargada #${n}`,
      hora: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
      icono: '📄',
    };
    setFotosRecibo([...fotosRecibo, nueva]);
    notify(`📷 Foto ${n}/5 al recibir agregada.`);
  };

  const agregarFotoEntrega = () => {
    const n = fotosEntrega.length + 1;
    if (n > 5) {
      notify('⚠️ Límite de 5 fotos de entrega alcanzado.');
      return;
    }
    const nueva: FotoEvidenciaMock = {
      id: `fe-${Date.now()}`,
      label: n === 1 ? 'Recepción sellada Almacén Los Pinos' : `Descarga en almacén #${n}`,
      hora: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
      icono: '✅',
    };
    setFotosEntrega([...fotosEntrega, nueva]);
    notify(`📷 Foto ${n}/5 de entrega agregada.`);
  };

  const eliminarFoto = (tipo: 'recibo' | 'entrega', id: string) => {
    if (tipo === 'recibo') {
      setFotosRecibo(fotosRecibo.filter((f) => f.id !== id));
    } else {
      setFotosEntrega(fotosEntrega.filter((f) => f.id !== id));
    }
    notify('🗑️ Foto eliminada.');
  };

  // Liberar / Cancelar por avería o contingencia operativa
  const liberarPorAveria = () => {
    if (!carreraActiva) return;
    const id = carreraActiva.id;
    setPedidosLiberados((prev) => new Set(prev).add(id));
    setCarreraActiva(null);
    setChip('por_tomar');
    setSubVistaPrincipal('lista');
    notify('⛔ Carrera liberada por contingencia/avería. Sigue disponible en la lista si deseas retomarla.');
  };

  // Liberar / Soltar por error (sin reportar avería ni contingencia)
  const liberarPorError = () => {
    if (!carreraActiva) return;
    const id = carreraActiva.id;
    setPedidosLiberados((prev) => new Set(prev).add(id));
    setCarreraActiva(null);
    setChip('por_tomar');
    setSubVistaPrincipal('lista');
    notify('↩️ Pedido liberado: marcado como "Tomado por error / Desasignar" (sin avería). Disponible de nuevo.');
  };

  return (
    <div style={{ background: '#030712', minHeight: '100vh', color: '#f3f4f6', padding: '1rem .5rem 7.5rem' }}>
      {/* Controles de la maqueta interactiva (Simulador) */}
      <div style={{ maxWidth: 480, margin: '0 auto 1rem', padding: '.75rem', background: '#111827', borderRadius: 12, border: '1px solid #374151' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
          <strong style={{ fontSize: '.85rem', color: 'var(--primary, #f59e0b)' }}>🧪 Simulador Calle · Teléfono</strong>
          <span style={{ fontSize: '.75rem', color: '#9ca3af' }}>Golden Touch ERP</span>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: flota === 'motorizado' ? '#f59e0b' : '#1f2937', color: flota === 'motorizado' ? '#000' : '#fff' }}
            onClick={() => setFlota('motorizado')}
          >
            🏍️ Motorizado
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: flota === 'carga_pesada' ? '#f59e0b' : '#1f2937', color: flota === 'carga_pesada' ? '#000' : '#fff' }}
            onClick={() => setFlota('carga_pesada')}
          >
            🚛 Carga Pesada
          </button>
          {carreraActiva ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ color: '#ef4444' }}
              onClick={liberarPorAveria}
            >
              ✕ Simular liberación / avería
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ color: '#10b981' }}
              onClick={() => handleAceptarPedido(PEDIDOS_DISPONIBLES[0])}
            >
              + Simular aceptar pedido
            </button>
          )}
        </div>
      </div>

      {mensajeToast && (
        <div style={{
          position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)',
          background: '#1f2937', color: '#fff', border: '1px solid #f59e0b',
          padding: '.65rem 1.1rem', borderRadius: 10, zIndex: 99999, fontSize: '.85rem', boxShadow: '0 6px 20px rgba(0,0,0,0.8)',
          maxWidth: '92%', textAlign: 'center', fontWeight: 600,
        }}>
          {mensajeToast}
        </div>
      )}

      {/* Contenedor teléfono protagonista */}
      <div className="surtidor dlv-calle-view" style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
        {/* Cabecera común del repartidor */}
        <header className="surt-head dlv-head" style={{ marginBottom: '.85rem' }}>
          <div className="dlv-conductor">
            <div className="dlv-avatar" aria-hidden>{flota === 'carga_pesada' ? '🚛' : '🏍️'}</div>
            <div style={{ minWidth: 0 }}>
              <h1 className="dlv-nombre">Pedro Repartidor</h1>
              <div className="dlv-flota">{flota === 'carga_pesada' ? 'Chofer de Carga Pesada' : 'Motorizado Express'} · Flota Operativa</div>
            </div>
          </div>
          <div className="dlv-head-acciones">
            <span style={{ fontSize: '.72rem', background: '#064e3b', color: '#6ee7b7', padding: '.25rem .6rem', borderRadius: 999, fontWeight: 700 }}>
              📍 GPS Activo
            </span>
          </div>
        </header>

        {/* ═════════════════════════════════════════════════════════════
            PANTALLA 1: PEDIDOS / EN CURSO (PROTAGONISTA)
           ═════════════════════════════════════════════════════════════ */}
        {pantallaActiva === 'principal' && (
          <div className="dlv-protagonista-screen">
            {/* Si el chofer tiene carrera activa pero está explorando la lista: BANNER SUPERIOR PERMANENTE */}
            {carreraActiva && subVistaPrincipal === 'lista' && (
              <div style={{ background: '#111c2e', border: '2px solid #3b82f6', borderRadius: 14, padding: '.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.5)' }}>
                <div>
                  <div style={{ fontSize: '.7rem', color: '#60a5fa', fontWeight: 800, textTransform: 'uppercase' }}>
                    🛵 Carrera activa en curso
                  </div>
                  <div style={{ fontSize: '.92rem', fontWeight: 800, color: '#f8fafc' }}>
                    {carreraActiva.codigo} · {faseViaje === 'hacia_recogida' ? 'Hacia recogida' : 'Retornando a sede'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  style={{ fontWeight: 800 }}
                  onClick={() => setSubVistaPrincipal('viaje')}
                >
                  ← Ver Mi Viaje
                </button>
              </div>
            )}

            {/* VISTA 1A: TARJETA DE CARRERA ACTIVA (Enfoque en el viaje) */}
            {carreraActiva && subVistaPrincipal === 'viaje' && (
              <div className="dlv-card mio urgente" style={{ borderLeft: '4px solid #f59e0b' }}>
                <div className="dlv-card-cab">
                  <div>
                    <div className="dlv-oc">{carreraActiva.codigo}</div>
                    <div className="dlv-sub">{carreraActiva.tipo === 'retiro' ? 'Retiro en Almacén' : 'Compra Externa'}</div>
                  </div>
                  <span className={`badge ${faseViaje === 'retorno_sede' ? 'info' : 'warning'}`}>
                    {faseViaje === 'hacia_recogida' ? '🛵 1. Hacia Recogida' : '🚚 2. Retorno a Sede'}
                  </span>
                </div>

                <div className="dlv-prov">
                  <div className="nombre">📍 Origen: {carreraActiva.origen}</div>
                  <div className="dlv-sub">🏬 Destino: <strong>{carreraActiva.destino}</strong></div>
                  <div className="dlv-sub">📦 Carga: {carreraActiva.items}</div>
                </div>

                {/* Timeline interactivo del viaje */}
                <div className="dlv-avance" style={{ marginTop: '.65rem' }}>
                  <div className="dlv-pasos">
                    <span className="dlv-paso hecho">🏍️</span>
                    <span className={`dlv-tramo ${faseViaje === 'retorno_sede' ? 'hecho' : ''}`} />
                    <span className={`dlv-paso ${faseViaje === 'hacia_recogida' ? 'activo' : 'hecho'}`}>
                      {carreraActiva.tipo === 'retiro' ? '📦' : '🏭'}
                    </span>
                    <span className={`dlv-tramo ${faseViaje === 'retorno_sede' ? 'hecho' : ''}`} />
                    <span className={`dlv-paso ${faseViaje === 'retorno_sede' ? 'activo' : ''}`}>🏬</span>
                  </div>
                  <div className="dlv-avance-info">
                    <span>
                      📍 <strong>Próximo punto:</strong> {faseViaje === 'hacia_recogida' ? carreraActiva.origen : carreraActiva.destino}
                    </span>
                    <span>⏱️ ~8 min</span>
                  </div>
                </div>

                {/* BOTÓN PRINCIPAL DE FASE (Con validación estricta de fotos) */}
                <div style={{ marginTop: '.85rem' }}>
                  {faseViaje === 'hacia_recogida' ? (
                    fotosRecibo.length === 0 ? (
                      <button
                        type="button"
                        className="btn"
                        style={{ width: '100%', minHeight: 50, background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#fff', fontWeight: 800, fontSize: '.9rem' }}
                        onClick={() => {
                          notify(`📸 Se requiere al menos 1 foto al recibir para iniciar traslado a ${carreraActiva.destino}.`);
                          setPantallaActiva('fotos');
                        }}
                      >
                        📸 Subir Foto de Recibo (Obligatoria para avanzar)
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: '100%', minHeight: 50, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', fontWeight: 800, fontSize: '.95rem' }}
                        onClick={() => {
                          setFaseViaje('retorno_sede');
                          notify(`🚚 Carga a bordo: iniciando traslado hacia ${carreraActiva.destino}.`);
                          setPantallaActiva('mapa');
                        }}
                      >
                        🚚 Iniciar Traslado hacia {carreraActiva.destino} →
                      </button>
                    )
                  ) : (
                    fotosEntrega.length === 0 ? (
                      <button
                        type="button"
                        className="btn"
                        style={{ width: '100%', minHeight: 50, background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff', fontWeight: 800, fontSize: '.9rem' }}
                        onClick={() => {
                          notify(`📸 Se requiere al menos 1 foto de entrega en ${carreraActiva.destino} para cerrar el pedido.`);
                          setPantallaActiva('fotos');
                        }}
                      >
                        📸 Subir Foto de Entrega (Obligatoria para cerrar)
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn dlv-btn-entregar"
                        style={{ width: '100%', minHeight: 50, fontWeight: 800, fontSize: '.95rem' }}
                        onClick={() => setModalConfirmarEntrega(true)}
                      >
                        📦 Confirmar Entrega en {carreraActiva.destino}
                      </button>
                    )
                  )}
                </div>

                {/* Acciones de calle y navegación sin cancelar */}
                <div style={{ display: 'grid', gridTemplateColumns: carreraActiva.tipo === 'compra' ? '1fr 1fr' : '1fr', gap: '.45rem', marginTop: '.55rem' }}>
                  {carreraActiva.tipo === 'compra' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '.76rem', minHeight: 38, border: '1px solid #334155' }}
                      onClick={() => setModalComprobante(true)}
                    >
                      🧾 Comprobante
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '.76rem', minHeight: 38, border: '1px solid #334155' }}
                    onClick={() => {
                      notify('📋 Mensaje para WhatsApp del grupo copiado.');
                    }}
                  >
                    💬 WhatsApp
                  </button>
                </div>

                {/* NAVEGAR A LA LISTA SIN CANCELAR */}
                <div style={{ marginTop: '.65rem', borderTop: '1px solid #1e293b', paddingTop: '.65rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: '100%', color: '#38bdf8', fontSize: '.84rem', fontWeight: 700 }}
                    onClick={() => {
                      setSubVistaPrincipal('lista');
                      setChip('por_tomar');
                    }}
                  >
                    📋 Ver otros pedidos disponibles (Mantener viaje activo)
                  </button>
                </div>

                {/* OPCIONES DE LIBERACIÓN / CANCELACIÓN (DIFERENCIANDO ERROR VS AVERÍA) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginTop: '.45rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: '#94a3b8', fontSize: '.74rem', border: '1px solid #334155', minHeight: 38 }}
                    onClick={liberarPorError}
                    title="Soltar el pedido sin registrar avería ni penalización (tomado por error)"
                  >
                    ↩️ Soltar (Por error)
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: '#ef4444', fontSize: '.74rem', border: '1px solid rgba(239, 68, 68, 0.3)', minHeight: 38 }}
                    onClick={liberarPorAveria}
                    title="Reportar avería mecánica, accidente o proveedor cerrado"
                  >
                    ⚠️ Reportar Avería
                  </button>
                </div>
              </div>
            )}

            {/* VISTA 1B: LISTA DE PEDIDOS DISPONIBLES */}
            {(!carreraActiva || subVistaPrincipal === 'lista') && (
              <>
                {/* Filtros de pestañas */}
                <div className="dlv-chips" id="lista-pedidos-demo" role="tablist">
                  <button
                    type="button"
                    className={`chip ${chip === 'por_tomar' ? 'chip-active' : ''}`}
                    onClick={() => setChip('por_tomar')}
                  >
                    💰 Por tomar <span className="dlv-chip-n">{PEDIDOS_DISPONIBLES.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`chip ${chip === 'en_ruta' ? 'chip-active' : ''}`}
                    onClick={() => {
                      if (carreraActiva) {
                        setSubVistaPrincipal('viaje');
                      } else {
                        setChip('en_ruta');
                      }
                    }}
                  >
                    🚚 En curso <span className="dlv-chip-n">{carreraActiva ? 1 : 0}</span>
                  </button>
                  <button
                    type="button"
                    className={`chip ${chip === 'entregados' ? 'chip-active' : ''}`}
                    onClick={() => setChip('entregados')}
                  >
                    ✅ Entregados <span className="dlv-chip-n">{entregadosCount}</span>
                  </button>
                </div>

                {/* Listado según chip */}
                {chip === 'por_tomar' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                    <div style={{ fontSize: '.8rem', color: '#9ca3af', padding: '.15rem .25rem' }}>
                      ℹ️ Elige el pedido disponible para definir tu propia prioridad de recogida:
                    </div>
                    {PEDIDOS_DISPONIBLES.map((p) => {
                      const fueLiberado = pedidosLiberados.has(p.id);
                      return (
                        <article key={p.id} className={`dlv-card ${p.urgente ? 'urgente' : ''}`}>
                          <div className="dlv-card-cab">
                            <div>
                              <div className="dlv-oc">{p.codigo}</div>
                              <div className="dlv-sub">{p.tipo === 'retiro' ? '📦 Retiro en Almacén' : '🏭 Compra Externa'}</div>
                            </div>
                            <div className="dlv-badges">
                              {fueLiberado && (
                                <span className="badge warning" style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', border: '1px solid #f59e0b' }}>
                                  🔄 Retomable
                                </span>
                              )}
                              {p.urgente && <span className="badge danger">🚨 Urgente</span>}
                              <span className="badge info" title="Distancia desde tu teléfono hasta el punto de recogida">
                                📍 a {p.distanciaM} m (desde ti)
                              </span>
                            </div>
                          </div>

                          <div className="dlv-prov">
                            <div className="nombre">{p.origen}</div>
                            <div className="dlv-sub">🏬 Entregar a: <strong>{p.destino}</strong></div>
                            <div className="dlv-sub" style={{ marginTop: '.25rem' }}>📦 {p.items}</div>
                            <div className="dlv-sub" style={{ fontSize: '.76rem', color: '#38bdf8', marginTop: '.3rem' }}>
                              📍 Medido desde tu posición GPS actual
                            </div>
                            <div className="dlv-sub" style={{ fontSize: '.76rem', color: '#94a3b8' }}>
                              👤 Analista responsable: <strong style={{ color: '#f1f5f9' }}>{p.analistaNombre}</strong>
                            </div>
                          </div>

                          <div className="dlv-acciones" style={{ marginTop: '.75rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '.5rem' }}>
                            <button
                              type="button"
                              className="btn dlv-btn-aceptar"
                              onClick={() => handleAceptarPedido(p)}
                            >
                              {fueLiberado ? '✓ Retomar Pedido · Iniciar Ruta' : '✓ Aceptar · Iniciar Ruta'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ color: '#94a3b8', fontSize: '.75rem', border: '1px solid #334155' }}
                              onClick={() => notify(`✕ Marcado como No Disponible para este vehículo (${p.codigo}).`)}
                              title="No compatible con vehículo o ruta"
                            >
                              No disponible
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {chip === 'en_ruta' && !carreraActiva && (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#9ca3af', background: '#0b1320', borderRadius: 16, border: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>🛵</div>
                    <strong>No tienes carreras en curso</strong>
                    <p style={{ fontSize: '.84rem', margin: '.35rem 0 1rem' }}>Revisa la pestaña «Por tomar» para aceptar pedidos disponibles.</p>
                    <button type="button" className="btn btn-primary" onClick={() => setChip('por_tomar')}>
                      Ver Pedidos Disponibles
                    </button>
                  </div>
                )}

                {chip === 'entregados' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                    <div className="dlv-entregado">
                      <div>🏬 <strong>Recibido en:</strong> Almacén Los Pinos</div>
                      <div>✅ Hoy, 09:14 a. m. · OC-1038</div>
                      <div>📷 2 fotos registradas (1 recibo + 1 entrega)</div>
                    </div>
                    <div className="dlv-entregado">
                      <div>🏬 <strong>Entregado a:</strong> Mina San Salvador (Mecánica)</div>
                      <div>✅ Hoy, 08:30 a. m. · RET-0887</div>
                      <div>📷 2 fotos registradas (1 recibo + 1 entrega)</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════
            PANTALLA 2: NAVEGACIÓN GPS (PROTAGONISTA)
            - RUTA DINÁMICA: TRAMO 1 HACIA PROVEEDOR, TRAMO 2 RETORNO A SEDE
           ═════════════════════════════════════════════════════════════ */}
        {pantallaActiva === 'mapa' && (
          <div className="dlv-protagonista-screen">
            <div className="dlv-screen-head">
              <div>
                <h2 className="dlv-screen-title">🧭 Mi GPS y Navegación</h2>
                <div className="dlv-screen-sub">
                  {carreraActiva
                    ? faseViaje === 'hacia_recogida'
                      ? `Tramo 1: En ruta hacia ${carreraActiva.origen}`
                      : `Tramo 2: Retornando a Sede (${carreraActiva.destino})`
                    : 'Medición en tiempo real desde tu teléfono móvil'}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '.75rem', color: '#60a5fa' }}
                onClick={() => setPantallaActiva('principal')}
              >
                ← Pedidos
              </button>
            </div>

            {/* Radar interactivo en vivo con destino activo */}
            <div className="dlv-mapa-canvas-mock" style={{ height: 260 }}>
              <div className="dlv-mapa-radar" title="Tu posición GPS actual" />
              <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: '#0b1320', padding: '.4rem .7rem', borderRadius: 8, border: '1px solid #334155', fontSize: '.75rem' }}>
                <strong style={{ color: '#60a5fa' }}>📍 Tu Ubicación (GPS)</strong> · ±4 m
              </div>
              <div style={{
                position: 'absolute', top: '16px', right: '16px',
                background: faseViaje === 'hacia_recogida' ? '#1f2937' : '#0b1320',
                padding: '.4rem .7rem', borderRadius: 8,
                border: `2px solid ${faseViaje === 'hacia_recogida' ? '#f59e0b' : '#334155'}`,
                fontSize: '.75rem',
              }}>
                <strong style={{ color: '#f59e0b' }}>🏭 {carreraActiva ? carreraActiva.origen : 'Ferretería El Tornillo'}</strong>
                {faseViaje === 'hacia_recogida' && <span style={{ marginLeft: 4, color: '#f59e0b' }}>● DESTINO</span>}
              </div>
              <div style={{
                position: 'absolute', top: '70px', left: '16px',
                background: faseViaje === 'retorno_sede' ? '#1f2937' : '#0b1320',
                padding: '.4rem .7rem', borderRadius: 8,
                border: `2px solid ${faseViaje === 'retorno_sede' ? '#10b981' : '#334155'}`,
                fontSize: '.75rem',
              }}>
                <strong style={{ color: '#10b981' }}>🏬 {carreraActiva ? carreraActiva.destino : 'Destino de Entrega'}</strong>
                {faseViaje === 'retorno_sede' && <span style={{ marginLeft: 4, color: '#10b981' }}>● DESTINO ACTIVO</span>}
              </div>
            </div>

            {/* Tarjeta de estado de ruta */}
            <div style={{ background: '#0b1320', padding: '1rem', borderRadius: 16, border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                <span style={{ fontSize: '.75rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase' }}>
                  {carreraActiva
                    ? faseViaje === 'hacia_recogida'
                      ? `Tramo 1: Recogida de ${carreraActiva.codigo}`
                      : `Tramo 2: Entrega en ${carreraActiva.destino}`
                    : 'GPS Repartidor'}
                </span>
                <span style={{ fontSize: '.75rem', color: '#10b981', fontWeight: 700 }}>🟢 Coordenadas Válidas</span>
              </div>
              <div style={{ fontSize: '.95rem', fontWeight: 700, color: '#f8fafc', marginBottom: '.25rem' }}>
                {carreraActiva
                  ? faseViaje === 'hacia_recogida'
                    ? `Paso 1: Ir a recoger en ${carreraActiva.origen}`
                    : `Paso 2: Trasladando carga hacia ${carreraActiva.destino}`
                  : 'Listo para recibir asignación o elegir orden'}
              </div>
              <p style={{ fontSize: '.8rem', color: '#94a3b8', margin: 0, lineHeight: 1.35 }}>
                📏 <strong>Referencia de distancias:</strong> Las distancias se miden en tiempo real desde tu teléfono hasta la parada activa.
              </p>
            </div>

            {/* Botón de navegación nativa (Google Maps exclusivo) */}
            <div style={{ marginTop: '.35rem' }}>
              <button
                type="button"
                className="btn"
                style={{ width: '100%', background: '#1e293b', border: '2px solid #3b82f6', color: '#60a5fa', minHeight: 52, fontWeight: 800, fontSize: '.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}
                onClick={() => notify(`🧭 Abriendo Google Maps hacia ${carreraActiva ? (faseViaje === 'hacia_recogida' ? carreraActiva.origen : carreraActiva.destino) : 'Almacén Los Pinos'}...`)}
              >
                🧭 Abrir Navegación en Google Maps
              </button>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════
            PANTALLA 3: ANALISTA RESPONSABLE (PROTAGONISTA)
           ═════════════════════════════════════════════════════════════ */}
        {pantallaActiva === 'analista' && (
          <div className="dlv-protagonista-screen">
            <div className="dlv-screen-head">
              <div>
                <h2 className="dlv-screen-title">📞 Analista Responsable</h2>
                <div className="dlv-screen-sub">Llamada directa interna · Sin intermediarios</div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '.75rem', color: '#34d399' }}
                onClick={() => setPantallaActiva('principal')}
              >
                ← Pedidos
              </button>
            </div>

            {carreraActiva ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
                <div className="dlv-analista-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="dlv-analista-orden-badge">Orden: {carreraActiva.codigo}</span>
                    <span style={{ fontSize: '.75rem', color: '#38bdf8' }}>{carreraActiva.tipo === 'retiro' ? '📦 Retiro' : '🏭 Compra'}</span>
                  </div>
                  <div className="dlv-analista-nombre">{carreraActiva.analistaNombre}</div>
                  <div className="dlv-analista-cargo">
                    {carreraActiva.tipo === 'retiro' ? 'Almacenista responsable en Los Pinos' : 'Analista responsable en Procura'}
                  </div>
                  <a className="dlv-analista-call-btn" href={`tel:${carreraActiva.analistaTelefono}`} onClick={() => notify(`📞 Marcando a ${carreraActiva.analistaNombre}...`)}>
                    📞 Llamar al Analista ({carreraActiva.analistaTelefono})
                  </a>
                </div>

                {carreraActiva.solicitanteTelefono && (
                  <div className="dlv-analista-card" style={{ borderColor: '#334155' }}>
                    <span className="dlv-analista-orden-badge" style={{ color: '#a78bfa', background: 'rgba(167, 139, 250, 0.12)' }}>
                      Destinatario en Mina
                    </span>
                    <div className="dlv-analista-nombre">{carreraActiva.solicitanteNombre}</div>
                    <div className="dlv-analista-cargo">Quien generó la solicitud en Mina Central</div>
                    <a className="dlv-analista-call-btn" style={{ background: '#3b82f6', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' }} href={`tel:${carreraActiva.solicitanteTelefono}`} onClick={() => notify(`📞 Marcando al solicitante...`)}>
                      📞 Llamar al Solicitante ({carreraActiva.solicitanteTelefono})
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                <p style={{ fontSize: '.84rem', color: '#94a3b8', margin: 0 }}>
                  Analistas asignados a las órdenes disponibles para coordinar antes de aceptar:
                </p>
                {PEDIDOS_DISPONIBLES.map((p) => (
                  <div key={p.id} className="dlv-analista-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="dlv-analista-orden-badge">Orden: {p.codigo}</span>
                      <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>{p.tipo === 'retiro' ? '📦 Retiro' : '🏭 Compra'}</span>
                    </div>
                    <div className="dlv-analista-nombre">{p.analistaNombre}</div>
                    <div className="dlv-analista-cargo">
                      {p.origen} · {p.tipo === 'retiro' ? 'Almacén Los Pinos' : 'Compras'}
                    </div>
                    <a className="dlv-analista-call-btn" href={`tel:${p.analistaTelefono}`} onClick={() => notify(`📞 Marcando al analista de ${p.codigo}...`)}>
                      📞 Llamar a {p.analistaNombre.split(' ')[0]} ({p.analistaTelefono})
                    </a>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: '.78rem', color: '#94a3b8', background: '#0b1320', padding: '.75rem', borderRadius: 12, border: '1px solid #1e293b', textAlign: 'center' }}>
              🔒 <strong>Política de Seguridad:</strong> Por resguardo de datos y cotizaciones, los números de proveedores externos nunca se marcan desde aquí. Toda coordinación es con el Analista interno o Almacenista.
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════
            PANTALLA 4: EVIDENCIA FOTOGRÁFICA (SEGÚN LA FASE ACTIVA)
           ═════════════════════════════════════════════════════════════ */}
        {pantallaActiva === 'fotos' && (
          <div className="dlv-protagonista-screen">
            <div className="dlv-screen-head">
              <div>
                <h2 className="dlv-screen-title">📸 Evidencia Fotográfica</h2>
                <div className="dlv-screen-sub">
                  {carreraActiva ? `Orden ${carreraActiva.codigo}` : 'Registro de Carga y Recepción'}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '.75rem', color: '#c084fc' }}
                onClick={() => setPantallaActiva('principal')}
              >
                ← Pedidos
              </button>
            </div>

            {!carreraActiva ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1.25rem', background: '#0b1320', borderRadius: 16, border: '1px solid #1e293b' }}>
                <div style={{ fontSize: '2.8rem', marginBottom: '.75rem' }}>📷</div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', marginBottom: '.4rem' }}>Sin Pedido Activo</h3>
                <p style={{ fontSize: '.82rem', color: '#94a3b8', maxWidth: 300, margin: '0 auto 1.25rem', lineHeight: 1.4 }}>
                  Para adjuntar evidencia fotográfica (remisión, factura o entrega), primero debes aceptar un pedido en la sección de Pedidos.
                </p>
                <button type="button" className="btn btn-primary" onClick={() => setPantallaActiva('principal')}>
                  Ver Pedidos Disponibles
                </button>
              </div>
            ) : (
              <>
                {/* Stepper Superior: Muestra el estado y qué fase ya tiene foto */}
                <div className="dlv-fases-stepper">
                  <div className={`dlv-fase-step ${faseViaje === 'hacia_recogida' ? 'activo' : 'pasado'}`}>
                    <div className="dlv-fase-step-num">
                      {fotosRecibo.length > 0 ? '✓' : '1'}
                    </div>
                    <div className="dlv-fase-step-body">
                      <span className="dlv-fase-step-title">1. Al Recibir</span>
                      <span className={`dlv-fase-step-sub ${fotosRecibo.length > 0 ? 'listo' : 'alerta'}`}>
                        {fotosRecibo.length > 0 ? `✓ Ya tiene ${fotosRecibo.length} foto(s)` : '🚨 Foto Requerida'}
                      </span>
                    </div>
                  </div>

                  <div className={`dlv-fase-step-divider ${fotosRecibo.length > 0 ? 'listo' : ''}`} />

                  <div className={`dlv-fase-step ${faseViaje === 'retorno_sede' ? 'activo' : 'futuro'}`}>
                    <div className="dlv-fase-step-num">
                      {fotosEntrega.length > 0 ? '✓' : '2'}
                    </div>
                    <div className="dlv-fase-step-body">
                      <span className="dlv-fase-step-title">2. Al Entregar</span>
                      <span className={`dlv-fase-step-sub ${fotosEntrega.length > 0 ? 'listo' : faseViaje === 'retorno_sede' ? 'alerta' : 'espera'}`}>
                        {fotosEntrega.length > 0 ? `✓ Ya tiene ${fotosEntrega.length} foto(s)` : faseViaje === 'retorno_sede' ? '🚨 Foto Requerida' : 'En espera'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '.8rem', color: '#cbd5e1', background: 'rgba(147, 51, 234, 0.1)', padding: '.7rem .85rem', borderRadius: 12, border: '1px solid rgba(168, 85, 247, 0.25)', lineHeight: 1.35 }}>
                  {faseViaje === 'hacia_recogida' ? (
                    <span>📍 <strong>Fase 1 Activa (Recogida):</strong> Foto obligatoria de remisión/paquete al recibir para habilitar el traslado hacia {carreraActiva.destino}.</span>
                  ) : (
                    <span>📍 <strong>Fase 2 Activa (Entrega):</strong> Foto obligatoria de recepción sellada o descarga en {carreraActiva.destino} para cerrar la orden.</span>
                  )}
                </div>

                {/* ── FASE 1: HACIA RECOGIDA ── */}
                {faseViaje === 'hacia_recogida' && (
                  <>
                    {/* MOMENTO 1: AL RECIBIR (PROTAGONISTA ACTIVO) */}
                    <div className={`dlv-foto-momento-card ${fotosRecibo.length > 0 ? 'completado' : 'pendiente'}`}>
                      <div className="dlv-momento-head">
                        <div>
                          <span className="dlv-momento-tag m1">Momento 1 · Al Recibir (Fase Actual)</span>
                          <h3 className="dlv-momento-titulo">
                            {carreraActiva.tipo === 'retiro' ? 'Retiro en Almacén Los Pinos' : `Recepción en ${carreraActiva.origen}`}
                          </h3>
                          <p className="dlv-momento-desc">
                            Fotos de la remisión firmada, factura física o paquetes subidos al vehículo (obligatorio para habilitar traslado).
                          </p>
                        </div>
                        <span className={`badge ${fotosRecibo.length > 0 ? 'success' : 'danger'}`}>
                          {fotosRecibo.length > 0 ? `✓ Ya tiene ${fotosRecibo.length}/5 fotos` : '🚨 Obligatoria'}
                        </span>
                      </div>

                      {fotosRecibo.length > 0 && (
                        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '.5rem .75rem', borderRadius: 8, fontSize: '.78rem', color: '#34d399', fontWeight: 700 }}>
                          ✓ ¡Fase 1 documentada! Ya puedes tocar «Carga a Bordo» en la barra para iniciar ruta al destino.
                        </div>
                      )}

                      {/* Galería de fotos registradas */}
                      {fotosRecibo.length > 0 && (
                        <div className="dlv-foto-galeria">
                          {fotosRecibo.map((f) => (
                            <div key={f.id} className="dlv-foto-item" title={f.label}>
                              <div style={{ fontSize: '1.6rem' }}>{f.icono}</div>
                              <span className="dlv-foto-badge-label">{f.label}</span>
                              <button
                                type="button"
                                onClick={() => eliminarFoto('recibo', f.id)}
                                style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(239, 68, 68, 0.85)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: '.65rem', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                                title="Eliminar foto"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Botón táctil grande */}
                      <button
                        type="button"
                        className="dlv-btn-tomar-foto m1"
                        onClick={agregarFotoRecibo}
                      >
                        📸 {fotosRecibo.length > 0 ? '+ Agregar otra foto al recibir' : 'Tomar / Subir Foto al Recibir'} ({fotosRecibo.length}/5)
                      </button>
                    </div>

                    {/* MOMENTO 2: AL ENTREGAR (BLOQUEADO / EN ESPERA DE FASE 1) */}
                    <div className="dlv-foto-momento-card bloqueado">
                      <div className="dlv-momento-head">
                        <div>
                          <span className="dlv-momento-tag m2" style={{ opacity: 0.6 }}>Momento 2 · Al Entregar</span>
                          <h3 className="dlv-momento-titulo" style={{ color: '#94a3b8' }}>
                            {carreraActiva.tipo === 'retiro' ? `Entrega en ${carreraActiva.destino}` : `Recepción en ${carreraActiva.destino}`}
                          </h3>
                          <p className="dlv-momento-desc" style={{ color: '#64748b' }}>
                            🔒 Esta fase se habilitará automáticamente cuando cargues el paquete e inicies el traslado hacia {carreraActiva.destino}.
                          </p>
                        </div>
                        <span className="dlv-badge-fase bloqueado">
                          🔒 Próximo Paso
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {/* ── FASE 2: EN TRASLADO / ENTREGA EN DESTINO ── */}
                {faseViaje === 'retorno_sede' && (
                  <>
                    {/* MOMENTO 1: RESUMEN DE FASE COMPLETADA (YA TIENE FOTO) */}
                    <div className="dlv-foto-momento-resumen">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                          <span style={{ fontSize: '1.2rem', color: '#10b981' }}>✅</span>
                          <div>
                            <div style={{ fontSize: '.84rem', fontWeight: 800, color: '#f1f5f9' }}>
                              Fase 1 (Al Recibir) ya tiene foto
                            </div>
                            <div style={{ fontSize: '.72rem', color: '#34d399', fontWeight: 700 }}>
                              ✓ {fotosRecibo.length} foto(s) de remisión / carga registradas
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          style={{ fontSize: '.72rem', color: '#60a5fa' }}
                          onClick={() => setMostrarDetalleM1(!mostrarDetalleM1)}
                        >
                          {mostrarDetalleM1 ? '▲ Ocultar' : `👁️ Ver fotos (${fotosRecibo.length})`}
                        </button>
                      </div>

                      {mostrarDetalleM1 && (
                        <div style={{ marginTop: '.4rem', paddingTop: '.5rem', borderTop: '1px solid #1e293b' }}>
                          <div className="dlv-foto-galeria">
                            {fotosRecibo.map((f) => (
                              <div key={f.id} className="dlv-foto-item" title={f.label}>
                                <div style={{ fontSize: '1.6rem' }}>{f.icono}</div>
                                <span className="dlv-foto-badge-label">{f.label}</span>
                                <button
                                  type="button"
                                  onClick={() => eliminarFoto('recibo', f.id)}
                                  style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(239, 68, 68, 0.85)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: '.65rem', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                                  title="Eliminar foto"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            style={{ marginTop: '.4rem', fontSize: '.72rem', color: '#fbbf24', width: '100%' }}
                            onClick={agregarFotoRecibo}
                          >
                            + Agregar otra foto al recibir ({fotosRecibo.length}/5)
                          </button>
                        </div>
                      )}
                    </div>

                    {/* MOMENTO 2: AL ENTREGAR (PROTAGONISTA ACTIVO) */}
                    <div className={`dlv-foto-momento-card ${fotosEntrega.length > 0 ? 'completado' : 'pendiente'}`}>
                      <div className="dlv-momento-head">
                        <div>
                          <span className="dlv-momento-tag m2">Momento 2 · Al Entregar (Fase Actual)</span>
                          <h3 className="dlv-momento-titulo">
                            {carreraActiva.tipo === 'retiro' ? `Entrega en ${carreraActiva.destino}` : `Recepción en ${carreraActiva.destino}`}
                          </h3>
                          <p className="dlv-momento-desc">
                            Fotos de la guía firmada/sellada por quien recibe y descarga de materiales en el destino.
                          </p>
                        </div>
                        <span className={`badge ${fotosEntrega.length > 0 ? 'success' : 'danger'}`}>
                          {fotosEntrega.length > 0 ? `✓ Ya tiene ${fotosEntrega.length}/5 fotos` : '🚨 Obligatoria'}
                        </span>
                      </div>

                      {fotosEntrega.length > 0 && (
                        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '.5rem .75rem', borderRadius: 8, fontSize: '.78rem', color: '#34d399', fontWeight: 700 }}>
                          ✓ ¡Evidencia de entrega lista! Ya puedes confirmar y cerrar el pedido en la barra inferior.
                        </div>
                      )}

                      {/* Galería de fotos registradas */}
                      {fotosEntrega.length > 0 && (
                        <div className="dlv-foto-galeria">
                          {fotosEntrega.map((f) => (
                            <div key={f.id} className="dlv-foto-item" title={f.label}>
                              <div style={{ fontSize: '1.6rem' }}>{f.icono}</div>
                              <span className="dlv-foto-badge-label">{f.label}</span>
                              <button
                                type="button"
                                onClick={() => eliminarFoto('entrega', f.id)}
                                style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(239, 68, 68, 0.85)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: '.65rem', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                                title="Eliminar foto"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Botón táctil grande */}
                      <button
                        type="button"
                        className="dlv-btn-tomar-foto m2"
                        onClick={agregarFotoEntrega}
                      >
                        📸 {fotosEntrega.length > 0 ? '+ Agregar otra foto de entrega' : 'Tomar / Subir Foto de Entrega'} ({fotosEntrega.length}/5)
                      </button>
                    </div>
                  </>
                )}

                <div style={{ fontSize: '.75rem', color: '#94a3b8', textAlign: 'center', marginTop: '.25rem' }}>
                  ☁️ Las fotos se sincronizan automáticamente con el ERP y quedan archivadas en el comprobante digital.
                </div>
              </>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════
            BARRA INFERIOR SEMIFLOTANTE DE CALLE (4 BOTONES PROTAGONISTAS)
           ═════════════════════════════════════════════════════════════ */}
        <nav className="dlv-bottom-bar" aria-label="Acciones principales de calle">
          {/* BOTÓN 1: ACCIÓN PRINCIPAL / PEDIDOS */}
          <button
            type="button"
            className={`dlv-bar-btn btn-accion-p ${carreraActiva && faseViaje === 'retorno_sede' ? 'entregar' : ''} ${pantallaActiva === 'principal' ? 'active' : ''}`}
            onClick={handleBoton1}
            title={carreraActiva ? (faseViaje === 'retorno_sede' ? 'Entregar en Sede' : 'Ir a Recoger') : 'Ver lista de pedidos'}
          >
            <span className="icono">
              {carreraActiva ? (faseViaje === 'retorno_sede' ? '🏬' : '🚚') : '📦'}
            </span>
            <span className="label">
              {carreraActiva
                ? faseViaje === 'retorno_sede' ? 'Entregar' : 'En camino'
                : `Pedidos (${PEDIDOS_DISPONIBLES.length})`}
            </span>
          </button>

          {/* BOTÓN 2: MI GPS / MAPA */}
          <button
            type="button"
            className={`dlv-bar-btn btn-gps ${pantallaActiva === 'mapa' ? 'active' : ''}`}
            onClick={() => setPantallaActiva('mapa')}
            title="Abrir mapa interactivo de navegación GPS"
          >
            <span className="icono">🧭</span>
            <span className="label">{carreraActiva ? (faseViaje === 'retorno_sede' ? 'Destino' : 'Ruta') : 'Mi GPS'}</span>
          </button>

          {/* BOTÓN 3: ANALISTA (LLAMADA INTERNA DIRECTA) */}
          <button
            type="button"
            className={`dlv-bar-btn btn-llamar ${pantallaActiva === 'analista' ? 'active' : ''}`}
            onClick={() => setPantallaActiva('analista')}
            title="Contactar al analista responsable de la orden"
          >
            <span className="icono">📞</span>
            <span className="label">Analista</span>
          </button>

          {/* BOTÓN 4: FOTOS (LOS 2 MOMENTOS) */}
          <button
            type="button"
            className={`dlv-bar-btn btn-camara ${pantallaActiva === 'fotos' ? 'active' : ''}`}
            onClick={() => setPantallaActiva('fotos')}
            title="Evidencia fotográfica en 2 momentos"
          >
            <span className="icono">📸</span>
            <span className="label">
              Fotos ({fotosRecibo.length + fotosEntrega.length})
            </span>
          </button>
        </nav>

        {/* Modal de confirmación de entrega formal */}
        {modalConfirmarEntrega && (
          <div className="dlv-sheet-overlay" onClick={() => setModalConfirmarEntrega(false)}>
            <div className="dlv-sheet-container" style={{ paddingBottom: '95px' }} onClick={(e) => e.stopPropagation()}>
              <div className="dlv-sheet-handle" />
              <div className="dlv-sheet-header">
                <h3 className="dlv-sheet-title">📦 Confirmar Entrega de Carga</h3>
                <button type="button" className="dlv-sheet-close" onClick={() => setModalConfirmarEntrega(false)} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
                <p style={{ fontSize: '.85rem', color: '#d1d5db', margin: 0 }}>
                  {carreraActiva?.tipo === 'retiro'
                    ? 'Entregando en destino final (Mina / Unidad):'
                    : 'Entregando en Almacén Los Pinos:'}
                </p>
                <div style={{ background: '#111827', padding: '.75rem', borderRadius: 12, border: '1px solid #374151' }}>
                  <strong style={{ display: 'block', fontSize: '.95rem', color: '#f59e0b' }}>{carreraActiva?.codigo}</strong>
                  <div style={{ fontSize: '.84rem', color: '#f1f5f9' }}>{carreraActiva?.destino}</div>
                  <small style={{ color: '#9ca3af' }}>{carreraActiva?.items}</small>
                </div>

                <div style={{ background: '#0b1320', padding: '.65rem', borderRadius: 10, border: '1px solid #1e293b', fontSize: '.78rem', color: '#94a3b8' }}>
                  📷 <strong>Fotos registradas:</strong> {fotosRecibo.length} al recibir · {fotosEntrega.length} al entregar
                </div>

                {fotosEntrega.length === 0 && (
                  <div style={{ color: '#ef4444', fontSize: '.82rem', fontWeight: 700 }}>
                    🚨 No puedes finalizar la entrega sin adjuntar al menos 1 foto.
                  </div>
                )}

                <label style={{ fontSize: '.82rem', color: '#9ca3af' }}>
                  Nombre de quien recibe conforme:
                  <input
                    type="text"
                    className="input"
                    defaultValue={carreraActiva?.solicitanteNombre ?? 'Almacenista de Guardia'}
                    style={{ width: '100%', marginTop: '.35rem' }}
                  />
                </label>

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={fotosEntrega.length === 0}
                  style={{ minHeight: 52, fontWeight: 800, fontSize: '.95rem', marginTop: '.35rem', opacity: fotosEntrega.length === 0 ? 0.5 : 1 }}
                  onClick={confirmarEntrega}
                >
                  ✓ Confirmar y Finalizar Entrega
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Comprobante de Pago al Proveedor */}
        {modalComprobante && (
          <div className="dlv-sheet-overlay" onClick={() => setModalComprobante(false)}>
            <div className="dlv-sheet-container" style={{ paddingBottom: '95px' }} onClick={(e) => e.stopPropagation()}>
              <div className="dlv-sheet-handle" />
              <div className="dlv-sheet-header">
                <h3 className="dlv-sheet-title">🧾 Comprobante de Pago · {carreraActiva?.codigo}</h3>
                <button type="button" className="dlv-sheet-close" onClick={() => setModalComprobante(false)} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                <p style={{ fontSize: '.84rem', color: '#94a3b8', margin: 0 }}>
                  Presenta este comprobante al proveedor para autorizar la entrega de los repuestos/materiales:
                </p>
                <div style={{ background: '#111827', padding: '1rem', borderRadius: 12, border: '1px solid #374151', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '.75rem', color: '#9ca3af' }}>Beneficiario:</span>
                    <strong style={{ fontSize: '.85rem', color: '#f3f4f6' }}>{carreraActiva?.origen}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '.75rem', color: '#9ca3af' }}>Banco / Método:</span>
                    <span style={{ fontSize: '.85rem', color: '#38bdf8' }}>Banesco · Transferencia</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '.75rem', color: '#9ca3af' }}>Referencia:</span>
                    <span style={{ fontSize: '.85rem', fontFamily: 'monospace', color: '#f59e0b', fontWeight: 700 }}>REF-94021948</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '.75rem', color: '#9ca3af' }}>Monto Cancelado:</span>
                    <strong style={{ fontSize: '.95rem', color: '#10b981' }}>$142,50 USD (Pagado)</strong>
                  </div>
                </div>

                <div style={{ textAlign: 'center', background: '#0b1320', padding: '.6rem', borderRadius: 8, border: '1px solid #1e293b', fontSize: '.78rem', color: '#94a3b8' }}>
                  🔒 Pago verificado por Tesorería Golden Touch ERP.
                </div>

                <button type="button" className="btn btn-primary" style={{ minHeight: 48, fontWeight: 700 }} onClick={() => setModalComprobante(false)}>
                  Entendido · Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
