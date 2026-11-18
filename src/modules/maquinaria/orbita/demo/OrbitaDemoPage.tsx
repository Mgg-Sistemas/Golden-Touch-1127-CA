/* ============================================================
   Golden Touch · Control de Maquinaria · catálogo · página de prueba
   SOLO LOCAL (App.tsx la registra con import.meta.env.DEV): el catálogo
   con datos genéricos («EMPRESA A…»), sin sesión ni base. Sus preferencias
   van con otro prefijo, para no mezclarse con las reales.
   `?equipos=N` repite la flota genérica hasta N equipos (para medir el
   peso con 100, guía del rosetón §5).
   ============================================================ */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OrbitaVista } from '../OrbitaVista';
import { crearPreferenciasOrbita, PREFIJO_ORBITA_DEMO } from '../orbitaPreferencias';
import { datosDemoOrbita, type DatosDemoOrbita } from './datosDemoOrbita';

/** La demo con exactamente `n` equipos: repite los genéricos con otro id. */
function conEquipos(d: DatosDemoOrbita, n: number): DatosDemoOrbita {
  if (!Number.isFinite(n) || n <= 0 || n === d.equipos.length) return d;
  const equipos = Array.from({ length: n }, (_, i) => {
    const base = d.equipos[i % d.equipos.length];
    return i < d.equipos.length ? base : { ...base, id: `${base.id}-r${Math.floor(i / d.equipos.length)}` };
  });
  const lecturas = new Map(equipos.map((e) => [e.id, d.lecturas.get(e.id.replace(/-r\d+$/, '')) ?? { horometro: null, kilometraje: null }]));
  const avisos = new Map(equipos.map((e) => [e.id, d.avisos.get(e.id.replace(/-r\d+$/, '')) ?? null]));
  return { ...d, equipos, lecturas, avisos };
}

export function OrbitaDemoPage() {
  const [params] = useSearchParams();
  const n = Number(params.get('equipos') ?? '');
  const demo = useMemo(() => conEquipos(datosDemoOrbita(), n), [n]);
  const prefs = useMemo(() => crearPreferenciasOrbita(PREFIJO_ORBITA_DEMO), []);
  return (
    <main className="orb-demo">
      <OrbitaVista datos={{ ...demo, cargando: false, error: null }} prefs={prefs} categoriasIniciales={demo.categorias}
        aviso={<div className="orb-aviso demo">🧪 Página de prueba local · datos genéricos ({demo.equipos.length} equipos) · no toca la base</div>} />
    </main>
  );
}
