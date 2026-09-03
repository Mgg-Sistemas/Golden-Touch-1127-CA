-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 03/09/2026 · PARTE 17
-- GT-INT-15 · Reconexión de los cinco vínculos equipo ↔ combustible
--             que ya estaban rotos
--
-- APLICADO el 03/09/2026, autorizado por el administrador. Verificado
-- después: cero vínculos rotos, y el YAMAGRO 60KVA recuperó 39 movimientos
-- (3.003 litros de gasoil) y su alerta de mantenimiento cada 250 h.
--
-- POR QUÉ HIZO FALTA
-- El vínculo entre un equipo de Maquinaria y su consumo de combustible es por
-- TEXTO: `maquinaria_equipos.combustible_equipo` guarda el NOMBRE del valor del
-- catálogo, no su id. Hasta hoy, renombrar el valor propagaba el cambio a los
-- movimientos pero NO a la ficha del equipo, así que el equipo quedaba colgado
-- de un nombre inexistente y perdía en silencio su horómetro y su gasoil. Sin
-- horómetro no hay alerta de mantenimiento preventivo: deja de sonar y nadie se
-- entera, porque no hay ningún error.
--
-- El código ya no deja que vuelva a pasar (updateCatalogo propaga también a la
-- ficha, eliminarCatalogo no borra un valor en uso, y tanto el formulario del
-- equipo como el listado de Maquinaria avisan si el vínculo está roto). Lo que
-- este archivo repara es el daño que YA estaba hecho: cinco generadores
-- apuntando a nombres viejos con prefijo «GT».
--
-- SOBRE LA COMPARACIÓN SIN ACENTOS
-- Los valores guardados traen tildes («Generador Eléctrico»). Se comparan sin
-- acentos y sin distinguir mayúsculas para no fallar por eso.
--
-- GUARDAS
-- Antes de cada UPDATE se exige que el destino EXISTA en el catálogo, y al final
-- se exige que se hayan actualizado exactamente 5 filas. Cualquier desvío aborta
-- la transacción entera sin tocar nada.
--
-- NOTA APARTE, PARA DECIDIR
-- `GENERADOR JHENCHIN AZUL` está INACTIVO en el catálogo de combustible mientras
-- el equipo `GE JHENCHIN AZUL` figura ACTIVO en Maquinaria. Las dos cosas no
-- pueden ser ciertas a la vez. El vínculo funciona igual (es por texto, y el
-- flag `activo` solo decide si el valor aparece en el desplegable), pero
-- conviene resolver la contradicción: reactivar el valor si el generador sigue
-- en operación, o dar de baja el equipo si no.
-- ═══════════════════════════════════════════════════════════════════

do $rec$
declare
  v_pares text[][] := array[
    ['GT Generador Yamagro 60 KVA',             'GENERADOR YAMAGRO 60 KVA'],
    ['GT Generador Electrico Jhenchin Azul',    'GENERADOR JHENCHIN AZUL'],
    ['GT Generador Electrico YG18000DSE',       'GENERADOR YG18000DSE'],
    ['GT Generador Electrico Yamagro YG7500DCE','GE YAMAGRO YG7500DCE'],
    ['GT Generador Electrico Yamagro YG7800DCE','GE YAMAGRO YG7800DCE']
  ];
  v_viejo text; v_nuevo text; i int;
  v_filas int; v_total int := 0;
begin
  for i in 1 .. array_length(v_pares, 1) loop
    v_viejo := v_pares[i][1];
    v_nuevo := v_pares[i][2];

    if not exists (select 1 from public.combustible_catalogos c
                    where c.tipo = 'equipo' and c.valor = v_nuevo) then
      raise exception 'El destino "%" no existe en el catalogo: se aborta sin tocar nada.', v_nuevo;
    end if;

    update public.maquinaria_equipos e
       set combustible_equipo = v_nuevo,
           updated_at = now()
     where translate(lower(coalesce(e.combustible_equipo,'')), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')
         = translate(lower(v_viejo), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU');
    get diagnostics v_filas = row_count;
    v_total := v_total + v_filas;
  end loop;

  if v_total <> 5 then
    raise exception 'Se esperaban 5 equipos reconectados y se actualizaron %. Se aborta.', v_total;
  end if;
end $rec$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación: no debe quedar ninguna fila (cero vínculos rotos)
-- ═══════════════════════════════════════════════════════════════════
select e.equipo, e.combustible_equipo as apunta_a
from public.maquinaria_equipos e
where coalesce(trim(e.combustible_equipo), '') <> ''
  and not exists (
    select 1 from public.combustible_catalogos c
     where c.tipo = 'equipo' and c.valor = e.combustible_equipo)
order by e.equipo;
