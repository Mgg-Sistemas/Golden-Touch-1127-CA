/* ============================================================
   Golden Touch · RRHH · Campos de Domicilio y Nómina Bancaria
   (19/11/2026)

   Bloque integrado en los formularios de alta y edición de Personal
   para capturar todos los campos exigidos por el reporte de
   «CARGA MASIVA - NOMINA» (44 columnas):
     · Calle / avenida, casa / edificio, piso / nivel, N° de casa / apto /
       oficina / local, punto de referencia y teléfono local.
     · Condición del inmueble, tipo de vivienda y tiempo de residencia.
     · País de nacimiento, región, estado, ciudad, municipio, parroquia y
       zona postal (con autocompletado al elegir ciudad).
     · Nivel de educación bancario, profesión (código 4 letras), tipo de
       cargo (código 3 dígitos), fuente de ingreso, tipo de contrato,
       tipo de nómina, tipo de cuenta, cuenta bancaria nómina (20 dígitos, escrita a mano y nunca tomada de transferencias) y oficinas bancarias.
   ============================================================ */

import { useMemo } from 'react';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import {
  CATALOGO_CIUDADES_PRINCIPALES,
  CATALOGO_CONDICION_INMUEBLE,
  CATALOGO_ESTADOS,
  CATALOGO_FUENTE_INGRESO,
  CATALOGO_MUNICIPIOS_PRINCIPALES,
  CATALOGO_NIVEL_EDUCACION,
  CATALOGO_OFICINAS_TESORO,
  CATALOGO_PAISES_ISO2,
  CATALOGO_PARROQUIAS_PRINCIPALES,
  CATALOGO_PROFESIONES,
  CATALOGO_REGIONES,
  CATALOGO_TIEMPO_CONTRATO,
  CATALOGO_TIPOS_CARGO,
  CATALOGO_TIPO_CUENTA,
  CATALOGO_TIPO_NOMINA,
  CATALOGO_TIPO_VIVIENDA,
  type FichaNominaBancaria,
} from './cargaMasivaNomina';

interface Props {
  value: FichaNominaBancaria;
  onChange: (parcial: Partial<FichaNominaBancaria>) => void;
}

