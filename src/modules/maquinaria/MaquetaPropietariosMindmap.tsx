/* ============================================================
   Golden Touch · Maqueta: Catálogo de Propietarios (Mapa Mental)
   Ruta: /dosc y /docs
   
   Flujo previo a Control de Maquinaria:
   1. Centro del mapa: "GENERAL" (toda la flota consolidada).
   2. Ramas radiales tipo mapa mental hacia cada Propietario.
   3. Al seleccionar un propietario (o General), se despliega la
      vista de Control de Maquinaria SIN NADA DE SERVICIOS (puro
      control de activos, estatus, horómetros, operadores, ubicación).
   4. Los usuarios tienen dos opciones:
      - Entrar al módulo completo (vista tipo mapa mental de propietarios).
      - O entrar directo al Control de Maquinaria tradicional.
   ============================================================ */

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listEquipos, type MaquinariaEquipo } from './maquinariaEquipos.repository';

// Datos de demostración enriquecidos para cuando la BD no tiene todos los campos
interface PropietarioData {
  id: string;
  nombre: string;
  categoria: 'Propio' | 'Alquilado' | 'Asociado' | 'Contratista';
  icono: string;
  color: string;
  contacto: string;
  telefono: string;
  totalEquipos: number;
  operativos: number;
  taller: number;
  inactivos: number;
}

const PROPIETARIOS_DEMO: PropietarioData[] = [
  {
    id: 'golden_touch',
    nombre: 'Golden Touch 1127 C.A.',
    categoria: 'Propio',
    icono: '🏢',
    color: '#eab308', // Dorado
    contacto: 'Operaciones Mina',
    telefono: '+58 414 123-4567',
    totalEquipos: 16,
    operativos: 14,
    taller: 2,
    inactivos: 0,
  },
  {
    id: 'consorcio_guayana',
    nombre: 'Consorcio Minero Guayana',
    categoria: 'Alquilado',
    icono: '⛏️',
    color: '#3b82f6', // Azul
    contacto: 'Ing. Roberto Silva',
    telefono: '+58 424 987-6543',
    totalEquipos: 8,
    operativos: 7,
    taller: 1,
    inactivos: 0,
  },
  {
    id: 'inversiones_callao',
    nombre: 'Inversiones El Callao',
    categoria: 'Asociado',
    icono: '🚛',
    color: '#10b981', // Verde esmeralda
    contacto: 'Carlos Méndez',
    telefono: '+58 412 555-1122',
    totalEquipos: 6,
    operativos: 5,
    taller: 1,
    inactivos: 0,
  },
  {
    id: 'minera_pinos',
    nombre: 'Minera Los Pinos',
    categoria: 'Propio',
    icono: '🌲',
    color: '#14b8a6', // Teal
    contacto: 'Sede Los Pinos',
    telefono: '+58 416 333-8899',
    totalEquipos: 5,
    operativos: 4,
    taller: 0,
    inactivos: 1,
  },
  {
    id: 'maquinarias_bolivar',
    nombre: 'Equipos & Maquinaria Bolívar',
    categoria: 'Contratista',
    icono: '🏗️',
    color: '#f97316', // Naranja
    contacto: 'Servicios de Carga Bolívar',
    telefono: '+58 424 777-2233',
    totalEquipos: 4,
    operativos: 3,
    taller: 1,
    inactivos: 0,
  },
  {
    id: 'sin_propietario',
    nombre: 'Sin Propietario Asignado',
    categoria: 'Asociado',
    icono: '❓',
    color: '#94a3b8', // Gris
    contacto: 'Por regularizar',
    telefono: '—',
    totalEquipos: 2,
    operativos: 1,
    taller: 0,
    inactivos: 1,
  },
];

interface EquipoDemo {
  id: string;
  equipo: string;
  tipo: string;
  propietarioId: string;
  propietarioNombre: string;
  marca: string;
  modelo: string;
  serial: string;
  placa: string;
  horometro: number;
  combustible: string;
  consumoPorHora: number;
  operador: string;
  ubicacion: string;
  status: 'OPERATIVO' | 'EN TALLER' | 'INACTIVO';
  anio: number;
  color: string;
}

