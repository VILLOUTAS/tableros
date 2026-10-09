# Validación V6.0.0

75 pruebas automáticas aprobadas, sin fallos. Incluye matriz exacta, motor 6.0 e históricos, permisos del resumen, pendientes de meses anteriores, pagos concurrentes, servicios configurables, asignación de instalaciones, tarifas inmutables y migración PostgreSQL con PGlite.

Ejemplo probado: instalación con venta de $26.000, costo estimado de $8.000 y mano de obra por persona de $6.000/unidad. Dos unidades generan venta de $52.000 y mano de obra de $12.000. Registrar el pago no altera la cotización ni la tarifa guardada.

105% material / 100% instalación en motores 6.0 y 5.5; 102% / 100% en 5.1; 100% / 100% en 5.0. Modificaciones técnicas archivan la revisión anterior; metadatos conservan el cálculo.

Chromium real, sin errores JavaScript: siete entradas del menú, Panel y pago, catálogos desplegables, cotización de servicio/PDF, ausencia del aviso general, CRM, Despachos, campos financieros, móvil y consulta de Logística sin controles de pago.

Capturas con datos exclusivamente de prueba:

- [Panel](VISTA_PANEL_V6.png).
- [Productos](VISTA_PRODUCTOS_V6.png).
- [Servicios](VISTA_SERVICIOS_V6.png).
- [CRM](VISTA_CRM_V6.png).
- [PDF de servicio](EJEMPLO_SERVICIOS_V6.pdf).

Vite compila correctamente; mantiene advertencia de tamaño del JavaScript. No se incluye el catálogo privado en los datos vacíos del cliente. Base local 5.5 comparada con GitHub: 86 coincidencias de hashes Git y ninguna divergencia en archivos comunes.

Se verifica integridad del ZIP y correspondencia con las fuentes al empaquetar. Pruebas locales, sin carga de datos de prueba ni despliegue de producción desde esta sesión. Verifica la base real después del despliegue.
