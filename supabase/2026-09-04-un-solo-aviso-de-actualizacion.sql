-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Un solo aviso de actualización, no dos
--
-- QUÉ PASABA
-- En cada despliegue el usuario veía DOS carteles casi iguales, uno detrás del
-- otro:
--   1. «Mantenimiento del sistema — se está aplicando una actualización…»
--      lo encendía el script de despliegue ANTES de construir y lo apagaba al
--      terminar.
--   2. «El sistema se actualizó — recargá para usar la última versión»
--      aparece solo cuando la versión nueva YA está publicada.
--
-- El primero avisa de algo que todavía no pasó; el segundo avisa de algo que
-- ya pasó y se puede accionar. Se queda el segundo.
--
-- QUÉ CAMBIA EN LA BASE
-- La fila deja de encender un banner. Se apaga ahora y el script de despliegue
-- ya no la vuelve a encender: pasa a ser SOLO el registro de qué commit está
-- publicado y desde cuándo (`updated_by = deploy:<commit>`), que es lo que se
-- usa para saber si el Droplet quedó al día.
--
-- No se borra la tabla: el registro de despliegues sirve, y borrarla no tiene
-- vuelta atrás.
-- ═══════════════════════════════════════════════════════════════════

update public.aviso_mantenimiento
   set activo        = false,
       mensaje       = null,
       minutos       = null,
       programado_at = null
 where id = 1;

comment on table public.aviso_mantenimiento is
  'Registro del último despliegue publicado: updated_by = deploy:<commit>, '
  'updated_at = cuándo. La columna `activo` quedó sin uso desde el 04/09/2026: '
  'el único aviso que ve el usuario es "El sistema se actualizó", que sale de '
  'version.json cuando la versión nueva ya está en línea.';

-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select activo, mensaje, minutos, programado_at, updated_by, updated_at
  from public.aviso_mantenimiento
 where id = 1;
