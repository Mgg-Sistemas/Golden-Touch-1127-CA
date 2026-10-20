import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  MAX_MINIMIZADAS, actualizarVentana, minimizarVentana, quitarVentana, registrarVentana, usePestanas,
} from '@/shared/lib/pestanasModal';
import { toast } from '@/shared/ui/Toast';

interface ModalProps {
  title?: string;
  size?: 'md' | 'lg' | 'xl';
  /** Modal pequeño y centrado (confirmaciones / “aceptar algo”). Los formularios
   *  van a pantalla completa (compact=false, por defecto). */
  compact?: boolean;
  /** Ofrece el botón «—» para minimizar el modal a una pestaña (solo en los de pantalla
   *  completa, y solo mientras haya barra de pestañas). `false` en los que viven fuera
   *  de la página (p. ej. el del menú lateral): su pestaña no se perdería al cambiar de módulo. */
  minimizable?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, size = 'md', compact = false, minimizable = true, onClose, children, footer }: ModalProps) {
  const id = useId();
  const puedeMinimizar = minimizable && !compact;
  const { ventanas, minimizadas, hayBarra } = usePestanas();
  const minimizado = puedeMinimizar && !!ventanas.find((v) => v.id === id)?.minimizada;

  // La ventana se anota al abrirse y se borra al cerrarse (o al desmontarse la página,
  // que es como se pierden las pestañas al cambiar de módulo).
  useEffect(() => {
    if (!puedeMinimizar) return;
    registrarVentana(id, title || 'Ventana', onClose);
    return () => quitarVentana(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, puedeMinimizar]);
  useEffect(() => {
    if (puedeMinimizar) actualizarVentana(id, title || 'Ventana', onClose);
  });

  function minimizar() {
    if (!minimizarVentana(id)) {
      toast(`Solo puedes tener ${MAX_MINIMIZADAS} pestañas minimizadas. Cierra una para poder minimizar esta.`, 'warning');
    }
  }
  const llena = minimizadas.length >= MAX_MINIMIZADAS;

  // Regla del sistema: el modal NO se cierra por clic fuera ni con Escape; solo
  // con la ✕ (o un botón explícito del pie). Así no se pierde lo cargado por error.
  // Minimizado, el modal SIGUE montado (solo se oculta): lo escrito y el estado de
  // sus hijos se conservan hasta que se restaure.
  return createPortal(
    <div className={`modal-backdrop${minimizado ? ' modal-min' : ''}`} aria-hidden={minimizado || undefined}>
      <div className={`modal ${compact ? 'modal-compact' : ''} ${size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : ''}`}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{title ?? ''}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            {puedeMinimizar && hayBarra && (
              <button
                type="button"
                className="btn btn-icon btn-ghost"
                onClick={minimizar}
                title={llena
                  ? `Ya hay ${MAX_MINIMIZADAS} pestañas minimizadas: cierra una para minimizar más`
                  : 'Minimizar: queda como pestaña abajo mientras sigues en este módulo'}
                aria-label="Minimizar"
                style={llena ? { opacity: 0.5 } : undefined}
              >—</button>
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
