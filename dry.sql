begin;
insert into recepciones_lab
  select * from jsonb_populate_recordset(null::recepciones_lab,
    (select snapshot->'recepciones' from recepciones_cierres where numero=172));
insert into recepciones_analisis
  select * from jsonb_populate_recordset(null::recepciones_analisis,
    (select snapshot->'analisis' from recepciones_cierres where numero=172));
insert into recepciones_humedad_prov
  select * from jsonb_populate_recordset(null::recepciones_humedad_prov,
    (select snapshot->'humedad_prov' from recepciones_cierres where numero=172));
insert into recepciones_humedad_final
  select * from jsonb_populate_recordset(null::recepciones_humedad_final,
    (select snapshot->'humedad_final' from recepciones_cierres where numero=172));
insert into recepciones_totales
  select * from jsonb_populate_recordset(null::recepciones_totales,
    (select snapshot->'totales' from recepciones_cierres where numero=172));
select 'inserts_ok' as resultado;
rollback;
