/* ============================================================
   Golden Touch · Control de Maquinaria · la Vitrina · siluetas por tipo
   Representación gráfica del protagonista cuando no hay foto real: una
   silueta de acero por TIPO de equipo (y por clase como respaldo), hecha
   con primitivas SVG. Liviana (sin WebGL, sin imágenes), escala sola.
   El color sale de CSS: `.sil-cuerpo` acero, `.sil-rueda` oscuro,
   `.sil-acento` naranja. viewBox 0 0 200 120, de perfil, piso en y≈100.
   ============================================================ */
import { norm } from '@/shared/lib/texto';
import type { ReactNode } from 'react';

type Dibujo = () => ReactNode;

/** Una rueda con su cubo. */
const rueda = (cx: number, cy: number, r: number) => (
  <g key={`r${cx}-${cy}`}>
    <circle className="sil-rueda" cx={cx} cy={cy} r={r} />
    <circle className="sil-cuerpo" cx={cx} cy={cy} r={r * 0.42} />
  </g>
);

const camion: Dibujo = () => (
  <>
    <rect className="sil-cuerpo" x="8" y="40" width="112" height="42" rx="3" />
    <path className="sil-cuerpo" d="M124 50 h30 l16 18 v14 h-46 Z" />
    <rect className="sil-acento" x="132" y="54" width="22" height="13" rx="2" />
    <rect className="sil-cuerpo" x="4" y="82" width="172" height="8" rx="2" />
    {rueda(44, 96, 15)}
    {rueda(92, 96, 15)}
    {rueda(150, 96, 15)}
  </>
);

const camioneta: Dibujo = () => (
  <>
    <path className="sil-cuerpo" d="M20 74 h160 v16 h-160 Z" />
    <path className="sil-cuerpo" d="M58 74 l14 -26 h44 l20 26 Z" />
    <path className="sil-acento" d="M74 72 l10 -18 h26 l13 18 Z" />
    <rect className="sil-cuerpo" x="118" y="60" width="62" height="18" rx="2" />
    {rueda(60, 92, 16)}
    {rueda(146, 92, 16)}
  </>
);

const excavadora: Dibujo = () => (
  <>
    {/* orugas */}
    <rect className="sil-rueda" x="10" y="86" width="120" height="18" rx="9" />
    <circle className="sil-cuerpo" cx="26" cy="95" r="5" />
    <circle className="sil-cuerpo" cx="114" cy="95" r="5" />
    {/* cuerpo giratorio y cabina */}
    <rect className="sil-cuerpo" x="26" y="52" width="86" height="34" rx="4" />
    <path className="sil-acento" d="M34 52 l6 -18 h26 v18 Z" />
    {/* brazo y cucharón */}
    <path className="sil-cuerpo" d="M104 60 L150 34 l10 8 L120 72 Z" />
    <path className="sil-cuerpo" d="M150 34 L182 54 l-8 10 -30 -22 Z" />
    <path className="sil-acento" d="M168 60 q16 6 10 24 l-16 -6 q4 -12 -6 -14 Z" />
  </>
);

const cargador: Dibujo = () => (
  <>
    {/* cuerpo trasero + cabina */}
    <rect className="sil-cuerpo" x="80" y="48" width="72" height="34" rx="4" />
    <path className="sil-acento" d="M96 48 l8 -18 h30 v18 Z" />
    {/* brazo y cucharón frontal */}
    <path className="sil-cuerpo" d="M86 64 L26 70 l0 10 L86 76 Z" />
    <path className="sil-cuerpo" d="M26 60 h10 v30 h-10 Z" />
    <path className="sil-acento" d="M8 62 h20 v30 h-20 l-4 -15 Z" />
    {rueda(72, 92, 18)}
    {rueda(132, 92, 18)}
  </>
);

const moto: Dibujo = () => (
  <>
    {rueda(44, 84, 22)}
    {rueda(158, 84, 22)}
    {/* cuadro */}
    <path className="sil-cuerpo" d="M44 84 L96 56 L140 56 L158 84" fill="none" strokeWidth="7" />
    <path className="sil-acento" d="M84 58 q24 -10 44 0 l-4 12 q-18 -8 -36 0 Z" />
    {/* manillar y asiento */}
    <path className="sil-cuerpo" d="M136 56 l20 -14 l8 4" fill="none" strokeWidth="5" />
    <rect className="sil-cuerpo" x="88" y="50" width="34" height="8" rx="4" />
  </>
);

