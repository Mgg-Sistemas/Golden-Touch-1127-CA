import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/shared/lib/supabase';

/** Los roles son dinámicos (custom_roles). Se exporta como string para no restringir nuevos valores. */
export type Role = string;

export interface AppUser {
  id: string;
  email: string;
  nombre: string;
  role: Role;
  ci?: string | null;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Al cambiar de pestaña y volver, Supabase refresca el token y emite eventos
      // (TOKEN_REFRESHED / SIGNED_IN) con un objeto `session` NUEVO del MISMO usuario.
      // Si cambiáramos la referencia, todo el árbol re-renderiza (y según el consumidor
      // se remonta, cerrando el modal abierto). Reglas:
      //  · SIGNED_OUT → null (cierre real de sesión).
      //  · sesión nula que NO es signout → la ignoramos (null transitorio del refresh):
      //    así ProtectedRoute no redirige a /login y no se desmonta /app.
      //  · mismo usuario → mantenemos la referencia previa (sin re-render).
      //  · usuario distinto / primer login → actualizamos.
      setSession((prev) => {
        if (event === 'SIGNED_OUT') return null;
        if (!s) return prev;
        if (prev && prev.user?.id === s.user?.id) return prev;
        return s;
      });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading, user: session?.user ?? null };
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

/** Cierra sesión solo del lado del cliente (limpia storage). Sin round-trip al servidor:
 *  ~5–10× más rápido que `signOut()`, usado al entrar al login para "siempre logearse". */
export async function signOutLocal() {
  return supabase.auth.signOut({ scope: 'local' });
}

export async function getAppUser(user: User): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, email, nombre, role, ci')
    .eq('id', user.id)
    .single();

  if (error) return null;
  return data as AppUser;
}
