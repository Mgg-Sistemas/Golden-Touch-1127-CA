-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 08/09/2026
-- Paso 2 de la revisión de lecturas: las cuentas por cobrar
--
-- CÓMO ESTABA
-- Igual que Ventas: `auth.role() = 'authenticated'`. Cualquiera logueado
-- podía leer la cuenta corriente de cada cliente —cuánto debe, desde cuándo,
-- qué se le cargó y qué abonó—. Escribirlas ya estaba gateado por tesorería.
--
-- LAS TRES JUNTAS
-- La madre acumula por cliente, pero el detalle vive en las hijas: `cargos`
-- tiene venta por venta y `abonos` cada pago recibido. Cerrar solo la madre
-- dejaría el detalle a la vista, que es lo que de verdad importa.
--
-- QUIÉN LA LEE DESPUÉS
--   · tesorería → es su módulo; ahí se cobran y se concilian
--   · ventas    → una venta a crédito genera el cargo, y la pantalla de
--                 Ventas muestra lo que quedó debiendo el cliente
-- Nadie más las toca. Lo verifiqué en el código: fuera de esos dos módulos,
-- la única mención es una etiqueta en el mapa de nombres de Auditoría, que
-- lee `auditoria_eventos` y no estas tablas.
--
-- ── UNA COSA QUE QUEDA ANOTADA, NO ARREGLADA ─────────────────────
-- Ninguna de las RPC de ventas es SECURITY DEFINER: corren con los permisos
-- de quien las llama. `confirmar_venta` de una venta A CRÉDITO llama a
-- `crear_o_acumular_cxc`, que escribe acá, y la política de escritura de
-- estas tablas pide `is_admin() or puede('tesoreria')`.
--
-- O sea: alguien con permiso de VENTAS pero sin TESORERÍA no puede confirmar
-- una venta a crédito. Hoy no le pasa a nadie —los dos únicos roles no-admin
-- que escriben ventas (analista de tesorería y asistente administrativo)
-- también escriben tesorería—, así que no se toca nada: ampliar permisos de
-- escritura «por las dudas» es ir en la dirección contraria a esta revisión.
--
-- Pero el día que se le dé Ventas a alguien que no maneja tesorería, las
-- ventas a crédito le van a fallar. Cuando pase, la decisión es agregar
-- `puede('ventas')` a la política de escritura de esta tabla y la de cargos.
-- ═══════════════════════════════════════════════════════════════════

-- ── cuentas_por_cobrar ───────────────────────────────────────────
drop policy if exists "cxc read auth" on public.cuentas_por_cobrar;
create policy "cxc read rol" on public.cuentas_por_cobrar
  for select using (puede_leer('tesoreria') or puede_leer('ventas'));

-- ── cuentas_por_cobrar_cargos ────────────────────────────────────
drop policy if exists "cxcc read auth" on public.cuentas_por_cobrar_cargos;
create policy "cxcc read rol" on public.cuentas_por_cobrar_cargos
  for select using (puede_leer('tesoreria') or puede_leer('ventas'));

-- ── cuentas_por_cobrar_abonos ────────────────────────────────────
drop policy if exists "cxca read auth" on public.cuentas_por_cobrar_abonos;
create policy "cxca read rol" on public.cuentas_por_cobrar_abonos
  for select using (puede_leer('tesoreria') or puede_leer('ventas'));


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select tablename, policyname, qual as condicion_de_lectura
  from pg_policies
 where schemaname='public' and tablename like 'cuentas_por_cobrar%' and cmd='SELECT'
 order by tablename;
