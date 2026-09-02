-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 9
-- GT-INT-04 · Correlativo fiscal de gasto duplicado
--
-- QUÉ PASA
-- `registrarGasto` saca el correlativo de RECEPCIÓN/EXPORTACIÓN así:
--     const ultimo = await ultimoCorrelativo(categoria);   // select max
--     correlativo = ultimo + 1;                            // y a insertar
-- Leer y después escribir. Dos gastos de la misma categoría al mismo tiempo
-- leen el mismo máximo y se llevan el MISMO número. Y no es un número interno:
-- es el correlativo del documento fiscal. Dos gastos con el mismo número es un
-- problema de libro, no de sistema.
--
-- El comentario del código decía «se recalcula lo más cerca posible del insert,
-- para reducir choques». Reducir no es evitar: la ventana sigue existiendo.
--
-- QUÉ CAMBIA
-- Se pasa a `next_correlativo(clave)`, que ya usa Solicitudes de Pedido: hace
-- el incremento en UN solo `insert … on conflict do update … returning`, así
-- que dos llamadas simultáneas se llevan números distintos siempre.
--
-- Este bloque SIEMBRA el contador con el máximo que ya está registrado en cada
-- categoría, para que la numeración siga donde estaba y no vuelva a empezar en
-- 1. Hay que correrlo ANTES de publicar el cambio de código.
-- ═══════════════════════════════════════════════════════════════════

insert into public.correlativos (clave, valor)
select 'gasto-' || lower(trim(m.gasto_categoria)) as clave,
       max(m.gasto_correlativo)                   as valor
from public.movimientos_caja m
where m.gasto_categoria is not null
  and trim(m.gasto_categoria) <> ''
  and m.gasto_correlativo is not null
group by lower(trim(m.gasto_categoria))
on conflict (clave) do update
  set valor = greatest(public.correlativos.valor, excluded.valor),
      updated_at = now();


-- ───────────────────────────────────────────────────────────────────
-- Verificación: en qué número quedó cada categoría (el próximo será +1).
-- ───────────────────────────────────────────────────────────────────
select clave, valor as ultimo_usado, valor + 1 as proximo
from public.correlativos
where clave like 'gasto-%'
order by clave;
