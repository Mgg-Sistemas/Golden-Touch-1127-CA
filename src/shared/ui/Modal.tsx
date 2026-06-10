import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title?: string;
  size?: 'md' | 'lg' | 'xl';
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, size = 'md', onClose, children, footer }: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : ''}`}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{title ?? ''}</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
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
  const matches = requireText == null || typed.trim() === requireText.trim();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={!matches}
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
            placeholder={requireText}
            autoFocus
          />
        </div>
      )}
    </Modal>
  );
}
