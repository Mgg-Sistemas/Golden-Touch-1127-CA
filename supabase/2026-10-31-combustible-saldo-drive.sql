-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Combustible: Control de Google Drive y Saldo Drive
-- Fecha: 2026-10-31
--
-- 1. Agrega registrado_en_drive a combustible_tanque_movimientos para
--    saber si el movimiento fue asentado en la hoja de control de Google Drive.
-- 2. Agrega saldo_drive a combustible_tanque_movimientos para guardar el
--    saldo reportado en la hoja de Drive para cotejo y conciliación.
-- 3. Recarga la caché de esquemas de PostgREST para que la API reconozca
--    las nuevas columnas inmediatamente sin reiniciar.
-- ═══════════════════════════════════════════════════════════════════

alter table public.combustible_tanque_movimientos
  add column if not exists registrado_en_drive boolean default false;

alter table public.combustible_tanque_movimientos
  add column if not exists saldo_drive numeric(12,2) default null;

comment on column public.combustible_tanque_movimientos.registrado_en_drive is
  'Indica si el movimiento fue asentado en la hoja de control de Google Drive.';

comment on column public.combustible_tanque_movimientos.saldo_drive is
  'Saldo en litros registrado en la hoja de Google Drive para cotejo y conciliación.';

create index if not exists idx_combustible_movimientos_drive
  on public.combustible_tanque_movimientos (registrado_en_drive);

-- Recarga la caché de esquemas en Supabase / PostgREST inmediatamente:
notify pgrst, 'reload schema';