const EQUIPOS_DEMO: EquipoDemo[] = [
  // Golden Touch
  {
    id: 'gt-01',
    equipo: 'EXC-01 · CAT 336D',
    tipo: 'Excavadora',
    propietarioId: 'golden_touch',
    propietarioNombre: 'Golden Touch 1127 C.A.',
    marca: 'Caterpillar',
    modelo: '336D2 L',
    serial: 'CAT0336DK2910',
    placa: 'GT-EQ-01',
    horometro: 5420,
    combustible: 'Diesel',
    consumoPorHora: 38,
    operador: 'Manuel Rojas (Op. Certificado)',
    ubicacion: 'Frente Mina Principal · Banco 4',
    status: 'OPERATIVO',
    anio: 2021,
    color: 'Amarillo Caterpillar',
  },
  {
    id: 'gt-02',
    equipo: 'EXC-02 · KOMATSU PC200',
    tipo: 'Excavadora',
    propietarioId: 'golden_touch',
    propietarioNombre: 'Golden Touch 1127 C.A.',
    marca: 'Komatsu',
    modelo: 'PC200-8M0',
    serial: 'KMTPC200-9941',
    placa: 'GT-EQ-02',
    horometro: 4180,
    combustible: 'Diesel',
    consumoPorHora: 26,
    operador: 'José Gregorio Hernández',
    ubicacion: 'Frente Mina Secundario',
    status: 'OPERATIVO',
    anio: 2020,
    color: 'Amarillo / Azul',
  },
  {
    id: 'gt-03',
    equipo: 'VOL-01 · MACK GRANITE',
    tipo: 'Camión Volteo',
    propietarioId: 'golden_touch',
    propietarioNombre: 'Golden Touch 1127 C.A.',
    marca: 'Mack',
    modelo: 'Granite GU713 (24 m³)',
    serial: 'MCKGRAN-2022-01',
    placa: 'A44BC9D',
    horometro: 2890,
    combustible: 'Diesel',
    consumoPorHora: 22,
    operador: 'Pedro Yánez',
    ubicacion: 'Ruta Mina → Planta de Lavado',
    status: 'OPERATIVO',
    anio: 2022,
    color: 'Blanco',
  },
  {
    id: 'gt-04',
    equipo: 'GEN-01 · CUMMINS 500KVA',
    tipo: 'Planta Eléctrica',
    propietarioId: 'golden_touch',
    propietarioNombre: 'Golden Touch 1127 C.A.',
    marca: 'Cummins',
    modelo: 'QSK19-G4',
    serial: 'CUMM-500-1127',
    placa: 'PE-GT-01',
    horometro: 8940,
    combustible: 'Diesel',
    consumoPorHora: 45,
    operador: 'Guardia Eléctrica Los Pinos',
    ubicacion: 'Campamento Central · Los Pinos',
    status: 'OPERATIVO',
    anio: 2019,
    color: 'Verde Oscuro',
  },
  {
    id: 'gt-05',
    equipo: 'RETRO-01 · CAT 420F',
    tipo: 'Retroexcavadora',
    propietarioId: 'golden_touch',
    propietarioNombre: 'Golden Touch 1127 C.A.',
    marca: 'Caterpillar',
    modelo: '420F2 4x4',
    serial: 'CAT420F-7712',
    placa: 'GT-RET-01',
    horometro: 3650,
    combustible: 'Diesel',
    consumoPorHora: 16,
    operador: 'Eduardo Zambrano',
    ubicacion: 'Taller Central (Mantenimiento)',
    status: 'EN TALLER',
    anio: 2018,
    color: 'Amarillo',
  },
  {
    id: 'gt-06',
    equipo: 'CIS-01 · FORD F-750 COMBUSTIBLE',
    tipo: 'Cisterna',
    propietarioId: 'golden_touch',
    propietarioNombre: 'Golden Touch 1127 C.A.',
    marca: 'Ford',
    modelo: 'F-750 Super Duty (10.000 L)',
    serial: 'FRDF750-TANK-01',
    placa: 'A12XY9Z',
    horometro: 4910,
    combustible: 'Diesel',
    consumoPorHora: 18,
    operador: 'Luis Bermúdez (Chofer Tanque)',
    ubicacion: 'Surtidor Móvil · Campamento',
    status: 'OPERATIVO',
    anio: 2017,
    color: 'Rojo / Blanco',
  },
  // Consorcio Guayana
  {
    id: 'cg-01',
    equipo: 'EXC-03 · HITACHI ZX350',
    tipo: 'Excavadora',
    propietarioId: 'consorcio_guayana',
    propietarioNombre: 'Consorcio Minero Guayana',
    marca: 'Hitachi',
    modelo: 'ZX350LC-5G',
    serial: 'HTCH-ZX350-55',
    placa: 'ALQ-HIT-01',
    horometro: 6100,
    combustible: 'Diesel',
    consumoPorHora: 35,
    operador: 'Francisco Rivas',
    ubicacion: 'Frente Este · Terraza 2',
    status: 'OPERATIVO',
    anio: 2021,
    color: 'Naranja Hitachi',
  },
  {
    id: 'cg-02',
    equipo: 'JUMBO-01 · ATLAS COPCO BOOMER',
    tipo: 'Jumbo de Perforación',
    propietarioId: 'consorcio_guayana',
    propietarioNombre: 'Consorcio Minero Guayana',
    marca: 'Epiroc / Atlas Copco',
    modelo: 'Boomer 282',
    serial: 'EP-BMR-282-09',
    placa: 'ALQ-JUM-01',
    horometro: 3200,
    combustible: 'Electrohidráulico / Diesel',
    consumoPorHora: 20,
    operador: 'Héctor Carrillo (Perforista)',
    ubicacion: 'Galería Subterránea Nivel -40m',
    status: 'OPERATIVO',
    anio: 2022,
    color: 'Amarillo / Gris',
  },
  {
    id: 'cg-03',
    equipo: 'CARG-01 · VOLVO L220H',
    tipo: 'Cargador Frontal',
    propietarioId: 'consorcio_guayana',
    propietarioNombre: 'Consorcio Minero Guayana',
    marca: 'Volvo',
    modelo: 'L220H (5.6 m³)',
    serial: 'VLV-L220-8812',
    placa: 'ALQ-VOL-02',
    horometro: 5800,
    combustible: 'Diesel',
    consumoPorHora: 32,
    operador: 'Ramón Castillo',
    ubicacion: 'Patio de Acopio · Mineral Bruto',
    status: 'EN TALLER',
    anio: 2020,
    color: 'Amarillo Volvo',
  },
  // Inversiones El Callao
  {
    id: 'ec-01',
    equipo: 'VOL-02 · IVECO TRAKKER 380',
    tipo: 'Camión Volteo',
    propietarioId: 'inversiones_callao',
    propietarioNombre: 'Inversiones El Callao',
    marca: 'Iveco',
    modelo: 'Trakker 380 6x4',
    serial: 'IVC-TRK-380-01',
    placa: 'A88KL1P',
    horometro: 4720,
    combustible: 'Diesel',
    consumoPorHora: 24,
    operador: 'Antonio Márquez',
    ubicacion: 'Ruta Matanzas ↔ Mina',
    status: 'OPERATIVO',
    anio: 2019,
    color: 'Blanco',
  },
  {
    id: 'ec-02',
    equipo: 'BOM-01 · GODWIN DPC300',
    tipo: 'Motobomba de Achique',
    propietarioId: 'inversiones_callao',
    propietarioNombre: 'Inversiones El Callao',
    marca: 'Godwin / Xylem',
    modelo: 'Dri-Prime DPC300 (12")',
    serial: 'GDW-DPC-300-88',
    placa: 'BOM-EC-01',
    horometro: 7200,
    combustible: 'Diesel',
    consumoPorHora: 14,
    operador: 'Cuadrilla de Bombeo',
    ubicacion: 'Pozo de Drenaje Fondo Mina',
    status: 'OPERATIVO',
    anio: 2018,
    color: 'Naranja',
  },
  // Minera Los Pinos
  {
    id: 'mp-01',
    equipo: 'TRACTOR-01 · CAT D8T',
    tipo: 'Tractor de Oruga (Bulldozer)',
    propietarioId: 'minera_pinos',
    propietarioNombre: 'Minera Los Pinos',
    marca: 'Caterpillar',
    modelo: 'D8T Waste Handler',
    serial: 'CAT-D8T-9011',
    placa: 'MP-DOZ-01',
    horometro: 6700,
    combustible: 'Diesel',
    consumoPorHora: 42,
    operador: 'Vicente Morales',
    ubicacion: 'Escombrera y Nivelación Norte',
    status: 'OPERATIVO',
    anio: 2019,
    color: 'Amarillo',
  },
  {
    id: 'mp-02',
    equipo: 'VOL-03 · MERCEDES ACTROS',
    tipo: 'Camión Volteo',
    propietarioId: 'minera_pinos',
    propietarioNombre: 'Minera Los Pinos',
    marca: 'Mercedes-Benz',
    modelo: 'Actros 3340K',
    serial: 'MB-ACT-3340-02',
    placa: 'A92MN4B',
    horometro: 5930,
    combustible: 'Diesel',
    consumoPorHora: 23,
    operador: 'Sin asignar',
    ubicacion: 'Galpón Los Pinos',
    status: 'INACTIVO',
    anio: 2016,
    color: 'Gris Plata',
  },
  // Equipos Bolívar
  {
    id: 'eb-01',
    equipo: 'EXC-04 · HYUNDAI ROBEX 220',
    tipo: 'Excavadora',
    propietarioId: 'maquinarias_bolivar',
    propietarioNombre: 'Equipos & Maquinaria Bolívar',
    marca: 'Hyundai',
    modelo: 'Robex 220LC-9S',
    serial: 'HYN-R220-410',
    placa: 'EB-EXC-01',
    horometro: 4320,
    combustible: 'Diesel',
    consumoPorHora: 27,
    operador: 'Gabriel Soto',
    ubicacion: 'Zanja de Drenaje Perimetral',
    status: 'OPERATIVO',
    anio: 2021,
    color: 'Amarillo / Negro',
  },
  // Sin propietario
  {
    id: 'sp-01',
    equipo: 'MINICARG-01 · BOBCAT S650',
    tipo: 'Minicargador',
    propietarioId: 'sin_propietario',
    propietarioNombre: 'Sin Propietario Asignado',
    marca: 'Bobcat',
    modelo: 'S650 High Flow',
    serial: 'BOB-S650-128',
    placa: 'S/P-01',
    horometro: 1980,
    combustible: 'Diesel',
    consumoPorHora: 11,
    operador: 'Almacén Los Pinos',
    ubicacion: 'Galpón de Materiales',
    status: 'OPERATIVO',
    anio: 2022,
    color: 'Blanco / Naranja',
  },
];

