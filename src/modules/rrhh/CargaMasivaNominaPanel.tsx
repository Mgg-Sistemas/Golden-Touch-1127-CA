/* ============================================================
   Golden Touch · RRHH · Panel Interactivo «CARGA MASIVA - NOMINA»
   (19/11/2026)

   Configuración interactiva, KPIs de validación y vista previa en vivo
   de las 44 columnas oficiales (A..AR) con correlativos y códigos bancarios.
   ============================================================ */

import { useMemo, useState } from 'react';
import { formatearBs } from './personalMoldeable';
import {
  CATALOGO_CIUDADES_PRINCIPALES,
  CATALOGO_CONDICION_INMUEBLE,
  CATALOGO_ESTADOS,
  CATALOGO_FUENTE_INGRESO,
  CATALOGO_MUNICIPIOS_PRINCIPALES,
  CATALOGO_OFICINAS_TESORO,
  CATALOGO_PARROQUIAS_PRINCIPALES,
  CATALOGO_REGIONES,
  CATALOGO_TIEMPO_CONTRATO,
  CATALOGO_TIPO_CUENTA,
  CATALOGO_TIPO_NOMINA,
  CATALOGO_TIPO_SOLICITUD,
  CATALOGO_TIPO_VIVIENDA,
  COLUMNAS_CARGA_MASIVA_NOMINA,
  type ConfigCargaMasivaNomina,
  type FilaCargaMasivaNomina,
  type ModoDecimalesSueldo,
  type PorcionSueldoCargaMasiva,
  type SeparadorTxtCargaMasiva,
} from './cargaMasivaNomina';
import type { CriterioOrdenPersonal } from './personalMoldeable';

export type FiltroCuenta0163 = 'todos' | 'sin_0163' | 'con_0163';

interface Props {
  filasLote: FilaCargaMasivaNomina[];
  totalCandidatos: number;
  excluidosIds: Set<string>;
  onToggleTrabajador: (personalId: string) => void;
  onSeleccionarTodos: () => void;
  onLimpiarSeleccion: () => void;

  filtroCuenta0163: FiltroCuenta0163;
  onChangeFiltroCuenta0163: (f: FiltroCuenta0163) => void;
  conteoSin0163: number;
  conteoCon0163: number;

  orden: CriterioOrdenPersonal;
  onChangeOrden: (o: CriterioOrdenPersonal) => void;

  config: ConfigCargaMasivaNomina;
  onChangeConfig: (parcial: Partial<ConfigCargaMasivaNomina>) => void;
  tasaBsSistema: number | null;
  tasaBsFecha: string | null;

  busqueda: string;
  onChangeBusqueda: (q: string) => void;
}

