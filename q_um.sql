select id, sku, nombre, categoria, unidad, stock
from productos
where unidad = '38' or unidad ilike '%38%';
