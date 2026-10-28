-- ============================================================
-- Golden Touch · Choferes / Conductores · Sincronización con MGG (28/10/2026)
-- Aplicado en GT (rroohciwhpfonklxuoev) como migración `choferes_sync_rrhh_trigger`.
--
-- Comparación de esquema MGG (itqejsffgueshmlodkjk) ↔ GT hecha el 28/10/2026:
--   · choferes_conductores, choferes_documentos, choferes_pagos, choferes_viajes,
--     choferes_viaticos: mismas columnas y tipos (GT tiene además choferes_viajes.empresa).
--   · RPC choferes_pago_crear / choferes_pago_anular y numeradores VJ-/RV-: misma
--     lógica; GT gatea con is_admin() or puede('choferes') y sella el correo del JWT.
--   · Diferencias que son ADAPTACIONES de GT y se conservan (no se tocan):
--       vehiculos_catalogo  observacion/created_by   (MGG: notas/creado_por)
--       choferes_guias      nombre/tamano/subido_por/subido_por_nombre/vehiculo_id/updated_at
--                           (MGG: filename/size_bytes/actor/actor_name/mime), path 'guias/%' y .pdf
--       choferes_descansos_config + rrhh_descansos_config.seleccion_plan
--                           (MGG usa rrhh_descansos_grupos, que el DescansosTab de GT no usa)
--       rrhh_descansos.updated_at NOT NULL default now() (MGG lo deja nulo)
--   · MGG NO tiene funciones ni triggers de sincronización RRHH → Choferes: allá se hace
--     desde la pantalla (personal.repository / ChoferesPage). En GT se hace también en la
--     base, para que valga venga de donde venga el cambio y aunque quien edita RRHH no
--     tenga permiso de Choferes (RLS de choferes_conductores = is_admin() or puede('choferes')).
--
-- Qué hace el trigger:
--   · Ficha ACTIVA con cargo/departamento de chofer (chofer, conductor, transporte,
--     gandolero, camionero, motorizado, volqueta; con o sin acentos) y sin expediente
--     → le abre el expediente en choferes_conductores (tarifa 0, sin datos de licencia).
--   · Cambia `activo` en RRHH → el expediente (si existe) queda igual: de baja en RRHH =
--     de baja en Choferes; reactivado = vuelve a salir.
--   No borra nada. Auditoría (fn_auditar) y realtime de choferes_conductores siguen igual.
-- ============================================================

create or replace function public.personal_es_cargo_chofer(p_cargo text, p_departamento text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select translate(lower(coalesce(p_cargo, '') || ' ' || coalesce(p_departamento, '')),
                   'áéíóúüàèìòùñ', 'aeiouuaeioun')
         ~ '(chofer|conductor|transpor|gandol|camioner|motoriz|volquet)';
$$;

comment on function public.personal_es_cargo_chofer(text, text) is
  'Misma regla que esCargoDeChofer (src/modules/choferes/choferes.ts): ¿la ficha de RRHH maneja?';

create or replace function public.personal_sincroniza_conductor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(coalesce(auth.jwt() ->> 'email', ''), '');
begin
  -- 1) Estado: lo que diga RRHH manda sobre el expediente existente.
  if tg_op = 'UPDATE' and new.activo is distinct from old.activo then
    update public.choferes_conductores
       set activo = new.activo
     where personal_id = new.id
       and activo is distinct from new.activo;
  end if;

  -- 2) Alta automática: ficha activa con cargo de chofer y sin expediente.
  if new.activo and public.personal_es_cargo_chofer(new.cargo, new.departamento) then
    insert into public.choferes_conductores (personal_id, tarifa_viaje_usd, activo, created_by, observaciones)
    values (new.id, 0, true, v_actor, 'Expediente creado automáticamente desde RRHH por cargo de chofer/conductor.')
    on conflict (personal_id) do nothing;
  end if;

  return null;
end;
$$;

revoke all on function public.personal_sincroniza_conductor() from public, anon, authenticated;

create or replace trigger trg_personal_sincroniza_conductor
  after insert or update of activo, cargo, departamento on public.personal
  for each row execute function public.personal_sincroniza_conductor();
