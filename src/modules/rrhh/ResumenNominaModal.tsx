/* ============================================================
   Golden Touch · RRHH · Diálogo «📑 Resumen de nómina» (09/10/2026)
   Igual que «Descargar datos del personal»: casillas para elegir qué
   columnas salen, atajos, hoja automática o elegida, y Excel o PDF con
   vista previa. Alcance: un período de nómina (sin los de la papelera) o
   general (todas, con fechas y empresa), agrupado con subtotales.
   Es un reporte de solo lectura: no necesita Realtime.
   ============================================================ */
import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { FechaInput } from '@/shared/ui/FechaInput';
import { date } from '@/shared/lib/format';
import type { EmpresaRrhh } from '@/shared/lib/types';
import type { NominaPeriodoResumen } from './nomina.repository';
import {
  CAMPOS_BASICOS, CAMPOS_RESUMEN, armarResumen, fechasPeriodo, filtrarGeneral, orientacionResumen,
  type Agrupacion, type OrientacionHoja,
} from './resumenNomina';
import { listFilasResumen } from './resumenNomina.repository';
import { descargarResumenExcel, descargarResumenPdf } from './resumenNominaReporte';

const CLAVE_LOCAL = 'rrhh.resumen-nomina.campos';

function seleccionGuardada(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LOCAL) ?? 'null');
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length) return v;
  } catch { /* sin almacenamiento: se usa la de por defecto */ }
  return CAMPOS_BASICOS;
}
function guardarSeleccion(claves: string[]) {
  try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(claves)); } catch { /* no es crítico */ }
}

interface Props {
  empresa: EmpresaRrhh;
  /** Las nóminas de la empresa que se ven en la pestaña (ya SIN las de la papelera). */
  nominas: NominaPeriodoResumen[];
  onClose: () => void;
}

const hoy = () => new Date().toISOString().slice(0, 10);

