/* ============================================================
   Golden Touch · Empresas de RRHH (carga y suscripción)

   Lee `rrhh_empresas` y la deja registrada en memoria (ver empresa.ts) para
   que carnets, constancias, recibos y reportes salgan con el nombre, el RIF,
   el domicilio y el logo de la empresa de cada persona (14/10/2026).
   ============================================================ */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import {
  empresasRrhh, registrarEmpresas, suscribirEmpresas, versionEmpresas,
  type FilaEmpresaRrhh, type IdentidadEmpresa,
} from './empresa';

export const BUCKET_LOGOS_EMPRESAS = 'rrhh-empresas-logos';

let cargando: Promise<void> | null = null;
let cargada = false;

/** URL pública del logo subido. */
export function urlLogoEmpresa(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET_LOGOS_EMPRESAS).getPublicUrl(path).data.publicUrl;
}

/** Lee las empresas de la base y las registra. Si falla, siguen GT y MTO de siempre. */
export function cargarEmpresasRrhh(forzar = false): Promise<void> {
  if (cargando && !forzar) return cargando;
  cargando = (async () => {
    const { data, error } = await supabase.from('rrhh_empresas')
      .select('clave, nombre, rif, domicilio, ciudad, email, whatsapp, logo_path, icono, activa, orden')
      .order('orden').order('clave');
    if (error) throw error;
    registrarEmpresas(((data ?? []) as FilaEmpresaRrhh[]).map((f) => ({ ...f, logo_url: urlLogoEmpresa(f.logo_path) })));
    cargada = true;
  })();
  cargando.catch(() => { cargando = null; });
  return cargando;
}

/** Las empresas de RRHH; la pantalla se vuelve a dibujar cuando cambian. */
export function useEmpresasRrhh(): IdentidadEmpresa[] {
  useSyncExternalStore(suscribirEmpresas, versionEmpresas);
  useEffect(() => { if (!cargada) void cargarEmpresasRrhh().catch(() => undefined); }, []);
  return empresasRrhh();
}
