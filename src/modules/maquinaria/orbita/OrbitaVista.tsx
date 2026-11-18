/* ============================================================
   Golden Touch · Control de Maquinaria · catálogo de propietarios (E-09)
   La maqueta de Mgg-Sistemas con el «Rosetón de mando» (D26): GENERAL
   dorado al centro con su medidor, el anillo de arcos por propietario y
   las tarjetas alrededor, dos entradas y la flota SIN servicios debajo.
   Recibe los datos: la página real los lee de la base; la de prueba (DEV)
   le pasa datos genéricos. Lo que el usuario asigna queda en el navegador.
   ============================================================ */
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/shared/ui/EmptyState';
import type { MaquinariaEquipo } from '../maquinariaEquipos.repository';
import type { AvisoServicio } from '../flota';
import { armarOrbita, ID_GENERAL, type CategoriaEquipo, type LecturaOrbita } from './orbitaDatos';
import { conCategoria, conPosicion, crearPreferenciasOrbita, type DesplazamientoTarjeta, type EntradaOrbita, type PreferenciasOrbita, type VistaFlota } from './orbitaPreferencias';
import { EscenaRoseton } from './EscenaRoseton';
import { VitrinaVista } from './vitrina/VitrinaVista';
import { TarjetaPropietario } from './TarjetaPropietario';
import { FlotaSinServicios } from './FlotaSinServicios';
import { FichaEquipoModal } from './FichaEquipoModal';
import './orbita.css';

export interface DatosVista {
  equipos: readonly MaquinariaEquipo[];
  lecturas: ReadonlyMap<string, LecturaOrbita>;
  avisos: ReadonlyMap<string, AvisoServicio | null>;
  cargando: boolean;
  error: string | null;
}

