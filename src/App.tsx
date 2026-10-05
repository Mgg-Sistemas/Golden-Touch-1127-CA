import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './modules/landing/LandingPage';
import { LoginPage } from './modules/auth/LoginPage';
import { AppShell } from './shared/ui/AppShell';
import { ProtectedRoute } from './modules/auth/ProtectedRoute';
import { PermissionsProvider, RequireModule, RequireAdmin, RequireVistaTelefono, HomeRedirect } from './modules/auth/PermissionsContext';
import { ToastHost } from './shared/ui/Toast';
import { PasswordChangeGate } from './modules/usuarios/PasswordChangeGate';

// Lazy: las páginas internas se descargan en chunks separados al navegarlas.
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const PedidosPage = lazy(() => import('./modules/pedidos/PedidosPage').then((m) => ({ default: m.PedidosPage })));
const HistoricoPage = lazy(() => import('./modules/pedidos/HistoricoPage').then((m) => ({ default: m.HistoricoPage })));
const ProveedoresPage = lazy(() => import('./modules/proveedores/ProveedoresPage').then((m) => ({ default: m.ProveedoresPage })));
const InventarioPage = lazy(() => import('./modules/inventario/InventarioPage').then((m) => ({ default: m.InventarioPage })));
const ProduccionPage = lazy(() => import('./modules/produccion/ProduccionPage').then((m) => ({ default: m.ProduccionPage })));
const SalidasPage = lazy(() => import('./modules/salidas/SalidasPage').then((m) => ({ default: m.SalidasPage })));
const CombustiblePage = lazy(() => import('./modules/combustible/CombustiblePage').then((m) => ({ default: m.CombustiblePage })));
const SurtidorMovilView = lazy(() => import('./modules/combustible/SurtidorMovilView').then((m) => ({ default: m.SurtidorMovilView })));
const AcopioPage = lazy(() => import('./modules/acopio/AcopioPage').then((m) => ({ default: m.AcopioPage })));
const CocinaPage = lazy(() => import('./modules/cocina/CocinaPage').then((m) => ({ default: m.CocinaPage })));
const ComidasMovilView = lazy(() => import('./modules/cocina/ComidasMovilView').then((m) => ({ default: m.ComidasMovilView })));
const RrhhPage = lazy(() => import('./modules/rrhh/RrhhPage').then((m) => ({ default: m.RrhhPage })));
const GeodestaPage = lazy(() => import('./modules/geodesta/GeodestaPage').then((m) => ({ default: m.GeodestaPage })));
const TesoreriaPage = lazy(() => import('./modules/tesoreria/TesoreriaPage').then((m) => ({ default: m.TesoreriaPage })));
const AsignacionesPage = lazy(() => import('./modules/asignaciones/AsignacionesPage').then((m) => ({ default: m.AsignacionesPage })));
const VentasPage = lazy(() => import('./modules/ventas/VentasPage').then((m) => ({ default: m.VentasPage })));
const RetencionesPage = lazy(() => import('./modules/retenciones/RetencionesPage').then((m) => ({ default: m.RetencionesPage })));
const RecepcionesPage = lazy(() => import('./modules/recepciones/RecepcionesPage').then((m) => ({ default: m.RecepcionesPage })));
const UsuariosPage = lazy(() => import('./modules/usuarios/UsuariosPage').then((m) => ({ default: m.UsuariosPage })));
const AjustesPage = lazy(() => import('./modules/ajustes/AjustesPage').then((m) => ({ default: m.AjustesPage })));
const AuditoriaPage = lazy(() => import('./modules/auditoria/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })));
const MaquinariaPage = lazy(() => import('./modules/maquinaria/MaquinariaPage').then((m) => ({ default: m.MaquinariaPage })));
const ServicioMantenimientoPage = lazy(() => import('./modules/maquinaria/ServicioMantenimientoPage').then((m) => ({ default: m.ServicioMantenimientoPage })));
const TelefonoInicioPage = lazy(() => import('./modules/auth/TelefonoInicioPage').then((m) => ({ default: m.TelefonoInicioPage })));
const CambiarClavePage = lazy(() => import('./modules/usuarios/CambiarClavePage').then((m) => ({ default: m.CambiarClavePage })));

function PageLoader() {
  return <div className="p-8 muted">Cargando…</div>;
}

function SinAccesoPage() {
  return (
    <div className="card" style={{ padding: '2rem', maxWidth: 520, margin: '2rem auto', textAlign: 'center' }}>
      <h2 style={{ marginTop: 0 }}>Sin acceso</h2>
      <p className="muted">
        Tu rol no tiene permisos sobre ningún módulo. Pídele a un administrador que ajuste tus
        permisos en <strong>Usuarios → Roles y Permisos</strong>.
      </p>
    </div>
  );
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/cambiar-clave"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <CambiarClavePage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <PermissionsProvider>
                <PasswordChangeGate>
                  <AppShell />
                </PasswordChangeGate>
              </PermissionsProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<RequireModule module="dashboard"><Suspense fallback={<PageLoader />}><DashboardPage /></Suspense></RequireModule>} />
          <Route path="pedidos" element={<RequireModule module="pedidos"><Suspense fallback={<PageLoader />}><PedidosPage /></Suspense></RequireModule>} />
          <Route path="pedidos/historico" element={<RequireModule module="pedidos"><Suspense fallback={<PageLoader />}><HistoricoPage /></Suspense></RequireModule>} />
          <Route path="proveedores" element={<RequireModule module="proveedores"><Suspense fallback={<PageLoader />}><ProveedoresPage /></Suspense></RequireModule>} />
          <Route path="inventario" element={<RequireModule module="inventario"><Suspense fallback={<PageLoader />}><InventarioPage /></Suspense></RequireModule>} />
          {/* Depósito Mina: submódulo de Inventario, catálogo independiente (misma pantalla, otro depósito). */}
          <Route path="inventario/deposito-mina" element={<RequireModule module="inventario"><Suspense fallback={<PageLoader />}><InventarioPage deposito="mina" key="mina" /></Suspense></RequireModule>} />
          <Route path="produccion" element={<RequireModule module="produccion"><Suspense fallback={<PageLoader />}><ProduccionPage /></Suspense></RequireModule>} />
          <Route path="salidas" element={<RequireModule module="salidas"><Suspense fallback={<PageLoader />}><SalidasPage /></Suspense></RequireModule>} />
          <Route path="combustible" element={<RequireModule module="combustible"><Suspense fallback={<PageLoader />}><CombustiblePage /></Suspense></RequireModule>} />
          <Route path="combustible/surtidor" element={<RequireVistaTelefono vista="surtidor"><Suspense fallback={<PageLoader />}><SurtidorMovilView /></Suspense></RequireVistaTelefono>} />
          <Route path="acopio" element={<RequireModule module="acopio"><Suspense fallback={<PageLoader />}><AcopioPage /></Suspense></RequireModule>} />
          <Route path="cocina" element={<RequireModule module="cocina"><Suspense fallback={<PageLoader />}><CocinaPage /></Suspense></RequireModule>} />
          <Route path="cocina/telefono" element={<RequireVistaTelefono vista="comidas"><Suspense fallback={<PageLoader />}><ComidasMovilView /></Suspense></RequireVistaTelefono>} />
          <Route path="rrhh" element={<RequireModule module="rrhh"><Suspense fallback={<PageLoader />}><RrhhPage /></Suspense></RequireModule>} />
          <Route path="geodesta" element={<RequireModule module="geodesta"><Suspense fallback={<PageLoader />}><GeodestaPage /></Suspense></RequireModule>} />
          <Route path="maquinaria" element={<RequireModule module="maquinaria"><Suspense fallback={<PageLoader />}><MaquinariaPage /></Suspense></RequireModule>} />
          <Route path="maquinaria/servicio-mantenimiento" element={<RequireModule module="maquinaria"><Suspense fallback={<PageLoader />}><ServicioMantenimientoPage /></Suspense></RequireModule>} />
          <Route path="tesoreria" element={<RequireModule module="tesoreria"><Suspense fallback={<PageLoader />}><TesoreriaPage /></Suspense></RequireModule>} />
          <Route path="asignaciones" element={<RequireModule module="asignaciones"><Suspense fallback={<PageLoader />}><AsignacionesPage /></Suspense></RequireModule>} />
          <Route path="ventas" element={<RequireModule module="ventas"><Suspense fallback={<PageLoader />}><VentasPage /></Suspense></RequireModule>} />
          <Route path="retenciones" element={<RequireModule module="retenciones"><Suspense fallback={<PageLoader />}><RetencionesPage /></Suspense></RequireModule>} />
          <Route path="recepciones" element={<RequireModule module="recepciones"><Suspense fallback={<PageLoader />}><RecepcionesPage /></Suspense></RequireModule>} />
          <Route path="usuarios" element={<RequireModule module="usuarios"><Suspense fallback={<PageLoader />}><UsuariosPage /></Suspense></RequireModule>} />
          <Route path="ajustes" element={<RequireModule module="ajustes"><Suspense fallback={<PageLoader />}><AjustesPage /></Suspense></RequireModule>} />
          <Route path="auditoria" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AuditoriaPage /></Suspense></RequireAdmin>} />
          <Route path="telefono" element={<Suspense fallback={<PageLoader />}><TelefonoInicioPage /></Suspense>} />
          <Route path="sin-acceso" element={<SinAccesoPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastHost />
    </>
  );
}
