/* ============================================================
   Golden Touch · Inventario Móvil · Selector «Solicitado por» con alta rápida
   (18/11/2026)

   Permite buscar y elegir quién solicitó la salida o el traslado, y si la
   persona no existe en la lista, añadirla al instante (tanto escribiendo en
   el buscador como tocando «＋ Añadir persona»). Se sincroniza con el catálogo
   compartido (`combustible_catalogos` tipo `autorizado`), con los nombres ya
   usados en salidas del depósito y con respaldo local.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { supabase } from '@/shared/lib/supabase';
import { useRealtime } from '@/shared/lib/useRealtime';
import { asegurarCatalogo, listCatalogos } from '@/modules/combustible/tanques.repository';
import { normalizarNombreSolicitante, unirNombresSolicitantes } from './solicitantesMovil';

const STORAGE_KEY = 'gt_inventario_solicitantes_movil_v1';

function leerLocales(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function guardarLocales(lista: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  } catch {
    /* ignore */
  }
}

export function CampoSolicitadoPorMovil({
  id,
  value,
  onChange,
  disabled = false,
  notaExtra,
}: {
  id: string;
  value: string;
  onChange: (nuevo: string) => void;
  disabled?: boolean;
  notaExtra?: ReactNode;
}) {
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [historicos, setHistoricos] = useState<string[]>([]);
  const [locales, setLocales] = useState<string[]>(() => leerLocales());
  const [agregando, setAgregando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const cargar = useCallback(() => {
    listCatalogos()
      .then((cs) => setCatalogo(cs.filter((c) => c.tipo === 'autorizado' && c.activo).map((c) => c.valor)))
      .catch(() => {});

    supabase
      .from('deposito_mina_salidas')
      .select('autorizado_por')
      .not('autorizado_por', 'is', null)
      .order('created_at', { ascending: false })
      .limit(250)
      .then(({ data }) => {
        if (!data) return;
        const nombres = (data as Array<{ autorizado_por?: string | null }>)
          .map((r) => String(r.autorizado_por ?? '').trim())
          .filter(Boolean);
        setHistoricos(nombres);
      });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useRealtime(['combustible_catalogos', 'deposito_mina_salidas'], cargar);

  const personas = useMemo(
    () => unirNombresSolicitantes(catalogo, historicos, locales, value ? [value] : []),
    [catalogo, historicos, locales, value],
  );

  async function registrarPersonaNueva(raw: string) {
    const limpio = normalizarNombreSolicitante(raw);
    if (limpio.length < 2) {
      toast('Escribe el nombre de la persona.', 'warning');
      return;
    }
    setGuardandoNuevo(true);
    try {
      const siguientesLocales = unirNombresSolicitantes(locales, [limpio]);
      setLocales(siguientesLocales);
      guardarLocales(siguientesLocales);
      onChange(limpio);
      setNuevoNombre('');
      setAgregando(false);

      // Persistir también en el catálogo general (si el rol tiene permiso en catálogo, queda para todos al instante).
      await asegurarCatalogo('autorizado', limpio).catch(() => null);
      toast(`«${limpio}» añadido a la lista de solicitantes.`, 'success');
    } finally {
      setGuardandoNuevo(false);
    }
  }

  function handleSelectOrCreate(elegido: string) {
    const limpio = normalizarNombreSolicitante(elegido);
    if (!limpio) {
      onChange('');
      return;
    }
    const yaExiste = personas.some((p) => p.toLowerCase() === limpio.toLowerCase());
    if (!yaExiste) {
      void registrarPersonaNueva(limpio);
    } else {
      onChange(limpio);
    }
  }

  return (
    <div className="surt-campo">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <label htmlFor={id} style={{ marginBottom: 0 }}>
          Solicitado por {notaExtra}
        </label>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={disabled}
          onClick={() => setAgregando((v) => !v)}
          style={{ fontSize: '.78rem', padding: '.2rem .55rem' }}
        >
          {agregando ? '✕ Cancelar' : '＋ Añadir persona'}
        </button>
      </div>

      {agregando && (
        <div
          style={{
            display: 'flex',
            gap: '.4rem',
            marginTop: '.35rem',
            marginBottom: '.35rem',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            className="input surt-input"
            style={{ flex: 1, minWidth: 180 }}
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre y apellido de quien solicita…"
            autoFocus
            disabled={disabled || guardandoNuevo}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void registrarPersonaNueva(nuevoNombre);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={disabled || guardandoNuevo || nuevoNombre.trim().length < 2}
            onClick={() => void registrarPersonaNueva(nuevoNombre)}
          >
            {guardandoNuevo ? 'Añadiendo…' : '✓ Añadir'}
          </button>
        </div>
      )}

      <div className="surt-buscable">
        <SearchSelect
          id={id}
          value={value}
          onChange={handleSelectOrCreate}
          disabled={disabled}
          allowCreate
          createLabel={(q) => `➕ Añadir «${normalizarNombreSolicitante(q)}» a la lista`}
          placeholder="🔍 Busca o escribe quién solicitó…"
          options={personas.map((v) => ({ value: v, label: v }))}
        />
      </div>
    </div>
  );
}
