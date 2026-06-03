export function PedidosObreroPage() {
  return (
    <div>
      <h1>Pedidos · Obrero / Planta</h1>
      <p className="muted">Módulo en construcción · Sprint 1, Semana 2.</p>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-title">Lo que vendrá aquí</div>
        <ul style={{ paddingLeft: '1.1rem', color: 'var(--text-muted)', lineHeight: 1.8, margin: 0 }}>
          <li>Formulario de solicitud (nombre, ficha/CI, producto, cantidad, motivo).</li>
          <li>Bandeja del jefe con alertas y aprobación.</li>
          <li>Histórico de solicitudes con filtros.</li>
          <li>Cierre de solicitud al recibir el producto.</li>
        </ul>
      </div>
    </div>
  );
}
