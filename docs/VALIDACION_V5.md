# Validación V5.0.0 · 29 de septiembre de 2026

## Pruebas ejecutadas

- 52 pruebas automáticas: autenticación, roles acumulados, acceso a proyectos,
  catálogo, importación, restricciones de piezas, cálculo histórico, rebajes,
  veta, códigos globales, Neolith, fletes y revisiones.
- Migración SQL en PostgreSQL embebido (PGlite) con estructura anterior y un
  proyecto existente. Se ejecutó dos veces; se compararon todos los campos
  originales y se comprobó que no cambiasen. Se validaron roles, almacenamiento
  de configuración y rechazo de una escritura con versión de fila obsoleta.
- API: resumen enviado por el cliente ignorado en favor del cálculo del
  servidor, descuento máximo, precios históricos, metadatos sin revisión,
  medidas con revisión nueva, historial inmutable y lectura sin costos públicos.
- Navegador Chromium: acceso, panel, selección de material, pegado en cm,
  asignación de veta/tapacantos, vista previa editable, incorporación, guardado,
  PDF, edición de cliente conservando R1, cambio de medida creando R2 y consulta
  del historial sin botón de guardado. También catálogo de futuros herrajes,
  configuración de comuna, cotización de flete y panel en pantalla móvil.
- PDF de ensayo: resumen, listado de piezas y plano de corte, renderizados
  para revisar legibilidad, correspondencia de ejes y códigos de tapacanto.
- Compilación de producción con Vite.

## Planillas reales proporcionadas

Se leyeron ambos archivos sin modificarlos ni incorporarlos al paquete:

- XLS con cinco bloques horizontales: 10, 52, 13, 18 y 8 filas dimensionales,
  respectivamente; 173 unidades en total, con conversión de cm a mm.
- XLSX, hoja de detalle: 128 filas dimensionales, 326 unidades; 27 filas con
  Largo menor que Ancho. Se conservaron los ejes. Incluye dos filas de vidrio /
  aluminio que deben excluirse del flujo de tableros (quedan 126 filas y 324
  unidades de los materiales correspondientes).
- Las equivalencias de símbolos, materiales y tapacantos requieren revisión
  del usuario: leer cantidades y dimensiones no confirma qué significa cada
  asterisco o código. La interfaz exige esa definición antes de incorporar.

## Límites de esta validación

No se ha conectado, migrado ni publicado sobre la base real de la empresa.
No se verificaron rutas viales reales ni costos de compra ausentes. Debe
ensayarse el despliegue sobre una copia de la base actual antes de usarlo con
pedidos reales. Las distancias, costos de servicios y precios nuevos pendientes
se completan dentro de la plataforma.

Las pruebas de lectura de las planillas verifican estructura, unidades y ejes;
no certifican las decisiones comerciales o de fabricación de sus autores.

`EJEMPLO_PDF_V5.pdf` y `VISTA_PANEL_V5.png` son ejemplos generados con datos
de prueba. No representan pedidos productivos.
