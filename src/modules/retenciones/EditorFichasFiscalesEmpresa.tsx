/* ============================================================
   Golden Touch · Retenciones · Config fiscal POR EMPRESA (multi-empresa)

   Dentro de «⚙ Parámetros». Lista las empresas receptoras y, por cada una,
   edita INLINE lo fiscal por-empresa con el editor ÚNICO (EmpresaEditor, modo
   'fiscal'): alícuota municipal, licencia y original/copia. Los % nacionales
   (Parámetros → Valores) y el régimen (Parámetros → Régimen) NO viven acá.
   La identidad (nombre, RIF, contacto) se edita en el buzón, con el mismo editor.

   Degradación segura: si la base todavía no trae las columnas fiscales por
   empresa (F-ME1), se avisa y no se edita.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import {
  listEmpresasReceptoras,
  fichaFiscalEmpresaDisponible,
  sincronizarEmpresasDesdeAdmin,
  type EmpresaReceptora,
} from './empresasReceptoras.repository';
import { EmpresaEditor } from './EmpresaEditor';

export interface EditorFichasFiscalesEmpresaProps {
  puedeEditar: boolean;
  onAbrirGestionEmpresas?: () => void;
}

export function EditorFichasFiscalesEmpresa({
  puedeEditar,
  onAbrirGestionEmpresas,
}: EditorFichasFiscalesEmpresaProps) {
  const [empresas, setEmpresas] = useState<EmpresaReceptora[] | null>(null);
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [empresaIdentidadEditar, setEmpresaIdentidadEditar] = useState<EmpresaReceptora | null>(null);

  const cargar = useCallback(async () => {
    const [hay, lista] = await Promise.all([
      fichaFiscalEmpresaDisponible().catch(() => false),
      listEmpresasReceptoras().catch(() => [] as EmpresaReceptora[]),
    ]);
    setDisponible(hay);
    setEmpresas(lista);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const handleSincronizar = async () => {
    setSincronizando(true);
    try {
      const res = await sincronizarEmpresasDesdeAdmin();
      if (res.creadas > 0 || res.actualizadas > 0) {
        toast(`✅ ${res.creadas} empresa(s) importada(s) de Administración, ${res.actualizadas} actualizada(s).`, 'success');
      } else {
        toast('Todas las empresas de Administración ya están sincronizadas.', 'info');
      }
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al sincronizar con Administración.', 'error');
    } finally {
      setSincronizando(false);
    }
  };

  if (empresas === null) return <p className="muted">Cargando empresas…</p>;
  if (disponible === false) {
    return <p className="muted">La configuración fiscal por empresa estará disponible cuando la base traiga sus campos. Por ahora el módulo trabaja con una sola empresa.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: '.9rem' }}>
      {/* Barra de herramientas superior */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.6rem' }}>
        <p className="muted" style={{ margin: 0, fontSize: '.86rem', maxWidth: '600px' }}>
          Lo municipal de cada empresa (alícuota del ISAE, licencia) y la emisión Original/Copia.
          Puedes sincronizar automáticamente con las empresas de Administración o editarlas por completo.
        </p>

        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {puedeEditar && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleSincronizar}
              disabled={sincronizando}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.35rem',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid var(--primary, #f59e0b)',
                color: 'var(--primary, #f59e0b)',
                fontWeight: 600,
              }}
              title="Importar y preconfigurar empresas registradas en el módulo de Administración"
            >
              <span>{sincronizando ? '⏳ Sincronizando…' : '🔄 Sincronizar desde Administración'}</span>
            </button>
          )}

          {onAbrirGestionEmpresas && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onAbrirGestionEmpresas}
              title="Abrir la ventana de gestión completa de empresas"
            >
              ⚙️ Gestionar empresas
            </button>
          )}
        </div>
      </div>

      {empresas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
          <p style={{ fontWeight: 600, margin: '0 0 .5rem' }}>No hay empresas cargadas en el módulo de Retenciones</p>
          <p className="muted" style={{ fontSize: '.84rem', margin: '0 0 .9rem' }}>
            Puedes preconfigurarlas automáticamente trayendo las existentes en Administración.
          </p>
          {puedeEditar && (
            <button type="button" className="btn btn-primary" onClick={handleSincronizar} disabled={sincronizando}>
              🔄 Sincronizar desde Administración
            </button>
          )}
        </div>
      ) : (
        empresas.map((e) => (
          <div key={e.id} className="card" style={{ display: 'grid', gap: '.5rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.4rem' }}>
              <div>
                <strong style={{ fontSize: '.92rem' }}>{e.nombreCorto || e.nombre}</strong>
                <span className="muted mono" style={{ fontSize: '.8rem', marginLeft: '.5rem' }}>· {e.rif}</span>
                {e.municipio && <span className="muted" style={{ fontSize: '.8rem', marginLeft: '.4rem' }}>({e.municipio})</span>}
              </div>

              {puedeEditar && (
                <button
                  type="button"
                  className="btn btn-xs"
                  onClick={() => setEmpresaIdentidadEditar(empresaIdentidadEditar?.id === e.id ? null : e)}
                >
                  {empresaIdentidadEditar?.id === e.id ? 'Cerrar identidad' : '✏️ Editar RIF y datos'}
                </button>
              )}
            </div>

            {empresaIdentidadEditar?.id === e.id && (
              <div style={{ padding: '.8rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <EmpresaEditor
                  modo="identidad"
                  empresa={e}
                  onGuardada={(g) => {
                    setEmpresas((prev) => (prev ?? []).map((x) => (x.id === e.id ? g : x)));
                    setEmpresaIdentidadEditar(null);
                    toast(`Datos de ${g.nombreCorto || g.nombre} guardados.`, 'success');
                  }}
                  onClose={() => setEmpresaIdentidadEditar(null)}
                />
              </div>
            )}

            {puedeEditar ? (
              <EmpresaEditor
                modo="fiscal"
                empresa={e}
                onGuardada={(g) => {
                  setEmpresas((prev) => (prev ?? []).map((x) => (x.id === e.id ? g : x)));
                  toast(`Config fiscal de ${g.nombreCorto || g.nombre} guardada.`, 'success');
                }}
              />
            ) : (
              <div>
                <p className="muted" style={{ margin: '.2rem 0 0', fontSize: '.8rem' }}>Sin permiso para editar.</p>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
