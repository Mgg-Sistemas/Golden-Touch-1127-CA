import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '@/shared/ui/Toast';
import {
  MAX_MINIMIZADAS, minimizar, minimizarUltimaAbierta, moduloActual, quitarMinimizada, registrarVentana,
} from '@/shared/lib/minimizadas';

interface ModalProps {
  title?: string;
  size?: 'md' | 'lg' | 'xl';
  /** Modal pequeño y centrado (confirmaciones / “aceptar algo”). Los formularios
   *  van a pantalla completa (compact=false, por defecto). */
  compact?: boolean;
  onClose: () => void;
  /** Minimizar a medida (Pedidos reabre la orden por su id). Sin esto, el Modal se minimiza SOLO: se
   *  oculta sin desmontarse (conserva lo escrito) y queda en la barra inferior (ver minimizadas.ts). */
  onMinimizar?: () => void;
  /** Muestra el «—» para minimizar. Por defecto sí, salvo en los modales pequeños (compact) de confirmación. */
  minimizable?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, size = 'md', compact = false, onClose, onMinimizar, minimizable, children, footer }: ModalProps) {
  // Minimizar en TODOS los módulos (21/10/2026): salvo que la página traiga su propio onMinimizar o sea un
  // modal pequeño de confirmación, la ventana se oculta sin desmontarse y deja su pestaña en la barra de
  // abajo (hasta MAX_MINIMIZADAS, solo dentro del módulo). Al restaurarla vuelve tal como estaba.
  const propia = onMinimizar === undefined && (minimizable ?? !compact);
  const uid = useId();
  const id = `ventana:${uid}`;
  const [oculto, setOculto] = useState(false);
  const titulo = (title ?? '').trim() || 'Ventana';
  const tituloAlOcultar = useRef(titulo);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const mostrar = useCallback(() => {
    quitarMinimizada(id);
    // La ventana que esté a la vista pasa a la barra en lugar de la que se restaura.
    minimizarUltimaAbierta(id);
    setOculto(false);
  }, [id]);

  const minimizarme = useCallback((avisar: boolean) => {
    const { nombre, ruta } = moduloActual();
    tituloAlOcultar.current = titulo;
    const r = minimizar(nombre, ruta, { id, titulo, restaurar: mostrar, descartar: () => onCloseRef.current() });
    if (r === 'lleno') {
      if (avisar) toast(`Ya tienes ${MAX_MINIMIZADAS} pestañas minimizadas (el máximo). Restaura o descarta una para minimizar esta.`, 'warning');
      return;
    }
    setOculto(true);
  }, [id, titulo, mostrar]);

  // Mientras está a la vista se anota como minimizable: al restaurar otra, esta pasa a la barra.
  useEffect(() => {
    if (!propia || oculto) return;
    return registrarVentana(id, () => minimizarme(false));
  }, [propia, oculto, id, minimizarme]);

  // Si la página la cierra o cambia de ventana, su pestaña no puede quedar huérfana en la barra.
  useEffect(() => () => { quitarMinimizada(id); }, [id]);

  // Si la página reutiliza esta ventana para OTRA cosa mientras estaba oculta (otro título), la nueva se ve.
  useEffect(() => {
    if (oculto && titulo !== tituloAlOcultar.current) { quitarMinimizada(id); setOculto(false); }
  }, [oculto, titulo, id]);

  const alMinimizar = onMinimizar ?? (propia ? () => minimizarme(true) : undefined);

  // Regla del sistema: el modal NO se cierra por clic fuera ni con Escape; solo
  // con la ✕ (o un botón explícito del pie). Así no se pierde lo cargado por error.
  return createPortal(
    <div className="modal-backdrop" style={oculto ? { display: 'none' } : undefined}>
      <div className={`modal ${compact ? 'modal-compact' : ''} ${size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : ''}`}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{title ?? ''}</h3>
          <div style={{ display: 'flex', gap: '.35rem' }}>
            {alMinimizar && (
              <button type="button" className="btn btn-icon btn-ghost" onClick={alMinimizar} title="Minimizar (queda en la barra de abajo)" aria-label="Minimizar">—</button>
            )}
            <button className="btn btn-icon btn-ghost" onClick={onClose} title="Cerrar" aria-label="Cerrar">✕</button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

interface ConfirmDialogProps {
  title?: string;
  message: ReactNode;
  /** Recuadro con lo que está en juego (ver `VistaPrevia`). Va debajo del mensaje:
   *  confirmar mirando el dato es distinto a confirmar de memoria. */
  preview?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  /** Si se indica, el usuario debe escribir EXACTAMENTE este texto para habilitar el botón. */
  requireText?: string;
  /** Etiqueta sobre el input de confirmación (por defecto: «Escribe … para confirmar»). */
  requireLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title = 'Confirmar', message, preview, confirmText = 'Confirmar', danger, requireText, requireLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  // Comparación tolerante (sin distinguir may/min ni espacios): evita el "no pasa nada"
  // cuando el usuario escribe la palabra en otra caja.
  const matches = requireText == null || typed.trim().toLowerCase() === requireText.trim().toLowerCase();
  return (
    <Modal
      title={title}
      compact
      onClose={onCancel}
      footer={
        <>
          {/* `type="button"` explícito: hoy el diálogo se dibuja por portal fuera
              de cualquier <form>, pero si algún día deja de hacerlo, un botón sin
              tipo envía el formulario y confirma lo que no era. */}
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={!matches}
            style={matches && requireText != null ? { boxShadow: '0 0 0 2px var(--success, #22c55e)' } : undefined}
            onClick={() => { if (matches) onConfirm(); }}
          >{confirmText}</button>
        </>
      }
    >
      {/* `div` y no `p`: el mensaje ahora puede traer negritas, saltos o una lista. */}
      <div style={{ margin: 0 }}>{message}</div>
      {preview}
      {requireText != null && (
        <div className="form-row" style={{ marginTop: '0.9rem' }}>
          <label>{requireLabel ?? <>Escribe <strong>{requireText}</strong> para confirmar</>}</label>
          <input
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches) { e.preventDefault(); onConfirm(); } }}
            placeholder={`Escribe "${requireText}" aquí…`}
            autoFocus
          />
          {!matches && typed.trim().length > 0 && (
            <small className="muted">Escribe exactamente <strong>{requireText}</strong> para habilitar el botón.</small>
          )}
          {matches && (
            <small style={{ color: 'var(--success, #22c55e)', fontWeight: 600 }}>✓ Listo — toca «{confirmText}» para confirmar.</small>
          )}
        </div>
      )}
    </Modal>
  );
}
