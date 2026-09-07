-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- La tasa de Binance se actualiza sola, tres veces al día
--
-- CÓMO ERA HASTA HOY
-- La tasa se refrescaba de dos maneras, y las dos dependían de una persona:
--   · el botón «Actualizar ahora» del modal de Tasas, y
--   · `refrescarTasasSiVencido(11h)`, que corre al ABRIR Tesorería o al pintar
--     el chip de tasa, y solo si el último snapshot ya tiene 11 horas.
-- O sea: si nadie entraba al sistema, la tasa no se movía. Un lunes por la
-- mañana el sistema podía estar cotizando con el número del viernes.
--
-- LO QUE HACE ESTE ARCHIVO
-- Programa la llamada a la Edge Function `tasa-binance-p2p` —la misma que
-- dispara el botón— tres veces al día, desde la base, sin que haya nadie
-- conectado. La función ya hace todo el trabajo: consulta el P2P, saca la
-- mediana de compra y de venta, guarda el promedio en `tasa_cambio` y los tres
-- puntos en `tasa_snapshot`.
--
-- LOS HORARIOS
-- pg_cron corre en UTC y Venezuela es UTC−4:
--   12:00 UTC → 08:00 VE   al abrir la jornada
--   16:00 UTC → 12:00 VE   mediodía
--   21:00 UTC → 17:00 VE   al cerrar
-- Si hay que moverlos, se cambia el `cron.schedule` de abajo y se vuelve a
-- correr este archivo: es idempotente, borra el job anterior por nombre.
--
-- LA CLAVE
-- La llamada va con la anon key, que es pública —viaja en el bundle del
-- navegador— pero igual no se escribe acá: vive en Vault bajo el nombre
-- `anon_key_cron` y la función la lee por nombre. Así este archivo se puede
-- commitear sin arrastrar credenciales.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1 · pg_net: es lo que permite hacer HTTP desde la base ────────
create extension if not exists pg_net;

-- ── 2 · La función que dispara el refresco ───────────────────────
create or replace function public.cron_tasa_binance_p2p()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key text;
  v_req bigint;
begin
  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'anon_key_cron';

  if v_key is null then
    raise warning 'cron_tasa_binance_p2p: falta el secreto anon_key_cron en Vault; no se llamó a la función';
    return;
  end if;

  -- net.http_post es ASÍNCRONO: devuelve el id del pedido y sigue. La
  -- respuesta queda en net._http_response, que es donde hay que mirar si un
  -- día la tasa no se actualiza (ver la consulta del pie de este archivo).
  select net.http_post(
           url     := 'https://rroohciwhpfonklxuoev.supabase.co/functions/v1/tasa-binance-p2p',
           headers := jsonb_build_object(
                        'Content-Type',  'application/json',
                        'Authorization', 'Bearer ' || v_key
                      ),
           body    := '{}'::jsonb,
           timeout_milliseconds := 20000
         )
    into v_req;
end;
$$;

revoke all on function public.cron_tasa_binance_p2p() from public;

-- ── 3 · El horario ───────────────────────────────────────────────
-- Se borra por nombre antes de crear, así este archivo se puede correr las
-- veces que haga falta sin dejar jobs duplicados disparando la misma llamada.
select cron.unschedule(jobid) from cron.job where jobname = 'tasa-binance-3-al-dia';

select cron.schedule(
  'tasa-binance-3-al-dia',
  '0 12,16,21 * * *',
  $cron$ select public.cron_tasa_binance_p2p(); $cron$
);


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
--
-- Para revisar más adelante si las corridas están saliendo bien:
--   select start_time, status, return_message
--     from cron.job_run_details
--    where jobname = 'tasa-binance-3-al-dia'
--    order by start_time desc limit 10;
--
--   select created, status_code, content
--     from net._http_response order by created desc limit 5;
-- ═══════════════════════════════════════════════════════════════════
select j.jobname,
       j.schedule,
       j.active,
       (select count(*) from pg_extension where extname = 'pg_net')            as pg_net_instalado,
       (select count(*) from vault.secrets where name = 'anon_key_cron')       as clave_en_vault
  from cron.job j
 where j.jobname = 'tasa-binance-3-al-dia';