export default function MaquetaPropietariosMindmap() {
  // Modo de navegación: 'mindmap' (mapa mental) o 'directo' (control de maquinaria directo)
  const [modoEntrada, setModoEntrada] = useState<'mindmap' | 'directo'>('mindmap');

  // Propietario seleccionado en el mapa mental: 'GENERAL' o ID del propietario
  const [propietarioSel, setPropietarioSel] = useState<string>('GENERAL');

  // Búsqueda y filtros para la vista de maquinaria (SIN SERVICIOS)
  const [busqueda, setBusqueda] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [vistaModo, setVistaModo] = useState<'cards' | 'tabla'>('cards');
  const [equipoModal, setEquipoModal] = useState<EquipoDemo | null>(null);

  // Intentar cargar equipos reales de la base de datos si existen
  const [equiposReales, setEquiposReales] = useState<MaquinariaEquipo[]>([]);
  const [cargandoBD, setCargandoBD] = useState(false);

  useEffect(() => {
    let cancel = false;
    setCargandoBD(true);
    listEquipos()
      .then((data) => {
        if (!cancel && data && data.length > 0) {
          setEquiposReales(data);
        }
      })
      .catch(() => {
        // En maqueta, continuamos tranquilamente con el catálogo enriquecido
      })
      .finally(() => {
        if (!cancel) setCargandoBD(false);
      });
    return () => { cancel = true; };
  }, []);

  // Consolidar datos de propietarios y equipos
  const { propietarios, todosEquipos } = useMemo(() => {
    const equiposList: EquipoDemo[] = [...EQUIPOS_DEMO];

    // Integrar equipos de la base de datos real si existen
    if (equiposReales.length > 0) {
      equiposReales.forEach((er) => {
        const propNombre = er.propietario?.trim() || 'Sin Propietario Asignado';
        const propId = propNombre.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const st = (er.status || '').toUpperCase();
        const statusReal = st.includes('TALLER') || st.includes('MANT') ? 'EN TALLER' : st.includes('INACT') ? 'INACTIVO' : 'OPERATIVO';

        equiposList.push({
          id: er.id,
          equipo: er.equipo,
          tipo: er.tipo || 'Maquinaria',
          propietarioId: propId,
          propietarioNombre: propNombre,
          marca: er.marca || '—',
          modelo: er.modelo || '—',
          serial: er.serial || '—',
          placa: er.placa || '—',
          horometro: er.mantenimiento_base_hrs || 0,
          combustible: er.combustible || 'Diesel',
          consumoPorHora: er.litros_consume || 25,
          operador: er.encargado_responsable || 'Por asignar',
          ubicacion: er.ubicacion || 'Mina',
          status: statusReal,
          anio: er.anio || 2020,
          color: er.color || 'Amarillo',
        });
      });
    }

    // Calcular estadísticas por propietario
    const propsMap = new Map<string, PropietarioData>();
    PROPIETARIOS_DEMO.forEach((p) => {
      propsMap.set(p.id, { ...p, totalEquipos: 0, operativos: 0, taller: 0, inactivos: 0 });
    });

    equiposList.forEach((eq) => {
      let p = propsMap.get(eq.propietarioId);
      if (!p) {
        p = {
          id: eq.propietarioId,
          nombre: eq.propietarioNombre,
          categoria: 'Asociado',
          icono: '🚜',
          color: '#38bdf8',
          contacto: 'Operador / Dueño',
          telefono: '—',
          totalEquipos: 0,
          operativos: 0,
          taller: 0,
          inactivos: 0,
        };
        propsMap.set(eq.propietarioId, p);
      }
      p.totalEquipos++;
      if (eq.status === 'OPERATIVO') p.operativos++;
      else if (eq.status === 'EN TALLER') p.taller++;
      else p.inactivos++;
    });

    return {
      propietarios: Array.from(propsMap.values()),
      todosEquipos: equiposList,
    };
  }, []);

  // Propietario actualmente activo
  const propietarioActivo = useMemo(() => {
    if (propietarioSel === 'GENERAL') {
      const totOp = todosEquipos.filter((e) => e.status === 'OPERATIVO').length;
      const totTal = todosEquipos.filter((e) => e.status === 'EN TALLER').length;
      const totIna = todosEquipos.filter((e) => e.status === 'INACTIVO').length;
      return {
        id: 'GENERAL',
        nombre: 'GENERAL · Flota Consolidada',
        categoria: 'Propio' as const,
        icono: '👑',
        color: '#f59e0b',
        contacto: 'Dirección General de Operaciones',
        telefono: '+58 286 000-1127',
        totalEquipos: todosEquipos.length,
        operativos: totOp,
        taller: totTal,
        inactivos: totIna,
      };
    }
    return propietarios.find((p) => p.id === propietarioSel) || propietarios[0];
  }, [propietarioSel, propietarios, todosEquipos]);

  // Lista de tipos únicos para el selector de filtro
  const tiposUnicos = useMemo(() => {
    return Array.from(new Set(todosEquipos.map((e) => e.tipo))).sort();
  }, [todosEquipos]);

  // Filtrado de máquinas del propietario seleccionado (o general)
  const equiposFiltrados = useMemo(() => {
    return todosEquipos.filter((eq) => {
      // Filtro de propietario
      if (propietarioSel !== 'GENERAL' && eq.propietarioId !== propietarioSel) {
        return false;
      }
      // Filtro de estatus
      if (filtroStatus !== 'todos' && eq.status !== filtroStatus) {
        return false;
      }
      // Filtro de tipo
      if (filtroTipo !== 'todos' && eq.tipo !== filtroTipo) {
        return false;
      }
      // Filtro de búsqueda
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const texto = `${eq.equipo} ${eq.marca} ${eq.modelo} ${eq.serial} ${eq.placa} ${eq.operador} ${eq.ubicacion}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [todosEquipos, propietarioSel, filtroStatus, filtroTipo, busqueda]);

  // Coordenadas calculadas para los nodos del mapa mental en forma de estrella/radial
  // Nodo central está en (500, 320), y los propietarios se colocan en un semicírculo/anillo
  const radioX = 350;
  const radioY = 220;
  const centroX = 500;
  const centroY = 320;

  const nodosPosiciones = useMemo(() => {
    const total = propietarios.length;
    return propietarios.map((prop, idx) => {
      // Distribuir en círculo completo con ligero ángulo
      const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
      const x = Math.round(centroX + radioX * Math.cos(angle));
      const y = Math.round(centroY + radioY * Math.sin(angle));
      return { ...prop, x, y };
    });
  }, [propietarios]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', padding: '1.25rem 1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* ========================================================
          BARRA SUPERIOR: MAQUETA / ENCABEZADO Y ELECCIÓN DE ENTRADA
          ======================================================== */}
      <header style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
        border: '1px solid rgba(234, 179, 8, 0.3)',
        borderRadius: '16px',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.35rem' }}>
              <span style={{ fontSize: '1.6rem' }}>🚜</span>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                Control de Maquinaria · <span style={{ color: '#eab308' }}>Catálogo de Propietarios</span>
              </h1>
              <span style={{
                background: 'linear-gradient(90deg, #ca8a04, #eab308)',
                color: '#000',
                padding: '.2rem .6rem',
                borderRadius: '999px',
                fontSize: '.75rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
              }}>
                MAQUETA /DOSC
              </span>
              {cargandoBD && <span style={{ fontSize: '.75rem', color: '#94a3b8' }}>⏳ Sincronizando equipos…</span>}
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '.9rem', maxWidth: 780 }}>
              Flujo previo con mapa mental de propietarios desprendido del centro <strong>GENERAL</strong>.
              Dentro de cada propietario se visualiza el control de flota <strong style={{ color: '#38bdf8' }}>100% libre de servicios</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
            <Link
              to="/app/maquinaria"
              className="btn btn-ghost"
              style={{
                borderColor: 'rgba(148, 163, 184, 0.3)',
                color: '#cbd5e1',
                padding: '.5rem 1rem',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '.88rem',
              }}
            >
              ← Ir a Módulo Producción (PC)
            </Link>
          </div>
        </div>

        {/* ========================================================
            SELECTOR DE LAS DOS OPCIONES QUE TIENEN LOS USUARIOS
            ======================================================== */}
        <div style={{
          marginTop: '1.25rem',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(148, 163, 184, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div>
            <div style={{ fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.06em', color: '#94a3b8', fontWeight: 700, marginBottom: '.35rem' }}>
              Elige cómo deseas entrar al módulo:
            </div>
            <div style={{ display: 'inline-flex', background: '#090d16', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                onClick={() => setModoEntrada('mindmap')}
                style={{
                  background: modoEntrada === 'mindmap' ? 'linear-gradient(135deg, #eab308, #ca8a04)' : 'transparent',
                  color: modoEntrada === 'mindmap' ? '#000' : '#cbd5e1',
                  border: 'none',
                  padding: '.55rem 1.15rem',
                  borderRadius: '9px',
                  fontWeight: 700,
                  fontSize: '.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.5rem',
                  transition: 'all 0.2s ease',
                  boxShadow: modoEntrada === 'mindmap' ? '0 4px 14px rgba(234, 179, 8, 0.35)' : 'none',
                }}
              >
                <span>🗺️</span>
                <span>1. Catálogo Completo (Mapa Mental)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModoEntrada('directo');
                  setPropietarioSel('GENERAL');
                }}
                style={{
                  background: modoEntrada === 'directo' ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'transparent',
                  color: modoEntrada === 'directo' ? '#fff' : '#cbd5e1',
                  border: 'none',
                  padding: '.55rem 1.15rem',
                  borderRadius: '9px',
                  fontWeight: 700,
                  fontSize: '.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.5rem',
                  transition: 'all 0.2s ease',
                  boxShadow: modoEntrada === 'directo' ? '0 4px 14px rgba(59, 130, 246, 0.35)' : 'none',
                }}
              >
                <span>🚜</span>
                <span>2. Entrada Directa a Maquinaria</span>
              </button>
            </div>
          </div>

          <div style={{ fontSize: '.82rem', color: '#94a3b8', background: 'rgba(255,255,255,0.04)', padding: '.45rem .85rem', borderRadius: '8px' }}>
            {modoEntrada === 'mindmap' ? (
              <span>💡 <strong>Opción 1 activa:</strong> Explora primero los propietarios en el mapa radial para segmentar o haz clic en GENERAL para todo.</span>
            ) : (
              <span>⚡ <strong>Opción 2 activa:</strong> Los usuarios que lo deseen van directo al listado de maquinaria sin pasar por el mapa.</span>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================
          VISTA 1: MAPA MENTAL RADIAL (SI MODO ES 'mindmap')
          ======================================================== */}
      {modoEntrada === 'mindmap' && (
        <section style={{
          background: 'radial-gradient(ellipse at center, #1e293b 0%, #090d16 100%)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: '20px',
          padding: '1.5rem',
          marginBottom: '2rem',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 50px rgba(0,0,0,0.5)',
        }}>
          {/* Header del lienzo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
              <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>Mapa Mental de Propietarios · Centro GENERAL</strong>
              <span style={{ fontSize: '.8rem', color: '#94a3b8' }}>(Haz clic en el centro o en cualquier propietario para filtrar la flota)</span>
            </div>

            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setPropietarioSel('GENERAL')}
                className={`btn btn-sm ${propietarioSel === 'GENERAL' ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  fontSize: '.82rem',
                  borderRadius: '999px',
                  padding: '.3rem .85rem',
                  borderColor: propietarioSel === 'GENERAL' ? 'transparent' : 'rgba(234, 179, 8, 0.5)',
                  color: propietarioSel === 'GENERAL' ? '#000' : '#facc15',
                }}
              >
                👑 Ver Flota GENERAL
              </button>
            </div>
          </div>

          {/* Canvas SVG interactivo para escritorio y pantallas medianas */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '1000px',
            margin: '0 auto',
            height: '620px',
            borderRadius: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            {/* SVG con líneas conectoras Bezier */}
            <svg
              viewBox="0 0 1000 640"
              style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
              }}
            >
              <defs>
                {/* Gradiente dorado para nodo central */}
                <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </radialGradient>
                {/* Gradiente de líneas */}
                <linearGradient id="lineGold" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#eab308" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.4" />
                </linearGradient>
              </defs>

              {/* Círculo de radiación visual de fondo */}
              <circle cx={centroX} cy={centroY} r="320" fill="none" stroke="rgba(234, 179, 8, 0.08)" strokeDasharray="6 6" />
              <circle cx={centroX} cy={centroY} r="200" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="4 4" />
              <circle cx={centroX} cy={centroY} r="100" fill="url(#centerGlow)" />

              {/* Líneas conectoras a cada nodo de propietario */}
              {nodosPosiciones.map((p) => {
                const esActivo = propietarioSel === p.id;
                // Curva Bézier suave desde centro a nodo
                const midX = (centroX + p.x) / 2;
                const midY = (centroY + p.y) / 2 - 25;
                const d = `M ${centroX} ${centroY} Q ${midX} ${midY} ${p.x} ${p.y}`;
                return (
                  <g key={`link-${p.id}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={esActivo ? p.color : 'rgba(148, 163, 184, 0.25)'}
                      strokeWidth={esActivo ? 4 : 2}
                      strokeDasharray={esActivo ? 'none' : '4 4'}
                      style={{ transition: 'all 0.3s ease' }}
                    />
                    {esActivo && (
                      <circle cx={midX} cy={midY} r="4" fill={p.color}>
                        <animate attributeName="r" values="3;6;3" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* NODO CENTRAL: GENERAL (Flota completa) */}
            <div
              onClick={() => setPropietarioSel('GENERAL')}
              style={{
                position: 'absolute',
                top: `${centroY}px`,
                left: `${centroX}px`,
                transform: 'translate(-50%, -50%)',
                width: '180px',
                height: '180px',
                borderRadius: '50%',
                background: propietarioSel === 'GENERAL'
                  ? 'radial-gradient(circle, #854d0e 0%, #1e1b4b 90%)'
                  : 'radial-gradient(circle, #1e293b 0%, #090d16 90%)',
                border: propietarioSel === 'GENERAL'
                  ? '4px solid #facc15'
                  : '3px solid rgba(234, 179, 8, 0.5)',
                boxShadow: propietarioSel === 'GENERAL'
                  ? '0 0 35px rgba(250, 204, 21, 0.6), inset 0 0 20px rgba(250, 204, 21, 0.4)'
                  : '0 0 20px rgba(0, 0, 0, 0.6)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                cursor: 'pointer',
                zIndex: 10,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                padding: '10px',
              }}
              title="Haz clic para ver toda la maquinaria por GENERAL"
            >
              <span style={{ fontSize: '2rem', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}>👑</span>
              <div style={{
                fontWeight: 900,
                fontSize: '1.05rem',
                color: '#facc15',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginTop: '2px',
              }}>
                GENERAL
              </div>
              <div style={{ fontSize: '.72rem', color: '#e2e8f0', fontWeight: 600 }}>
                Toda la Flota
              </div>
              <div style={{
                marginTop: '6px',
                background: 'rgba(0,0,0,0.5)',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '.75rem',
                fontWeight: 700,
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                {todosEquipos.length} Máquinas
              </div>
              <div style={{ fontSize: '.65rem', color: '#4ade80', marginTop: '3px', fontWeight: 600 }}>
                {todosEquipos.filter((e) => e.status === 'OPERATIVO').length} Operativas
              </div>
            </div>

            {/* NODOS DE PROPIETARIOS (Periféricos) */}
            {nodosPosiciones.map((prop) => {
              const esActivo = propietarioSel === prop.id;
              return (
                <div
                  key={prop.id}
                  onClick={() => setPropietarioSel(prop.id)}
                  style={{
                    position: 'absolute',
                    top: `${prop.y}px`,
                    left: `${prop.x}px`,
                    transform: 'translate(-50%, -50%)',
                    width: '160px',
                    borderRadius: '14px',
                    backgroundColor: esActivo ? 'rgba(30, 41, 59, 0.98)' : 'rgba(15, 23, 42, 0.88)',
                    border: `2px solid ${esActivo ? prop.color : 'rgba(148, 163, 184, 0.25)'}`,
                    boxShadow: esActivo
                      ? `0 0 25px ${prop.color}55, 0 8px 20px rgba(0,0,0,0.6)`
                      : '0 6px 16px rgba(0,0,0,0.4)',
                    padding: '.75rem .65rem',
                    cursor: 'pointer',
                    zIndex: esActivo ? 8 : 4,
                    transition: 'all 0.25s ease',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', marginBottom: '.3rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{prop.icono}</span>
                    <span style={{
                      fontSize: '.62rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      color: prop.color,
                      letterSpacing: '.04em',
                    }}>
                      {prop.categoria}
                    </span>
                  </div>

                  <div style={{
                    fontSize: '.82rem',
                    fontWeight: 700,
                    color: esActivo ? '#fff' : '#e2e8f0',
                    lineHeight: 1.2,
                    marginBottom: '.4rem',
                    minHeight: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {prop.nombre}
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    padding: '.25rem .5rem',
                    borderRadius: '8px',
                    fontSize: '.72rem',
                  }}>
                    <strong style={{ color: prop.color }}>{prop.totalEquipos} eq.</strong>
                    <span style={{ color: '#4ade80' }}>{prop.operativos} op.</span>
                  </div>

                  {esActivo && (
                    <div style={{
                      marginTop: '.4rem',
                      fontSize: '.68rem',
                      fontWeight: 800,
                      color: '#000',
                      backgroundColor: prop.color,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
                    }}>
                      ✓ Seleccionado
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Versión móvil/chips de acceso rápido para pantallas pequeñas */}
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em', color: '#94a3b8', fontWeight: 700, marginBottom: '.5rem' }}>
              Propietarios disponibles (toca para cambiar):
            </div>
            <div style={{ display: 'flex', gap: '.5rem', overflowX: 'auto', paddingBottom: '.5rem' }}>
              <button
                type="button"
                onClick={() => setPropietarioSel('GENERAL')}
                className={`btn btn-sm ${propietarioSel === 'GENERAL' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: '999px', whiteSpace: 'nowrap', fontSize: '.82rem', padding: '.4rem .9rem' }}
              >
                👑 GENERAL ({todosEquipos.length})
              </button>
              {propietarios.map((p) => {
                const activo = propietarioSel === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPropietarioSel(p.id)}
                    style={{
                      background: activo ? p.color : 'rgba(30, 41, 59, 0.7)',
                      color: activo ? '#000' : '#e2e8f0',
                      border: `1px solid ${activo ? p.color : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                      fontSize: '.82rem',
                      padding: '.4rem .85rem',
                      fontWeight: activo ? 800 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {p.icono} {p.nombre} ({p.totalEquipos})
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          VISTA 2: CONTROL DE MAQUINARIA (SIN NADA DE SERVICIOS)
          ======================================================== */}
      <main style={{
        background: '#1e293b',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '20px',
        padding: '1.5rem',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)',
      }}>
        
        {/* Banner del Propietario Seleccionado */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '1.25rem',
          borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
          marginBottom: '1.5rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.25rem' }}>
              <span style={{ fontSize: '1.8rem' }}>{propietarioActivo.icono}</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc' }}>
                  {propietarioActivo.nombre}
                </h2>
                <div style={{ fontSize: '.82rem', color: '#94a3b8' }}>
                  Tipo: <strong style={{ color: propietarioActivo.color }}>{propietarioActivo.categoria}</strong> · Contacto: {propietarioActivo.contacto} ({propietarioActivo.telefono})
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            <div style={{ background: '#0f172a', padding: '.45rem .85rem', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Total Maquinaria</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>{propietarioActivo.totalEquipos}</div>
            </div>
            <div style={{ background: '#0f172a', padding: '.45rem .85rem', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
              <div style={{ fontSize: '.7rem', color: '#4ade80', textTransform: 'uppercase' }}>Operativas</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#4ade80' }}>{propietarioActivo.operativos}</div>
            </div>
            <div style={{ background: '#0f172a', padding: '.45rem .85rem', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <div style={{ fontSize: '.7rem', color: '#f59e0b', textTransform: 'uppercase' }}>En Taller</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b' }}>{propietarioActivo.taller}</div>
            </div>
            <div style={{ background: '#0f172a', padding: '.45rem .85rem', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ fontSize: '.7rem', color: '#ef4444', textTransform: 'uppercase' }}>Inactivas</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ef4444' }}>{propietarioActivo.inactivos}</div>
            </div>
          </div>
        </div>

        {/* ========================================================
            BARRA DE FILTROS Y BÚSQUEDA (CERO SERVICIOS)
            ======================================================== */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '.75rem',
          marginBottom: '1.25rem',
        }}>
          {/* Buscador de máquinas */}
          <div style={{ flex: '1 1 280px', maxWidth: '420px', position: 'relative' }}>
            <input
              type="text"
              className="input"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="🔍 Buscar por equipo, modelo, serial, operador o ubicación…"
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                color: '#fff',
                borderColor: 'rgba(148, 163, 184, 0.3)',
                paddingLeft: '1rem',
                borderRadius: '10px',
              }}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtros rápidos: Estado y Tipo */}
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="select"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              style={{ backgroundColor: '#0f172a', color: '#fff', borderColor: 'rgba(148, 163, 184, 0.3)', borderRadius: '10px', fontSize: '.85rem' }}
            >
              <option value="todos">Todos los Estados</option>
              <option value="OPERATIVO">🟢 Solo Operativos</option>
              <option value="EN TALLER">🟠 En Taller / Mant.</option>
              <option value="INACTIVO">🔴 Inactivos</option>
            </select>

            <select
              className="select"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              style={{ backgroundColor: '#0f172a', color: '#fff', borderColor: 'rgba(148, 163, 184, 0.3)', borderRadius: '10px', fontSize: '.85rem' }}
            >
              <option value="todos">Todos los Tipos</option>
              {tiposUnicos.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {/* Alternador de vista: Cards vs Tabla */}
            <div style={{ display: 'inline-flex', background: '#0f172a', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', padding: '2px' }}>
              <button
                type="button"
                onClick={() => setVistaModo('cards')}
                style={{
                  background: vistaModo === 'cards' ? '#334155' : 'transparent',
                  color: vistaModo === 'cards' ? '#fff' : '#94a3b8',
                  border: 'none',
                  padding: '.35rem .65rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '.82rem',
                }}
                title="Vista en tarjetas"
              >
                🎴 Cuadrícula
              </button>
              <button
                type="button"
                onClick={() => setVistaModo('tabla')}
                style={{
                  background: vistaModo === 'tabla' ? '#334155' : 'transparent',
                  color: vistaModo === 'tabla' ? '#fff' : '#94a3b8',
                  border: 'none',
                  padding: '.35rem .65rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '.82rem',
                }}
                title="Vista en tabla"
              >
                📑 Tabla
              </button>
            </div>
          </div>
        </div>

        {/* Nota explicativa de no servicios */}
        <div style={{
          backgroundColor: 'rgba(56, 189, 248, 0.08)',
          borderLeft: '4px solid #38bdf8',
          padding: '.6rem 1rem',
          borderRadius: '0 8px 8px 0',
          fontSize: '.82rem',
          color: '#bae6fd',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '.5rem',
        }}>
          <div>
            <strong>🛡️ Vista Pura de Control de Maquinaria:</strong> Mostrando {equiposFiltrados.length} equipo(s).
            Se excluyen intencionalmente órdenes de servicio, mantenimientos preventivos y solicitudes de piezas.
          </div>
          {propietarioSel !== 'GENERAL' && (
            <button
              type="button"
              onClick={() => setPropietarioSel('GENERAL')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#facc15',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '.82rem',
                textDecoration: 'underline',
              }}
            >
              ← Volver a Flota General
            </button>
          )}
        </div>

        {/* ========================================================
            MODO 1: CUADRÍCULA DE TARJETAS (CARDS)
            ======================================================== */}
        {vistaModo === 'cards' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: '1.15rem',
          }}>
            {!equiposFiltrados.length && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>🚜</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>No se encontraron máquinas</div>
                <div>Intenta ajustar los términos de búsqueda o los filtros de estado/tipo.</div>
              </div>
            )}

            {equiposFiltrados.map((eq) => {
              const esOperativo = eq.status === 'OPERATIVO';
              const esTaller = eq.status === 'EN TALLER';
              const statusColor = esOperativo ? '#10b981' : esTaller ? '#f59e0b' : '#ef4444';
              const statusBg = esOperativo ? 'rgba(16, 185, 129, 0.15)' : esTaller ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)';

              return (
                <div
                  key={eq.id}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '14px',
                    padding: '1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'transform 0.2s ease, border-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  }}
                >
                  <div>
                    {/* Header de la tarjeta */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem', marginBottom: '.65rem' }}>
                      <div>
                        <div style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '.04em' }}>
                          {eq.tipo}
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.25 }}>
                          {eq.equipo}
                        </div>
                      </div>

                      <span style={{
                        backgroundColor: statusBg,
                        color: statusColor,
                        border: `1px solid ${statusColor}44`,
                        padding: '.2rem .55rem',
                        borderRadius: '999px',
                        fontSize: '.72rem',
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                      }}>
                        {eq.status}
                      </span>
                    </div>

                    {/* Especificaciones clave */}
                    <div style={{ fontSize: '.82rem', color: '#cbd5e1', marginBottom: '.75rem', lineHeight: 1.4 }}>
                      <div><strong>Marca / Modelo:</strong> {eq.marca} · {eq.modelo} ({eq.anio})</div>
                      <div><strong>Serial:</strong> <span style={{ fontFamily: 'monospace' }}>{eq.serial}</span> · <strong>Placa:</strong> {eq.placa}</div>
                      <div><strong>Propietario:</strong> <span style={{ color: '#facc15' }}>{eq.propietarioNombre}</span></div>
                    </div>

                    {/* Ficha técnica rápida / Indicadores */}
                    <div style={{
                      backgroundColor: 'rgba(30, 41, 59, 0.7)',
                      borderRadius: '8px',
                      padding: '.65rem',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '.5rem',
                      fontSize: '.78rem',
                      marginBottom: '.75rem',
                    }}>
                      <div>
                        <div style={{ color: '#94a3b8' }}>⏱️ Horómetro</div>
                        <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '.9rem' }}>{eq.horometro.toLocaleString()} hrs</div>
                      </div>
                      <div>
                        <div style={{ color: '#94a3b8' }}>⛽ Consumo est.</div>
                        <div style={{ fontWeight: 700, color: '#f8fafc' }}>{eq.consumoPorHora} L/hr</div>
                      </div>
                      <div style={{ gridColumn: '1/-1' }}>
                        <div style={{ color: '#94a3b8' }}>👤 Operador actual</div>
                        <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{eq.operador}</div>
                      </div>
                      <div style={{ gridColumn: '1/-1' }}>
                        <div style={{ color: '#94a3b8' }}>📍 Ubicación</div>
                        <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{eq.ubicacion}</div>
                      </div>
                    </div>
                  </div>

                  {/* Botón de acción: Ficha del equipo (SIN SERVICIOS) */}
                  <div style={{ paddingTop: '.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                      type="button"
                      onClick={() => setEquipoModal(eq)}
                      style={{
                        width: '100%',
                        backgroundColor: '#1e293b',
                        color: '#f8fafc',
                        border: '1px solid rgba(148, 163, 184, 0.3)',
                        padding: '.45rem',
                        borderRadius: '8px',
                        fontSize: '.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '.4rem',
                      }}
                    >
                      <span>🔍</span>
                      <span>Ver Ficha Técnica Completa</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ========================================================
            MODO 2: TABLA DETALLADA DE EQUIPOS
            ======================================================== */}
        {vistaModo === 'tabla' && (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '.84rem', color: '#f8fafc' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(148, 163, 184, 0.3)', color: '#94a3b8' }}>
                  <th>Equipo</th>
                  <th>Tipo</th>
                  <th>Propietario</th>
                  <th>Marca / Modelo</th>
                  <th>Serial / Placa</th>
                  <th>Horómetro</th>
                  <th>Operador Asignado</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                  <th>Ficha</th>
                </tr>
              </thead>
              <tbody>
                {equiposFiltrados.map((eq) => {
                  const esOperativo = eq.status === 'OPERATIVO';
                  const esTaller = eq.status === 'EN TALLER';
                  const statusColor = esOperativo ? '#10b981' : esTaller ? '#f59e0b' : '#ef4444';
                  return (
                    <tr key={eq.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td><strong>{eq.equipo}</strong></td>
                      <td>{eq.tipo}</td>
                      <td><span style={{ color: '#facc15' }}>{eq.propietarioNombre}</span></td>
                      <td>{eq.marca} {eq.modelo}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '.78rem' }}>{eq.serial} ({eq.placa})</td>
                      <td style={{ fontWeight: 700, color: '#38bdf8' }}>{eq.horometro.toLocaleString()} hrs</td>
                      <td>{eq.operador}</td>
                      <td>{eq.ubicacion}</td>
                      <td>
                        <span style={{ color: statusColor, fontWeight: 800, fontSize: '.78rem' }}>
                          ● {eq.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setEquipoModal(eq)}
                          style={{ fontSize: '.75rem', padding: '.2rem .5rem' }}
                        >
                          Ficha
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ========================================================
          MODAL: FICHA TÉCNICA DEL EQUIPO (SIN SERVICIOS)
          ======================================================== */}
      {equipoModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 100,
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#facc15' }}>
                  Ficha Técnica · Control de Activo
                </div>
                <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>
                  {equipoModal.equipo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEquipoModal(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem',
              backgroundColor: '#0f172a',
              padding: '1.15rem',
              borderRadius: '12px',
              marginBottom: '1.25rem',
              fontSize: '.85rem',
            }}>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Empresa / Propietario</span>
                <strong style={{ color: '#facc15' }}>{equipoModal.propietarioNombre}</strong>
              </div>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Tipo de Maquinaria</span>
                <strong>{equipoModal.tipo}</strong>
              </div>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Marca y Modelo</span>
                <strong>{equipoModal.marca} · {equipoModal.modelo}</strong>
              </div>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Año y Color</span>
                <strong>{equipoModal.anio} · {equipoModal.color}</strong>
              </div>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Serial de Chasis / Bastidor</span>
                <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{equipoModal.serial}</span>
              </div>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Placa / Identificador</span>
                <strong>{equipoModal.placa}</strong>
              </div>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Horómetro Actual</span>
                <strong style={{ color: '#38bdf8', fontSize: '1rem' }}>{equipoModal.horometro.toLocaleString()} horas</strong>
              </div>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Combustible</span>
                <strong>{equipoModal.combustible} ({equipoModal.consumoPorHora} L/hr)</strong>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Operador Responsable</span>
                <strong>{equipoModal.operador}</strong>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <span className="muted" style={{ display: 'block', fontSize: '.75rem', color: '#94a3b8' }}>Ubicación Asignada</span>
                <strong>{equipoModal.ubicacion}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.6rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setEquipoModal(null)}
                style={{ padding: '.5rem 1.25rem' }}
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
