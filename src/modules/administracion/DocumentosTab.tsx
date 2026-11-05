/* ============================================================
   Golden Touch · Administración · Pestaña «Documentos y Permisos»
   (04/11/2026)

   Pilar principal del módulo de Administración para empresas mineras:
     1. Gestión de Documentos y Permisos (Rupdae, Ragda, Mintras, Inces,
        IVSS, Carta Constitutiva, Cédulas de N socios, etc.).
     2. Carpetas organizativas con badges dinámicos de estado.
     3. Dimension de Vencimiento y Caducidad (Vigente, Por Vencer,
        Vencido, Vencido en Trámite, No Vence).
     4. Alertas y advertencias individuales y agrupadas con filtros rápidos.
     5. Carga masiva con Drag & Drop (límite seguro de 10 archivos por intento).
     6. Historial ligero de auditoría por documento (quién modificó qué y cuándo).
     7. Multi-empresa (reacciona al selector de cabecera de la página).
     8. Generación de avisos y alertas ejecutivas para WhatsApp.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { ExportarDocumentosModal } from './ExportarDocumentosModal';
import {
  CARPETAS_DOCUMENTOS,
  ETIQUETA_CARPETA,
  TIPO_DOCUMENTO_LABEL,
  STATUS_VENCIMIENTO_LABEL,
  STATUS_VENCIMIENTO_COLOR,
  diasRestantes,
  inferirCarpetaYTipo,
  type AdminRepo,
  type CarpetaDocumento,
  type DocumentoEmpresa,
  type Empresa,
  type StatusVencimiento,
  type TipoDocumento,
} from './admin.repository';

const MAX_ARCHIVOS_POR_INTENTO = 10;
const MAX_TAMANO_BYTES = 25 * 1024 * 1024; // 25 MB

const fFecha = new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fFechaHora = new Intl.DateTimeFormat('es-VE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function tamanoFmt(b: number | null): string {
  if (!b || b <= 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

interface StagedFile {
  id: string;
  file: File;
  empresaClave: string;
  carpeta: CarpetaDocumento;
  tipo: TipoDocumento;
  nombre: string;
  fechaEmision: string;
  fechaVencimiento: string;
  statusVencimiento: StatusVencimiento;
  socioNombre: string;
  entidadEmisora: string;
  numeroRegistro: string;
  notaTramite: string;
}

export function DocumentosTab({
  repo,
  empresaClave,
  empresas,
  puedeEscribir = true,
}: {
  repo: AdminRepo;
  empresaClave: string | null;
  empresas: Empresa[];
  puedeEscribir?: boolean;
}) {
  const [docs, setDocs] = useState<DocumentoEmpresa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros activos
  const [carpetaActiva, setCarpetaActiva] = useState<string>('todas');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [buscar, setBuscar] = useState('');

  // Drag & drop staging
  const [isDragging, setIsDragging] = useState(false);
  const [archivosEnEspera, setArchivosEnEspera] = useState<StagedFile[] | null>(null);
  const [subiendoLote, setSubiendoLote] = useState(false);
  const [progresoLote, setProgresoLote] = useState<{ actual: number; total: number; nombre: string } | null>(null);

  // Modales
  const [docDetalle, setDocDetalle] = useState<DocumentoEmpresa | null>(null);
  const [docBorrar, setDocBorrar] = useState<DocumentoEmpresa | null>(null);
  const [verAlertaWsp, setVerAlertaWsp] = useState(false);
  const [modalReporte, setModalReporte] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nombreEmpMap = useMemo(() => new Map(empresas.map((e) => [e.clave, e.nombre])), [empresas]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await repo.listDocumentos(empresaClave ?? undefined);
      setDocs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer los documentos.');
    } finally {
      setCargando(false);
    }
  }, [repo, empresaClave]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Recuento de status global para alertas
  const resumenStatus = useMemo(() => {
    let vencidos = 0;
    let enTramite = 0;
    let porVencer = 0;
    let vigentes = 0;
    let noVence = 0;

    for (const d of docs) {
      if (d.statusVencimiento === 'vencido') vencidos += 1;
      else if (d.statusVencimiento === 'vencido_en_tramite') enTramite += 1;
      else if (d.statusVencimiento === 'por_vencer') porVencer += 1;
      else if (d.statusVencimiento === 'vigente') vigentes += 1;
      else noVence += 1;
    }

    return {
      vencidos,
      enTramite,
      porVencer,
      vigentes,
      noVence,
      total: docs.length,
      requierenAtencion: vencidos + enTramite + porVencer,
    };
  }, [docs]);

  // Recuento de archivos y status por carpeta
  const carpetasStats = useMemo(() => {
    const map = new Map<string, { total: number; vencidos: number; enTramite: number; porVencer: number; vigentes: number }>();

    for (const c of CARPETAS_DOCUMENTOS) {
      map.set(c.id, { total: 0, vencidos: 0, enTramite: 0, porVencer: 0, vigentes: 0 });
    }

    for (const d of docs) {
      const cKey = d.carpeta || 'otros';
      const stat = map.get(cKey) || { total: 0, vencidos: 0, enTramite: 0, porVencer: 0, vigentes: 0 };
      stat.total += 1;
      if (d.statusVencimiento === 'vencido') stat.vencidos += 1;
      else if (d.statusVencimiento === 'vencido_en_tramite') stat.enTramite += 1;
      else if (d.statusVencimiento === 'por_vencer') stat.porVencer += 1;
      else if (d.statusVencimiento === 'vigente') stat.vigentes += 1;
      map.set(cKey, stat);
    }

    return map;
  }, [docs]);

  // Lista de documentos filtrada
  const docsFiltrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return docs.filter((d) => {
      // Filtro por carpeta
      if (carpetaActiva !== 'todas' && d.carpeta !== carpetaActiva) return false;

      // Filtro por status
      if (filtroStatus === 'atencion' && !['vencido', 'vencido_en_tramite', 'por_vencer'].includes(d.statusVencimiento)) return false;
      if (filtroStatus === 'vencido' && d.statusVencimiento !== 'vencido') return false;
      if (filtroStatus === 'vencido_en_tramite' && d.statusVencimiento !== 'vencido_en_tramite') return false;
      if (filtroStatus === 'por_vencer' && d.statusVencimiento !== 'por_vencer') return false;
      if (filtroStatus === 'vigente' && d.statusVencimiento !== 'vigente') return false;

      // Filtro de búsqueda
      if (q) {
        const texto = `${d.nombre} ${d.tipo} ${d.carpeta} ${d.socioNombre ?? ''} ${d.entidadEmisora ?? ''} ${d.numeroRegistro ?? ''} ${d.notaTramite ?? ''}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }

      return true;
    });
  }, [docs, carpetaActiva, filtroStatus, buscar]);

  // Manejo de Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!puedeEscribir) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const procesarArchivosSeleccionados = (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    if (!rawFiles.length) return;

    if (rawFiles.length > MAX_ARCHIVOS_POR_INTENTO) {
      toast(
        `Has seleccionado ${rawFiles.length} archivos. Se procesarán los primeros ${MAX_ARCHIVOS_POR_INTENTO} para garantizar la estabilidad del sistema.`,
        'warning',
      );
    }

    const permitidos = rawFiles.slice(0, MAX_ARCHIVOS_POR_INTENTO);
    const validos: StagedFile[] = [];

    for (const f of permitidos) {
      if (f.size > MAX_TAMANO_BYTES) {
        toast(`«${f.name}» supera el límite de 25 MB y fue omitido.`, 'error');
        continue;
      }

      const { carpeta, tipo } = inferirCarpetaYTipo(f.name);
      validos.push({
        id: `staged-${Math.random().toString(36).slice(2)}`,
        file: f,
        empresaClave: empresaClave || empresas[0]?.clave || 'GT',
        carpeta,
        tipo,
        nombre: f.name,
        fechaEmision: '',
        fechaVencimiento: '',
        statusVencimiento: 'vigente',
        socioNombre: '',
        entidadEmisora: '',
        numeroRegistro: '',
        notaTramite: '',
      });
    }

    if (validos.length > 0) {
      setArchivosEnEspera(validos);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!puedeEscribir) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      procesarArchivosSeleccionados(e.dataTransfer.files);
    }
  };

  // Subir lote confirmado
  const ejecutarSubidaLote = async () => {
    if (!archivosEnEspera || !archivosEnEspera.length) return;
    setSubiendoLote(true);

    let exitosos = 0;
    const total = archivosEnEspera.length;

    for (let i = 0; i < total; i += 1) {
      const item = archivosEnEspera[i];
      setProgresoLote({ actual: i + 1, total, nombre: item.file.name });

      try {
        await repo.subirDocumento(
          item.empresaClave,
          item.tipo,
          item.file,
          {
            nombre: item.nombre,
            carpeta: item.carpeta,
            fechaEmision: item.fechaEmision || null,
            fechaVencimiento: item.fechaVencimiento || null,
            statusVencimiento: item.statusVencimiento,
            socioNombre: item.socioNombre || null,
            entidadEmisora: item.entidadEmisora || null,
            numeroRegistro: item.numeroRegistro || null,
            notaTramite: item.notaTramite || null,
          },
        );
        exitosos += 1;
      } catch (e) {
        toast(`Error al subir «${item.file.name}»: ${e instanceof Error ? e.message : 'falló'}`, 'error');
      }
    }

    setSubiendoLote(false);
    setProgresoLote(null);
    setArchivosEnEspera(null);

    if (exitosos > 0) {
      toast(`Se subieron exitosamente ${exitosos} de ${total} documento(s).`, 'success');
      await cargar();
    }
  };

  // Abrir documento
  const abrirDoc = async (d: DocumentoEmpresa) => {
    try {
      const url = await repo.urlDocumento(d.path);
      if (!url) {
        toast('No se pudo generar enlace de visualización.', 'info');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo abrir el archivo.', 'error');
    }
  };

  // Borrar documento
  const confirmarBorrar = async () => {
    if (!docBorrar) return;
    try {
      await repo.borrarDocumento(docBorrar);
      toast(`Documento «${docBorrar.nombre}» eliminado.`, 'success');
      setDocBorrar(null);
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al eliminar.', 'error');
    }
  };

  // Texto para WhatsApp de Vencimientos
  const textoAlertaWsp = useMemo(() => {
    const nombreEmp = empresaClave ? (nombreEmpMap.get(empresaClave) || empresaClave) : 'Todas las empresas';
    const lines = [
      `🏛️ *GOLDEN TOUCH 1127 C.A. · CONTROL DE VENCIMIENTOS*`,
      `💼 Empresa: *${nombreEmp}*`,
      `📅 Fecha de corte: *${fFecha.format(new Date())}*`,
      '',
      `*ESTADO DE PERMISOLOGÍA Y DOCUMENTOS:*`,
      `🔴 Vencidos (Urgentes): *${resumenStatus.vencidos}*`,
      `🟣 Vencidos en Trámite: *${resumenStatus.enTramite}*`,
      `🟡 Por Vencer (Próximos 30d): *${resumenStatus.porVencer}*`,
      `🟢 Vigentes al Día: *${resumenStatus.vigentes}*`,
      `📁 Total Documentos: *${resumenStatus.total}*`,
      '',
    ];

    const criticos = docs.filter((d) => d.statusVencimiento === 'vencido' || d.statusVencimiento === 'vencido_en_tramite' || d.statusVencimiento === 'por_vencer');
    if (criticos.length > 0) {
      lines.push(`*DOCUMENTOS QUE REQUIEREN ATENCIÓN:*`);
      criticos.slice(0, 15).forEach((d, idx) => {
        const icono = d.statusVencimiento === 'vencido' ? '🔴' : d.statusVencimiento === 'vencido_en_tramite' ? '🟣' : '🟡';
        const dias = diasRestantes(d.fechaVencimiento);
        const diasTxt = dias != null ? (dias < 0 ? `hace ${Math.abs(dias)}d` : `en ${dias}d`) : '';
        const nota = d.notaTramite ? ` [Trámite: ${d.notaTramite}]` : '';
        lines.push(`${idx + 1}. ${icono} *${d.nombre}* (${TIPO_DOCUMENTO_LABEL[d.tipo] || d.tipo}) - ${STATUS_VENCIMIENTO_LABEL[d.statusVencimiento]} ${diasTxt}${nota}`);
      });
      if (criticos.length > 15) {
        lines.push(`_... y ${criticos.length - 15} documento(s) más._`);
      }
    } else {
      lines.push(`✅ *Todos los documentos y permisos se encuentran vigentes y al día.*`);
    }

    lines.push('');
    lines.push(`_Generado automáticamente desde Sistema Golden Touch 1127 C.A._`);
    return lines.join('\n');
  }, [docs, resumenStatus, empresaClave, nombreEmpMap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* 1. SECCIÓN: Banner Resumen de Alertas y Vencimientos */}
      <div
        className="card"
        style={{
          margin: 0,
          padding: '.85rem 1rem',
          background: 'linear-gradient(135deg, var(--surface-2, #182230), var(--surface, #0f172a))',
          border: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '.75rem',
        }}
      >
        <div>
          <div style={{ fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.06em', color: '#ff8a00', fontWeight: 700 }}>
            Semáforo de Vigencias y Permisología
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', marginTop: '.15rem' }}>
            {resumenStatus.requierenAtencion > 0 ? (
              <span>⚠️ Hay <strong style={{ color: '#ef4444' }}>{resumenStatus.vencidos} vencido(s)</strong> y <strong style={{ color: '#f59e0b' }}>{resumenStatus.porVencer} por vencer</strong></span>
            ) : (
              <span style={{ color: '#10b981' }}>✅ Todos los permisos y documentos están al día</span>
            )}
          </div>
          <div className="muted" style={{ fontSize: '.75rem', marginTop: '.2rem' }}>
            {empresaClave ? `Empresa: ${nombreEmpMap.get(empresaClave) || empresaClave}` : 'Consolidado multiempresa'} · {docs.length} documentos registrados
          </div>
        </div>

        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModalReporte(true)}
            disabled={docs.length === 0}
            style={{ background: '#ff8a00', color: '#000', fontWeight: 700 }}
            title="Abrir reporte dinámico con fichas ejecutivas, orientación y filtros"
          >
            ✨ Reporte Dinámico / Exportar
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setVerAlertaWsp(true)}
            disabled={docs.length === 0}
            title="Enviar o copiar el informe de vencimientos por WhatsApp"
          >
            💬 Alerta WhatsApp
          </button>
          {puedeEscribir && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              title="Seleccionar archivos desde su equipo"
            >
              ⬆ Subir Archivos
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) procesarArchivosSeleccionados(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Panel emergente de WhatsApp */}
      {verAlertaWsp && (
        <div className="card" style={{ margin: 0, padding: '.85rem', borderColor: '#25D366' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.4rem' }}>
            <strong>💬 Alerta de Vencimientos para WhatsApp</strong>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setVerAlertaWsp(false)}>✕ Cerrar</button>
          </div>
          <CompartirWhatsapp texto={textoAlertaWsp} />
        </div>
      )}

      {/* 2. SECCIÓN: Carpetas con Badges de Estado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.65rem' }}>
        <div
          onClick={() => setCarpetaActiva('todas')}
          className="card"
          style={{
            margin: 0,
            padding: '.65rem .85rem',
            cursor: 'pointer',
            border: carpetaActiva === 'todas' ? '2px solid #ff8a00' : '1px solid var(--border)',
            background: carpetaActiva === 'todas' ? 'rgba(255, 138, 0, 0.08)' : 'var(--surface-1, #0f172a)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '.4rem',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '.86rem', fontWeight: 700, color: 'var(--text)' }}>📂 Todas las Carpetas</span>
            <span className="badge" style={{ fontSize: '.72rem', background: 'rgba(255,255,255,0.08)' }}>{docs.length}</span>
          </div>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
            {resumenStatus.vencidos > 0 && <span className="badge" style={{ ...STATUS_VENCIMIENTO_COLOR.vencido, fontSize: '.68rem' }}>{resumenStatus.vencidos} 🔴</span>}
            {resumenStatus.enTramite > 0 && <span className="badge" style={{ ...STATUS_VENCIMIENTO_COLOR.vencido_en_tramite, fontSize: '.68rem' }}>{resumenStatus.enTramite} 🟣</span>}
            {resumenStatus.porVencer > 0 && <span className="badge" style={{ ...STATUS_VENCIMIENTO_COLOR.por_vencer, fontSize: '.68rem' }}>{resumenStatus.porVencer} 🟡</span>}
            <span className="badge" style={{ ...STATUS_VENCIMIENTO_COLOR.vigente, fontSize: '.68rem' }}>{resumenStatus.vigentes} 🟢</span>
          </div>
        </div>

        {CARPETAS_DOCUMENTOS.map((c) => {
          const stats = carpetasStats.get(c.id) || { total: 0, vencidos: 0, enTramite: 0, porVencer: 0, vigentes: 0 };
          const activa = carpetaActiva === c.id;

          return (
            <div
              key={c.id}
              onClick={() => setCarpetaActiva(c.id)}
              className="card"
              style={{
                margin: 0,
                padding: '.65rem .85rem',
                cursor: 'pointer',
                border: activa ? '2px solid #ff8a00' : '1px solid var(--border)',
                background: activa ? 'rgba(255, 138, 0, 0.08)' : 'var(--surface-1, #0f172a)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '.4rem',
                transition: 'all 0.15s ease',
              }}
              title={c.descripcion}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.3rem' }}>
                <span style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.icon} {c.label}
                </span>
                <span className="badge" style={{ fontSize: '.72rem', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}>
                  {stats.total}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                {stats.vencidos > 0 && <span className="badge" style={{ ...STATUS_VENCIMIENTO_COLOR.vencido, fontSize: '.65rem' }}>{stats.vencidos} 🔴</span>}
                {stats.enTramite > 0 && <span className="badge" style={{ ...STATUS_VENCIMIENTO_COLOR.vencido_en_tramite, fontSize: '.65rem' }}>{stats.enTramite} 🟣</span>}
                {stats.porVencer > 0 && <span className="badge" style={{ ...STATUS_VENCIMIENTO_COLOR.por_vencer, fontSize: '.65rem' }}>{stats.porVencer} 🟡</span>}
                {stats.vigentes > 0 && <span className="badge" style={{ ...STATUS_VENCIMIENTO_COLOR.vigente, fontSize: '.65rem' }}>{stats.vigentes} 🟢</span>}
                {stats.total === 0 && <span className="muted" style={{ fontSize: '.7rem' }}>Vacía</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. SECCIÓN: Drag & Drop Zone */}
      {puedeEscribir && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: isDragging ? '2px dashed #ff8a00' : '2px dashed var(--border)',
            background: isDragging ? 'rgba(255, 138, 0, 0.12)' : 'rgba(255, 255, 255, 0.02)',
            borderRadius: '8px',
            padding: '1.25rem 1rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ fontSize: '1.8rem', marginBottom: '.25rem' }}>📤</div>
          <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--text)' }}>
            Arrastra y suelta tus archivos aquí (PDF o Imágenes)
          </div>
          <div className="muted" style={{ fontSize: '.75rem', marginTop: '.25rem' }}>
            Hasta {MAX_ARCHIVOS_POR_INTENTO} archivos por intento · Máx 25 MB por archivo · El sistema clasifica automáticamente Rupdae, Mintras, Inces, IVSS, Carta Constitutiva, Cédulas, etc.
          </div>
        </div>
      )}

      {/* 4. SECCIÓN: Barra de Búsqueda y Filtro de Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ maxWidth: 280, fontSize: '.8rem', padding: '.3rem .6rem' }}
            placeholder="🔍 Buscar por nombre, socio, N° registro…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
          <button
            type="button"
            className={`btn btn-xs ${filtroStatus === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroStatus('todos')}
          >
            Todos ({docs.length})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filtroStatus === 'atencion' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroStatus('atencion')}
            style={{ color: filtroStatus === 'atencion' ? '#fff' : '#ef4444' }}
          >
            ⚠️ Requieren Atención ({resumenStatus.requierenAtencion})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filtroStatus === 'vencido' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroStatus('vencido')}
          >
            🔴 Vencidos ({resumenStatus.vencidos})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filtroStatus === 'vencido_en_tramite' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroStatus('vencido_en_tramite')}
          >
            🟣 En Trámite ({resumenStatus.enTramite})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filtroStatus === 'por_vencer' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroStatus('por_vencer')}
          >
            🟡 Por Vencer ({resumenStatus.porVencer})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filtroStatus === 'vigente' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroStatus('vigente')}
          >
            🟢 Vigentes ({resumenStatus.vigentes})
          </button>
        </div>

        <span className="muted mono" style={{ fontSize: '.76rem' }}>
          Mostrando {docsFiltrados.length} de {docs.length}
        </span>
      </div>

      {/* 5. SECCIÓN: Listado de Documentos */}
      {error && (
        <div className="adm-aviso">
          No se pudieron leer los documentos: {error}
        </div>
      )}

      {cargando ? (
        <div className="card"><p className="muted">Cargando permisología y documentos…</p></div>
      ) : docs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="📁"
            message="No hay documentos cargados en esta empresa. Arrastra archivos arriba para registrar RUPDAE, MINTRAS, INCES, Carta Constitutiva, etc."
          />
        </div>
      ) : docsFiltrados.length === 0 ? (
        <div className="card"><p className="muted">Ningún documento coincide con el filtro o la carpeta seleccionada.</p></div>
      ) : (
        <div className="adm-tabla">
          <table>
            <thead>
              <tr>
                <th>Documento / Archivo</th>
                <th>Carpeta</th>
                <th>Vigencia / Vencimiento</th>
                <th>Socio / Organismo</th>
                <th>Tamaño</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {docsFiltrados.map((d) => {
                const statusStyle = STATUS_VENCIMIENTO_COLOR[d.statusVencimiento];
                const dias = diasRestantes(d.fechaVencimiento);

                return (
                  <tr key={d.id}>
                    <td>
                      <div>
                        <strong style={{ color: 'var(--text)', fontSize: '.86rem' }}>{d.nombre}</strong>
                        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginTop: '.15rem', flexWrap: 'wrap' }}>
                          <span className="adm-chip" style={{ fontSize: '.7rem' }}>
                            {TIPO_DOCUMENTO_LABEL[d.tipo] || d.tipo}
                          </span>
                          {!empresaClave && (
                            <span className="badge" style={{ fontSize: '.68rem', background: 'rgba(255,255,255,0.06)' }}>
                              🏢 {d.empresaClave}
                            </span>
                          )}
                          {d.numeroRegistro && (
                            <span className="muted mono" style={{ fontSize: '.7rem' }}>
                              Reg: {d.numeroRegistro}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="muted" style={{ fontSize: '.78rem' }}>
                        {ETIQUETA_CARPETA[d.carpeta] || d.carpeta}
                      </span>
                    </td>

                    <td>
                      <div>
                        <span
                          className="badge"
                          style={{
                            background: statusStyle.bg,
                            color: statusStyle.color,
                            borderColor: statusStyle.border,
                            fontSize: '.72rem',
                            fontWeight: 700,
                          }}
                        >
                          {STATUS_VENCIMIENTO_LABEL[d.statusVencimiento]}
                        </span>
                        <div className="muted mono" style={{ fontSize: '.72rem', marginTop: '.2rem' }}>
                          {d.fechaVencimiento ? (
                            <span>
                              {fFecha.format(new Date(`${d.fechaVencimiento}T00:00:00`))}
                              {dias != null && (
                                <strong style={{ marginLeft: '.3rem', color: dias < 0 ? '#ef4444' : dias <= 30 ? '#f59e0b' : 'inherit' }}>
                                  ({dias < 0 ? `venció hace ${Math.abs(dias)}d` : `vence en ${dias}d`})
                                </strong>
                              )}
                            </span>
                          ) : (
                            'Permanente'
                          )}
                        </div>
                        {d.notaTramite && (
                          <div style={{ fontSize: '.7rem', color: '#a855f7', marginTop: '.15rem' }}>
                            📋 {d.notaTramite}
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '.78rem' }}>
                        {d.socioNombre && <div>👤 <strong>{d.socioNombre}</strong></div>}
                        {d.entidadEmisora && <div className="muted">🏛️ {d.entidadEmisora}</div>}
                        {!d.socioNombre && !d.entidadEmisora && <span className="muted">—</span>}
                      </div>
                    </td>

                    <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: '.76rem' }}>
                      {tamanoFmt(d.tamano)}
                    </td>

                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" className="btn btn-xs btn-ghost" onClick={() => void abrirDoc(d)} title="Previsualizar archivo">
                        👁️ Ver
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => setDocDetalle(d)}
                        title="Ver detalle, historial y editar metadatos"
                      >
                        ✏️ Detalle / Historial
                      </button>
                      {puedeEscribir && (
                        <button type="button" className="btn btn-xs btn-ghost" style={{ color: '#ef4444' }} onClick={() => setDocBorrar(d)} title="Eliminar documento">
                          🗑️
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 6. MODAL: Staging de subida por Drag & Drop (Lote) */}
      {archivosEnEspera && (
        <Modal
          title={`⬆ Subir Lote de Documentos (${archivosEnEspera.length} archivos)`}
          size="lg"
          onClose={() => { if (!subiendoLote) setArchivosEnEspera(null); }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '.5rem', flexWrap: 'wrap' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>
                {subiendoLote ? (progresoLote ? `Subiendo ${progresoLote.actual} de ${progresoLote.total}: «${progresoLote.nombre}»` : 'Subiendo…') : `${archivosEnEspera.length} archivo(s) listos para cargar`}
              </div>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setArchivosEnEspera(null)} disabled={subiendoLote}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void ejecutarSubidaLote()} disabled={subiendoLote}>
                  {subiendoLote ? 'Subiendo Lote…' : `Confirmar y Subir (${archivosEnEspera.length})`}
                </button>
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
            <p className="muted hint" style={{ margin: 0, fontSize: '.78rem' }}>
              Revisa y ajusta la carpeta, tipo y fecha de vencimiento antes de subir. Los valores fueron inferidos automáticamente por los nombres de los archivos.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', maxHeight: '420px', overflowY: 'auto' }}>
              {archivosEnEspera.map((item, idx) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '.65rem .8rem', background: 'var(--surface-1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '.84rem', color: 'var(--text)' }}>
                      {idx + 1}. {item.file.name} <span className="muted mono" style={{ fontSize: '.74rem' }}>({tamanoFmt(item.file.size)})</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      style={{ color: '#ef4444' }}
                      onClick={() => setArchivosEnEspera(archivosEnEspera.filter((x) => x.id !== item.id))}
                      disabled={subiendoLote}
                    >
                      ✕ Quitar
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.45rem' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                      <span className="muted hint" style={{ fontSize: '.7rem' }}>Carpeta</span>
                      <select
                        className="input"
                        style={{ fontSize: '.78rem', padding: '.25rem .45rem' }}
                        value={item.carpeta}
                        onChange={(e) => {
                          const val = e.target.value as CarpetaDocumento;
                          setArchivosEnEspera(archivosEnEspera.map((x) => x.id === item.id ? { ...x, carpeta: val } : x));
                        }}
                      >
                        {CARPETAS_DOCUMENTOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                      <span className="muted hint" style={{ fontSize: '.7rem' }}>Tipo Documento</span>
                      <select
                        className="input"
                        style={{ fontSize: '.78rem', padding: '.25rem .45rem' }}
                        value={item.tipo}
                        onChange={(e) => {
                          const val = e.target.value as TipoDocumento;
                          setArchivosEnEspera(archivosEnEspera.map((x) => x.id === item.id ? { ...x, tipo: val } : x));
                        }}
                      >
                        {(Object.keys(TIPO_DOCUMENTO_LABEL) as TipoDocumento[]).map((t) => (
                          <option key={t} value={t}>{TIPO_DOCUMENTO_LABEL[t]}</option>
                        ))}
                      </select>
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                      <span className="muted hint" style={{ fontSize: '.7rem' }}>Fecha Vencimiento</span>
                      <input
                        type="date"
                        className="input"
                        style={{ fontSize: '.78rem', padding: '.2rem .4rem' }}
                        value={item.fechaVencimiento}
                        onChange={(e) => {
                          const val = e.target.value;
                          setArchivosEnEspera(archivosEnEspera.map((x) => x.id === item.id ? { ...x, fechaVencimiento: val } : x));
                        }}
                      />
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                      <span className="muted hint" style={{ fontSize: '.7rem' }}>Status Vigencia</span>
                      <select
                        className="input"
                        style={{ fontSize: '.78rem', padding: '.25rem .45rem' }}
                        value={item.statusVencimiento}
                        onChange={(e) => {
                          const val = e.target.value as StatusVencimiento;
                          setArchivosEnEspera(archivosEnEspera.map((x) => x.id === item.id ? { ...x, statusVencimiento: val } : x));
                        }}
                      >
                        {(Object.keys(STATUS_VENCIMIENTO_LABEL) as StatusVencimiento[]).map((s) => (
                          <option key={s} value={s}>{STATUS_VENCIMIENTO_LABEL[s]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* 7. MODAL: Detalle, Edición e Historial Ligero de Auditoría */}
      {docDetalle && (
        <Modal
          title={`📄 ${docDetalle.nombre}`}
          size="lg"
          onClose={() => setDocDetalle(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <button type="button" className="btn btn-ghost" onClick={() => void abrirDoc(docDetalle)}>
                👁️ Abrir Archivo
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setDocDetalle(null)}>
                Listo
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Formulario de actualización rápida */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '.8rem', background: 'var(--surface-1)' }}>
              <div style={{ fontWeight: 700, fontSize: '.86rem', marginBottom: '.6rem', color: 'var(--text)' }}>
                Metadatos y Estado de Vencimiento
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.6rem' }}>
                <div>
                  <span className="muted hint" style={{ fontSize: '.72rem' }}>Status Actual</span>
                  <div style={{ marginTop: '.2rem' }}>
                    <select
                      className="input"
                      value={docDetalle.statusVencimiento}
                      disabled={!puedeEscribir}
                      onChange={async (e) => {
                        const val = e.target.value as StatusVencimiento;
                        try {
                          const act = await repo.editarDocumento(
                            docDetalle.id,
                            { statusVencimiento: val },
                            undefined,
                            `Status cambiado manualmente a: ${STATUS_VENCIMIENTO_LABEL[val]}`,
                          );
                          setDocDetalle(act);
                          toast('Status actualizado.', 'success');
                          await cargar();
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Error al actualizar', 'error');
                        }
                      }}
                    >
                      {(Object.keys(STATUS_VENCIMIENTO_LABEL) as StatusVencimiento[]).map((s) => (
                        <option key={s} value={s}>{STATUS_VENCIMIENTO_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <span className="muted hint" style={{ fontSize: '.72rem' }}>Fecha de Vencimiento</span>
                  <div style={{ marginTop: '.2rem' }}>
                    <input
                      type="date"
                      className="input"
                      value={docDetalle.fechaVencimiento || ''}
                      disabled={!puedeEscribir}
                      onChange={async (e) => {
                        const val = e.target.value;
                        try {
                          const act = await repo.editarDocumento(
                            docDetalle.id,
                            { fechaVencimiento: val || null },
                            undefined,
                            `Fecha de vencimiento actualizada a: ${val || 'Sin vencimiento'}`,
                          );
                          setDocDetalle(act);
                          toast('Fecha de vencimiento actualizada.', 'success');
                          await cargar();
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Error al actualizar', 'error');
                        }
                      }}
                    />
                  </div>
                </div>

                <div>
                  <span className="muted hint" style={{ fontSize: '.72rem' }}>Carpeta</span>
                  <div style={{ marginTop: '.2rem' }}>
                    <select
                      className="input"
                      value={docDetalle.carpeta}
                      disabled={!puedeEscribir}
                      onChange={async (e) => {
                        const val = e.target.value as CarpetaDocumento;
                        try {
                          const act = await repo.editarDocumento(
                            docDetalle.id,
                            { carpeta: val },
                            undefined,
                            `Carpeta cambiada a: ${ETIQUETA_CARPETA[val]}`,
                          );
                          setDocDetalle(act);
                          toast('Carpeta actualizada.', 'success');
                          await cargar();
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Error al actualizar', 'error');
                        }
                      }}
                    >
                      {CARPETAS_DOCUMENTOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <span className="muted hint" style={{ fontSize: '.72rem' }}>Tipo Documento</span>
                  <div style={{ marginTop: '.2rem' }}>
                    <select
                      className="input"
                      value={docDetalle.tipo}
                      disabled={!puedeEscribir}
                      onChange={async (e) => {
                        const val = e.target.value as TipoDocumento;
                        try {
                          const act = await repo.editarDocumento(
                            docDetalle.id,
                            { tipo: val },
                            undefined,
                            `Tipo cambiado a: ${TIPO_DOCUMENTO_LABEL[val]}`,
                          );
                          setDocDetalle(act);
                          toast('Tipo actualizado.', 'success');
                          await cargar();
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Error al actualizar', 'error');
                        }
                      }}
                    >
                      {(Object.keys(TIPO_DOCUMENTO_LABEL) as TipoDocumento[]).map((t) => (
                        <option key={t} value={t}>{TIPO_DOCUMENTO_LABEL[t]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Nota de trámite si está vencido en trámite */}
              <div style={{ marginTop: '.6rem' }}>
                <span className="muted hint" style={{ fontSize: '.72rem' }}>Nota de Trámite en Curso (Radicado, TAQUILLA, N° Expediente)</span>
                <input
                  className="input"
                  placeholder="Ej: Trámite ingresado el 25/10/2026 taquilla 3, recibo N° 928391..."
                  defaultValue={docDetalle.notaTramite || ''}
                  disabled={!puedeEscribir}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val === (docDetalle.notaTramite || '')) return;
                    try {
                      const act = await repo.editarDocumento(
                        docDetalle.id,
                        { notaTramite: val || null },
                        undefined,
                        `Nota de trámite actualizada: ${val || 'Borrada'}`,
                      );
                      setDocDetalle(act);
                      toast('Nota de trámite guardada.', 'success');
                      await cargar();
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Error al guardar nota', 'error');
                    }
                  }}
                />
              </div>
            </div>

            {/* Historial Ligero de Cambios y Auditoría */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '.8rem', background: 'var(--surface-1)' }}>
              <div style={{ fontWeight: 700, fontSize: '.86rem', marginBottom: '.4rem', color: 'var(--text)' }}>
                📜 Historial de Cambios y Modificaciones
              </div>
              <p className="muted hint" style={{ fontSize: '.74rem', margin: '0 0 .6rem' }}>
                Registro cronológico liviano de quién modificó el documento, cuándo y qué acción realizó.
              </p>

              {docDetalle.historial && docDetalle.historial.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {[...docDetalle.historial].reverse().map((h) => (
                    <div
                      key={h.id}
                      style={{
                        padding: '.4rem .6rem',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: '.76rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#ff8a00' }}>👤 {h.actor || 'Usuario'}</strong>
                        <span className="muted mono" style={{ fontSize: '.68rem' }}>
                          {fFechaHora.format(new Date(h.fecha))}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text)', marginTop: '.15rem' }}>
                        {h.detalle}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: '.76rem' }}>
                  Sin cambios registrados en el historial de este archivo.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* 8. MODAL: Confirmar Borrado */}
      {docBorrar && (
        <ConfirmDialog
          title="Eliminar Documento"
          danger
          message={
            <>
              ¿Estás seguro de eliminar <strong>«{docBorrar.nombre}»</strong> ({TIPO_DOCUMENTO_LABEL[docBorrar.tipo]})? Esta acción no se puede deshacer.
            </>
          }
          confirmText="Eliminar"
          onCancel={() => setDocBorrar(null)}
          onConfirm={() => void confirmarBorrar()}
        />
      )}

      {/* 9. MODAL: Reporte Dinámico de Documentos */}
      {modalReporte && (
        <ExportarDocumentosModal
          documentos={docs}
          empresas={empresas}
          empresaClaveInicial={empresaClave}
          onClose={() => setModalReporte(false)}
        />
      )}
    </div>
  );
}
