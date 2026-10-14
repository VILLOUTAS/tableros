# Validación V6.1.0

**84 pruebas automáticas aprobadas, sin fallos.** Incluyen motores históricos, conservación de cotizaciones/revisiones, permisos, dimensiones, matríz completa, costos, despachos, Salice, avances y pagos concurrentes. Tres grupos de pruebas ejercitan PostgreSQL con PGlite y migraciones idempotentes.

Casos nuevos comprobados:

- 104 servicios con importes y unidades del Excel; mínimo y pago ocultos al público.
- Neolith 6/12 y Cuarzo: base por placa completa; biselados con su tarifa específica. Corte bruto separado: 3 ml × $3.500 = $10.500 neto, pago $1.500.
- Material de tapacanto 105%, instalación/pago 100% de los ml físicos.
- Pedido pagado con tareas sin asignar; avance sin responsable, distribución de cantidades y asignación posterior que conserva tarifa. No admite pago sin responsable, exceso de cantidad ni reducción de trabajo ejecutado.
- Cambio de tarifas conserva registros anteriores; una excepción sin tarifa requiere definición explícita.
- Trabajo nuevo de una tarea antigua usa tarifa compatible por unidad, manteniendo intactos sus registros históricos.
- Cotización paralela vinculada al mismo cliente sin cambiar precios/historial; productos sin servicios no generan tareas.
- Usuarios, contraseñas, dimensiones, operadores y pagos conservados tras repetir la migración PostgreSQL.

Chromium real: panel con cinco flujos, formulario propio de servicios, cotización y PDF, vinculación posterior, cuadrícula con encabezados/códigos, ejes L1–L4, revisión compacta, referencia pendiente sin error JavaScript, tareas sin minutos, asignación posterior, informe/CSV por persona, CRM, despacho y panel móvil. Cero errores JavaScript durante estos flujos.

Se inspeccionaron las pantallas y el PDF de prueba. El paquete no incluye capturas ni datos de las pruebas. Vite compila correctamente; conserva la advertencia de tamaño del JavaScript, sin errores de compilación. La semilla privada de servicios no se incluye en el JavaScript público.

Base V6.0 comparada con GitHub antes de modificar: 107 archivos comunes coinciden por hash Git, sin divergencias. El ZIP se comprueba contra las fuentes y su manifiesto SHA-256 al empaquetar.

Validación local; la base de producción requiere la comprobación posterior indicada en ACTUALIZACION_V6.1.0.md.
