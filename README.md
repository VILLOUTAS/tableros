# Casa Diseño · Optimizador V5.1.0

Actualización de V5.0.0 para el repositorio y servicio existentes.
Para instalar, lee **ACTUALIZACION_V5.1.0.md**. Mantén la misma base PostgreSQL.

## CRM, proyectos y agendas

- **CRM de Producción** en la barra principal para todos los perfiles internos.
  Clientes y visitas no tienen acceso, ni desde la interfaz ni desde la API.
- Vistas **Por estados** y **Calendario**. El calendario ubica cada trabajo en
  su fecha de inicio; permite cambiar el mes y consultar trabajos sin programar.
- Tres agendas independientes: **Tableros**, **Placas** e **Instalaciones**.
  Tableros y Placas admiten trabajos de dimensionado y servicios asociados a
  sus cotizaciones. Instalaciones admite cotizaciones de ambas familias.
- Cada trabajo guarda proyecto, cotizaciones, inicio, término, responsable,
  observaciones y estado: Programado, En ejecución, Terminado o Anulado.
- La programación está separada de la nota de venta. Cambiar una fecha o el
  estado del trabajo no cambia facturación, importes ni estado comercial.
- Administración programa las tres agendas; Producción programa Tableros y
  Placas; Instalación programa Instalaciones. Los demás internos consultan.
- El buscador general encuentra cliente, comercial, nombre de proyecto,
  cotización y código. Ignora diferencias de mayúsculas y tildes.
- Un proyecto puede contener varias cotizaciones de Tableros y Placas.
  Los permisos de edición de cada cotización se mantienen por rol/asignación.

## Catálogo nuevo

El Excel del 30-09-2026 reemplaza los productos anteriores del catálogo activo:
**471 referencias únicas: 299 tableros/placas, 149 tapacantos y 23 servicios**.
Los 299 incluyen 135 productos Neolith. El archivo recibido se conserva intacto
como `catalog/PRODUCTOS_20260930.xlsx`; el importador aplica las correcciones.

| Columna Excel | Campo |
|---|---|
| Referencia | Código CDChile / SKU |
| Nombre | Nombre del producto o servicio |
| Descripción | Información adicional |
| Precio base de venta | Precio base neto |
| Precio mínimo | Mínimo de venta, restringido por rol |
| Código de barras | Código de origen, exclusivo del equipo interno |
| Familia de productos | Categoría |

| Grupo | Subcategorías |
|---|---|
| TABLEROS | Tableros de Melamina; Tableros Egr Decor; Tableros Chinos; Otros Tableros |
| TAPACANTOS | Tapacantos; Tapacantos EGR; Tapacantos Chinos |
| PLACAS | Neolith de 06mm; Neolith de 12mm; Cuarzo 18mm (próximamente); Granito 20mm (próximamente) |
| SERVICIOS PARA TABLEROS | Dimensionados de Tableros; Servicios para Tableros |
| SERVICIOS PARA PLACAS | Dimensionados de Placas; Servicios de Placas |
| OTROS SERVICIOS | Despachos; Armado de Muebles; Servicios de Instalacion de Muebles; Servicios de Instalacion de Placas |

La fila 275, Carbon Trumatte, usa **73-STYLE-CRTM**. Cinnabar conserva
73-STYLE-CBTM. Lamitech Noce tiene **1200 × 1125 mm**; no es Neolith.
Las fichas Neolith usan el código, color y espesor del Excel: no necesitan
escribir nuevamente un color libre. Se corrigen sus errores de formato.

Los servicios nuevos quedan registrados en su categoría. La agenda de
instalaciones está disponible; los módulos completos de armado, instalación,
herrajes y otros productos/fotografías siguen pendientes de la próxima entrega.
Los servicios con precio cero figuran como **Por cotizar**.

Las fotografías antiguas solo se reutilizan cuando coinciden código, producto
y espesor. Las referencias cambiadas tienen una clave de foto independiente,
para evitar mostrar la imagen de otro producto que antes usaba el mismo código.

## Configuración de dimensiones

En Configuración → **Catálogo y dimensiones**, o Administración:

1. Selecciona **Tableros y placas** y filtra por categoría o producto.
2. Usa **Editar** para cambiar una ficha: categoría, largo/ancho de fábrica,
   espesor, despunte por lado, servicio de corte y otros datos autorizados.
3. Para varios productos, selecciónalos y abre **Editar dimensiones**.
   Completa solo los campos que quieras modificar. La operación se valida
   completa antes de guardar; las casillas vacías conservan sus valores.

Se muestran dimensiones de fábrica y útiles. Cada cambio crea una revisión
del producto; no modifica el resultado de cotizaciones guardadas.
Hay siete fichas con espesor por completar: consulta `docs/CATALOGO_V5.1.md`.

## Optimización y precios