export function CamposFichaNominaBancaria({ value, onChange }: Props) {
  const opcionesProfesion = useMemo(
    () => [
      { value: '', label: '— Automático según título / cargo —' },
      ...CATALOGO_PROFESIONES.map((p) => ({
        value: p.codigo,
        label: `${p.codigo} · ${p.descripcion}`,
      })),
    ],
    [],
  );

  const opcionesCargoBanco = useMemo(
    () => [
      { value: '', label: '— Automático según cargo —' },
      ...CATALOGO_TIPOS_CARGO.map((c) => ({
        value: c.codigo,
        label: `${c.codigo} · ${c.descripcion}`,
      })),
    ],
    [],
  );

  const opcionesOficina = useMemo(
    () => [
      { value: '', label: '— Usar oficina del lote (0405 Puerto Ordaz) —' },
      ...CATALOGO_OFICINAS_TESORO.map((o) => ({
        value: o.codigo,
        label: `${o.codigo} · ${o.descripcion}`,
      })),
    ],
    [],
  );

  const evitarSubmitEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') e.preventDefault();
  };

  return (
    <div>
      <div className="divider" />
      <div className="card-title" style={{ marginBottom: '.25rem' }}>
        🏠 Domicilio detallado y ubicación (Carga Masiva - Nómina)
      </div>
      <small className="muted" style={{ display: 'block', marginBottom: '.65rem' }}>
        Estos datos alimentan directamente las columnas de dirección, ubicación geográfica y vivienda en el reporte de <strong>CARGA MASIVA - NOMINA</strong>.
      </small>

      <div className="form-grid">
        <div className="form-row">
          <label>Calle / Avenida</label>
          <input
            className="input"
            value={value.calle_avenida ?? ''}
            onChange={(e) => onChange({ calle_avenida: e.target.value.toUpperCase() })}
            onKeyDown={evitarSubmitEnter}
            placeholder="Ej. URB. UNARE II CALLE 4"
            maxLength={40}
          />
        </div>

        <div className="form-row">
          <label>Casa / Edificio / Residencia</label>
          <input
            className="input"
            value={value.casa_edificio ?? ''}
            onChange={(e) => onChange({ casa_edificio: e.target.value.toUpperCase() })}
            onKeyDown={evitarSubmitEnter}
            placeholder="Ej. CASA o EDIF. RORAIMA"
            maxLength={25}
          />
        </div>

        <div className="form-row">
          <label>Piso / Nivel</label>
          <input
            className="input mono"
            value={value.piso_nivel ?? ''}
            onChange={(e) => onChange({ piso_nivel: e.target.value.toUpperCase() })}
            onKeyDown={evitarSubmitEnter}
            placeholder="Ej. PB, 01, 02"
            maxLength={6}
          />
        </div>

        <div className="form-row">
          <label>N° Casa / Apto / Ofic. / Local</label>
          <input
            className="input mono"
            value={value.apto_local ?? ''}
            onChange={(e) => onChange({ apto_local: e.target.value.toUpperCase() })}
            onKeyDown={evitarSubmitEnter}
            placeholder="Ej. 14, 2-B, S/N"
            maxLength={12}
          />
        </div>

        <div className="form-row">
          <label>Punto de referencia</label>
          <input
            className="input"
            value={value.referencia ?? ''}
            onChange={(e) => onChange({ referencia: e.target.value.toUpperCase() })}
            onKeyDown={evitarSubmitEnter}
            placeholder="Ej. FRENTE A LA PLAZA"
            maxLength={35}
          />
        </div>

        <div className="form-row">
          <label>Teléfono local / habitación</label>
          <input
            className="input mono"
            value={value.telefono_local ?? ''}
            onChange={(e) => onChange({ telefono_local: e.target.value })}
            onKeyDown={evitarSubmitEnter}
            placeholder="0286-9610000"
            inputMode="tel"
          />
        </div>

        <div className="form-row">
          <label>Condición del inmueble</label>
          <select
            className="input"
            value={value.condicion_inmueble ?? ''}
            onChange={(e) =>
              onChange({
                condicion_inmueble: e.target.value as FichaNominaBancaria['condicion_inmueble'],
              })
            }
          >
            <option value="">Sin indicar (usa valor del lote)</option>
            {CATALOGO_CONDICION_INMUEBLE.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} · {c.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Tipo de vivienda</label>
          <select
            className="input"
            value={value.tipo_vivienda ?? ''}
            onChange={(e) =>
              onChange({ tipo_vivienda: e.target.value as FichaNominaBancaria['tipo_vivienda'] })
            }
          >
            <option value="">Sin indicar (usa valor del lote)</option>
            {CATALOGO_TIPO_VIVIENDA.map((v) => (
              <option key={v.codigo} value={v.codigo}>
                {v.codigo} · {v.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Tiempo de residencia (años)</label>
          <input
            className="input mono"
            type="number"
            min={1}
            max={99}
            value={value.tiempo_residencia ?? ''}
            onChange={(e) =>
              onChange({
                tiempo_residencia: e.target.value === '' ? null : Math.max(1, Number(e.target.value) || 1),
              })
            }
            onKeyDown={evitarSubmitEnter}
            placeholder="Ej. 3"
          />
        </div>

        <div className="form-row">
          <label>País de nacimiento</label>
          <select
            className="input"
            value={value.pais_nacimiento ?? ''}
            onChange={(e) => onChange({ pais_nacimiento: e.target.value })}
          >
            <option value="">Automático según nacionalidad (VE)</option>
            {CATALOGO_PAISES_ISO2.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.codigo} · {p.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Región</label>
          <select
            className="input"
            value={value.region ?? ''}
            onChange={(e) => onChange({ region: e.target.value })}
          >
            <option value="">Automático (09 · Región Guayana)</option>
            {CATALOGO_REGIONES.map((r) => (
              <option key={r.codigo} value={r.codigo}>
                {r.codigo} · {r.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Estado</label>
          <select
            className="input"
            value={value.estado ?? ''}
            onChange={(e) => onChange({ estado: e.target.value })}
          >
            <option value="">Automático (07 · Bolívar)</option>
            {CATALOGO_ESTADOS.map((es) => (
              <option key={es.codigo} value={es.codigo}>
                {es.codigo} · {es.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Ciudad</label>
          <select
            className="input"
            value={value.ciudad ?? ''}
            onChange={(e) => {
              const cod = e.target.value;
              const encontrada = CATALOGO_CIUDADES_PRINCIPALES.find((c) => c.codigo === cod);
              onChange({
                ciudad: cod,
                ...(encontrada && !value.zona_postal ? { zona_postal: encontrada.zonaPostal } : {}),
                ...(encontrada && !value.estado ? { estado: encontrada.estado } : {}),
              });
            }}
          >
            <option value="">Automático (7029 · Puerto Ordaz)</option>
            {CATALOGO_CIUDADES_PRINCIPALES.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} · {c.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Municipio</label>
          <select
            className="input"
            value={value.municipio ?? ''}
            onChange={(e) => onChange({ municipio: e.target.value })}
          >
            <option value="">Automático (0701 · Puerto Ordaz)</option>
            {CATALOGO_MUNICIPIOS_PRINCIPALES.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo} · {m.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Parroquia</label>
          <select
            className="input"
            value={value.parroquia ?? ''}
            onChange={(e) => onChange({ parroquia: e.target.value })}
          >
            <option value="">Automático (070106 · Unare)</option>
            {CATALOGO_PARROQUIAS_PRINCIPALES.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.codigo} · {p.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Zona postal</label>
          <input
            className="input mono"
            value={value.zona_postal ?? ''}
            onChange={(e) => onChange({ zona_postal: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            onKeyDown={evitarSubmitEnter}
            placeholder="8050"
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="divider" />
      <div className="card-title" style={{ marginBottom: '.25rem' }}>
        🏛️ Códigos de Nómina y Clasificación Bancaria
      </div>
      <small className="muted" style={{ display: 'block', marginBottom: '.65rem' }}>
        Si los dejas en «Automático», el reporte asigna el código oficial a partir del cargo, grado de instrucción y configuración del lote.
      </small>

      <div className="form-grid">
        <div className="form-row">
          <label>Nivel de educación (Cód. Banco)</label>
          <select
            className="input"
            value={value.nivel_educacion_cod ?? ''}
            onChange={(e) => onChange({ nivel_educacion_cod: e.target.value })}
          >
            <option value="">Automático según instrucción</option>
            {CATALOGO_NIVEL_EDUCACION.map((n) => (
              <option key={n.codigo} value={n.codigo}>
                {n.codigo} · {n.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Profesión (Catálogo Bancario)</label>
          <SearchSelect
            options={opcionesProfesion}
            value={value.profesion_cod ?? ''}
            onChange={(v) => onChange({ profesion_cod: v })}
            placeholder="Buscar profesión bancaria…"
          />
        </div>

        <div className="form-row">
          <label>Tipo de cargo (Catálogo Bancario)</label>
          <SearchSelect
            options={opcionesCargoBanco}
            value={value.tipo_cargo_cod ?? ''}
            onChange={(v) => onChange({ tipo_cargo_cod: v })}
            placeholder="Buscar tipo de cargo bancario…"
          />
        </div>

        <div className="form-row">
          <label>Fuente de ingreso</label>
          <select
            className="input"
            value={value.fuente_ingreso ?? ''}
            onChange={(e) =>
              onChange({ fuente_ingreso: e.target.value as FichaNominaBancaria['fuente_ingreso'] })
            }
          >
            <option value="">Automático (1 · Sueldo)</option>
            {CATALOGO_FUENTE_INGRESO.map((f) => (
              <option key={f.codigo} value={f.codigo}>
                {f.codigo} · {f.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Tipo de contrato</label>
          <select
            className="input"
            value={value.tipo_contrato ?? ''}
            onChange={(e) =>
              onChange({ tipo_contrato: e.target.value as FichaNominaBancaria['tipo_contrato'] })
            }
          >
            <option value="">Automático (2 · Indefinido)</option>
            {CATALOGO_TIEMPO_CONTRATO.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} · {c.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Tipo de nómina</label>
          <select
            className="input"
            value={value.tipo_nomina ?? ''}
            onChange={(e) =>
              onChange({ tipo_nomina: e.target.value as FichaNominaBancaria['tipo_nomina'] })
            }
          >
            <option value="">Automático (B · Quincenal)</option>
            {CATALOGO_TIPO_NOMINA.map((n) => (
              <option key={n.codigo} value={n.codigo}>
                {n.codigo} · {n.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Tipo de cuenta nómina</label>
          <select
            className="input"
            value={value.tipo_cuenta_nomina ?? ''}
            onChange={(e) =>
              onChange({
                tipo_cuenta_nomina: e.target.value as FichaNominaBancaria['tipo_cuenta_nomina'],
              })
            }
          >
            <option value="">Automático (CCVI / VI01)</option>
            {CATALOGO_TIPO_CUENTA.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} · {c.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Cuenta bancaria nómina (20 dígitos)</label>
          <input
            className="input"
            inputMode="numeric"
            maxLength={20}
            value={value.cuenta_bancaria_nomina ?? ''}
            onChange={(e) =>
              onChange({ cuenta_bancaria_nomina: e.target.value.replace(/\D/g, '').slice(0, 20) })
            }
            placeholder="Vacía si aún no hay cuenta nómina"
          />
          <small className="muted" style={{ display: 'block' }}>
            {(value.cuenta_bancaria_nomina ?? '').length}/20 dígitos. Se captura aquí a mano; no se copia de la
            cuenta de transferencia de Datos Bancarios.
          </small>
        </div>

        <div className="form-row">
          <label>Oficina bancaria principal</label>
          <SearchSelect
            options={opcionesOficina}
            value={value.oficina_principal ?? ''}
            onChange={(v) =>
              onChange({
                oficina_principal: v,
                ...(!value.oficina_secundaria ? { oficina_secundaria: v } : {}),
              })
            }
            placeholder="Buscar agencia Banco del Tesoro…"
          />
        </div>

        <div className="form-row">
          <label>Oficina bancaria secundaria</label>
          <SearchSelect
            options={opcionesOficina}
            value={value.oficina_secundaria ?? ''}
            onChange={(v) => onChange({ oficina_secundaria: v })}
            placeholder="Buscar agencia secundaria…"
          />
        </div>
      </div>
    </div>
  );
}
