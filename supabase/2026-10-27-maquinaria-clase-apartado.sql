-- 27/10/2026 · Maquinaria: la categoría (apartado) elegida en el formulario se guarda en la ficha.
-- Aplicado en Supabase (rroohciwhpfonklxuoev) el 27/10/2026 vía MCP (migración
-- maquinaria_equipos_clase_apartado + relleno). Idempotente.
--
-- Antes el apartado (Maquinaria y Equipos / Vehículos / Motos / Lanchas / Herramientas) se deducía
-- SOLO del `tipo`, así que el botón «Categoría de la unidad» del formulario no se guardaba.
-- Ahora `clase` manda sobre el tipo (ver claseEquipo en src/modules/maquinaria/flota.ts);
-- null = se sigue deduciendo del tipo.

alter table public.maquinaria_equipos add column if not exists clase text;
comment on column public.maquinaria_equipos.clase is
  'Apartado elegido por el usuario: maquinaria | vehiculo | moto | lancha | herramienta | <id de apartado personalizado>. null = se deduce del tipo.';

-- Relleno inicial con las mismas reglas de claseEquipo (27/10/2026). Resultado al aplicarlo:
-- vehiculo 97 · moto 26 · lancha 5 · null (Maquinaria y Equipos) 36.

-- Vehículos: todo carro, camioneta, camión y afín (pedido de la usuaria: camioneta, camión, automóvil = VEHÍCULO).
update public.maquinaria_equipos set clase = 'vehiculo'
where clase is null and lower(translate(btrim(coalesce(tipo,'')),'ÁÉÍÓÚáéíóúÑñ','AEIOUaeiouNn')) in
('vehiculo','camioneta','pick-up d/c','pick-up','pickup','pick up','suv','sedan','automovil','rustico','techo duro',
 'camion','camion cava','camion volteo','chasis','chuto','autobus','bus','gandola','van','jeep','cisterna');

-- Remolques con placa van por carretera → Vehículos.
update public.maquinaria_equipos set clase = 'vehiculo'
where clase is null and lower(translate(btrim(coalesce(tipo,'')),'ÁÉÍÓÚáéíóúÑñ','AEIOUaeiouNn')) in ('remolque','semi remolque','semiremolque')
  and upper(regexp_replace(coalesce(placa,''),'[^A-Za-z0-9]','','g')) not in ('','NA','SN','SP');

-- Lanchas: embarcaciones y los remolques REMEQ sin placa (trayler de la lancha).
update public.maquinaria_equipos set clase = 'lancha'
where clase is null and (
  lower(translate(btrim(coalesce(tipo,'')),'ÁÉÍÓÚáéíóúÑñ','AEIOUaeiouNn')) in ('lancha','bote','embarcacion','penero','yate')
  or lower(translate(btrim(coalesce(tipo,'')),'ÁÉÍÓÚáéíóúÑñ','AEIOUaeiouNn')) in ('remolque','semi remolque','semiremolque'));

-- Motos: de calle, UTV / ATV / cuatrimotos y motos acuáticas.
update public.maquinaria_equipos set clase = 'moto'
where clase is null and lower(translate(btrim(coalesce(tipo,'')),'ÁÉÍÓÚáéíóúÑñ','AEIOUaeiouNn')) in
('moto','moto acuatica','motocicleta','cuatrimoto','trimoto','utv','atv');
