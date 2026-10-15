# Validación V6.1.1

88 pruebas automáticas aprobadas, sin fallos. Se conserva la cobertura V6.1 y se agregan pruebas específicas de la corrección de Despacho:

- Pedidos con retiro del cliente o transporte contratado llegan a Despacho sin programación de viajes ni de producción, al completar sus tareas.
- Producción y Logística pueden confirmar que un pedido está procesado y revisado aunque el registro de mano de obra esté pendiente.
- La confirmación guarda fecha y usuario y mantiene cantidades, tareas, importes, revisiones y registros de pago intactos.
- Los perfiles de consulta no obtienen permisos para cambiar el estado.
- Las tarjetas listas no muestran “Producción sin programar” ni solicitan programarla; se excluyen de pendientes de programación de producción.

Chromium real: cambio de estado desde CRM con confirmación, paso a listo para retiro/carga, registro de revisión, tareas y pagos intactos, cero errores JavaScript. También se verificaron los flujos anteriores de cotización, pegado, reportes, CRM, transporte y móvil.

Compilación Vite correcta. Mantiene la advertencia de tamaño del JavaScript; no hay errores de compilación. El motor de cálculo sigue en 6.1: la corrección no recalcula cotizaciones anteriores.

Se verifica la integridad del ZIP y su correspondencia con los archivos fuente mediante el manifiesto SHA-256. No se incluyen capturas ni datos de prueba.

Pruebas locales; no publicado ni desplegado en producción desde esta sesión.
