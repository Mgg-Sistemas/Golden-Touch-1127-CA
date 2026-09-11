-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 11/09/2026
-- El conversor multimoneda guarda su historial
--
-- QUÉ FALTABA
-- Una conversión de Bs a USDT dejaba DOS renglones sueltos en el libro
-- de la caja: una salida de un lado y una entrada del otro, unidas
-- solo por el texto del motivo. No había forma de ver «las conversiones»
-- como una lista, ni de filtrarlas, ni de saber de un vistazo quién la
-- hizo. Tampoco se podía cargar una conversión de ayer: el libro la
-- fechaba siempre en el momento de apretar el botón.
--
-- CÓMO QUEDA
-- Cada conversión deja UN renglón propio acá, con las dos puntas del
-- cambio, la tasa, la comisión, con quién se hizo, quién la cargó y
-- cuándo ocurrió DE VERDAD.
--
-- Dos fechas distintas a propósito:
--   · `fecha` + `hora` → cuándo ocurrió el cambio (se puede poner una
--     fecha anterior si se carga después).
--   · `created_at`     → cuándo se cargó al sistema. No se edita.
-- Cuando las dos no coinciden, la pantalla lo dice. Una conversión
-- cargada tres días tarde no se puede disfrazar de conversión de hoy.
--
-- Los movimientos del libro mayor siguen siendo la verdad del dinero;
-- esta tabla es el índice que los une y les agrega lo que faltaba.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.caja_conversiones (
  id                 uuid primary key default gen_random_uuid(),

  -- Cuándo ocurrió el cambio (editable al cargarlo).
  fecha              date not null default current_date,
  hora               time,

  -- Las dos puntas.
  moneda_de          text    not null,
  moneda_a           text    not null,
  monto_de           numeric not null check (monto_de > 0),
  monto_a            numeric not null check (monto_a > 0),
  tasa               numeric not null check (tasa > 0),
  monto_bruto        numeric not null default 0,
  comision_monto     numeric not null default 0,
  comision_pct       numeric not null default 0,

  -- De dónde salió y a dónde entró.
  origen_caja_id     uuid references public.cajas(id) on delete set null,
  origen_cuenta      text,
  destino_caja_id    uuid references public.cajas(id) on delete set null,
  destino_cuenta     text,

  -- Con quién se hizo el cambio (cliente o proveedor), igual que en CxC/CxP.
  contraparte_tipo   text check (contraparte_tipo in ('cliente','proveedor')),
  contraparte_nombre text,

  motivo             text,

  -- Los dos renglones del libro mayor que movieron la plata.
  mov_salida_id      uuid,
  mov_ingreso_id     uuid,

  actor              text not null,
  actor_name         text,
  created_at         timestamptz not null default now()
);

comment on table public.caja_conversiones is
  'Historial del conversor multimoneda: un renglón por conversión. fecha/hora = cuándo ocurrió; created_at = cuándo se cargó.';

create index if not exists caja_conversiones_fecha_idx  on public.caja_conversiones (fecha desc, hora desc nulls last);
create index if not exists caja_conversiones_actor_idx  on public.caja_conversiones (actor);
create index if not exists caja_conversiones_par_idx    on public.caja_conversiones (moneda_de, moneda_a);


-- ── Permisos: los mismos que el resto de Tesorería ──────────────────
alter table public.caja_conversiones enable row level security;

drop policy if exists "caja_conversiones read rol" on public.caja_conversiones;
create policy "caja_conversiones read rol" on public.caja_conversiones
  for select using (public.puede_leer('tesoreria'));

drop policy if exists "caja_conversiones write tesoreria" on public.caja_conversiones;
create policy "caja_conversiones write tesoreria" on public.caja_conversiones
  for all using (public.is_admin() or public.puede('tesoreria'))
       with check (public.is_admin() or public.puede('tesoreria'));


-- ── Realtime ────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'caja_conversiones'
  ) then
    alter publication supabase_realtime add table public.caja_conversiones;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Rescate de las conversiones que ya se hicieron
--
-- Las viejas viven como dos movimientos del libro con el MISMO motivo,
-- el mismo actor y segundos de diferencia: una salida y una entrada.
-- Se emparejan por ahí. La tasa se recalcula de los montos en vez de
-- leerla del texto, porque el texto cambió de formato con el tiempo y
-- un número mal parseado es peor que un número calculado.
-- ═══════════════════════════════════════════════════════════════════
with salidas as (
  select id, at, monto, moneda, cuenta, caja_id, motivo, actor, actor_name
    from public.movimientos_caja
   where tipo = 'salida' and (categoria = 'conversion' or motivo like 'Conversi%')
),
entradas as (
  select id, at, monto, moneda, cuenta, caja_id, motivo, actor, actor_name
    from public.movimientos_caja
   where tipo = 'ingreso' and motivo like 'Conversi%'
),
pares as (
  select distinct on (s.id)
         s.id as sal_id, e.id as ent_id, s.at,
         s.monto as monto_de, s.moneda as moneda_de, s.cuenta as cta_de, s.caja_id as caja_de,
         e.monto as monto_a,  e.moneda as moneda_a,  e.cuenta as cta_a,  e.caja_id as caja_a,
         s.motivo, s.actor, s.actor_name
    from salidas s
    join entradas e
      on e.motivo = s.motivo and e.actor = s.actor
     and e.at between s.at and s.at + interval '2 minutes'
   order by s.id, e.at
)
insert into public.caja_conversiones
  (fecha, hora, moneda_de, moneda_a, monto_de, monto_a, tasa, monto_bruto,
   origen_caja_id, origen_cuenta, destino_caja_id, destino_cuenta,
   motivo, mov_salida_id, mov_ingreso_id, actor, actor_name, created_at)
select (p.at at time zone 'America/Caracas')::date,
       (p.at at time zone 'America/Caracas')::time,
       p.moneda_de, p.moneda_a, p.monto_de, p.monto_a,
       round(p.monto_a / nullif(p.monto_de, 0), 6), p.monto_a,
       p.caja_de, p.cta_de, p.caja_a, p.cta_a,
       p.motivo, p.sal_id, p.ent_id, p.actor, p.actor_name, p.at
  from pares p
 where not exists (select 1 from public.caja_conversiones c where c.mov_salida_id = p.sal_id);


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from public.caja_conversiones)                                   as conversiones_rescatadas,
  (select min(fecha)::text from public.caja_conversiones)                           as desde,
  (select max(fecha)::text from public.caja_conversiones)                           as hasta,
  (select count(distinct actor) from public.caja_conversiones)                      as personas,
  (select count(*) from public.movimientos_caja
    where tipo='salida' and (categoria='conversion' or motivo like 'Conversi%'))    as salidas_de_conversion,
  (select count(*) from pg_policies where tablename='caja_conversiones')            as politicas;
