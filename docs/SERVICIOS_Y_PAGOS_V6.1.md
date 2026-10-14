# Servicios, responsables y pagos V6.1

## Matriz vigente

Fuente: `catalog/MATRIZ_PRODUCTOS_SERVICIOS_V6.1.xlsx`, hoja SERVICIOS, filas 4–107. Expande las celdas combinadas declaradas, sin inventar jerarquías. Cada fila aporta código, unidad, venta neta, venta mínima neta y pago por unidad. No interpreta el pago como costo total del servicio.

104 códigos únicos; unidades: tablero, placa, ml, unidad, m², par y gl. Los 43 caminos de Productos no contienen un catálogo nuevo de SKU/precios: se conserva el catálogo anterior de 840 productos. Despachos sigue fuera de Servicios.

Administración/Super Administrador mantienen productos, categorías, dimensiones, venta y mínimos. Costos y usuarios requieren sus permisos específicos. Administración, Producción y Finanzas pueden editar la tarifa de pago de servicios; Logística no puede editarla. Cliente/Visitante no reciben costos, mínimos, tarifas de pago ni código de origen.

## Pedido y tareas

| Venta | Tarea automática | Cantidad |
| --- | --- | --- |
| Optimización de tablero | Dimensionado correspondiente | Tableros usados |
| Optimización de placa | Corte base correspondiente | Placas completas usadas |
| Instalación de tapacanto | Servicio del espesor | ml físicos, 100% |
| Biselado/45° | Acabado del material | ml de lados seleccionados |
| Servicio adicional | Código vendido | Cantidad y unidad de la línea |
| Producto sin servicio | Sin tarea de producción | — |

El material de tapacanto vendido incorpora 5% de merma; esa merma no aumenta la cantidad de instalación ni el pago del operador. El corte bruto por ml no se añade sobre el corte base de placa: requiere una línea de venta adicional.

El pedido genera sus tareas al estar facturado y pagado. Los responsables se asignan desde esas tareas, sin recodificar servicios ni cambiar su unidad. Se pueden repartir cantidades entre personas o subcontratistas, sin superar lo vendido ni dejar fuera trabajo ya registrado. La corrección de una venta no puede reducir cantidades asignadas o ejecutadas.

Una excepción manual exige descripción, unidad, cantidad, área y motivo. Si carece de tarifa, un perfil autorizado puede definirla explícitamente para completar registros pendientes; no cambia pagos que ya tenían importe.

## Registro y pago

- Registra fecha y cantidad validada. No requiere tiempos.
- Puede quedar sin responsable y asignarse después, conservando el registro y su tarifa.
- Pago generado = cantidad validada × tarifa por unidad, redondeado a pesos.
- Los cambios de matriz se aplican a nuevas tareas. Una tarea/registro existente conserva su tarifa.
- Una tarea antigua con código equivalente y la misma unidad puede registrar trabajo nuevo con la tarifa vigente por unidad; sus registros anteriores permanecen intactos. Sin equivalencia de unidad, no se presume conversión ni tarifa.
- Sin responsable o tarifa, el registro no se puede liquidar.
- Una tarea solo se cierra tras validar toda su cantidad. Al terminar las tareas requeridas del grupo, se actualiza término real y el estado de los pedidos en producción.

Informe por persona, servicio y período, con detalle por proyecto/fecha y exportación CSV. El panel de saldo por pagar sigue visible para Super Administrador, Administración, Logística y Finanzas. Los pagos registrados requieren fecha y comprobante; Logística solo consulta. Bloquea pagar dos veces la misma línea.

Los registros históricos conservan sus códigos, unidades, tarifas por persona, tiempos y modalidades antiguas. No se convierten pagos antiguos a la nueva matriz ni se inventan comprobantes.
