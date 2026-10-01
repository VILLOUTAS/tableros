# Validación V5.1.0 · 30 de septiembre de 2026

## Resultado

- **58 pruebas automáticas aprobadas**; ninguna fallida u omitida.
- Compilación de producción Vite completada. Se mantiene el aviso informativo
  de tamaño del paquete JavaScript por las librerías Excel/PDF existentes.
- 471 referencias únicas: 299 tableros/placas, 149 tapacantos y 23 servicios.
- Verificados SKU Carbon/Cinnabar, categorías, Lamitech Noce 1200 × 1125 mm,
  formatos Neolith y espesores de los 149 tapacantos.
- 100 ml de instalación generan 102 ml de material y 100 ml de servicio.
  Una cotización con motor V5.0 conserva la regla previa sin añadir merma.
- Disco de 4,2 mm conservado en API; valores menores de 2, mayores de 5 y
  entradas inválidas rechazados. No se guarda un segundo parámetro nominal.
- Flete de ida y selección del mayor importe entre familias; búsqueda por
  múltiples palabras sin depender de tildes o mayúsculas.
- Cotizaciones históricas conservadas al modificar descripción o catálogo.
  Cambios técnicos crean revisión nueva con producto vigente e historial intacto.
- Tres agendas separadas, sin modificar nota de venta; validación de fechas,
  familias, permisos y rechazo de ediciones con versión obsoleta.
- CRM accesible a todos los perfiles internos y excluido para Cliente/Visita.
  La API pública y de Cliente no contiene mínimos, costos ni códigos de origen.

## PostgreSQL y migración

Pruebas con PostgreSQL embebido (PGlite): estructura antigua, proyecto anterior,
roles, almacenamiento y migración ejecutada dos veces sin cambiar datos previos.
También se ejercitaron las rutas de actualización agrupada de dimensiones,
revisiones de servicios, conversión de fechas antiguas al calendario y control
de concurrencia. Se verificó que el cálculo guardado siguiera intacto.
No se conectó ninguna base de producción.

## PDF

`EJEMPLO_PDF_V5.1.pdf` se generó con la función de exportación del código de
esta versión, jsPDF y un lienzo local. Se renderizaron e inspeccionaron sus
tres páginas: resumen, listado y plano. El resumen diferencia metros instalados,
merma y material por tipo; el plano muestra un solo consumo de disco de 4,2 mm.
Los datos son ficticios. Esta comprobación no prueba el botón de descarga.

## Límites de la revisión

El navegador de esta sesión bloqueó el acceso al servidor local
(`ERR_BLOCKED_BY_CLIENT`). No se completó una nueva comprobación visual
interactiva de V5.1 ni la descarga desde navegador. La captura y validación V5.0
conservadas en este paquete pertenecen a esa versión anterior.

No se ha desplegado V5.1, ni verificado la base real, rutas viales o costos de
compra ausentes. La guía de actualización incluye la revisión funcional sobre
una copia de la base actual antes de usar la versión con pedidos reales.
