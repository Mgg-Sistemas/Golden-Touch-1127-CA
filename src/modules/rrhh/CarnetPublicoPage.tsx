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

  const nombre = `${dato.nombre ?? ''} ${dato.apellido ?? ''}`.trim();
  const vencido = estadoCarnet(dato.carnet_vence) === 'vencido';
  const parentesco = PARENTESCOS.find((x) => x.valor === dato.contacto_emergencia_parentesco)?.label;
  const emergencia = [dato.contacto_emergencia, parentesco ? `(${parentesco})` : '', dato.telefono_emergencia].filter(Boolean).join(' ');
  const salud = lineasSaludQr(dato);
  const filas: [string, string | null | undefined][] = [
    ['Cédula', dato.cedula],
    ['Cargo', dato.cargo],
    ['Departamento', dato.departamento],
    ['Teléfono', dato.telefono],
    ['Grupo sanguíneo', dato.grupo_sanguineo],
    ['Emergencia', emergencia],
    ['Vigencia', fechaCarnet(dato.carnet_vence)],
  ];

  return (
    <div style={{ ...fondo, alignItems: 'flex-start', background: '#14110d', color: '#f4efe6' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <img src={LOGO} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', background: '#fff' }} />
          <div>
            <div style={{ fontWeight: 800, color: '#ff9f2e', letterSpacing: '.02em', fontSize: 17 }}>GOLDEN TOUCH 1127 C.A.</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>Carnet de identificación · verificado en línea</div>
          </div>
        </div>
        <div style={{
          padding: '11px 13px', borderRadius: 10, marginBottom: 16, fontWeight: 700, fontSize: 15,
          background: vencido ? 'rgba(220,60,60,.18)' : 'rgba(60,180,100,.18)',
          border: `1px solid ${vencido ? '#dc3c3c' : '#3cb464'}`,
        }}>
          {vencido ? `⚠ Trabajador activo · CARNET VENCIDO desde el ${fechaCarnet(dato.carnet_vence)}` : '✓ Trabajador activo · carnet vigente'}
        </div>
        <h1 style={{ fontSize: 26, margin: '0 0 14px', lineHeight: 1.2 }}>{nombre || '—'}</h1>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '9px 16px', fontSize: 16 }}>
          {filas.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt style={{ opacity: 0.65 }}>{k}</dt>
              <dd style={{ margin: 0, fontWeight: 600, wordBreak: 'break-word' }}>{v}</dd>
            </div>
          ))}
        </dl>
        {salud.length > 0 && (
          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,138,0,.14)', border: '1px solid #ff8a00' }}>
            {salud.map((l) => <div key={l} style={{ fontWeight: 700 }}>{l}</div>)}
          </div>
        )}
        <div style={{ marginTop: 22, fontSize: 13, opacity: 0.6 }}>{EMPRESA_EMAIL} · WhatsApp {EMPRESA_WHATSAPP}</div>
      </div>
    </div>
  );
}
