-- ============================================================================
-- 05/11/2026 · RRHH · Minutas: cargar minutas ya hechas (en papel o en otro sistema)
--
-- Una minuta «cargada» guarda los datos para buscarla (número, fecha, tema, lugar,
-- participantes) y su documento original como adjunto (PDF o imagen); la vista
-- previa muestra ese documento. Las del sistema siguen igual.
-- ============================================================================
alter table public.minutas add column if not exists origen text not null default 'sistema';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'minutas_origen_chk') then
    alter table public.minutas add constraint minutas_origen_chk check (origen in ('sistema', 'cargada'));
  end if;
end $$;
comment on column public.minutas.origen is 'sistema = hecha con el editor · cargada = minuta ya existente subida con su documento.';
