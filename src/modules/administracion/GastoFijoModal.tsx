/* ============================================================
   Golden Touch · Administración · alta/edición de un GASTO FIJO (plantilla)
   Formulario en Modal (estilo del sistema). Labels visibles, feedback de
   guardado (cargando → ok/error), proveedor «catálogo o libre». Sin lógica
   de recurrencia: solo define la plantilla. empresa_clave = la elegida.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect, SearchCreateSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import type { Moneda, Periodicidad } from './administracionCalculo';
import type { AdminRepo, Empresa, GastoFijo, GastoFijoInput, OpcionRef } from './admin.repository';

const PERIODICIDADES: { v: Periodicidad; label: string }[] = [
  { v: 'mensual', label: 'Mensual' }, { v: 'bimensual', label: 'Bimensual' }, { v: 'trimestral', label: 'Trimestral' },
  { v: 'semestral', label: 'Semestral' }, { v: 'anual', label: 'Anual' },
];
const MONEDAS: Moneda[] = ['Bs', 'USD'];
const hoyISO = () => new Date().toISOString().slice(0, 10);

interface Draft {
  empresaClave: string;
  concepto: string;
  proveedorNombre: string;
  categoriaGastoId: string;
  monto: string;
  moneda: Moneda;
  tasaRef: string;
  periodicidad: Periodicidad;
  diaVencimiento: string;
  vigenteDesde: string;
  estado: 'activo' | 'suspendido';
}

function draftDe(g: GastoFijo | null | undefined, empresaClaveFija: string | null, monedaEmpresa: Moneda | null): Draft {
  if (g) {
    return {
      empresaClave: g.empresaClave, concepto: g.concepto, proveedorNombre: g.proveedorNombre ?? '',
      categoriaGastoId: g.categoriaGastoId ?? '', monto: String(g.monto), moneda: g.moneda,
      tasaRef: g.tasaRef == null ? '' : String(g.tasaRef), periodicidad: g.periodicidad,
      diaVencimiento: g.diaVencimiento == null ? '' : String(g.diaVencimiento), vigenteDesde: g.vigenteDesde, estado: g.estado,
    };
  }
  return {
    empresaClave: empresaClaveFija ?? '', concepto: '', proveedorNombre: '', categoriaGastoId: '',
    monto: '', moneda: monedaEmpresa ?? 'USD', tasaRef: '', periodicidad: 'mensual',
    diaVencimiento: '', vigenteDesde: hoyISO(), estado: 'activo',
  };
}

export function GastoFijoModal({ repo, empresas, empresaClaveFija, categorias, proveedores, gasto, onClose, onSaved }: {
  repo: AdminRepo;
  empresas: Empresa[];
  /** Si hay una empresa elegida en la cabecera, se fija; con 'Todas' va null y se elige aquí. */
  empresaClaveFija: string | null;
  categorias: OpcionRef[];
  proveedores: OpcionRef[];
  gasto?: GastoFijo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const monedaEmpresa = useMemo(
    () => empresas.find((e) => e.clave === empresaClaveFija)?.moneda ?? null,
    [empresas, empresaClaveFija],
  );
  const [d, setD] = useState<Draft>(() => draftDe(gasto, empresaClaveFija, monedaEmpresa));
  const [guardando, setGuardando] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const empresasActivas = useMemo(() => empresas.filter((e) => e.activa || e.clave === d.empresaClave), [empresas, d.empresaClave]);

  async function guardar() {
    const concepto = d.concepto.trim();
    const monto = Number(d.monto);
    if (!d.empresaClave) { toast('Elige la empresa del gasto.', 'warning', { silent: true }); return; }
    if (!concepto) { toast('El concepto es obligatorio.', 'warning', { silent: true }); return; }
    if (!Number.isFinite(monto) || monto <= 0) { toast('El monto debe ser mayor que cero.', 'warning', { silent: true }); return; }
    const dia = d.diaVencimiento.trim() === '' ? null : Math.trunc(Number(d.diaVencimiento));
    if (dia != null && (!Number.isFinite(dia) || dia < 1 || dia > 31)) { toast('El día de vencimiento va de 1 a 31.', 'warning', { silent: true }); return; }
    const tasaRef = d.tasaRef.trim() === '' ? null : Number(d.tasaRef);
    if (tasaRef != null && (!Number.isFinite(tasaRef) || tasaRef <= 0)) { toast('La tasa de referencia debe ser un número positivo.', 'warning', { silent: true }); return; }
    const provNombre = d.proveedorNombre.trim();
    const proveedorId = provNombre ? proveedores.find((p) => p.nombre.toLowerCase() === provNombre.toLowerCase())?.id ?? null : null;

    const entrada: GastoFijoInput = {
      empresaClave: d.empresaClave, concepto, proveedorId, proveedorNombre: provNombre || null,
      categoriaGastoId: d.categoriaGastoId || null, monto, moneda: d.moneda, tasaRef,
      periodicidad: d.periodicidad, diaVencimiento: dia, vigenteDesde: d.vigenteDesde, estado: d.estado,
    };
    setGuardando(true);
    try {
      if (gasto) await repo.editarGastoFijo(gasto.id, entrada);
      else await repo.crearGastoFijo(entrada);
      toast(gasto ? 'Gasto fijo actualizado.' : 'Gasto fijo creado.', 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : 'error'}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      title={gasto ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : gasto ? 'Guardar cambios' : 'Crear gasto fijo'}
          </button>
        </>
      }
    >
      <div className="form-grid-2">
        <div className="form-row">
          <label htmlFor="gf-empresa">Empresa</label>
          {empresaClaveFija ? (
            <input id="gf-empresa" className="input" value={empresas.find((e) => e.clave === empresaClaveFija)?.nombre ?? empresaClaveFija} disabled />
          ) : (
            <SearchSelect id="gf-empresa" placeholder="Elige la empresa…"
              options={empresasActivas.map((e) => ({ value: e.clave, label: e.nombre, hint: e.clave }))}
              value={d.empresaClave} onChange={(v) => set('empresaClave', v)} />
          )}
        </div>
        <div className="form-row">
          <label htmlFor="gf-concepto">Concepto</label>
          <input id="gf-concepto" className="input" value={d.concepto} onChange={(e) => set('concepto', e.target.value)} placeholder="Agua, alquiler, honorarios…" autoFocus />
        </div>
        <div className="form-row">
          <label htmlFor="gf-prov">Proveedor / beneficiario <span className="muted">(catálogo o libre)</span></label>
          <SearchCreateSelect id="gf-prov" placeholder="Escribe o elige…" options={proveedores.map((p) => p.nombre)}
            value={d.proveedorNombre} onChange={(v) => set('proveedorNombre', v)} />
        </div>
        <div className="form-row">
          <label htmlFor="gf-cat">Categoría de gasto</label>
          <SearchSelect id="gf-cat" placeholder="Sin categoría" options={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
            value={d.categoriaGastoId} onChange={(v) => set('categoriaGastoId', v)} />
        </div>
        <div className="form-row">
          <label htmlFor="gf-monto">Monto</label>
          <input id="gf-monto" className="input" type="number" min="0" step="0.01" inputMode="decimal"
            value={d.monto} onChange={(e) => set('monto', e.target.value)} placeholder="0,00" />
        </div>
        <div className="form-row">
          <label htmlFor="gf-moneda">Moneda</label>
          <select id="gf-moneda" className="input" value={d.moneda} onChange={(e) => set('moneda', e.target.value as Moneda)}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="gf-tasa">Tasa de referencia <span className="muted">(Bs/USD, opcional)</span></label>
          <input id="gf-tasa" className="input" type="number" min="0" step="0.01" inputMode="decimal"
            value={d.tasaRef} onChange={(e) => set('tasaRef', e.target.value)} placeholder="p. ej. 40,00" />
        </div>
        <div className="form-row">
          <label htmlFor="gf-periodicidad">Periodicidad</label>
          <select id="gf-periodicidad" className="input" value={d.periodicidad} onChange={(e) => set('periodicidad', e.target.value as Periodicidad)}>
            {PERIODICIDADES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="gf-dia">Día de vencimiento <span className="muted">(1–31, opcional)</span></label>
          <input id="gf-dia" className="input" type="number" min="1" max="31" step="1" inputMode="numeric"
            value={d.diaVencimiento} onChange={(e) => set('diaVencimiento', e.target.value)} placeholder="1" />
        </div>
        <div className="form-row">
          <label htmlFor="gf-desde">Vigente desde</label>
          <input id="gf-desde" className="input" type="date" value={d.vigenteDesde} onChange={(e) => set('vigenteDesde', e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="gf-estado">Estado</label>
          <select id="gf-estado" className="input" value={d.estado} onChange={(e) => set('estado', e.target.value as 'activo' | 'suspendido')}>
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
