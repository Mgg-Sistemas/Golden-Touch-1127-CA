-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Los catálogos dejan de duplicarse por un acento
--
-- QUÉ PASABA
-- La unicidad de los catálogos era sobre el texto tal cual: `(tipo, valor)`.
-- Para Postgres «MARÍA» y «MARIA» son valores distintos, así que la misma
-- unidad solicitante podía entrar dos veces según quién la escribiera. Después
-- quedan dos entradas para lo mismo y los reportes se parten al medio.
--
-- QUÉ CAMBIA
-- Se agrega un índice único adicional sobre `(tipo, sin_acentos(valor))`. El
-- valor se sigue guardando y mostrando como se escribió —con su acento—; lo
-- que ya no se puede es crear una segunda variante que solo difiera en eso.
--
-- SEGURIDAD DE LA MIGRACIÓN
-- Se verificó antes de aplicar: hoy hay CERO colisiones en las cuatro tablas,
-- así que el índice entra sin conflicto. Si en el futuro fallara, sería porque
-- alguien ya creó el par — y ese es justamente el caso que queremos frenar.
--
-- POR QUÉ NO SE HACE LO MISMO EN `productos`
-- Ahí sí hay conflictos: «PLATANO» y «Plátano» existen como dos productos
-- separados, además de 25 grupos con el nombre repetido exacto. Fusionarlos
-- mueve stock y costo, así que es una decisión del administrador, no de una
-- migración automática.
-- ═══════════════════════════════════════════════════════════════════

create unique index if not exists pedido_catalogos_tipo_valor_sin_acentos
  on public.pedido_catalogos (tipo, public.sin_acentos(valor));

create unique index if not exists maquinaria_catalogos_tipo_valor_sin_acentos
  on public.maquinaria_catalogos (tipo, public.sin_acentos(valor));

create unique index if not exists combustible_catalogos_tipo_valor_sin_acentos
  on public.combustible_catalogos (tipo, public.sin_acentos(valor));

create unique index if not exists acopio_catalogos_tipo_valor_sin_acentos
  on public.acopio_catalogos (tipo, public.sin_acentos(valor));


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select count(*) as indices_creados
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('pedido_catalogos_tipo_valor_sin_acentos',
                     'maquinaria_catalogos_tipo_valor_sin_acentos',
                     'combustible_catalogos_tipo_valor_sin_acentos',
                     'acopio_catalogos_tipo_valor_sin_acentos');
