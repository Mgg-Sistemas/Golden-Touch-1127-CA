import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { supabase } from '@/shared/lib/supabase';

/**
 * Wrapper que bloquea acceso al app si el usuario tiene must_change_password=true.
 * Lo redirige a /cambiar-clave; el botón Volver de esa página cancela la redirección
 * (la sesión queda con el flag activo y volverá a forzarse en el próximo login).
 */
export function PasswordChangeGate({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();
  const [mustChange, setMustChange] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setMustChange(false);
      return;
    }
    supabase
      .from('usuarios')
      .select('must_change_password')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setMustChange(Boolean(data?.must_change_password));
      });
    return () => { cancelled = true; };
    // Dependemos del ID, no del objeto `user`: al cambiar de pestaña Supabase emite
    // un `user` nuevo (mismo id) y no queremos re-ejecutar este gate (evita parpadeos
    // y posibles remontajes que cierren modales abiertos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading || mustChange === null) return null;
  if (mustChange && location.pathname !== '/cambiar-clave') {
    return <Navigate to="/cambiar-clave" replace />;
  }
  return <>{children}</>;
}
