import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title?: string;
  size?: 'md' | 'lg' | 'xl';
  /** Modal pequeño y centrado (confirmaciones / “aceptar algo”). Los formularios
   *  van a pantalla completa (compact=false, por defecto). */
  compact?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, size = 'md', compact = false, onClose, children, footer }: ModalProps) {
  // Regla del sistema: el modal NO se cierra por clic fuera ni con Escape; solo
  // con la ✕ (o un botón explícito del pie). Así no se pierde lo cargado por error.
  return createPortal(
    <div className="modal-backdrop">
      <div className={`modal ${compact ? 'modal-compact' : ''} ${size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : ''}`}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{title ?? ''}</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose} title="Cerrar" aria-label="Cerrar">✕</button>
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
  message: string;
  confirmText?: string;
  danger?: boolean;
  /** Si se indica, el usuario debe escribir EXACTAMENTE este texto para habilitar el botón. */
  requireText?: string;
  /** Etiqueta sobre el input de confirmación (por defecto: «Escribí … para confirmar»). */
  requireLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title = 'Confirmar', message, confirmText = 'Confirmar', danger, requireText, requireLabel, onConfirm, onCancel }: ConfirmDialogProps) {
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
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={!matches}
            style={matches && requireText != null ? { boxShadow: '0 0 0 2px var(--success, #22c55e)' } : undefined}
            onClick={() => { if (matches) onConfirm(); }}
          >{confirmText}</button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
      {requireText != null && (
        <div className="form-row" style={{ marginTop: '0.9rem' }}>
          <label>{requireLabel ?? <>Escribí <strong>{requireText}</strong> para confirmar</>}</label>
          <input
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches) { e.preventDefault(); onConfirm(); } }}
            placeholder={`Escribí "${requireText}" aquí…`}
            autoFocus
          />
          {!matches && typed.trim().length > 0 && (
            <small className="muted">Escribí exactamente <strong>{requireText}</strong> para habilitar el botón.</small>
          )}
          {matches && (
            <small style={{ color: 'var(--success, #22c55e)', fontWeight: 600 }}>✓ Listo — tocá «{confirmText}» para confirmar.</small>
          )}
        </div>
      )}
    </Modal>
  );
}
