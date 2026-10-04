# Reglas de operación V5.5

## Optimización y precios

Disco único de 3 mm iniciales, configurable de 2 a 5 mm. El despunte es otro parámetro de cada producto. Material de tapacanto: metros instalados × 1,05; servicio: metros instalados × 1,00. Por ejemplo, 100 ml instalados generan 105 ml de material y 100 ml de servicio. La producción y la remuneración cuentan los metros realizados, sin sumar la merma de material. V5.1 conserva su factor 1,02; V5.0, 1,00, en revisiones históricas.

Los precios son netos, con IVA de 19%. Los descuentos comerciales sobre productos/servicios se limitan a 50% y al piso entre costo/mínimo de venta. Los clientes y visitantes no aplican descuentos. El despacho tiene su regla de descuento propia.

## Despacho

El cliente elige despacho o retiro. Se valoriza por productos completos utilizados, incluidos retazos/sobrantes, tapacantos y adicionales físicos. No se calcula solo el peso de piezas terminadas. Los servicios sin suministro físico no suman peso.

1. Referencia = peso total en kg × tarifa original por kg de la comuna.
2. Valor de venta = referencia × 1,20.
3. Neto = mayor entre el mínimo de la comuna y el valor de venta con descuento de 0 a 50%, redondeado al peso.
4. IVA = 19% del neto; total = neto + IVA.

La tarifa conserva el valor desfavorable original de la columna I del Excel: no se recalcula con capacidad de 5000 kg. Corresponde al recorrido de ida.

**Mínimo $5.000 netos** en Concepción, Chiguayante, Hualqui, Talcahuano, Hualpén, San Pedro de la Paz, Tomé y Penco. **$15.000 netos** en las demás comunas. Se respetan los mínimos después del descuento. Hay 68 comunas habilitadas inicialmente. Administradores/Superadministrador editan tarifas, pesos, activación y nuevas comunas. Los pesos desconocidos dejan el cálculo pendiente, identificado por SKU.

Comercial propone fecha para su proyecto. Logística o Producción confirma/reasigna; Administración también puede gestionar. El calendario identifica sugeridos, confirmados y otros estados. Una factura registrada protege la valorización del despacho contra recálculos. Cambiar la agenda no modifica la factura de la cotización. Los despachos históricos mantienen su precio guardado.

## Jornada, tareas y productividad

Se planifica por **persona**, no por máquina. Lunes a jueves: 08:00–17:30, colación 14:00–14:30, 9 horas efectivas por día. Viernes: 08:00–14:00, 6 horas. Total: 42 horas semanales. La planificación excluye colación y fin de semana. No incorpora automáticamente feriados, vacaciones ni licencias.

El rendimiento diario usa 9 horas como base; el viernes es proporcional a 6 horas. La asignación distribuye la demanda del servicio entre operadores y evita sobreasignación o superposición de una misma persona. Las tarifas de pago no se derivan de los precios de venta.

| SKU | Servicio | Producción | Unidad | Período |
|---|---|---|---|---|
| SER-0038 | SERVICIO TAPACANTO 0,4MM | 1 | ml | minuto |
| SER-0037 | SERVICIO TAPACANTO 1,0MM | 1 | ml | minuto |
| SER-0035 | SERVICIO TAPACANTO 1,5MM | 1 | ml | minuto |
| SER-0036 | SERVICIO TAPACANTO 2,0MM | 1 | ml | minuto |
| SER-NEO-02 | CORTE NEOLITH 06MM | 8 | placa | día de 9 horas |
| SER-NEO-01 | CORTE NEOLITH 12MM | 6 | placa | día de 9 horas |
| SER-NEO-21 | CORTE NEOLITH 45° ML | 4 | ml | hora |
| SER-NEO-22 | CORTE NEOLITH LINEAL BICELADO | 2 | ml | hora |
| SER-PLA-01 | CORTE PLACAS CUARZO O GRANITO | 8 | placa | día de 9 horas |
| SER-PLA-21 | CORTE PLACAS LINEAL BICELADO | 4 | ml | hora |
| SER-NEO-23 | CORTE RANURADO NEOLITH | 0.5 | placa | día de 9 horas |
| SER-PLA-22 | CORTE RANURADO PLACAS | 0.5 | placa | día de 9 horas |
| SER-NEO-24 | PERFORACION NEOLITH | 1 | unidad | hora |
| SER-PLA-23 | PERFORACION PLACAS | 1 | unidad | hora |
| SER-112 | CORTADOR - EXTERNO | 1 | gl | día de 9 horas |
| SER-DIM-02 | CORTE TABLERO ACRILICO | 5 | tablero | día de 9 horas |
| SER-DIM-01 | CORTE TABLERO MELAMINA | 30 | tablero | día de 9 horas |
| SER-DIM-04 | CORTE TABLERO OTROS | 10 | tablero | día de 9 horas |
| SER-DIM-03 | CORTE TABLERO STYLELITE | 20 | tablero | día de 9 horas |

