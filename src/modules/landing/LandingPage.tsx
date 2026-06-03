import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand">
          <img src="/LOGO.jpg" alt="Golden Touch" />
          <div className="brand-text">
            <strong>Golden Touch</strong>
            <small>1127 C.A.</small>
          </div>
        </Link>
        <Link to="/login" className="btn btn-primary btn-sm">Ingresar</Link>
      </header>

      <section className="hero" style={{ minHeight: 'calc(100vh - 88px)' }}>
        <div>
          <span className="hero-eyebrow">⬢ Golden Touch 1127 C.A.</span>
          <h1>
            🪨 De la tierra al <span className="grad">estaño</span>.
          </h1>
          <p className="lead">
            ⚒ Expertos en la explotación de casiterita hasta su transformación en estaño.
            <br />
            📈 Calidad, responsabilidad e innovación.
          </p>
          <div className="hero-actions">
            <Link to="/login" className="btn btn-primary">Acceder al sistema →</Link>
            <a
              href="https://www.instagram.com/goldentouch.ca/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              aria-label="Instagram de Golden Touch"
              title="Síguenos en Instagram"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}
            >
              <InstagramIcon size={22} />
              @goldentouch.ca
            </a>
          </div>
        </div>
        <div className="hero-visual">
          <img src="/LOGO.jpg" alt="Logo Golden Touch" />
        </div>
      </section>
    </div>
  );
}

/** Logo de Instagram (degradado oficial). */
function InstagramIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <radialGradient id="igGrad" cx="0.3" cy="1" r="1">
          <stop offset="0" stopColor="#fdf497" />
          <stop offset="0.05" stopColor="#fdf497" />
          <stop offset="0.45" stopColor="#fd5949" />
          <stop offset="0.6" stopColor="#d6249f" />
          <stop offset="0.9" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#igGrad)" />
      <circle cx="16" cy="16" r="6" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="23" cy="9" r="1.6" fill="#fff" />
      <rect x="7" y="7" width="18" height="18" rx="6" fill="none" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}
