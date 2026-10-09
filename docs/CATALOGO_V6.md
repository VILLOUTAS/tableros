# Catálogos V6.0

Fuente: `catalog/MATRIZ_PRODUCTOS_SERVICIOS_V6.xlsx`, matriz corregida. Contiene 43 rutas de Productos y 80 de Servicios; excluye Despachos.

| Catálogo | Grupos |
| --- | --- |
| Productos | Tableros; Placas; Herrajes; Artefactos de Cocina |
| Servicios | Tableros; Placas; Herrajes; Artefactos de Cocina; Diseño |

Hasta cinco niveles: catálogo, grupo, familia, línea/marca y variante. Las celdas finales vacías no generan niveles ficticios. Se corrigen etiquetas de “biselado” y “dormitorio”; la matriz generada conserva los textos fuente.

Se mantienen 840 productos y 28 servicios de la V5.5, con identidades y precios. Las asociaciones conocidas asignan referencias a sus ramas. Donde falta marca se usa agrupación conservadora editable, sin inventar fabricantes ni fotografías.

Se agregan 60 fichas: 88 servicios en total. Una ruta puede tener varias referencias anteriores, y algunos servicios anteriores no tienen ruta en la matriz. Las fichas nuevas usan códigos provisionales `V6-SRV-<fila>`, distintos de los códigos oficiales CDChile. Configura código definitivo, unidad, costo, venta y venta mínima. Fachadas y Diseño requieren confirmar expresamente su unidad. Una venta/mínimo vacío o una unidad sin confirmar bloquea la cotización.

Los servicios ausentes de la matriz siguen en el bloque de servicios anteriores y Administración: ranurados por placa, cortador externo e instalaciones genéricas. No se asignan sus precios arbitrariamente a nuevas variantes.

## Valores y permisos

- Administración y Super Administrador gestionan venta y venta mínima. El mínimo puede ser cero si se define expresamente; vacío permanece pendiente. No puede superar la venta habitual.
- Super Administrador y Administrador con permiso de costos configuran costo de ejecución. Vacío significa desconocido, distinto de cero.
- Clientes y visitantes no reciben costo, mínimo ni código de origen.
- La tarifa por persona/tarea se configura aparte y no se obtiene automáticamente del costo o venta del servicio.

Dimensiones individuales y por selección dentro de cada categoría, con revisiones y conservación de medidas históricas. Reclasificar visualmente no cambia las claves de peso de los productos existentes.

Persisten los pendientes de [CATALOGO_V5.5.md](CATALOGO_V5.5.md) y [PENDIENTES_CATALOGO_V5.5.csv](PENDIENTES_CATALOGO_V5.5.csv): 12 medidas/espesores, tres servicios con venta cero, 34 composiciones especiales Salice y 212 pesos. No se inventan esos datos.