const prefiereQuieto = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function OrbitaVista({ datos, prefs: prefsDadas, categoriasIniciales, aviso }: {
  datos: DatosVista;
  /** Por defecto, las de este navegador con el prefijo real. */
  prefs?: PreferenciasOrbita;
  /** Si nunca se guardaron categorías (la demo trae unas de ejemplo). */
  categoriasIniciales?: Record<string, CategoriaEquipo>;
  /** Franja arriba de todo (la demo avisa que es de prueba). */
  aviso?: React.ReactNode;
}) {
  const prefs = useMemo(() => prefsDadas ?? crearPreferenciasOrbita(), [prefsDadas]);
  const [entrada, setEntrada] = useState<EntradaOrbita>(() => prefs.leerEntrada());
  const [vista, setVista] = useState<VistaFlota>(() => prefs.leerVista());
  const [categorias, setCategorias] = useState<Record<string, CategoriaEquipo>>(() => prefs.leerCategorias() ?? categoriasIniciales ?? {});
  const [traspasos] = useState(() => prefs.leerTraspasos());
  const [posiciones, setPosiciones] = useState<Record<string, DesplazamientoTarjeta>>(() => prefs.leerPosiciones());
  const [elegido, setElegido] = useState<string>(ID_GENERAL);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const flotaRef = useRef<HTMLElement>(null);

  const modelo = useMemo(() => armarOrbita({
    equipos: datos.equipos, lecturas: datos.lecturas, avisos: datos.avisos, categorias, traspasos,
  }), [datos.equipos, datos.lecturas, datos.avisos, categorias, traspasos]);

  const propietario = modelo.propietarios.find((p) => p.id === elegido);
  // Si el elegido dejó de existir (p. ej. pasó a «Otros»), se vuelve a GENERAL.
  const elegidoVivo = propietario ? elegido : ID_GENERAL;
  const fila = fichaId ? modelo.flota.find((f) => f.id === fichaId) : undefined;

  const elegir = (id: string) => {
    setElegido(id);
    // Como en el encargo: se marca, se filtra la flota y la página baja hasta ella.
    requestAnimationFrame(() => flotaRef.current?.scrollIntoView({ behavior: prefiereQuieto() ? 'auto' : 'smooth', block: 'start' }));
  };
  const cambiarEntrada = (e: EntradaOrbita) => {
    setEntrada(e);
    prefs.guardarEntrada(e);
    if (e === 'directo') setElegido(ID_GENERAL);
  };
  const cambiarVista = (v: VistaFlota) => {
    setVista(v);
    prefs.guardarVista(v);
  };
  const cambiarCategoria = (equipoId: string, c: CategoriaEquipo | 'por_asignar') => {
    setCategorias((prev) => {
      const nuevas = conCategoria(prev, equipoId, c);
      prefs.guardarCategorias(nuevas);
      return nuevas;
    });
  };
  const moverTarjeta = (id: string, d: DesplazamientoTarjeta) => {
    setPosiciones((prev) => {
      const nuevas = conPosicion(prev, id, d);
      prefs.guardarPosiciones(nuevas);
      return nuevas;
    });
  };
  const restablecerPosiciones = () => {
    setPosiciones({});
    prefs.limpiarPosiciones();
  };
  const hayMovidas = Object.keys(posiciones).length > 0;

  return (
    <div className="orb">
      {aviso}
      <header className="orb-cab">
        <div className="orb-cab-fila">
          <div>
            <h1>🚜 Control de maquinaria · <span className="orb-dorado">Catálogo de propietarios</span></h1>
            <p>De quién son los equipos y cómo están. Al elegir un propietario, la flota de abajo se segmenta: <strong>sin servicios</strong>.</p>
          </div>
          <Link to="/app/maquinaria" className="btn btn-ghost">← Volver al módulo de maquinaria</Link>
        </div>
        <div className="orb-entradas">
          <span className="orb-entradas-tit">Elige la experiencia de entrada</span>
          <div className="view-toggle" role="tablist" aria-label="Entrada">
            <button type="button" role="tab" aria-selected={entrada === 'mindmap'} className={entrada === 'mindmap' ? 'active' : ''}
              onClick={() => cambiarEntrada('mindmap')}>⚙ Mapa de propietarios</button>
            <button type="button" role="tab" aria-selected={entrada === 'vitrina'} className={entrada === 'vitrina' ? 'active' : ''}
              onClick={() => cambiarEntrada('vitrina')}>🎬 Vitrina</button>
            <button type="button" role="tab" aria-selected={entrada === 'directo'} className={entrada === 'directo' ? 'active' : ''}
              onClick={() => cambiarEntrada('directo')}>🚜 Directo a la flota</button>
          </div>
        </div>
      </header>

      {datos.error && (
        <div className="orb-aviso">
          No se pudo leer la flota{/sesi|jwt|auth|401|permission/i.test(datos.error) ? ': inicia sesión en el sistema para verla.' : `: ${datos.error}`}
        </div>
      )}

      {datos.cargando ? (
        <p className="orb-cargando">Leyendo la flota…</p>
      ) : !datos.equipos.length ? (
        <EmptyState icon="🚜" message={datos.error ? 'Sin datos de la flota.' : 'No hay equipos registrados.'} />
      ) : (
        <>
          {entrada === 'mindmap' && (
            <section className="orb-mapa" aria-label="Mapa de propietarios">
              <div className="orb-mapa-cab">
                <span><strong>Mapa de propietarios</strong>: toca para segmentar la flota · arrastra las tarjetas para acomodarlas</span>
                <div className="orb-mapa-acciones">
                  {hayMovidas && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={restablecerPosiciones}>↺ Restablecer posiciones</button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm orb-dorado" onClick={() => elegir(ID_GENERAL)}>👑 Ver toda la flota</button>
                </div>
              </div>
              <EscenaRoseton general={modelo.general} propietarios={modelo.propietarios} elegido={elegidoVivo} onElegir={elegir}
                desplazamientos={posiciones} onMover={moverTarjeta} />
              {/* Teléfono: el rosetón solo, y las tarjetas en lista, en el orden del anillo. */}
              <div className="ros-lista" role="group" aria-label="Propietarios">
                {modelo.propietarios.map((p) => (
                  <TarjetaPropietario key={p.id} p={p} elegido={elegidoVivo === p.id} onElegir={() => elegir(p.id)} />
                ))}
              </div>
            </section>
          )}
          {entrada === 'vitrina' && (
            <section className="orb-vitrina" aria-label="Vitrina de la flota">
              <VitrinaVista modelo={modelo} onElegir={elegir} />
            </section>
          )}
          <FlotaSinServicios ref={flotaRef} elegido={elegidoVivo} conteo={propietario ?? modelo.general} propietario={propietario}
            flota={modelo.flota} vista={vista} onVista={cambiarVista} onVerGeneral={() => elegir(ID_GENERAL)}
            onFicha={setFichaId} onCategoria={cambiarCategoria} />
        </>
      )}

      {fila && <FichaEquipoModal f={fila} onCategoria={(c) => cambiarCategoria(fila.id, c)} onCerrar={() => setFichaId(null)} />}
    </div>
  );
}
