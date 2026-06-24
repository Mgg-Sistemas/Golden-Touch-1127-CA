import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signIn, signOutLocal } from './authStore';
import { isSupabaseConfigured } from '@/shared/lib/supabase';
import { isWebAuthnSupported, huellaHint, loginConHuella } from './webauthn.repository';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Login con huella (WebAuthn): solo si el navegador lo soporta. Si este equipo
  // ya tiene una huella enrolada, prellenamos el correo y lo ofrecemos primero.
  const [huellaBusy, setHuellaBusy] = useState(false);
  const soportaHuella = isWebAuthnSupported();
  const hint = huellaHint();

  // Forzar logout al abrir el login: el usuario debe autenticarse siempre.
  const didCleanRef = useRef(false);
  useEffect(() => {
    if (didCleanRef.current) return;
    didCleanRef.current = true;
    if (isSupabaseConfigured) {
      signOutLocal().catch(() => {});
    }
    if (hint) setEmail(hint);
  }, [hint]);

  async function handleHuella() {
    const correo = (email || hint || '').trim();
    if (!correo) { setError('Escribí tu correo para entrar con huella.'); return; }
    setError(null);
    setHuellaBusy(true);
    try {
      await loginConHuella(correo);
      navigate('/app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo entrar con huella.');
    } finally {
      setHuellaBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError('Supabase no configurado. Crea .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: authError } = await signIn(email, password);
    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    navigate('/app');
  }

  return (
    <div className="login-page">
      <aside className="login-aside">
        <div
          className="login-aside-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            flex: 1,
            gap: '1.5rem',
          }}
        >
          <div className="brand" style={{ flexDirection: 'column', alignItems: 'center', gap: '.75rem' }}>
            <img src="/LOGO.jpg" alt="GOLDEN TOUCH 1127 C.A." style={{ width: 72, height: 72 }} />
            <div className="brand-text" style={{ alignItems: 'center' }}>
              <strong>GOLDEN TOUCH 1127 C.A.</strong>
              <small>1127 C.A.</small>
            </div>
          </div>

          <p className="quote" style={{ maxWidth: 480 }}>
            Bienvenido al Sistema de Gestión de la Empresa.
          </p>
        </div>

        <div className="footnote">
          <span>© GOLDEN TOUCH 1127 C.A.</span>
          <span>v0.3.0</span>
        </div>
      </aside>

      <div className="login-form-wrap">
        <form className="login-form" onSubmit={handleSubmit}>
          <Link to="/" className="back-link">← Volver al inicio</Link>

          <h1>Iniciar sesión</h1>
          <p className="sub">Ingresa con tu cuenta corporativa GOLDEN TOUCH 1127 C.A.</p>

          {!isSupabaseConfigured && (
            <div className="badge warning" style={{ marginBottom: '1rem', display: 'block', padding: '.6rem .8rem' }}>
              Supabase aún no configurado · revisa .env.local
            </div>
          )}

          <div className="form-row">
            <label htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              className="input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-row">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              className="input"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="badge danger" style={{ display: 'block', padding: '.6rem .8rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting || huellaBusy}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>

          {soportaHuella && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', margin: '.9rem 0', color: 'var(--muted, #888)', fontSize: '.78rem' }}>
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                o
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center', gap: '.5rem' }}
                onClick={() => void handleHuella()}
                disabled={submitting || huellaBusy}
                title="Entrar con la huella registrada en este equipo"
              >
                🔒 {huellaBusy ? 'Verificando…' : 'Entrar con huella'}
              </button>
              <div className="login-help" style={{ marginTop: '.4rem' }}>
                {hint
                  ? <>Huella activa en este equipo para <strong>{hint}</strong>.</>
                  : <>Para usar huella, primero entrá con tu clave y activala desde tu sesión.</>}
              </div>
            </>
          )}

          <div className="login-help">
            ¿Sin cuenta? Pídele al administrador que te dé acceso.
          </div>
        </form>
      </div>
    </div>
  );
}
