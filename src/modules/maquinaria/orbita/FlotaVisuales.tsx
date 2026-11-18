/* ============================================================
   Golden Touch · Control de Maquinaria · visuales embebidos (E-09)
   El Rosetón y la Vitrina montados DENTRO de «Flota y Equipos» como capa
   de DESCUBRIMIENTO: reciben los datos que la página ya leyó (equipos,
   lecturas vigentes y avisos) y arman el modelo de la Órbita. El selector
   de vista (Rosetón · Vitrina · Lista) vive en MaquinariaPage.

   Flujo (decisión del usuario, 09-10/11):
   · Rosetón → tocar una empresa = transición cinemática a su Vitrina
     enfocada (zoom+desvanecido de una sola vez; prefers-reduced-motion =
     corte limpio).
   · «Ver su flota» / «Ver toda la flota» NO caen en una lista simple:
     llevan a la LISTA RICA de la página (onVerFlota), prefiltrada por la
     empresa, donde se filtra por tipo, ubicación y estado, y cada vehículo
     abre su expediente. Así la experiencia es una sola, sin incongruencias.
   · La categoría del propietario se LEE de la ficha (BD) para colorear el
     mapa; se ASIGNA en la ficha del equipo (no aquí).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import type { MaquinariaEquipo } from '../maquinariaEquipos.repository';
import type { AvisoServicio } from '../flota';
import { armarOrbita, ID_GENERAL, ID_SIN, ID_OTROS, type CategoriaEquipo, type LecturaOrbita } from './orbitaDatos';
import { conPosicion, crearPreferenciasOrbita, type DesplazamientoTarjeta, type PreferenciasOrbita } from './orbitaPreferencias';
import { EscenaRoseton } from './EscenaRoseton';
import { VitrinaVista } from './vitrina/VitrinaVista';
import { TarjetaPropietario } from './TarjetaPropietario';
import './orbita.css';

export type EscenaFlota = 'roseton' | 'vitrina';

/** Filtro de propietario para la lista rica: el nombre, '__sin__' (sin propietario) o null (toda la flota). */
export type FiltroPropietario = string | null;

