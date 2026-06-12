import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signIn, signOutLocal } from './authStore';
import { isSupabaseConfigured } from '@/shared/lib/supabase';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forzar logout al abrir el login: el usuario debe autenticarse siempre.
  const didCleanRef = useRef(false);
  useEffect(() => {
    if (didCleanRef.current) return;
    didCleanRef.current = true;
    if (isSupabaseConfigured) {
      signOutLocal().catch(() => {});
    }
  }, []);

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

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>

          <div className="login-help">
            ¿Sin cuenta? Pídele al administrador que te dé acceso.
          </div>
        </form>
      </div>
    </div>
  );
}
