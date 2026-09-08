-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 08/09/2026
-- Paso 1 de la revisión de lecturas: Ventas deja de leerla cualquiera
--
-- CÓMO ESTABA
-- Las tres tablas del módulo se leían con `auth.role() = 'authenticated'`:
-- alcanzaba con estar logueado, sin mirar el rol. Escribirlas sí estaba
-- gateado (`is_admin() or puede('ventas')`), pero leer no.
--
-- De los 16 usuarios activos, 7 no tienen nada que ver con ventas ni con
-- tesorería —3 analistas de compras, 2 almacenistas, 1 analista y 1 de centro
-- de acopio— y podían consultar por la API toda la facturación: a quién se le
-- vendió, cuánto, con qué ganancia y qué le quedó debiendo.
--
-- POR QUÉ ESTE ES EL PRIMER PASO
-- Porque es el único sin riesgo: `ventas` tiene CERO filas y nadie estrenó el
-- módulo todavía. Si la regla estuviera mal, no hay dato que se pierda ni
-- pantalla en uso que se rompa. Las otras tablas de dinero —movimientos_caja,
-- cuentas por pagar— tienen módulos vivos colgando y van aparte.
--
-- LAS TRES JUNTAS, NO SOLO LA MADRE
-- Cerrar `ventas` y dejar abiertas `ventas_renglones` y `ventas_recibidos`
-- no serviría de nada: los renglones tienen el producto, la cantidad, el
-- precio y el costo. El dato se seguiría leyendo por la puerta de al lado.
--
-- QUIÉN LA LEE DESPUÉS DE ESTO
-- `puede_leer` ya resuelve admin y exige cuenta activa y sin contraseña
-- vencida, así que la regla queda en dos nombres:
--   · ventas    → los que trabajan el módulo
--   · tesorería → porque el cobro de una venta entra por caja y desde el
--                 detalle del movimiento se abre la venta que lo generó
-- ═══════════════════════════════════════════════════════════════════

-- ── ventas ───────────────────────────────────────────────────────
drop policy if exists "ventas read auth" on public.ventas;
create policy "ventas read rol" on public.ventas
  for select using (puede_leer('ventas') or puede_leer('tesoreria'));

-- ── ventas_renglones ─────────────────────────────────────────────
drop policy if exists "ventas_renglones read auth" on public.ventas_renglones;
create policy "ventas_renglones read rol" on public.ventas_renglones
  for select using (puede_leer('ventas') or puede_leer('tesoreria'));

-- ── ventas_recibidos ─────────────────────────────────────────────
drop policy if exists "ventas_recibidos read auth" on public.ventas_recibidos;
create policy "ventas_recibidos read rol" on public.ventas_recibidos
  for select using (puede_leer('ventas') or puede_leer('tesoreria'));


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select tablename, policyname, qual as condicion_de_lectura
  from pg_policies
 where schemaname='public'
   and tablename in ('ventas','ventas_renglones','ventas_recibidos')
   and cmd='SELECT'
 order by tablename;
