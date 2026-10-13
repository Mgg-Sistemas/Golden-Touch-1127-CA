/* ============================================================
   Golden Touch · Campo de fecha (dd-mm-aaaa) con texto de ayuda

   Envoltura de `FechaInput` con la misma forma que el campo de MGG
   (módulo de Choferes, 13/10/2026): valor y salida en AAAA-MM-DD y una
   línea de ayuda opcional debajo.
   ============================================================ */
import type { ReactNode } from 'react';
import { FechaInput } from './FechaInput';

export function FechaVe({ value, onChange, disabled, id, placeholder, ayuda }: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  ayuda?: ReactNode;
}) {
  return (
    <>
      <FechaInput id={id} value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} className="input" />
      {ayuda && <small className="muted" style={{ display: 'block', marginTop: '.2rem' }}>{ayuda}</small>}
    </>
  );
}
