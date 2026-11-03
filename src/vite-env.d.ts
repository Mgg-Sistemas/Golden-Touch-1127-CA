/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Llave pública VAPID para Web Push (la privada es secreto del Edge Function). Opcional
   *  hasta que infra/BD la configure; sin ella, activar notificaciones avisa que falta. */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