const lancha: Dibujo = () => (
  <>
    <path className="sil-cuerpo" d="M14 70 L176 70 L150 94 L40 94 Z" />
    <path className="sil-acento" d="M60 70 l14 -20 h44 l10 20 Z" />
    <rect className="sil-cuerpo" x="150" y="52" width="10" height="20" rx="2" />
    <path className="sil-rueda" d="M6 100 q20 -10 40 0 t40 0 t40 0 t40 0 t34 0" fill="none" strokeWidth="4" opacity="0.6" />
  </>
);

const planta: Dibujo = () => (
  <>
    <rect className="sil-cuerpo" x="22" y="42" width="156" height="48" rx="6" />
    <path className="sil-rueda" d="M40 50 v32 M54 50 v32 M68 50 v32 M82 50 v32" strokeWidth="3" fill="none" opacity="0.5" />
    <rect className="sil-acento" x="120" y="54" width="44" height="26" rx="3" />
    <circle className="sil-cuerpo" cx="132" cy="67" r="4" />
    <circle className="sil-cuerpo" cx="150" cy="67" r="4" />
    <rect className="sil-cuerpo" x="150" y="26" width="10" height="18" rx="3" />
    <rect className="sil-rueda" x="22" y="90" width="156" height="8" rx="2" />
  </>
);

const herramienta: Dibujo = () => (
  <>
    <rect className="sil-cuerpo" x="54" y="44" width="92" height="50" rx="6" />
    <rect className="sil-acento" x="66" y="54" width="68" height="18" rx="3" />
    <circle className="sil-rueda" cx="78" cy="94" r="8" />
    <circle className="sil-rueda" cx="122" cy="94" r="8" />
    <path className="sil-cuerpo" d="M146 60 q34 2 30 34" fill="none" strokeWidth="5" />
    <rect className="sil-acento" x="170" y="90" width="18" height="7" rx="2" transform="rotate(20 179 93)" />
  </>
);

const generico: Dibujo = () => (
  <>
    <path className="sil-cuerpo" d="M100 34 l10 4 4 -8 12 4 -2 10 10 7 -6 9 7 10 -10 7 2 10 -12 4 -4 -8 -11 4 -6 -9 -11 2 -2 -11 10 -7 -7 -9 7 -10 11 2 Z" />
    <circle className="sil-rueda" cx="100" cy="70" r="16" />
  </>
);

const POR_TIPO: { claves: string[]; dibujo: Dibujo }[] = [
  { claves: ['retro', 'excavad'], dibujo: excavadora },
  { claves: ['payload', 'cargad'], dibujo: cargador },
  { claves: ['camioneta', 'pick'], dibujo: camioneta },
  { claves: ['camion'], dibujo: camion }, // tras «camioneta»
  { claves: ['moto'], dibujo: moto },
  { claves: ['lancha', 'bote', 'barco'], dibujo: lancha },
  { claves: ['planta', 'generad'], dibujo: planta },
  { claves: ['hidrolav', 'herramient', 'compres', 'soldad'], dibujo: herramienta },
];

const POR_CLASE: Record<string, Dibujo> = {
  maquinaria: excavadora,
  vehiculo: camion,
  moto,
  lancha,
  herramienta,
};

/** Elige el dibujo por tipo (palabra clave) y, si no, por clase. */
function elegir(tipo: string | null | undefined, clase: string | null | undefined): Dibujo {
  const t = norm(tipo ?? '');
  for (const { claves, dibujo } of POR_TIPO) if (claves.some((k) => t.includes(k))) return dibujo;
  return POR_CLASE[norm(clase ?? '')] ?? generico;
}

export function SiluetaMaquina({ tipo, clase, className = '' }: { tipo?: string | null; clase?: string | null; className?: string }) {
  const dibujo = elegir(tipo, clase);
  return (
    <svg className={`sil ${className}`} viewBox="0 0 200 120" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {dibujo()}
    </svg>
  );
}