export function ResumenNominaModal({ empresa, nominas, onClose }: Props) {
  const periodos = nominas.filter((p) => !p.eliminado_en);
  const [alcance, setAlcance] = useState<'periodo' | 'general'>('periodo');
  const [periodoId, setPeriodoId] = useState<string>(periodos[0]?.id ?? '');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [empresaFiltro, setEmpresaFiltro] = useState<EmpresaRrhh | 'ambas'>(empresa);
  const [agrupar, setAgrupar] = useState<Agrupacion>('periodo');
  const [conTotales, setConTotales] = useState(true);
  const [marcados, setMarcados] = useState<string[]>(seleccionGuardada);
  const [orientacion, setOrientacion] = useState<OrientacionHoja>('auto');
  const [ocupado, setOcupado] = useState<'xlsx' | 'pdf' | null>(null);

  const alternar = (clave: string) =>
    setMarcados((m) => (m.includes(clave) ? m.filter((x) => x !== clave) : [...m, clave]));

  async function generar(formato: 'xlsx' | 'pdf') {
    setOcupado(formato);
    try {
      guardarSeleccion(marcados);
      let filas;
      let alcanceTxt: string;
      let empresaDoc: 'GT' | 'MTO';
      let archivo: string;
      if (alcance === 'periodo') {
        const p = periodos.find((x) => x.id === periodoId);
        if (!p) throw new Error('Elige el período de nómina.');
        filas = await listFilasResumen({ periodoId: p.id });
        alcanceTxt = [p.codigo, p.nombre, fechasPeriodo(p)].filter(Boolean).join(' · ');
        empresaDoc = p.empresa === 'MTO' ? 'MTO' : 'GT';
        archivo = `resumen-nomina-${p.codigo}`;
      } else {
        if (desde && hasta && desde > hasta) throw new Error('La fecha «desde» es posterior a «hasta».');
        const todas = await listFilasResumen({ empresa: empresaFiltro === 'ambas' ? null : empresaFiltro });
        filas = filtrarGeneral(todas, { desde, hasta, empresa: empresaFiltro });
        const rango = desde || hasta ? `del ${desde ? date(desde) : 'inicio'} al ${hasta ? date(hasta) : 'día de hoy'}` : 'todas las fechas';
        const agr = agrupar === 'periodo' ? 'por período' : agrupar === 'trabajador' ? 'por trabajador' : 'sin agrupar';
        alcanceTxt = `Todas las nóminas · ${empresaFiltro === 'ambas' ? 'GT y MTO' : empresaFiltro} · ${rango} · ${agr}`;
        empresaDoc = empresaFiltro === 'MTO' ? 'MTO' : 'GT';
        archivo = `resumen-nomina-general-${empresaFiltro === 'ambas' ? 'gt-y-mto' : empresaFiltro.toLowerCase()}-${hoy()}`;
      }
      const r = armarResumen(filas, marcados, { alcance, agrupar, totales: conTotales });
      const meta = { empresa: empresaDoc, alcance: alcanceTxt, claves: marcados, orientacion, archivo };
      if (formato === 'xlsx') await descargarResumenExcel(r, meta);
      else await descargarResumenPdf(r, meta);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el resumen', 'error');
    } finally {
      setOcupado(null);
    }
  }

  const nada = marcados.length === 0;
  const sinPeriodo = alcance === 'periodo' && !periodoId;
  const etiqueta = { fontSize: '.86rem', fontWeight: 600 } as const;
  return (
    <Modal title="📑 Resumen de nómina" size="lg" onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={!!ocupado}>Cerrar</button>
          <button className="btn btn-ghost" onClick={() => void generar('xlsx')} disabled={nada || sinPeriodo || !!ocupado}>
            {ocupado === 'xlsx' ? 'Generando…' : '📊 Excel'}
          </button>
          <button className="btn btn-primary" onClick={() => void generar('pdf')} disabled={nada || sinPeriodo || !!ocupado}>
            {ocupado === 'pdf' ? 'Generando…' : '📄 PDF (imprimir)'}
          </button>
        </>
      }>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
        <button type="button" className={`btn btn-sm ${alcance === 'periodo' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAlcance('periodo')}>Un período de nómina</button>
        <button type="button" className={`btn btn-sm ${alcance === 'general' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAlcance('general')}>General (todas las nóminas)</button>
      </div>

      {alcance === 'periodo' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
          <label htmlFor="res-nom-periodo" style={etiqueta}>Período ({empresa})</label>
          <select id="res-nom-periodo" className="input" style={{ width: 'auto', minWidth: 280 }} value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
            {!periodos.length && <option value="">No hay nóminas cargadas</option>}
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.codigo, p.nombre, fechasPeriodo(p)].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
          <small className="muted">Las de la papelera no se listan.</small>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.7rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
          <div>
            <div style={etiqueta}>Desde</div>
            <FechaInput id="res-nom-desde" value={desde} onChange={setDesde} max={hasta || undefined} />
          </div>
          <div>
            <div style={etiqueta}>Hasta</div>
            <FechaInput id="res-nom-hasta" value={hasta} onChange={setHasta} min={desde || undefined} />
          </div>
          <div>
            <label htmlFor="res-nom-empresa" style={{ ...etiqueta, display: 'block' }}>Empresa</label>
            <select id="res-nom-empresa" className="input" style={{ width: 'auto' }} value={empresaFiltro} onChange={(e) => setEmpresaFiltro(e.target.value as EmpresaRrhh | 'ambas')}>
              <option value="GT">GT</option>
              <option value="MTO">MTO</option>
              <option value="ambas">GT y MTO</option>
            </select>
          </div>
          <div>
            <label htmlFor="res-nom-agrupar" style={{ ...etiqueta, display: 'block' }}>Agrupar</label>
            <select id="res-nom-agrupar" className="input" style={{ width: 'auto' }} value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupacion)}>
              <option value="periodo">Por período (subtotal de cada nómina)</option>
              <option value="trabajador">Por trabajador (lo pagado a cada uno)</option>
              <option value="ninguno">Sin agrupar</option>
            </select>
          </div>
          <small className="muted" style={{ flexBasis: '100%' }}>
            Sin fechas salen todas. Entra cada nómina cuyo período se cruce con el rango; las de la papelera nunca entran.
          </small>
        </div>
      )}

      <p className="muted" style={{ fontSize: '.84rem', margin: '0 0 .4rem' }}>Marca las columnas que quieres que salgan.</p>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMarcados(CAMPOS_BASICOS)}>Lo básico</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMarcados(CAMPOS_RESUMEN.map((c) => c.clave))}>Marcar todos</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMarcados([])}>Ninguno</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '.3rem .8rem' }}>
        {CAMPOS_RESUMEN.map((c) => (
          <label key={c.clave} style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.86rem', cursor: 'pointer' }}>
            <input type="checkbox" id={`res-nom-${c.clave}`} checked={marcados.includes(c.clave)} onChange={() => alternar(c.clave)} />
            {c.etiqueta}
          </label>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.86rem', cursor: 'pointer', marginTop: '.7rem', fontWeight: 600 }}>
        <input type="checkbox" id="res-nom-totales" checked={conTotales} onChange={(e) => setConTotales(e.target.checked)} />
        Fila TOTAL y bloque de totales (neto pagado / por pagar, bono neto, recibos en Bs, lo que salió de caja por moneda)
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginTop: '.9rem' }}>
        <label htmlFor="res-nom-orientacion" style={etiqueta}>Hoja</label>
        <select id="res-nom-orientacion" className="input" style={{ width: 'auto' }} value={orientacion}
          onChange={(e) => setOrientacion(e.target.value as OrientacionHoja)}>
          <option value="auto">Automática (según las columnas)</option>
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select>
        <small className="muted">
          Sale en {orientacionResumen(marcados, orientacion) === 'portrait' ? 'vertical' : 'horizontal'}. Al imprimir, elige la misma orientación.
        </small>
      </div>
      {nada && <p className="muted" style={{ fontSize: '.78rem', color: 'var(--warning)' }}>Marca al menos una columna.</p>}
    </Modal>
  );
}
