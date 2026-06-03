import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { playNotificationSound } from '@/shared/lib/sound';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

let nextId = 1;
const subscribers = new Set<(toasts: ToastItem[]) => void>();
let current: ToastItem[] = [];

function emit() {
  subscribers.forEach((fn) => fn([...current]));
}

export interface ToastOptions {
  silent?: boolean;  // No reproducir sonido (para validaciones rápidas / errores de form)
}

export function toast(message: string, kind: ToastKind = 'info', options: ToastOptions = {}) {
  const item: ToastItem = { id: nextId++, message, kind };
  current = [...current, item];
  emit();
  if (!options.silent) playNotificationSound();
  setTimeout(() => {
    current = current.filter((t) => t.id !== item.id);
    emit();
  }, 3200);
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    subscribers.add(setToasts);
    setToasts([...current]);
    return () => {
      subscribers.delete(setToasts);
    };
  }, []);

  return createPortal(
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
      ))}
    </div>,
    document.body
  );
}
