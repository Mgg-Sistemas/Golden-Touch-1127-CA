/* ============================================================
   Golden Touch · Retenciones · Config fiscal POR EMPRESA (multi-empresa)

   Dentro de «⚙ Parámetros». Lista las empresas receptoras y deja editar SU
   régimen y SUS porcentajes (lo que define cómo se les retiene). La identidad
   (nombre, RIF) se edita en el buzón: aquí solo la parte fiscal.

   Degradación segura: si la base todavía no trae las columnas fiscales por
   empresa (F-ME1), se avisa y no se edita.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import {
  listEmpresasReceptoras, guardarEmpresaReceptora, faltaEnEmpresa, fichaFiscalEmpresaDisponible,
  type EmpresaReceptora,
} from './empresasReceptoras.repository';

/** El % de retención de IVA solo admite 75 o 100 (Providencia SNAT/2025/000054). */
const PORCENTAJES_IVA = [75, 100] as const;

type Draft = EmpresaReceptora;

export function EditorFichasFiscalesEmpresa({ puedeEditar }: { puedeEditar: boolean }) {
  const [empresas, setEmpresas] = useState<EmpresaReceptora[] | null>(null);
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [borradores, setBorradores] = useState<Record<string, Draft>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [hay, lista] = await Promise.all([
      fichaFiscalEmpresaDisponible().catch(() => false),
      listEmpresasReceptoras().catch(() => [] as EmpresaReceptora[]),
    ]);
    setDisponible(hay);
    setEmpresas(lista);
    setBorradores(Object.fromEntries(lista.map((e) => [e.id, { ...e }])));
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const editar = (id: string, cambio: Partial<Draft>) =>
    setBorradores((prev) => ({ ...prev, [id]: { ...prev[id], ...cambio } }));

  async function guardar(id: string) {
    const d = borradores[id];
    if (!d) return;
    const falta = faltaEnEmpresa(d);
    if (falta) { setError(falta); return; }
    setError(null); setGuardando(id);
    try {
      const guardada = await guardarEmpresaReceptora(d);
      setBorradores((prev) => ({ ...prev, [id]: { ...guardada } }));
      setEmpresas((prev) => (prev ?? []).map((e) => (e.id === id ? guardada : e)));
      toast(`Config fiscal de ${guardada.nombreCorto || guardada.nombre} guardada.`, 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la config fiscal.');
    } finally {
      setGuardando(null);
    }
  }

  if (empresas === null) return <p className="muted">Cargando empresas…</p>;
  if (disponible === false) {
    return <p className="muted">La configuración fiscal por empresa estará disponible cuando la base traiga sus campos. Por ahora el módulo trabaja con una sola empresa.</p>;
  }
  if (!empresas.length) {
    return <p className="muted">No hay empresas cargadas. Se agregan en el buzón (📥 Buzón Móvil → Empresas).</p>;
  }

  const num = (v: number | undefined) => (v == null ? '' : String(v));

  return (
    <div style={{ display: 'grid', gap: '.9rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>
        Los porcentajes y lo municipal de cada empresa. El régimen (qué retiene) se edita en Parámetros → Régimen; el nombre y el RIF, en el buzón.
      </p>
      {error && <div className="aviso error sm"><span className="aviso-icono">⚠️</span><div>{error}</div></div>}

      {empresas.map((e) => {
        const d = borradores[e.id] ?? e;
        const dis = !puedeEditar || guardando === e.id;
        return (
          <div key={e.id} className="card" style={{ display: 'grid', gap: '.6rem' }}>
            <div style={{ fontWeight: 700 }}>{e.nombreCorto || e.nombre} <span className="muted mono" style={{ fontWeight: 400 }}>· {e.rif}</span></div>

            {/* D2: el régimen (qué retiene cada empresa) ya NO se edita acá; se gobierna en
                Parámetros → Régimen (L6, por empresa y fecha). Acá solo lo que queda de la ficha. */}
            <p className="muted" style={{ margin: 0, fontSize: '.78rem' }}>
              El régimen (agente de IVA, especial, ISLR, municipal) se edita en Parámetros → Régimen.
            </p>

            {/* Porcentajes */}
            <div className="form-grid">
              <div className="form-row">
                <label>% de retención de IVA (general)</label>
                <select className="input" disabled={dis} value={d.pctIvaGeneral ?? 75}
                  onChange={(ev) => editar(e.id, { pctIvaGeneral: Number(ev.target.value) })}>
                  {PORCENTAJES_IVA.map((p) => <option key={p} value={p}>{p} %</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>% de retención de IVA (al contribuyente especial)</label>
                <select className="input" disabled={dis} value={d.pctIvaEspecial ?? 100}
                  onChange={(ev) => editar(e.id, { pctIvaEspecial: Number(ev.target.value) })}>
                  {PORCENTAJES_IVA.map((p) => <option key={p} value={p}>{p} %</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Alícuota general del IVA (%)</label>
                <input className="input mono" type="number" min={0} max={100} step="any" disabled={dis}
                  value={num(d.ivaAlicuota)} onChange={(ev) => editar(e.id, { ivaAlicuota: ev.target.value === '' ? undefined : Number(ev.target.value) })} placeholder="16" />
              </div>
              <div className="form-row">
                <label>Alícuota del IGTF (%)</label>
                <input className="input mono" type="number" min={0} max={100} step="any" disabled={dis}
                  value={num(d.pctIgtf)} onChange={(ev) => editar(e.id, { pctIgtf: ev.target.value === '' ? undefined : Number(ev.target.value) })} placeholder="3" />
              </div>
              <div className="form-row">
                <label>Alícuota del ISAE / Impuesto Municipal (%)</label>
                <input className="input mono" type="number" min={0} max={100} step="any" disabled={dis}
                  value={num(d.alicuotaMunicipal)} onChange={(ev) => editar(e.id, { alicuotaMunicipal: ev.target.value === '' ? undefined : Number(ev.target.value) })} placeholder="la del municipio" />
              </div>
              <div className="form-row">
                <label>Licencia municipal (RIM)</label>
                <input className="input" type="text" maxLength={60} disabled={dis}
                  value={d.licenciaMunicipal ?? ''} onChange={(ev) => editar(e.id, { licenciaMunicipal: ev.target.value })} placeholder="N° de licencia de actividad económica" />
              </div>
            </div>

            {/* C1: «Original y Copia» del comprobante, por empresa, en UN solo lugar (su única fuente es la ficha). */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: dis ? 'default' : 'pointer', fontSize: '.86rem' }}>
              <input type="checkbox" disabled={dis} checked={d.imprimirOriginalYCopia !== false}
                onChange={(ev) => editar(e.id, { imprimirOriginalYCopia: ev.target.checked })} />
              Imprimir el comprobante en Original y Copia
            </label>

            {puedeEditar && (
              <div>
                <button type="button" className="btn btn-sm btn-primary" disabled={dis} onClick={() => void guardar(e.id)}>
                  {guardando === e.id ? 'Guardando…' : 'Guardar config fiscal'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
