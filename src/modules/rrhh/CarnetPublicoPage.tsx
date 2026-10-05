/* ============================================================
   Golden Touch · RRHH · Lo que se ve al ESCANEAR el QR del carnet (05/10/2026)

   El QR ya no lleva los datos escritos: lleva /c/<token>, y esta página
   (pública, sin iniciar sesión) le pregunta a la base cómo está la persona.
   - Activa   → sus datos de contacto, emergencia y salud, y la vigencia.
   - Inactiva → SOLO el logo de la empresa: un carnet de alguien que ya no
     trabaja aquí no muestra nada de esa persona.
   La base (`carnet_publico`) solo devuelve lo que ya iba en el QR.
   ============================================================ */
import { useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/shared/lib/supabase';
import { EMPRESA_EMAIL, EMPRESA_WHATSAPP } from '@/shared/lib/empresa';
import { lineasSaludQr } from './saludPersonal';
import { PARENTESCOS } from './fichaPersonal';
import { estadoCarnet, fechaCarnet } from './vigenciaCarnet';

interface CarnetPublico {
  activo: boolean;
  nombre?: string; apellido?: string | null; cedula?: string | null;
  cargo?: string | null; departamento?: string | null;
  telefono?: string | null; correo?: string | null;
  contacto_emergencia?: string | null; contacto_emergencia_parentesco?: string | null; telefono_emergencia?: string | null;
  grupo_sanguineo?: string | null;
  tiene_alergias?: boolean | null; alergias_detalle?: string | null;
  tiene_enfermedad?: boolean | null; enfermedad_detalle?: string | null;
  carnet_vence?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGO = `${import.meta.env.BASE_URL}LOGO.jpg`;

const fondo: CSSProperties = {
  minHeight: '100vh', background: '#12151a', color: '#e7ecf3', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: '24px 16px', boxSizing: 'border-box',
  fontFamily: "'Segoe UI', Arial, sans-serif",
};

function SoloLogo() {
  return (
    <div style={fondo}>
      <img src={LOGO} alt="Golden Touch 1127 C.A." style={{ width: 'min(320px, 80vw)', borderRadius: '50%', background: '#fff' }} />
    </div>
  );
}

function Fila({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid #262a31' }}>
      <span style={{ color: '#9aa6b5', fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{valor}</span>
    </div>
  );
}

export function CarnetPublicoPage() {
  const { token = '' } = useParams();
  const [dato, setDato] = useState<CarnetPublico | null | undefined>(undefined);

  useEffect(() => {
    if (!UUID.test(token)) { setDato(null); return; }
    let vivo = true;
    supabase.rpc('carnet_publico', { p_token: token }).then(({ data, error }) => {
      if (vivo) setDato(error ? null : ((data as CarnetPublico | null) ?? null));
    });
    return () => { vivo = false; };
  }, [token]);

  if (dato === undefined) return <div style={fondo}>Cargando…</div>;
  // Inactivo, o un QR que no es de nadie: solo el logo.
  if (!dato || !dato.activo) return <SoloLogo />;

  const estado = estadoCarnet(dato.carnet_vence);
  const parentesco = PARENTESCOS.find((x) => x.valor === dato.contacto_emergencia_parentesco)?.label;
  const emergencia = [dato.contacto_emergencia, parentesco ? `(${parentesco})` : '', dato.telefono_emergencia].filter(Boolean).join(' ');
  const salud = lineasSaludQr(dato);

  return (
    <div style={fondo}>
      <div style={{ width: '100%', maxWidth: 420, background: '#1c1f24', border: '2px solid rgba(255,138,0,.45)', borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(90deg,#ff8a00,#ffa733)', color: '#1a0e00', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={LOGO} alt="" style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>GOLDEN TOUCH 1127 C.A.</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>CARNET DE PERSONAL</div>
          </div>
        </div>
        <div style={{ padding: '18px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, textAlign: 'center' }}>{`${dato.nombre ?? ''} ${dato.apellido ?? ''}`.trim()}</div>
          {dato.cedula && <div style={{ textAlign: 'center', color: '#ffd54a', fontFamily: 'Consolas, monospace', fontSize: 20, fontWeight: 700, marginTop: 4 }}>{dato.cedula}</div>}
          {(dato.cargo || dato.departamento) && (
            <div style={{ textAlign: 'center', color: '#9aa6b5', marginTop: 4 }}>{[dato.cargo, dato.departamento].filter(Boolean).join(' · ')}</div>
          )}
          {dato.carnet_vence && (
            <div style={{
              margin: '14px auto 6px', width: 'fit-content', padding: '6px 14px', borderRadius: 999, fontWeight: 700, fontSize: 14,
              background: estado === 'vencido' ? '#5c1a1a' : estado === 'por_vencer' ? '#5a4310' : '#1f4a2a',
              color: estado === 'vencido' ? '#ffb4b4' : estado === 'por_vencer' ? '#ffe08a' : '#a6f0b8',
            }}>
              {estado === 'vencido' ? 'CARNET VENCIDO' : 'VIGENCIA'}: {fechaCarnet(dato.carnet_vence)}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Fila label="Teléfono" valor={dato.telefono} />
            <Fila label="Correo" valor={dato.correo} />
            <Fila label="Emergencia" valor={emergencia} />
            <Fila label="Grupo sanguíneo" valor={dato.grupo_sanguineo} />
            {salud.map((l) => {
              const [k, ...v] = l.split(': ');
              return <Fila key={k} label={k} valor={v.join(': ')} />;
            })}
          </div>
          <div style={{ marginTop: 16, textAlign: 'center', color: '#9aa6b5', fontSize: 13 }}>
            {EMPRESA_EMAIL} · WhatsApp {EMPRESA_WHATSAPP}
          </div>
        </div>
      </div>
    </div>
  );
}
