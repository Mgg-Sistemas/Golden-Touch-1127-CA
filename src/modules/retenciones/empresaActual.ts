/* ============================================================
   Golden Touch · Retenciones · Empresa actual (Multi-Empresa · andamiaje)

   GT es multi-empresa: cada empresa tiene su propio libro, régimen y %, y no
   se mezclan. Este andamiaje provee la «empresa actual» elegida arriba del
   módulo para filtrar libro, registro y reportes a ELLA.

   Degradación segura: mientras la base no traiga la empresa en las retenciones
   (detector multiEmpresaDisponible = columna empresa_id en retencion_documentos),
   el módulo se comporta single-empresa como hasta hoy: `multiempresa` queda en
   false y nadie filtra por empresa. Por eso no cambia nada del comportamiento
   actual hasta que BD aplique F-ME1.

   Aquí NO se toca el cálculo ni el comprobante: solo se resuelve qué empresa
   está seleccionada y se expone para que el resto del flujo la reciba.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { listEmpresasReceptoras, type EmpresaReceptora } from './empresasReceptoras.repository';
import { multiEmpresaDisponible } from '@/modules/libroFiscal/disponibilidad';

/** Dónde recuerda el navegador la empresa elegida (comodidad por usuario, no es dato fiscal). */
export const CLAVE_EMPRESA_ACTUAL = 'gt.retenciones.empresaActual';

/** La clave de la empresa principal (GT) según el diseño de BD; es el default natural. */
const CLAVE_GT = 'empresa-golden-touch';

/**
 * Qué empresa debe quedar seleccionada, dada la lista y lo que recordaba el
 * navegador. Pura y testeable:
 *  - la guardada, si sigue existiendo y está activa;
 *  - si no, GT (empresa-golden-touch) si está;
 *  - si no, la primera activa (ya vienen ordenadas por `orden`);
 *  - si no hay ninguna, null.
 */
export function empresaPorDefecto(empresas: EmpresaReceptora[], guardadaId: string | null): string | null {
  if (!empresas.length) return null;
  const activas = empresas.filter((e) => e.activo);
  const elegibles = activas.length ? activas : empresas;
  if (guardadaId && elegibles.some((e) => e.id === guardadaId)) return guardadaId;
  const gt = elegibles.find((e) => e.clave === CLAVE_GT);
  if (gt) return gt.id;
  return elegibles[0].id;
}

function leerGuardada(): string | null {
  try { return localStorage.getItem(CLAVE_EMPRESA_ACTUAL); } catch { return null; }
}
function guardar(id: string | null): void {
  try { if (id) localStorage.setItem(CLAVE_EMPRESA_ACTUAL, id); } catch { /* sin localStorage, no pasa nada */ }
}

export interface EmpresaActual {
  /** La base trae la empresa en las retenciones (F-ME1 aplicado). */
  multiempresa: boolean;
  /** Las empresas receptoras (vacío mientras no sea multiempresa). */
  empresas: EmpresaReceptora[];
  /** La empresa seleccionada, o null en single-empresa / sin empresas. */
  empresaId: string | null;
  /** La ficha de la empresa seleccionada, o null. */
  empresaActual: EmpresaReceptora | null;
  setEmpresaId: (id: string) => void;
  cargando: boolean;
}

/**
 * Resuelve la empresa actual del módulo. En single-empresa (detector apagado)
 * devuelve multiempresa=false y empresaId=null: nadie filtra, todo como hoy.
 */
export function useEmpresaActual(): EmpresaActual {
  const [multiempresa, setMultiempresa] = useState(false);
  const [empresas, setEmpresas] = useState<EmpresaReceptora[]>([]);
  const [empresaId, setEmpresaIdState] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const hay = await multiEmpresaDisponible().catch(() => false);
      if (!vivo) return;
      if (!hay) { setMultiempresa(false); setEmpresas([]); setEmpresaIdState(null); setCargando(false); return; }
      const lista = await listEmpresasReceptoras().catch(() => [] as EmpresaReceptora[]);
      if (!vivo) return;
      setMultiempresa(true);
      setEmpresas(lista);
      setEmpresaIdState(empresaPorDefecto(lista, leerGuardada()));
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const setEmpresaId = useCallback((id: string) => {
    setEmpresaIdState(id);
    guardar(id);
  }, []);

  const empresaActual = empresaId ? empresas.find((e) => e.id === empresaId) ?? null : null;
  return { multiempresa, empresas, empresaId, empresaActual, setEmpresaId, cargando };
}
