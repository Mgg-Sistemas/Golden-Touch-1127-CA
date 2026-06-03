import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from './authStore';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  if (loading) return <div className="p-8">Cargando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
