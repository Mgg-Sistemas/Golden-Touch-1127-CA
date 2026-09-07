-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Los datos de pago del proveedor tienen que tener forma de datos de pago
--
-- LO QUE PASÓ
-- El formulario pedía que el teléfono no estuviera vacío, nada más. Así entró
-- esto en la ficha de un proveedor:
--
--   FILTROS NEKUIMA, C.A. · pago_movil · telefono = 11513895
--
-- Ocho dígitos. No es un teléfono: es una cédula pegada en el casillero
-- equivocado. A ese proveedor no se le puede pagar por pago móvil, porque el
-- pago se manda al número y ese número no existe. Y no se iba a notar hasta el
-- momento de pagar, con la plata en la mano.
--
-- LO QUE DICEN LOS DATOS
-- De los 23 teléfonos cargados, 22 tienen 11 dígitos y empiezan con 04, que es
-- la forma de un móvil venezolano. El que no, es justamente el error.
-- De las 12 cuentas cargadas, las 12 tienen 20 dígitos. Ahí nunca hubo
-- problema, porque el formulario ya exigía el largo exacto.
--
-- POR QUÉ EN LA BASE Y NO SOLO EN LA PANTALLA
-- El navegador habla directo con Postgres. La validación de React sirve para
-- avisarle a la persona mientras escribe, pero no impide nada: cualquier otro
-- camino que escriba en la tabla se la saltea. La regla que de verdad manda es
-- esta.
--
-- POR QUÉ «NOT VALID»
-- Añadir la restricción validando lo viejo fallaría por esa única fila, y
-- borrarle el teléfono al proveedor sería inventar una corrección que no me
-- toca. Con NOT VALID la fila vieja se queda como está, pero cualquier alta o
-- edición —incluida la de ESA fila— ya tiene que cumplir. O sea: el error
-- queda a la vista y se corrige la próxima vez que alguien toque esa ficha.
-- Cuando esté arreglada se puede correr:
--   alter table public.proveedor_datos_pago validate constraint datos_pago_con_forma_valida;
--
-- SOBRE «QUE EL TELÉFONO Y LA CUENTA SEAN DISTINTOS»
-- Con estas dos reglas puestas ya no pueden coincidir: uno tiene 11 dígitos y
-- la otra 20. La comprobación explícita sobra, así que no se agrega: una regla
-- que no puede fallar nunca es ruido para el que lea esto en un año.
-- ═══════════════════════════════════════════════════════════════════

alter table public.proveedor_datos_pago
  drop constraint if exists datos_pago_con_forma_valida;

alter table public.proveedor_datos_pago
  add constraint datos_pago_con_forma_valida check (
    -- Teléfono (pago móvil): si viene, 11 dígitos que empiezan con 04.
    (
      coalesce(datos->>'telefono', '') = ''
      or datos->>'telefono' ~ '^04[0-9]{9}$'
    )
    and
    -- Cuenta (transferencia): si viene, exactamente 20 dígitos.
    (
      coalesce(datos->>'cuenta', '') = ''
      or datos->>'cuenta' ~ '^[0-9]{20}$'
    )
  ) not valid;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select c.conname                              as restriccion,
       c.convalidated                          as ya_valido_lo_viejo,
       (select count(*) from public.proveedor_datos_pago d
         where coalesce(d.datos->>'telefono','') <> ''
           and d.datos->>'telefono' !~ '^04[0-9]{9}$')  as telefonos_mal_cargados,
       (select count(*) from public.proveedor_datos_pago d
         where coalesce(d.datos->>'cuenta','') <> ''
           and d.datos->>'cuenta' !~ '^[0-9]{20}$')     as cuentas_mal_cargadas
  from pg_constraint c
 where c.conname = 'datos_pago_con_forma_valida';