export function CargaMasivaNominaPanel({
  filasLote,
  totalCandidatos,
  excluidosIds,
  onToggleTrabajador,
  onSeleccionarTodos,
  onLimpiarSeleccion,
  filtroCuenta0163,
  onChangeFiltroCuenta0163,
  conteoSin0163,
  conteoCon0163,
  orden,
  onChangeOrden,
  config,
  onChangeConfig,
  tasaBsSistema,
  tasaBsFecha,
  busqueda,
  onChangeBusqueda,
}: Props) {
  const [mostrarUbicacionAvanzada, setMostrarUbicacionAvanzada] = useState(false);
  const [vistaSabana44, setVistaSabana44] = useState(true);
  const [soloConAlertas, setSoloConAlertas] = useState(false);

  const filasActivas = useMemo(
    () => filasLote.filter((f) => !excluidosIds.has(f.personalId)),
    [filasLote, excluidosIds],
  );

  const resumen = useMemo(() => {
    const totalBs = filasActivas.reduce((acc, f) => acc + f.montoBs, 0);
    const totalUsd = filasActivas.reduce((acc, f) => acc + f.sueldoUsd, 0);
    const conAlertas = filasActivas.filter((f) => f.alertas.length > 0).length;
    const primerCorr = filasActivas[0]?.campos.correlativo_cliente ?? '—';
    const ultimoCorr = filasActivas[filasActivas.length - 1]?.campos.correlativo_cliente ?? '—';
    return {
      seleccionados: filasActivas.length,
      totalBs,
      totalUsd,
      conAlertas,
      completos: filasActivas.length - conAlertas,
      primerCorr,
      ultimoCorr,
    };
  }, [filasActivas]);

  const filasVisibles = useMemo(() => {
    let lista = filasLote;
    if (soloConAlertas) {
      lista = lista.filter((f) => f.alertas.length > 0);
    }
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      lista = lista.filter(
        (f) =>
          f.nombreCompleto.toLowerCase().includes(q) ||
          f.cedulaLegible.toLowerCase().includes(q) ||
          f.campos.numero_cedula.includes(q) ||
          f.campos.correlativo_cliente.includes(q) ||
          f.cargoOriginal.toLowerCase().includes(q) ||
          f.campos.tipo_cargo.toLowerCase().includes(q) ||
          f.campos.profesion.toLowerCase().includes(q) ||
          f.departamento.toLowerCase().includes(q),
      );
    }
    return lista;
  }, [filasLote, soloConAlertas, busqueda]);

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '.2rem',
    fontSize: '.73rem',
    color: 'var(--text-muted, #94a3b8)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
      {/* 1. Barra de Filtro Bancario (0163) y Orden de Correlativos */}
      <div
        style={{
          background: 'var(--surface-2, #182230)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '.65rem .8rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.8rem', fontWeight: 600, marginRight: '.2rem' }}>
            🏦 Filtro Cuenta 0163:
          </span>
          <button
            type="button"
            className={`btn btn-xs ${filtroCuenta0163 === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onChangeFiltroCuenta0163('todos')}
          >
            🌐 Todos ({conteoSin0163 + conteoCon0163})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filtroCuenta0163 === 'sin_0163' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onChangeFiltroCuenta0163('sin_0163')}
            title="Ideal para aperturas masivas de cuenta nómina en Banco del Tesoro"
          >
            🆕 Sin cuenta 0163 ({conteoSin0163})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filtroCuenta0163 === 'con_0163' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onChangeFiltroCuenta0163('con_0163')}
          >
            ✅ Con cuenta 0163 ({conteoCon0163})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.78rem' }}>
          <span style={{ fontWeight: 600 }}>Ordenar correlativos por:</span>
          <select
            className="input input-xs"
            value={orden}
            onChange={(e) => onChangeOrden(e.target.value as CriterioOrdenPersonal)}
            style={{ width: 'auto' }}
          >
            <option value="alfabetico">🔤 Apellidos y Nombres (A-Z)</option>
            <option value="cedula">🆔 Cédula de Identidad</option>
            <option value="antiguedad_desc">⏳ Mayor Antigüedad</option>
            <option value="sueldo_desc">💵 Sueldo Base (Mayor a menor)</option>
            <option value="sueldo_asc">💵 Sueldo Base (Menor a mayor)</option>
          </select>
        </div>
      </div>

      {/* 2. Parámetros Oficiales del Archivo de Carga Masiva (44 Columnas) */}
      <div
        style={{
          background: 'var(--surface-2, #182230)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '.7rem .85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '.65rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem' }}>
          <div>
            <span style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text, #f1f5f9)' }}>
              ⚙️ Parámetros Bancarios, Correlativos y Códigos (Plantilla 44 Columnas · Moneda Nacional)
            </span>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted, #94a3b8)' }}>
              Los códigos de profesión, cargo, estado civil, educación, dependientes y ubicación se asignan automáticamente por trabajador.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setMostrarUbicacionAvanzada((v) => !v)}
          >
            {mostrarUbicacionAvanzada ? '▲ Ocultar códigos de domicilio y TXT' : '▼ Códigos de domicilio / formato TXT'}
          </button>
        </div>

        {/* Fila 1: Correlativo, Sueldo Bs, Tasa, Oficina, Cuenta, Nómina, Solicitud */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
            gap: '.55rem',
          }}
        >
          <label style={labelStyle}>
            <span>Correlativo Inicial (Col. B)</span>
            <input
              type="number"
              min={1}
              step={1}
              className="input input-xs"
              value={config.correlativoInicial}
              onChange={(e) =>
                onChangeConfig({ correlativoInicial: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </label>

          <label style={labelStyle}>
            <span>Base Sueldo Básico Bs (Col. AM)</span>
            <select
              className="input input-xs"
              value={config.porcionSueldo}
              onChange={(e) =>
                onChangeConfig({ porcionSueldo: e.target.value as PorcionSueldoCargaMasiva })
              }
            >
              <option value="bs_100">100% Sueldo en Bs (USD × Tasa)</option>
              <option value="bs_20">20% Porción Nómina en Bs</option>
              <option value="bs_80">80% Complemento en Bs</option>
              <option value="monto_fijo_bs">Monto fijo Bs igual para todos</option>
            </select>
          </label>

          {config.porcionSueldo === 'monto_fijo_bs' ? (
            <label style={labelStyle}>
              <span>Monto Fijo Sueldo (Bs)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input input-xs"
                value={config.montoFijoBs || ''}
                placeholder="Ej. 130.00"
                onChange={(e) => onChangeConfig({ montoFijoBs: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          ) : (
            <label style={labelStyle}>
              <span>
                Tasa BCV (Bs/USD){tasaBsFecha ? ` · ${tasaBsFecha}` : ''}
              </span>
              <div style={{ display: 'flex', gap: '.25rem' }}>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input input-xs"
                  value={config.tasaBs || ''}
                  placeholder="Tasa Bs"
                  onChange={(e) => onChangeConfig({ tasaBs: Math.max(0, Number(e.target.value) || 0) })}
                  style={{ flex: 1 }}
                />
                {tasaBsSistema && tasaBsSistema > 0 && Math.abs(config.tasaBs - tasaBsSistema) > 0.001 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    title="Restaurar tasa BCV del día"
                    onClick={() => onChangeConfig({ tasaBs: tasaBsSistema })}
                  >
                    ↺
                  </button>
                )}
              </div>
            </label>
          )}

          <label style={labelStyle}>
            <span>Formato Trama Sueldo (15 díg.)</span>
            <select
              className="input input-xs"
              value={config.modoDecimalesSueldo}
              onChange={(e) =>
                onChangeConfig({ modoDecimalesSueldo: e.target.value as ModoDecimalesSueldo })
              }
            >
              <option value="centimos">Céntimos implícitos ×100 (Estándar)</option>
              <option value="entero">Entero redondeado sin decimales</option>
            </select>
          </label>

          <label style={labelStyle}>
            <span>Oficina Principal (Col. AP)</span>
            <select
              className="input input-xs"
              value={config.oficinaPrincipal}
              onChange={(e) =>
                onChangeConfig({
                  oficinaPrincipal: e.target.value,
                  oficinaSecundaria:
                    config.oficinaSecundaria === config.oficinaPrincipal
                      ? e.target.value
                      : config.oficinaSecundaria,
                })
              }
            >
              {CATALOGO_OFICINAS_TESORO.map((of) => (
                <option key={of.codigo} value={of.codigo}>
                  {of.codigo} · {of.descripcion}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span>Oficina Secundaria (Col. AQ)</span>
            <select
              className="input input-xs"
              value={config.oficinaSecundaria}
              onChange={(e) => onChangeConfig({ oficinaSecundaria: e.target.value })}
            >
              {CATALOGO_OFICINAS_TESORO.map((of) => (
                <option key={of.codigo} value={of.codigo}>
                  {of.codigo} · {of.descripcion}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span>Tipo de Cuenta (Col. AL)</span>
            <select
              className="input input-xs"
              value={config.tipoCuenta}
              onChange={(e) => onChangeConfig({ tipoCuenta: e.target.value as 'CCVI' | 'VI01' })}
            >
              {CATALOGO_TIPO_CUENTA.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} · {c.descripcion}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span>Tipo de Nómina (Col. AK)</span>
            <select
              className="input input-xs"
              value={config.tipoNomina}
              onChange={(e) =>
                onChangeConfig({ tipoNomina: e.target.value as 'W' | 'B' | 'M' | 'S' | 'Y' })
              }
            >
              {CATALOGO_TIPO_NOMINA.map((n) => (
                <option key={n.codigo} value={n.codigo}>
                  {n.codigo} · {n.descripcion}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span>Contrato (Col. AJ)</span>
            <select
              className="input input-xs"
              value={config.tipoContrato}
              onChange={(e) => onChangeConfig({ tipoContrato: e.target.value as '1' | '2' })}
            >
              {CATALOGO_TIEMPO_CONTRATO.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} · {c.descripcion}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span>Solicitud (Col. AR)</span>
            <select
              className="input input-xs"
              value={config.tipoSolicitud}
              onChange={(e) => onChangeConfig({ tipoSolicitud: e.target.value as 'I' | 'M' | 'D' })}
            >
              {CATALOGO_TIPO_SOLICITUD.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.codigo} · {s.descripcion}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Fila 2 colapsable: Ubicación por defecto, Vivienda y Formato TXT */}
        {mostrarUbicacionAvanzada && (
          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: '.6rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
              gap: '.55rem',
            }}
          >
            <label style={labelStyle}>
              <span>Región respaldo (Col. T)</span>
              <select
                className="input input-xs"
                value={config.regionDefecto}
                onChange={(e) => onChangeConfig({ regionDefecto: e.target.value })}
              >
                {CATALOGO_REGIONES.map((r) => (
                  <option key={r.codigo} value={r.codigo}>
                    {r.codigo} · {r.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Estado respaldo (Col. U)</span>
              <select
                className="input input-xs"
                value={config.estadoDefecto}
                onChange={(e) => onChangeConfig({ estadoDefecto: e.target.value })}
              >
                {CATALOGO_ESTADOS.map((es) => (
                  <option key={es.codigo} value={es.codigo}>
                    {es.codigo} · {es.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Ciudad respaldo (Col. V)</span>
              <select
                className="input input-xs"
                value={config.ciudadDefecto}
                onChange={(e) => {
                  const sel = CATALOGO_CIUDADES_PRINCIPALES.find((c) => c.codigo === e.target.value);
                  onChangeConfig({
                    ciudadDefecto: e.target.value,
                    ...(sel ? { zonaPostalDefecto: sel.zonaPostal } : {}),
                  });
                }}
              >
                {CATALOGO_CIUDADES_PRINCIPALES.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.codigo} · {c.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Municipio respaldo (Col. W)</span>
              <select
                className="input input-xs"
                value={config.municipioDefecto}
                onChange={(e) => onChangeConfig({ municipioDefecto: e.target.value })}
              >
                {CATALOGO_MUNICIPIOS_PRINCIPALES.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.codigo} · {m.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Parroquia respaldo (Col. X)</span>
              <select
                className="input input-xs"
                value={config.parroquiaDefecto}
                onChange={(e) => onChangeConfig({ parroquiaDefecto: e.target.value })}
              >
                {CATALOGO_PARROQUIAS_PRINCIPALES.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.codigo} · {p.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Zona Postal (Col. Y · 10 díg.)</span>
              <input
                type="text"
                className="input input-xs"
                value={config.zonaPostalDefecto}
                onChange={(e) => onChangeConfig({ zonaPostalDefecto: e.target.value })}
                placeholder="8050"
              />
            </label>

            <label style={labelStyle}>
              <span>Cond. Inmueble (Col. AB)</span>
              <select
                className="input input-xs"
                value={config.condicionInmuebleDefecto}
                onChange={(e) =>
                  onChangeConfig({ condicionInmuebleDefecto: e.target.value as '1' | '2' | '3' })
                }
              >
                {CATALOGO_CONDICION_INMUEBLE.map((i) => (
                  <option key={i.codigo} value={i.codigo}>
                    {i.codigo} · {i.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Vivienda (Col. AC)</span>
              <select
                className="input input-xs"
                value={config.tipoViviendaDefecto}
                onChange={(e) =>
                  onChangeConfig({ tipoViviendaDefecto: e.target.value as '1' | '2' | '3' })
                }
              >
                {CATALOGO_TIPO_VIVIENDA.map((v) => (
                  <option key={v.codigo} value={v.codigo}>
                    {v.codigo} · {v.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Fuente Ingreso (Col. AI)</span>
              <select
                className="input input-xs"
                value={config.fuenteIngreso}
                onChange={(e) =>
                  onChangeConfig({ fuenteIngreso: e.target.value as '1' | '2' | '3' | '4' })
                }
              >
                {CATALOGO_FUENTE_INGRESO.map((f) => (
                  <option key={f.codigo} value={f.codigo}>
                    {f.codigo} · {f.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Separador Archivo TXT</span>
              <select
                className="input input-xs"
                value={config.separadorTxt}
                onChange={(e) =>
                  onChangeConfig({ separadorTxt: e.target.value as SeparadorTxtCargaMasiva })
                }
              >
                <option value=";">Punto y coma (;)</option>
                <option value="|">Barra vertical (|)</option>
                <option value={'\t'}>Tabulación (TAB)</option>
                <option value="ancho_fijo">Ancho fijo continuo (sin separador)</option>
              </select>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.4rem',
                fontSize: '.76rem',
                cursor: 'pointer',
                alignSelf: 'end',
                paddingBottom: '.3rem',
              }}
            >
              <input
                type="checkbox"
                checked={config.incluirEncabezadoPlano}
                onChange={(e) => onChangeConfig({ incluirEncabezadoPlano: e.target.checked })}
              />
              <span>Incluir encabezados en CSV / TXT</span>
            </label>
          </div>
        )}
      </div>

      {/* 3. Banner de KPIs del Lote */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '.6rem' }}>
        <div
          style={{
            background: 'var(--surface-2, #182230)',
            border: '1px solid var(--border)',
            borderTop: '3px solid #ff8a00',
            borderRadius: '6px',
            padding: '.5rem .7rem',
          }}
        >
          <div style={{ fontSize: '.68rem', color: '#94a3b8', fontWeight: 600 }}>TRABAJADORES EN LOTE</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ff8a00' }}>
            {resumen.seleccionados}{' '}
            <span style={{ fontSize: '.78rem', fontWeight: 500, color: '#94a3b8' }}>
              de {totalCandidatos}
            </span>
          </div>
          <div style={{ fontSize: '.68rem', color: '#64748b' }}>
            44 columnas oficiales (A..AR)
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-2, #182230)',
            border: '1px solid var(--border)',
            borderTop: '3px solid #38bdf8',
            borderRadius: '6px',
            padding: '.5rem .7rem',
          }}
        >
          <div style={{ fontSize: '.68rem', color: '#94a3b8', fontWeight: 600 }}>RANGO CORRELATIVO CLIENTE</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
            {resumen.primerCorr} → {resumen.ultimoCorr}
          </div>
          <div style={{ fontSize: '.68rem', color: '#64748b' }}>
            Banco {config.numeroBanco} · Ofic. {config.oficinaPrincipal} · Cta {config.tipoCuenta}
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-2, #182230)',
            border: '1px solid var(--border)',
            borderTop: '3px solid #22c55e',
            borderRadius: '6px',
            padding: '.5rem .7rem',
          }}
        >
          <div style={{ fontSize: '.68rem', color: '#94a3b8', fontWeight: 600 }}>MASA SALARIAL LOTE (BS)</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#22c55e' }}>
            {formatearBs(resumen.totalBs)}
          </div>
          <div style={{ fontSize: '.68rem', color: '#64748b' }}>
            Base USD ${resumen.totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-2, #182230)',
            border: '1px solid var(--border)',
            borderTop: `3px solid ${resumen.conAlertas > 0 ? '#f59e0b' : '#22c55e'}`,
            borderRadius: '6px',
            padding: '.5rem .7rem',
          }}
        >
          <div style={{ fontSize: '.68rem', color: '#94a3b8', fontWeight: 600 }}>ESTADO DE DATOS</div>
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: resumen.conAlertas > 0 ? '#f59e0b' : '#22c55e',
            }}
          >
            {resumen.completos} OK · {resumen.conAlertas} con alerta
          </div>
          <div style={{ fontSize: '.68rem', color: '#64748b' }}>
            {resumen.conAlertas > 0 ? 'Revisa nac., celular o correo faltante' : 'Listo para carga bancaria'}
          </div>
        </div>
      </div>

      {/* 4. Vista Previa Interactiva con Checkboxes y Sábana de 44 Columnas */}
      <div
        style={{
          background: 'var(--surface-2, #182230)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '.65rem .8rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '.45rem',
            marginBottom: '.55rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.84rem', fontWeight: 600 }}>👁️ Vista Previa · Carga Masiva</span>
            <span className="badge badge-sm">{filasVisibles.length} visibles</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={onSeleccionarTodos}>
              Marcar todos
            </button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={onLimpiarSeleccion}>
              Desmarcar
            </button>
            {resumen.conAlertas > 0 && (
              <button
                type="button"
                className={`btn btn-xs ${soloConAlertas ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSoloConAlertas((v) => !v)}
              >
                ⚠️ Solo alertas ({resumen.conAlertas})
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', gap: '.25rem' }}>
              <button
                type="button"
                className={`btn btn-xs ${vistaSabana44 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setVistaSabana44(true)}
              >
                🏦 Sábana 44 Cols (A–AR)
              </button>
              <button
                type="button"
                className={`btn btn-xs ${!vistaSabana44 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setVistaSabana44(false)}
              >
                📋 Resumen Legible
              </button>
            </div>
            <input
              type="search"
              placeholder="Buscar nombre, cédula, cargo, código…"
              className="input input-xs"
              value={busqueda}
              onChange={(e) => onChangeBusqueda(e.target.value)}
              style={{ width: '240px' }}
            />
          </div>
        </div>

        <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
          {filasVisibles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '.84rem' }}>
              No hay trabajadores que coincidan con los filtros actuales.
            </div>
          ) : vistaSabana44 ? (
            /* SÁBANA BANCARIA EXACTA DE LAS 44 COLUMNAS A..AR */
            <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '.74rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface-3, #334155)', color: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '.4rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'center' }}>✓</th>
                  <th style={{ padding: '.4rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'left' }}>Estado</th>
                  {COLUMNAS_CARGA_MASIVA_NOMINA.map((col) => (
                    <th
                      key={col.clave}
                      title={col.tituloPlanilla}
                      style={{
                        padding: '.4rem .55rem',
                        borderBottom: '2px solid #ff8a00',
                        textAlign: col.alineacion,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ color: '#fbbf24', marginRight: '.25rem', fontFamily: 'monospace' }}>
                        {col.colLetra}
                      </span>
                      {col.etiquetaCorta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map((f, idx) => {
                  const incluido = !excluidosIds.has(f.personalId);
                  return (
                    <tr
                      key={f.personalId}
                      style={{
                        background: idx % 2 === 1 ? 'rgba(255,255,255,0.025)' : 'transparent',
                        borderBottom: '1px solid var(--border)',
                        opacity: incluido ? 1 : 0.45,
                      }}
                    >
                      <td style={{ padding: '.35rem .5rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={incluido}
                          onChange={() => onToggleTrabajador(f.personalId)}
                        />
                      </td>
                      <td style={{ padding: '.35rem .5rem', whiteSpace: 'nowrap' }}>
                        {f.alertas.length === 0 ? (
                          <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '.7rem' }}>● OK</span>
                        ) : (
                          <span
                            title={f.alertas.join(' · ')}
                            style={{ color: '#f59e0b', fontWeight: 600, fontSize: '.7rem', cursor: 'help' }}
                          >
                            ⚠ {f.alertas[0]}
                            {f.alertas.length > 1 ? ` (+${f.alertas.length - 1})` : ''}
                          </span>
                        )}
                      </td>
                      {COLUMNAS_CARGA_MASIVA_NOMINA.map((col, cIdx) => {
                        const val = f.celdas[cIdx];
                        const esMonospace =
                          col.mascara.startsWith('0') || col.mascara === 'ddmmyyyy' || col.anchoFijo <= 6;
                        return (
                          <td
                            key={col.clave}
                            style={{
                              padding: '.35rem .55rem',
                              textAlign: col.alineacion,
                              whiteSpace: 'nowrap',
                              fontFamily: esMonospace ? 'monospace' : 'inherit',
                              color: val ? 'inherit' : '#64748b',
                            }}
                          >
                            {val || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* RESUMEN LEGIBLE CON EQUIVALENCIA DE CÓDIGOS */
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface-3, #334155)', color: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '.42rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'center' }}>✓</th>
                  <th style={{ padding: '.42rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'center' }}>Correlativo</th>
                  <th style={{ padding: '.42rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'center' }}>Doc / Cédula 15 díg.</th>
                  <th style={{ padding: '.42rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'left' }}>Trabajador</th>
                  <th style={{ padding: '.42rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'left' }}>Cargo → Cód.</th>
                  <th style={{ padding: '.42rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'left' }}>Educ / Prof.</th>
                  <th style={{ padding: '.42rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'center' }}>Ubicación</th>
                  <th style={{ padding: '.42rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'right' }}>Sueldo Bs / Trama</th>
                  <th style={{ padding: '.42rem .5rem', borderBottom: '2px solid #ff8a00', textAlign: 'left' }}>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map((f, idx) => {
                  const incluido = !excluidosIds.has(f.personalId);
                  return (
                    <tr
                      key={f.personalId}
                      style={{
                        background: idx % 2 === 1 ? 'rgba(255,255,255,0.025)' : 'transparent',
                        borderBottom: '1px solid var(--border)',
                        opacity: incluido ? 1 : 0.45,
                      }}
                    >
                      <td style={{ padding: '.38rem .5rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={incluido}
                          onChange={() => onToggleTrabajador(f.personalId)}
                        />
                      </td>
                      <td style={{ padding: '.38rem .5rem', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8' }}>
                        {incluido ? f.campos.correlativo_cliente : '—'}
                      </td>
                      <td style={{ padding: '.38rem .5rem', textAlign: 'center', fontFamily: 'monospace' }}>
                        {f.campos.tipo_documento}-{f.campos.numero_cedula}
                      </td>
                      <td style={{ padding: '.38rem .5rem' }}>
                        <div style={{ fontWeight: 600 }}>{f.nombreCompleto}</div>
                        <div style={{ fontSize: '.68rem', color: '#94a3b8' }}>
                          {f.empresa} · {f.departamento} {f.tieneCuenta0163 ? '· 🏦 0163' : ''}
                        </div>
                      </td>
                      <td style={{ padding: '.38rem .5rem' }}>
                        <div>{f.cargoOriginal}</div>
                        <div style={{ fontSize: '.68rem', color: '#fbbf24', fontFamily: 'monospace' }}>
                          {f.campos.tipo_cargo} · {f.cargoCatalogoDesc}
                        </div>
                      </td>
                      <td style={{ padding: '.38rem .5rem' }}>
                        <div style={{ fontFamily: 'monospace' }}>
                          Ed:{f.campos.nivel_educacion} · Prof:{f.campos.profesion}
                        </div>
                        <div style={{ fontSize: '.68rem', color: '#94a3b8' }}>{f.profesionCatalogoDesc}</div>
                      </td>
                      <td style={{ padding: '.38rem .5rem', textAlign: 'center', fontFamily: 'monospace', fontSize: '.7rem' }}>
                        {f.campos.region}·{f.campos.estado}·{f.campos.ciudad}·{f.campos.municipio}·{f.campos.parroquia}
                      </td>
                      <td style={{ padding: '.38rem .5rem', textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: '#22c55e' }}>{formatearBs(f.montoBs)}</div>
                        <div style={{ fontSize: '.68rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {f.campos.sueldo_basico}
                        </div>
                      </td>
                      <td style={{ padding: '.38rem .5rem' }}>
                        {f.alertas.length === 0 ? (
                          <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '.72rem' }}>Completo</span>
                        ) : (
                          <span style={{ color: '#f59e0b', fontSize: '.7rem' }}>{f.alertas.join(', ')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
