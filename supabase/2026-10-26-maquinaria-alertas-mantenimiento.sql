-- 26/10/2026 · Maquinaria · Respuestas a las alertas de mantenimiento (próximo / vencido)
--
-- Cuando un equipo tiene el servicio próximo o vencido (por horas o km), el usuario de
-- Maquinaria responde SI hará o NO hará el mantenimiento con un mensaje. La respuesta
-- queda guardada (se ve en la bitácora del equipo) y se puede enviar por WhatsApp con el
-- formato «ALERTA MANTENIMIENTO - RETRASADO / PRÓXIMO». Esta tabla es el historial de esas
-- respuestas: nunca se edita ni se borra desde la app (solo admin), igual que un evento.
--
-- Aplicada el 26/10/2026 con apply_migration (name: maquinaria_alertas_respuestas).

create table if not exists public.maquinaria_alertas_respuestas (
  id              uuid primary key default gen_random_uuid(),
  equipo_id       uuid not null references public.maquinaria_equipos(id) on delete cascade,
  -- Nivel del aviso al momento de responder (misma regla que avisoServicio en flota.ts).
  nivel           text not null check (nivel in ('proximo', 'vencido')),
  -- Dimensión del aviso: horas (horómetro) o kilómetros (odómetro).
  unidad          text not null check (unidad in ('h', 'km')),
  -- Foto del contador al responder: lectura vigente, frecuencia del servicio y lo que
  -- restaba (negativo = ya pasado). Se guardan para que el historial no cambie si después
  -- se ajusta la frecuencia o se registra una lectura nueva.
  lectura         numeric,
  frecuencia      numeric,
  restante        numeric,
  decision        text not null check (decision in ('hara', 'no_hara')),
  mensaje         text not null,
  -- Texto exacto que se armó para WhatsApp (para reenviarlo tal cual desde la bitácora).
  texto_whatsapp  text,
  actor           text,
  actor_name      text,
  created_at      timestamptz not null default now()
);

comment on table public.maquinaria_alertas_respuestas is
  'Respuestas del usuario de Maquinaria a las alertas de mantenimiento próximo/vencido: si hará o no el servicio, con mensaje y texto WhatsApp. Historial (sin edición).';

create index if not exists maquinaria_alertas_respuestas_equipo_idx
  on public.maquinaria_alertas_respuestas (equipo_id, created_at desc);

-- RLS: mismo patrón que maquinaria_lavados / maquinaria_estado_eventos.
--   · lee cualquier usuario con sesión
--   · inserta quien tiene permiso de Maquinaria (o admin)
--   · corrige / borra solo un administrador (es un historial)
alter table public.maquinaria_alertas_respuestas enable row level security;

drop policy if exists "maq_alertas_resp read auth" on public.maquinaria_alertas_respuestas;
create policy "maq_alertas_resp read auth" on public.maquinaria_alertas_respuestas
  for select using ((select auth.role()) = 'authenticated');

drop policy if exists "maq_alertas_resp insert maq" on public.maquinaria_alertas_respuestas;
create policy "maq_alertas_resp insert maq" on public.maquinaria_alertas_respuestas
  for insert with check ((select is_admin()) or (select puede('maquinaria')));

drop policy if exists "maq_alertas_resp update admin" on public.maquinaria_alertas_respuestas;
create policy "maq_alertas_resp update admin" on public.maquinaria_alertas_respuestas
  for update using ((select is_admin())) with check ((select is_admin()));

drop policy if exists "maq_alertas_resp delete admin" on public.maquinaria_alertas_respuestas;
create policy "maq_alertas_resp delete admin" on public.maquinaria_alertas_respuestas
  for delete using ((select is_admin()));

-- Realtime: la vista de PC y la del teléfono ven la respuesta apenas se guarda.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'maquinaria_alertas_respuestas') then
    alter publication supabase_realtime add table public.maquinaria_alertas_respuestas;
  end if;
end $$;

-- Frecuencia de servicio por defecto: 250 h.
-- Regla de la empresa (26/10/2026): todo equipo recibe mantenimiento cada 250 horas de
-- trabajo y la alerta salta al superarlas. Los equipos activos que no tenían frecuencia
-- cargada quedan en 250 para que el aviso funcione desde ya; los que ya tenían un valor
-- propio (p. ej. 500) se respetan.
alter table public.maquinaria_equipos alter column mantenimiento_cada_hrs set default 250;

update public.maquinaria_equipos
set mantenimiento_cada_hrs = 250, updated_at = now()
where mantenimiento_cada_hrs is null and activo;
