import { useEffect, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { mensajeError } from '@/shared/lib/errores';
import { dateTime, relTime } from '@/shared/lib/format';
import {
  BACKUP_EMAILS,
  descargarRespaldoSql,
  enviarRespaldoPorCorreo,
  obtenerDetalleUltimoRespaldo,
  registrarUltimoRespaldo,
  type DetalleUltimoRespaldo,
} from '@/shared/lib/backup';
import './respaldoModal.css';

export interface RespaldoDataModalProps {
  open: boolean;
  onClose: () => void;
  userEmail?: string | null;
}

export function RespaldoDataModal({ open, onClose, userEmail }: RespaldoDataModalProps) {
  const [ultimo, setUltimo] = useState<DetalleUltimoRespaldo | null>(null);
  const [cargandoInfo, setCargandoInfo] = useState(true);
  const [accion, setAccion] = useState<'descargando' | 'enviando' | null>(null);

  useEffect(() => {
    if (!open) return;
    setCargandoInfo(true);
    obtenerDetalleUltimoRespaldo()
      .then((det) => setUltimo(det))
      .catch(() => setUltimo(null))
      .finally(() => setCargandoInfo(false));
  }, [open]);

  if (!open) return null;

  const enProgreso = accion !== null;

  async function handleDescargar() {
    if (enProgreso) return;
    setAccion('descargando');
    try {
      const email = userEmail || 'admin';
      await descargarRespaldoSql(email, false);
      toast('Respaldo de base de datos descargado (.sql)', 'success');
      const det = await obtenerDetalleUltimoRespaldo();
      setUltimo(det ?? { at: new Date().toISOString(), por: email, automatico: false });
    } catch (e) {
      toast(mensajeError(e, 'No se pudo generar el respaldo'), 'error');
    } finally {
      setAccion(null);
    }
  }

  async function handleEnviarCorreo() {
    if (enProgreso) return;
    setAccion('enviando');
    try {
      const email = userEmail || 'admin';
      const { destinatarios } = await enviarRespaldoPorCorreo(email, false);
      toast(`Respaldo comprimido (.zip) enviado a: ${destinatarios.join(', ')}`, 'success');
      const det = await obtenerDetalleUltimoRespaldo();
      setUltimo(det ?? { at: new Date().toISOString(), por: email, automatico: false });
    } catch (e) {
      toast(mensajeError(e, 'No se pudo enviar el respaldo a la bóveda'), 'error');
    } finally {
      setAccion(null);
    }
  }

  async function handleRegistrarManual() {
    const email = userEmail || 'admin';
    const reg = await registrarUltimoRespaldo(email, false);
    setUltimo(reg);
    toast('Fecha de último respaldo actualizada a hoy', 'success');
  }

  // Cálculo de salud del respaldo (días transcurridos)
  const diasTranscurridos = ultimo?.at
    ? Math.max(0, Math.floor((Date.now() - new Date(ultimo.at).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  let saludBadgeClass = 'badge badge-warning';
  let saludBadgeTexto = 'Sin registro previo';
  if (diasTranscurridos !== null) {
    if (diasTranscurridos <= 7) {
      saludBadgeClass = 'badge badge-success';
      saludBadgeTexto = `Al día (${diasTranscurridos === 0 ? 'hoy' : `hace ${diasTranscurridos}d`})`;
    } else if (diasTranscurridos <= 25) {
      saludBadgeClass = 'badge badge-info';
      saludBadgeTexto = `Vigente (hace ${diasTranscurridos}d)`;
    } else {
      saludBadgeClass = 'badge badge-warning';
      saludBadgeTexto = `Próximo a ciclo (hace ${diasTranscurridos}d)`;
    }
  }

  return (
    <Modal
      title="Seguridad y Respaldo de Datos"
      size="lg"
      compact={false}
      onClose={() => { if (!enProgreso) onClose(); }}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.76rem', color: 'var(--text-dim)' }}>
            🔒 Proceso transaccional verificado · Privilegios SECURITY DEFINER
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={enProgreso}
          >
            Cerrar
          </button>
        </div>
      }
    >
      <div className="respaldo-modal-wrap">
        {/* Encabezado ejecutivo */}
        <div className="respaldo-header">
          <div className="respaldo-header-icon" aria-hidden="true">
            💾
          </div>
          <div className="respaldo-header-text">
            <h3>Copia de Seguridad de Base de Datos</h3>
            <p>
              Genera una instantánea completa de la base de datos de <strong>GOLDEN TOUCH 1127 C.A.</strong> incluyendo catálogos, existencias, compras, tesorería, maquinaria y auditoría.
            </p>
          </div>
        </div>

        {/* Banner de estado y ciclo automático */}
        <div className="respaldo-salud-card">
          <div className="respaldo-salud-info">
            <div className="respaldo-salud-icon" aria-hidden="true">
              {diasTranscurridos !== null && diasTranscurridos <= 7 ? '🛡️' : '⏱️'}
            </div>
            <div className="respaldo-salud-text">
              <span className="respaldo-salud-title">
                {cargandoInfo
                  ? 'Verificando estado de respaldos…'
                  : ultimo
                  ? `Último respaldo: ${dateTime(ultimo.at)} (${relTime(ultimo.at)})`
                  : 'No hay registro de respaldos recientes'}
              </span>
              <span className="respaldo-salud-sub">
                {ultimo?.por ? `Ejecutado por ${ultimo.por} · ` : ''}
                {ultimo?.automatico ? 'Generado por ciclo automático de 30 días' : 'Generación manual'}
              </span>
            </div>
          </div>
          <div className="respaldo-salud-actions">
            <span className={saludBadgeClass}>
              {saludBadgeTexto}
            </span>
            <button
              type="button"
              className="respaldo-sync-btn"
              onClick={() => void handleRegistrarManual()}
              title="Si ya hiciste un respaldo manual o externo recientemente, pulsa para actualizar la fecha registrada"
            >
              ↻ Registrar hecho hoy
            </button>
          </div>
        </div>

        {/* Tarjetas duales de acción */}
        <div className="respaldo-grid">
          {/* Opción 1: Descarga Local .SQL */}
          <div className={`respaldo-card ${enProgreso ? 'disabled' : ''}`}>
            <div>
              <div className="respaldo-card-top">
                <div className="respaldo-card-icon" style={{ color: 'var(--gold)', borderColor: 'rgba(255,213,74,0.2)' }}>
                  💾
                </div>
                <div>
                  <div className="respaldo-card-title">Descarga Local Directa</div>
                  <p className="respaldo-card-desc">
                    Genera el volcado estructurado en formato <strong>.SQL</strong> sin compresión y lo descarga inmediatamente a tu equipo.
                  </p>
                </div>
              </div>

              <div className="respaldo-card-badges">
                <span className="respaldo-tag">📄 Archivo .sql</span>
                <span className="respaldo-tag">⚡ Descarga directa</span>
                <span className="respaldo-tag">UTF-8</span>
              </div>
            </div>

            <div className="respaldo-card-action">
              <button
                type="button"
                className="btn btn-ghost"
                style={{ border: '1px solid var(--border)', background: 'var(--surface-3)' }}
                onClick={() => void handleDescargar()}
                disabled={enProgreso}
              >
                {accion === 'descargando' ? 'Generando volcado…' : '↓ Descargar archivo .sql'}
              </button>
            </div>
          </div>

          {/* Opción 2: Envío Seguro a Bóveda */}
          <div className={`respaldo-card ${enProgreso ? 'disabled' : ''}`}>
            <div>
              <div className="respaldo-card-top">
                <div className="respaldo-card-icon" style={{ color: 'var(--primary)', borderColor: 'rgba(255,138,0,0.25)' }}>
                  ✉️
                </div>
                <div>
                  <div className="respaldo-card-title">Custodia en Bóveda por Correo</div>
                  <p className="respaldo-card-desc">
                    Comprime el volcado a formato <strong>.ZIP</strong> de alta eficiencia (~10x) y lo despacha de forma cifrada a los buzones oficiales:
                  </p>
                </div>
              </div>

              <div className="respaldo-card-emails">
                {BACKUP_EMAILS.map((email) => (
                  <span key={email} className="respaldo-email-chip" title="Buzón de custodia oficial">
                    <span style={{ color: 'var(--primary)' }}>●</span> {email}
                  </span>
                ))}
              </div>

              <div className="respaldo-card-badges">
                <span className="respaldo-tag">📦 Archivo .zip</span>
                <span className="respaldo-tag">🔒 Nivel 9 de compresión</span>
                <span className="respaldo-tag">Brevo Edge</span>
              </div>
            </div>

            <div className="respaldo-card-action">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleEnviarCorreo()}
                disabled={enProgreso}
              >
                {accion === 'enviando' ? 'Comprimiendo y enviando…' : '✉ Enviar a Bóveda'}
              </button>
            </div>
          </div>
        </div>

        {/* Indicador de proceso en curso */}
        {enProgreso && (
          <div className="respaldo-progreso">
            <div className="respaldo-progreso-head">
              <span>
                {accion === 'descargando'
                  ? '⚡ Volcando base de datos y preparando script SQL…'
                  : '🔒 Comprimiendo volcado en ZIP y remitiendo por correo seguro…'}
              </span>
              <span>Por favor espera</span>
            </div>
            <div className="respaldo-progreso-bar-bg">
              <div className="respaldo-progreso-bar-fill" />
            </div>
            <p className="respaldo-progreso-hint">
              Este proceso consulta todas las tablas de Supabase en una transacción atómica segura. No cierres esta ventana.
            </p>
          </div>
        )}

        <p className="respaldo-footer-note">
          Nota de custodia: El respaldo de datos está protegido por políticas de control de acceso. Solo usuarios con el permiso <code>respaldo</code> activo en la matriz de seguridad pueden generar o descargar copias.
        </p>
      </div>
    </Modal>
  );
}
