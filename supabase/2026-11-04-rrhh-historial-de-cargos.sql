-- ============================================================
-- Golden Touch · RRHH · Historial de cambios de cargo (04/11/2026)
--
-- Igual que el historial de sueldo: el cargo de una ficha que ya existe se
-- cambia con `cambiar_cargo` (fecha desde la que rige + motivo obligatorio) y
-- queda el renglón en `personal_cargos`. Si el cargo se mueve por otra vía, el
-- disparador igual escribe el renglón marcado «sin motivo», para que el cambio
-- no desaparezca. Lo cargado antes de hoy no tiene historial: se ve el cargo
-- vigente y, de aquí en adelante, cada cambio.
-- ============================================================

create table if not exists public.personal_cargos (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal(id) on delete cascade,
  cargo_anterior text,
  cargo_nuevo text,
  departamento_anterior text,
  departamento_nuevo text,
  fecha date not null default current_date,
  motivo text not null,
  nota text,
  created_at timestamptz not null default now(),
  created_by text,
  actor_name text
);

create index if not exists personal_cargos_persona_idx on public.personal_cargos (personal_id, fecha desc, created_at desc);

alter table public.personal_cargos enable row level security;

create policy "cargos read rrhh" on public.personal_cargos
  for select to authenticated using ((select public.puede_leer('rrhh')));
create policy "cargos insert staff" on public.personal_cargos
  for insert to authenticated with check ((select public.is_admin()) or (select public.puede('rrhh')));
create policy "cargos delete admin" on public.personal_cargos
  for delete to authenticated using (public.is_admin() or public.puede_full('rrhh'));

-- Cambia el cargo (y, si se indica, el departamento) y deja el renglón con su motivo.
create or replace function public.cambiar_cargo(
  p_personal_id uuid,
  p_cargo_nuevo text,
  p_motivo text,
  p_fecha date default null,
  p_departamento_nuevo text default null,
  p_nota text default null,
  p_actor_name text default null
)
returns public.personal_cargos
language plpgsql
set search_path = public
as $$
declare
  v_cargo text;
  v_depto text;
  v_cargo_n text := upper(nullif(btrim(coalesce(p_cargo_nuevo, '')), ''));
  v_depto_n text;
  v_fila public.personal_cargos;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del cambio de cargo.' using errcode = '23514';
  end if;
  if v_cargo_n is null then
    raise exception 'Indica el cargo nuevo.' using errcode = '23514';
  end if;
  if p_fecha is not null and p_fecha > current_date + 31 then
    raise exception 'La fecha del cambio no puede pasar de un mes adelante.' using errcode = '23514';
  end if;

  select cargo, departamento into v_cargo, v_depto from public.personal where id = p_personal_id for update;
  if not found then
    raise exception 'No se encontró esa persona en el personal.' using errcode = '23503';
  end if;
  v_depto_n := coalesce(nullif(btrim(coalesce(p_departamento_nuevo, '')), ''), v_depto);

  if upper(btrim(coalesce(v_cargo, ''))) = v_cargo_n
     and upper(btrim(coalesce(v_depto, ''))) = upper(btrim(coalesce(v_depto_n, ''))) then
    raise exception 'Es el mismo cargo que ya tiene. No hay cambio que registrar.' using errcode = '23514';
  end if;

  perform set_config('gt.cargo_rpc', '1', true);
  update public.personal set cargo = v_cargo_n, departamento = v_depto_n where id = p_personal_id;
  perform set_config('gt.cargo_rpc', '', true);

  insert into public.personal_cargos (
    personal_id, cargo_anterior, cargo_nuevo, departamento_anterior, departamento_nuevo,
    fecha, motivo, nota, created_by, actor_name
  ) values (
    p_personal_id, nullif(btrim(coalesce(v_cargo, '')), ''), v_cargo_n,
    nullif(btrim(coalesce(v_depto, '')), ''), nullif(btrim(coalesce(v_depto_n, '')), ''),
    coalesce(p_fecha, current_date), btrim(p_motivo), nullif(btrim(coalesce(p_nota, '')), ''),
    auth.jwt() ->> 'email', nullif(btrim(coalesce(p_actor_name, '')), '')
  ) returning * into v_fila;

  return v_fila;
end $$;

revoke execute on function public.cambiar_cargo(uuid, text, text, date, text, text, text) from anon;
grant execute on function public.cambiar_cargo(uuid, text, text, date, text, text, text) to authenticated;

-- Red de seguridad: un cambio de cargo por otra vía igual queda en el historial.
create or replace function public.personal_cargo_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('gt.cargo_rpc', true), '') = '1' then
    return null;  -- lo está registrando cambiar_cargo(), con su motivo
  end if;
  insert into public.personal_cargos (personal_id, cargo_anterior, cargo_nuevo, departamento_anterior, departamento_nuevo, motivo, fecha, created_by)
  values (new.id, nullif(btrim(coalesce(old.cargo, '')), ''), nullif(btrim(coalesce(new.cargo, '')), ''),
          nullif(btrim(coalesce(old.departamento, '')), ''), nullif(btrim(coalesce(new.departamento, '')), ''),
          'Cambio sin motivo registrado (se guardó por otra vía)', current_date, auth.jwt() ->> 'email');
  return null;
end $$;

create or replace trigger personal_cargo_auditoria
  after update of cargo on public.personal
  for each row
  when (upper(btrim(coalesce(old.cargo, ''))) is distinct from upper(btrim(coalesce(new.cargo, ''))))
  execute function public.personal_cargo_auditoria();

alter publication supabase_realtime add table public.personal_cargos;