Los encargados autorizados registran y validan cantidad producida y minutos reales. Operador/Instalador consulta sus tareas y puede cerrar la tarea asignada cuando su producción ya está validada. El paso global Producción → Despacho espera completar todas las tareas productivas obligatorias y la demanda de corte/tapacanto/terminaciones. Guarda término previsto y real.

## Pagos

Modalidad inicial por unidad producida; se puede configurar por unidad, por hora o mixta, con tarifa propia para cada operador y tipo de tarea y fecha de vigencia. Administradores, Producción y Finanzas configuran estas tarifas. El registro de avance conserva una copia de la tarifa vigente y su importe: una modificación posterior no cambia pagos ya registrados.

Una tarifa no configurada se informa como pendiente, sin inventar un pago de cero. Los reportes filtran por período y persona/tarea y se descargan en CSV. Son reportes de producción y cálculo de remuneración; no ejecutan transferencias ni generan una liquidación legal de sueldos.

## Recursos y costo final

Cada cotización admite insumos, uso de activos, servicios externos y gastos; guarda cantidades previstas/reales y costo unitario. Se pueden crear plantillas por servicio. Los activos se costean por su uso, no por el precio completo de adquisición. Los materiales suministrados se incluyen según la cotización. La mano de obra validada se agrega una sola vez y no debe duplicarse como gasto manual.

El consolidado reúne todas las cotizaciones del proyecto, ingresos netos, costos informados y mano de obra validada. Es provisional mientras existan recursos/costos/tarifas pendientes. El indicador de saldo sobre costos registrados no sustituye una contabilidad: el responsable debe comprobar que estén todos los consumos y gastos. Producción/Instalación registra consumos; los importes requieren permiso de costos. Finanzas consulta el consolidado y configura tarifas de pago.

## Accesos

| Perfil | Proyectos | Acciones |
|---|---|---|
| Super Administrador | Todos | Acceso y administración completos |
| Administrador | Todos | Categorías, productos, venta, fotos y parámetros. Usuarios/costos con permiso específico del Superadministrador |
| Comercial | Propios y asignados | Cotiza, pasa a Facturación y Facturado y pagado. Consulta producción; propone despacho |
| Producción | Todos | Consulta etapas previas. Opera desde Facturado y pagado; tareas, operadores, tarifas y programación de Tableros/Placas |
| Instalación | Todos | Consulta etapas previas. Opera desde Facturado y pagado; tareas/recursos y agenda de Instalaciones |
| Logística | Todos | Consulta etapas previas. Opera desde Facturado y pagado; confirma/reasigna despachos |
| Supervisor | Todos | Consulta sin modificar |
| Operador | Asignados | Proyectos y CRM; consulta y cierre de su tarea validada |
| Instalador | Asignados | Proyectos y CRM; consulta y cierre de su tarea validada |
| Finanzas | Todos | Consulta y reportes; configuración de tarifas de pago como excepción autorizada |
| Cliente | Sus cotizaciones | Catálogo, cotiza, guarda, descarga, designa Comercial y calcula despacho; no cambia estados |
| Visitante | Cotización en curso, sin cuenta | Catálogo/precios, calcula despacho y envía cotización; sin PDF. Administración recibe aviso |

El CRM es exclusivo del equipo interno. Los códigos de origen se ocultan a Cliente/Visitante; los costos y mínimos se protegen por permisos. Las notificaciones internas se conservan. El correo requiere la configuración de envío del servicio existente.

## Autoría

El pie de toda la aplicación indica © 2026 Casa Diseño Multiespacio® y todos los derechos reservados. El aviso no equivale a una inscripción del software ni a una patente. Ver COPYRIGHT.txt.