export function FlotaVisuales({ escena, equipos, lecturas, avisos, fotos, propietarioActivo, onVerFlota, onSeleccionarPropietario, onVerUbicacion, prefs: prefsDadas }: {
  /** Qué visual pinta el selector de la página. */
  escena: EscenaFlota;
  equipos: readonly MaquinariaEquipo[];
  lecturas: ReadonlyMap<string, LecturaOrbita>;
  avisos: ReadonlyMap<string, AvisoServicio | null>;
  /** Mapa de fotos reales por equipo_id */
  fotos?: ReadonlyMap<string, string>;
  /** Propietario actualmente seleccionado en la lista (si lo hay) */
  propietarioActivo?: string;
  /** Llevar a la LISTA RICA de la página, filtrada por este propietario. */
  onVerFlota: (propietario: FiltroPropietario) => void;
  /** Sincronizar el propietario seleccionado sin salir de la vista actual */
  onSeleccionarPropietario?: (propietario: FiltroPropietario) => void;
  /** Llevar a la LISTA RICA de la página, filtrada por esta ubicación. */
  onVerUbicacion?: (ubicacion: string) => void;
  /** Por defecto, las de este navegador con el prefijo real (posiciones del rosetón). */
  prefs?: PreferenciasOrbita;
}) {
  const prefs = useMemo(() => prefsDadas ?? crearPreferenciasOrbita(), [prefsDadas]);
  const [traspasos] = useState(() => prefs.leerTraspasos());
  const [posiciones, setPosiciones] = useState<Record<string, DesplazamientoTarjeta>>(() => prefs.leerPosiciones());
  // Drill cinemático: empresa a la que se entró desde el mapa (null = sin drill).
  const [drillId, setDrillId] = useState<string | null>(null);
  const [saliendoDrill, setSaliendoDrill] = useState(false);

  // La categoría se LEE de la ficha (BD); sin dato = por asignar. (La asignación vive en la ficha del equipo.)
  const categorias = useMemo(() => {
    const m: Record<string, CategoriaEquipo> = {};
    for (const e of equipos) if (e.categoria_propietario) m[e.id] = e.categoria_propietario;
    return m;
  }, [equipos]);

  const modelo = useMemo(
    () => armarOrbita({ equipos, lecturas, avisos, categorias, traspasos }),
    [equipos, lecturas, avisos, categorias, traspasos],
  );

  const empresaDrill = drillId ? modelo.propietarios.find((p) => p.id === drillId) : undefined;
  const enDrill = !!drillId && !!empresaDrill;

  // El selector de la página manda: al cambiar de vista, se sale del drill.
  useEffect(() => { setDrillId(null); }, [escena]);

  // Un propietario del modelo → el filtro que entiende la lista rica.
  const verFlotaDe = (id: string) => {
    if (id === ID_GENERAL || id === ID_OTROS) { onVerFlota(null); return; } // GENERAL y el agregado «Otros» = toda la flota
    if (id === ID_SIN) { onVerFlota('__sin__'); return; }
    const prop = modelo.propietarios.find((p) => p.id === id);
    onVerFlota(prop?.nombre ?? id);
  };
  const verUbicacionDe = (ubicacion: string) => {
    if (onVerUbicacion) onVerUbicacion(ubicacion);
    else onVerFlota(null);
  };
  // Clic en el Rosetón: GENERAL muestra toda la flota (lista); una empresa entra a su Vitrina (drill) y preselecciona el propietario.
  const elegirDesdeMapa = (id: string) => {
    if (id === ID_GENERAL) { onVerFlota(null); return; }
    const prop = modelo.propietarios.find((p) => p.id === id);
    const nom = id === ID_SIN ? '__sin__' : (prop?.nombre ?? id);
    if (onSeleccionarPropietario) onSeleccionarPropietario(nom);
    setDrillId(id);
  };
  const volverAlMapa = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDrillId(null);
      return;
    }
    setSaliendoDrill(true);
    setTimeout(() => {
      setDrillId(null);
      setSaliendoDrill(false);
    }, 200);
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
    <div className="orb orb-embebido">
      {enDrill ? (
        <section className={`orb-vitrina orb-drill ${saliendoDrill ? 'orb-drill-sale' : 'orb-drill-entra'}`} aria-label={`Vitrina de ${empresaDrill!.nombre}`}>
          <div className="orb-drill-barra">
            <button type="button" className="btn btn-ghost btn-sm" onClick={volverAlMapa}>← Volver al mapa</button>
            <span className="orb-drill-rotulo">🏢 <strong>{empresaDrill!.nombre}</strong> · explorando desde el mapa</span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => verFlotaDe(drillId!)}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}
            >
              🚜 Ver en lista ({empresaDrill!.total})
            </button>
          </div>
          <VitrinaVista modelo={modelo} onElegir={verFlotaDe} onElegirUbicacion={verUbicacionDe} fotos={fotos} modoInicial="propietario" enfocarId={drillId} />
        </section>
      ) : escena === 'roseton' ? (
        <section key="mapa" className="orb-mapa orb-mapa-entra" aria-label="Mapa de propietarios">
          <div className="orb-mapa-cab">
            <span><strong>Mapa de propietarios</strong>: toca una empresa para entrar a su vitrina · arrastra las tarjetas para acomodarlas</span>
            <div className="orb-mapa-acciones">
              {hayMovidas && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={restablecerPosiciones}>↺ Restablecer posiciones</button>
              )}
              <button type="button" className="btn btn-ghost btn-sm orb-dorado" onClick={() => onVerFlota(null)}>👑 Ver toda la flota</button>
            </div>
          </div>
          <EscenaRoseton
            general={modelo.general}
            propietarios={modelo.propietarios}
            elegido={drillId ?? (propietarioActivo ? (modelo.propietarios.find((p) => p.nombre === propietarioActivo || (p.id === ID_SIN && propietarioActivo === '__sin__'))?.id ?? ID_GENERAL) : ID_GENERAL)}
            onElegir={elegirDesdeMapa}
            desplazamientos={posiciones}
            onMover={moverTarjeta}
          />
          {/* Teléfono: el rosetón solo, y las tarjetas en lista, en el orden del anillo. */}
          <div className="ros-lista" role="group" aria-label="Propietarios">
            {modelo.propietarios.map((p) => (
              <TarjetaPropietario
                key={p.id}
                p={p}
                elegido={p.id === drillId || (!!propietarioActivo && (p.nombre === propietarioActivo || (p.id === ID_SIN && propietarioActivo === '__sin__')))}
                onElegir={() => elegirDesdeMapa(p.id)}
              />
            ))}
          </div>
        </section>
      ) : (
        <section key="vitrina" className="orb-vitrina orb-vitrina-entra" aria-label="Vitrina de la flota">
          <VitrinaVista modelo={modelo} onElegir={verFlotaDe} onElegirUbicacion={verUbicacionDe} fotos={fotos} />
        </section>
      )}
    </div>
  );
}
