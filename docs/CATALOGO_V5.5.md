# Catálogo V5.5

Fuente vigente: `catalog/PRODUCTOS_V5.5.xlsx`, copia del archivo revisado «Productos REVISADOS y codificados para OPTIMIZADOR(1).xlsx». Reemplaza el catálogo activo anterior. Las semillas históricas se conservan para interpretar cotizaciones previas.

**868 SKU únicos**: 158 tableros, 176 placas, 150 tapacantos, 356 herrajes y 28 servicios.

## Familias y subcategorías

En el optimizador, la Familia de Productos corresponde a la categoría. Los grupos superiores organizan las subcategorías. Se conservan también Categoría y Subcategoría del Excel en cada ficha para trazabilidad.

| Grupo | Subcategoría | Productos |
|---|---|---|
| TABLEROS | Tableros de Melamina | 84 |
| TABLEROS | Tableros EGR Decor | 71 |
| TABLEROS | Tableros Chinos | 3 |
| TABLEROS | Otros Tableros | 0 |
| TAPACANTOS | Tapacantos | 109 |
| TAPACANTOS | Tapacantos EGR | 36 |
| TAPACANTOS | Tapacantos Chinos | 5 |
| PLACAS | Neolith de 06mm | 70 |
| PLACAS | Neolith de 12mm | 92 |
| PLACAS | Neolith Palmetas | 5 |
| PLACAS | Cuarzo 18mm | 3 |
| PLACAS | Cuarzo 20mm | 5 |
| PLACAS | Granito 20mm | 1 |
| SERVICIOS PARA TABLEROS | Dimensionados de Tableros | 5 |
| SERVICIOS PARA TABLEROS | Servicios para Tableros | 4 |
| SERVICIOS PARA PLACAS | Dimensionados de Placas | 10 |
| SERVICIOS PARA PLACAS | Servicios de Placas | 0 |
| OTROS SERVICIOS | Despachos | 0 |
| OTROS SERVICIOS | Fabricación y armado de muebles | 3 |
| OTROS SERVICIOS | Fabricación de placas | 3 |
| OTROS SERVICIOS | Instalación de muebles | 0 |
| OTROS SERVICIOS | Instalación de placas | 3 |
| HERRAJES SALICE | Bisagras, bases y accesorios | 122 |
| HERRAJES SALICE | Guías y acoplamientos | 25 |
| HERRAJES SALICE | Sistemas de elevación | 69 |
| HERRAJES SALICE | Sistemas de puertas | 42 |
| HERRAJES SALICE | Lineabox | 25 |
| HERRAJES SALICE | Excessories | 47 |
| HERRAJES SALICE | Organizadores | 7 |
| HERRAJES SALICE | PIN | 5 |
| HERRAJES SALICE | Perfiles, Push y Smove | 14 |

Las categorías vacías quedan disponibles para futuras incorporaciones. El despacho se calcula mediante su módulo; no se necesita un SKU de despacho para agregarlo a una cotización. Las placas Neolith son productos dentro de PLACAS. Las palmetas y el cuarzo de 20 mm tienen subcategorías propias conforme al listado nuevo.

## Correspondencia de datos

| Dato fuente | Uso |
|---|---|
| Referencia | Código CDChile / SKU |
| Nombre | Producto o servicio |
| Descripción | Información adicional |
| Precio base de venta | Venta neta |
| Precio mínimo | Mínimo comercial protegido por permisos |
| Código de barras, cuando exista | Origen; oculto a Cliente y Visitante |
| Familia, Categoría y Subcategoría | Agrupación del catálogo |

El archivo revisado usa Categoría y Subcategoría para ordenar la clasificación. Se mantienen los datos de origen históricos verificables. Las nuevas fotografías no fueron suministradas: se conservan las imágenes anteriores cuya identidad coincide, y Administración puede cargar las nuevas.

## Definiciones aplicadas

- Carbon usa el código del archivo vigente: **73-STYLE-CBTM**. Cinnabar usa **72-STYLE-CBTM2**. Se conserva la identidad histórica pese al cambio o reutilización de códigos. No se aplica la corrección antigua CRTM al nuevo Excel.
- Lamitech Noce: **1200 × 1125 mm**; su espesor sigue pendiente. Rovere Langhe tiene el mismo formato y espesor por completar. Dove: **8 mm**.
- Láminas acrílicas usan su servicio de corte; Stylelite, Petlite, Trunatur y Stylelex usan el servicio correspondiente a Stylelite.
- Tapacantos de 0,4 y 0,45 mm usan el servicio de 0,4 mm.
- El ranurado se vende y programa **por placa**.
- Los productos retirados no se borran de las revisiones históricas. La equivalencia de sucesores exige identidad verificable; las dudas se resuelven seleccionando el producto vigente.

