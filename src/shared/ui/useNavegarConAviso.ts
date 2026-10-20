/* Navegar a otra ruta avisando antes si se perderían pestañas minimizadas
   (cambio de módulo). El aviso lo dibuja el AppShell. Ver `pestanasModal.ts`. */
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { necesitaAvisoSalida, solicitarSalida } from '@/shared/lib/pestanasModal';

export function useNavegarConAviso(): (to: string) => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback((to: string) => {
    const ruta = to.split(/[?#]/)[0];
    if (necesitaAvisoSalida(pathname, ruta)) solicitarSalida(to);
    else navigate(to);
  }, [navigate, pathname]);
}