| Concepto | Regla V5.1 |
|---|---|
| Consumo de disco | Un único valor por corte, 3 mm iniciales; editable de 2 a 5 mm |
| Predeterminado | Configuración → Parámetros de optimización; se aplica a nuevas cotizaciones |
| Tableros | Despunte inicial de 10 mm por lado, editable por producto |
| Neolith 6 mm | Fábrica 3260 × 1560; útil 3200 × 1500 mm |
| Neolith 12 mm | Fábrica 3260 × 1660; útil 3200 × 1600 mm |
| Tapacanto material | Metros instalados × 1,02, por tipo |
| Servicio de tapacanto | Metros instalados × 1,00 |
| Despacho | Un recorrido de ida; en cargas mixtas se cobra el mayor flete |

Por ejemplo, 100 ml instalados generan 102 ml de material y 100 ml de servicio.
El resumen y el PDF indican los metros instalados, la merma y el total de material.
El indicador de producción cuenta únicamente los metros efectivamente instalados.

Los servicios de corte y tapacanto usan los precios del catálogo vigente.
Valores iniciales netos: melamina $7.500/placa, acrílico $10.000/placa,
Stylelite $15.000/placa, Neolith $75.000/placa, biselado/pulido y corte 45°
$12.500/ml. Tapacanto: 0,4 y 1,0 mm a $600/ml; 1,5 mm a $750/ml;
2,0 mm a $800/ml. Se editan en Administración → Servicios.

En Placas, **Incluir suministro de las placas** agrega el valor del material.
Está desmarcado inicialmente para conservar el flujo de cotización de servicios
de V5.0. Las cotizaciones históricas mantienen su valorización original.

IVA: 19%. Los descuentos se validan en el servidor, con máximo de 50% y
respetando el mayor entre costo y mínimo de venta. Cliente y visita no aplican
descuentos. Compra y mínimos solo se envían a Finanzas/Superadministrador;
códigos de origen se excluyen de toda respuesta a clientes y visitas.

## Cotizaciones históricas

La actualización no borra proyectos, usuarios, documentos ni fotografías y no
recalcula cotizaciones en bloque. Conserva códigos, precios, parámetros, planos
y resultados de cada revisión guardada. Cambiar datos descriptivos conserva
el cálculo. Cambiar piezas, materiales o condiciones de cálculo crea una nueva
revisión V5.1 y archiva la anterior.

Las referencias se relacionan por identidad de producto y espesor. No se usa
solo el código: el catálogo anterior tenía códigos repetidos. Si no existe
una equivalencia inequívoca, se solicita elegir el producto vigente al editar.
Las versiones antiguas sin plano almacenado se reconstruyen con su motor
histórico, conservando el resumen monetario guardado.

## Despachos

Origen: Casa Diseño · Bodega, Concepción. Se conservan origen, comunas y
kilómetros previamente configurados. La primera actualización carga:

| Familia | Tarifa neta de ida |
|---|---|
| Melamina / otros tableros | $10.000 + $200 × km |
| Acrílico / EGR Decor | $10.000 + $120 × km |
| Placas Neolith | $20.000 + $150 × km |
| Salice | $7.500 + $50 × km |
| Otros | $200 × km |

Se mantienen las bases fijas de V5.0 y se actualiza el valor por km con el Excel.
No se duplica la distancia por el regreso. En mezclas se toma el mayor valor.
Una comuna sin kilómetros viales verificados queda Por cotizar. No se consulta
un servicio externo para calcular automáticamente rutas. Los despachos ya
valorizados conservan su tarifa; un despacho facturado no admite recálculo.

## Importación de piezas

Se conserva la carga XLS/XLSX/CSV y el pegado desde Excel: selección de hoja,
filas y columnas; conversión cm/mm; transposición; mapeo de materiales, veta,
tapacantos y terminaciones; vista previa editable. Largo y Ancho conservan sus
ejes aunque Largo sea menor. Longitudinal sigue Largo y Transversal sigue Ancho.
L1/L2 son los lados paralelos a Largo; A1/A2, los paralelos a Ancho.
Los símbolos de cada cliente deben definirse y revisarse antes de incorporar.

## Desarrollo y comprobación

Node.js 24, Express, PostgreSQL y Vite. SheetJS se incluye en `vendor/`.

```bash
npm ci --include=dev
npm test
npm run build
npm start
```

Sin DATABASE_URL, el entorno local usa memoria temporal. Producción requiere
PostgreSQL. `npm run catalog:import:v51` regenera el catálogo desde el Excel
incluido. El importador y catálogo anteriores se conservan por compatibilidad;
no se deben regenerar al actualizar referencias de V5.1.

Consulta `docs/VALIDACION_V5.1.md`: 58 pruebas, compilación y revisión del PDF
de ensayo. No se ha desplegado ni probado sobre la base productiva.
