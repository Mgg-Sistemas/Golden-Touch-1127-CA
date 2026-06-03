import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './modules/landing/LandingPage';
import { LoginPage } from './modules/auth/LoginPage';
import { AppShell } from './shared/ui/AppShell';
import { ProtectedRoute } from './modules/auth/ProtectedRoute';
import { PermissionsProvider, RequireModule, HomeRedirect } from './modules/auth/PermissionsContext';
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
const TesoreriaPage = lazy(() => import('./modules/tesoreria/TesoreriaPage').then((m) => ({ default: m.TesoreriaPage })));
const UsuariosPage = lazy(() => import('./modules/usuarios/UsuariosPage').then((m) => ({ default: m.UsuariosPage })));
const AjustesPage = lazy(() => import('./modules/ajustes/AjustesPage').then((m) => ({ default: m.AjustesPage })));
const CambiarClavePage = lazy(() => import('./modules/usuarios/CambiarClavePage').then((m) => ({ default: m.CambiarClavePage })));

function PageLoader() {
  return <div className="p-8 muted">Cargando…</div>;
}

function SinAccesoPage() {
  return (
    <div className="card" style={{ padding: '2rem', maxWidth: 520, margin: '2rem auto', textAlign: 'center' }}>
      <h2 style={{ marginTop: 0 }}>Sin acceso</h2>
      <p className="muted">
        Tu rol no tiene permisos sobre ningún módulo. Pedile a un administrador que ajuste tus
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
          <Route path="produccion" element={<RequireModule module="produccion"><Suspense fallback={<PageLoader />}><ProduccionPage /></Suspense></RequireModule>} />
          <Route path="salidas" element={<RequireModule module="salidas"><Suspense fallback={<PageLoader />}><SalidasPage /></Suspense></RequireModule>} />
          <Route path="combustible" element={<RequireModule module="combustible"><Suspense fallback={<PageLoader />}><CombustiblePage /></Suspense></RequireModule>} />
          <Route path="tesoreria" element={<RequireModule module="tesoreria"><Suspense fallback={<PageLoader />}><TesoreriaPage /></Suspense></RequireModule>} />
          <Route path="usuarios" element={<RequireModule module="usuarios"><Suspense fallback={<PageLoader />}><UsuariosPage /></Suspense></RequireModule>} />
          <Route path="ajustes" element={<RequireModule module="ajustes"><Suspense fallback={<PageLoader />}><AjustesPage /></Suspense></RequireModule>} />
          <Route path="sin-acceso" element={<SinAccesoPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastHost />
    </>
  );
}