## Datos por completar desde Administración

| Tipo | Cantidad | Efecto |
|---|---|---|
| Medidas o espesor | 12 | No optimizar ese producto hasta completar su formato |
| Compatibilidad Salice | 34 | No cotizar el principal hasta configurar su relación |
| Servicio con precio cero | 3 | Por cotizar; no se trata como servicio gratuito |
| Peso no definido | 212 | Despacho pendiente para una carga que incluya ese SKU |

Las listas completas están en `PENDIENTES_CATALOGO_V5.5.csv`. Un SKU puede tener más de un pendiente. No todo el catálogo requiere intervención: las medidas, tarifas y reglas confirmadas están cargadas.

### Medidas y espesor

| SKU | Producto | Formato inicial (mm) |
|---|---|---|
| 51-GRA-1000 | PLACA - GRANITO 20mm | ? × ? × 20 mm |
| 73-LAM-RL1351 | LAMINA - LAMITECH - ROVERE LANGHE - 1,20 M X 1,125 M | 1200 × 1125 × ? mm |
| 73-LAM-NA1121 | LAMINA - LAMITECH - NOCE ASIA - 1,20 M X 1,125 M | 1200 × 1125 × ? mm |
| 72-STYLE-AHTM | STYLELITE - ASH TRUMATTE | 2400 × 1200 × ? mm |
| 72-STYLE-CBTM2 | STYLELITE - CINNABAR TRUMATTE | 2400 × 1200 × ? mm |
| 72-STYLE-CTTM | STYLELITE - COTTONSEED TRUMATTE - 2 CARAS | 2400 × 1200 × ? mm |
| 72-STYLE-MATM | STYLELITE - MARIANA TRUMATTE - 2 CARAS | 2400 × 1200 × ? mm |
| 72-STYLE-SHTM | STYLELITE - SHADE TRUMATTE - 2 CARAS | 2400 × 1200 × ? mm |
| 72-STYLE-WWUB | STYLELITE - WHISPER WHITE TRUGLOSS - 2 CARAS | 2400 × 1200 × ? mm |
| 22-CHN-1002 | TABLERO MDF - BROWN - CHINO ACRILICO - 2 CARAS | ? × ? × ? mm |
| 22-CHN-1001 | TABLERO MDF - GREY - CHINO ACRILICO - 2 CARAS | ? × ? × ? mm |
| 22-CHN-1003 | TABLERO MDF - WHITE - CHINO ACRILICO - 2 CARAS | ? × ? × ? mm |

### Servicios sin precio

| SKU | Servicio |
|---|---|
| SER-112 | CORTADOR - EXTERNO |
| SER-0082 | INSTALACION NEOLITH - E |
| SER-0045 | INSTALACION NEOLITH - I |

### Relaciones especiales Salice

Se configuran los grupos de complementos y sus cantidades en Configuración → Parámetros V5.5 → Relaciones y complementos Salice. AIR y bisagras de perfil metálico, más mecanismos sueltos Evolift, Pacta y Wind, necesitan verificar su composición técnica. Las tapas y barras sueltas no se tratan como mecanismos principales. Los kits descritos como completos no exigen duplicar los componentes incluidos.

Las bisagras estándar y serie 800 tienen reglas iniciales por acabado y serie. Exigen base y placa metálica con logo; el cubrecazoleta es opcional. Guías Futura y F70/Progressa tienen acoplamientos separados. La plataforma valida cantidades, evita consumir dos veces un mismo complemento y permite configurar alternativas compatibles.

### Pesos

El archivo de pesos define 15 reglas de familia/tipo. No incluye un peso individual para todos los accesorios separados, palmetas y placas de otras variantes. Por eso quedan 212 referencias sin peso resoluble. Un Administrador puede fijar peso por SKU en Parámetros V5.5 sin editar el código. «Otros sistemas Salice» usa **50 kg por sistema completo**, como valor global; no se aplica ese peso a cada accesorio suelto.

## Regeneración

`npm run catalog:import:v55` regenera la semilla desde el Excel incluido. `node scripts/import-routes-v55.mjs` conserva los valores de la columna I de rutas, con su precisión original. Las ediciones guardadas por Administración persisten en PostgreSQL y no se sustituyen en cada reinicio.
