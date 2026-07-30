select tablename || ' | ' || cmd || ' | ' || coalesce(with_check, qual, 'none') as pol
from pg_policies where tablename in ('recepciones_lab','recepciones_cierres') order by 1;
