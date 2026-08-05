select coalesce(unidad,'(null)') as unidad, count(*) as n
from productos
group by unidad
order by n desc;
