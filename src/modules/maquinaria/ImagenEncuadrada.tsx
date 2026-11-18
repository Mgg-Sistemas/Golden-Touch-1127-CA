import { useEffect, useRef, useState } from 'react';
import { recorteDeEncuadre, esNeutro, type Encuadre } from '@/modules/rrhh/encuadreFoto';

/**
 * Foto del expediente de maquinaria:
 * - Sin encuadre personalizado: presenta el vehículo completo y centrado (contain)
 *   sobre un fondo cinemático difuminado de la misma foto, evitando recortes
 *   agresivos en fotos verticales o cuadradas.
 * - Con encuadre personalizado: respeta fielmente el zoom y centro elegidos en
 *   «Ajustar foto», con el mismo cálculo continuo.
 * - Al hacer clic en la foto, permite abrirla en alta resolución si se pasa `onAmpliar`.
 */
export function ImagenEncuadrada({
  src,
  alt,
  encuadre,
  onAmpliar,
}: {
  src: string;
  alt: string;
  encuadre?: Encuadre | null;
  onAmpliar?: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [destino, setDestino] = useState<{ w: number; h: number } | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setDestino({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { setNat(null); }, [src]);

  const tieneEncuadrePersonalizado = Boolean(encuadre && !esNeutro(encuadre));

  let estilo: React.CSSProperties | undefined;
  if (tieneEncuadrePersonalizado && destino && nat && destino.w > 0 && destino.h > 0) {
    const { sx, sy, sw } = recorteDeEncuadre(nat.w, nat.h, destino.w, destino.h, encuadre);
    if (sw > 0) {
      const k = destino.w / sw;
      estilo = { position: 'absolute', left: -sx * k, top: -sy * k, width: nat.w * k, height: nat.h * k, maxWidth: 'none', objectFit: 'fill' };
    }
  }

  return (
    <div
      ref={caja}
      className="flo-media-canvas"
      onClick={onAmpliar}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: onAmpliar ? 'zoom-in' : undefined }}
      title={onAmpliar ? 'Clic para ampliar foto en alta resolución' : undefined}
    >
      {/* Fondo ambiental difuminado cinemático */}
      <div
        className="flo-media-glow-bg"
        style={{ backgroundImage: `url("${src}")` }}
        aria-hidden="true"
      />

      {tieneEncuadrePersonalizado ? (
        <img
          src={src}
          alt={alt}
          style={estilo}
          onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      ) : (
        <div className="flo-media-fg">
          <img
            src={src}
            alt={alt}
            className="flo-media-hero-img"
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
        </div>
      )}
    </div>
  );
}
