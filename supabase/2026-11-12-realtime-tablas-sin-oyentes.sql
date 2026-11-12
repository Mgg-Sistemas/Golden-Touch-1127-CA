-- 12/11/2026 · Optimización de Realtime: fuera de la publicación las tablas que se
-- escriben mucho y que ninguna pantalla escucha. El servidor de Realtime procesa
-- cada cambio de cada tabla publicada, la escuche alguien o no.
--
--   · sesiones_usuario  (~55 000 escrituras: el latido de cada usuario, 1/min). Solo
--     la escuchaba Auditoría; ahora refresca los conectados cada minuto por su cuenta.
--   · notificaciones    (~19 600 escrituras): la campana no usa Realtime.
--   · aviso_mantenimiento y las tablas viejas delivery_*_v1: sin uso en la app.
--
-- Con esto, sesiones_usuario + notificaciones (el 99 % del tráfico sin oyentes) dejan
-- de pasar por Realtime. El script 2026-11-11-rls-y-realtime-verificacion.sql (paso 6)
-- las excluye para no volver a agregarlas.
-- Para volver a publicar alguna: alter publication supabase_realtime add table public.<tabla>;
alter publication supabase_realtime drop table
  public.sesiones_usuario,
  public.notificaciones,
  public.aviso_mantenimiento,
  public.delivery_eventos_v1,
  public.delivery_pedidos_v1,
  public.delivery_ubicaciones_v1;
