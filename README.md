# Casa Diseño Multiespacio · Plataforma V6.1.1

Actualización sobre `VILLOUTAS/tableros`, el servicio existente y la misma base PostgreSQL. Comienza por [ACTUALIZACION_V6.1.1.md](ACTUALIZACION_V6.1.1.md).

## Corrección V6.1.1: Despacho del CRM

**Despacho significa pedido procesado, revisado y listo para entrega o carga**, tanto para retiro del cliente como para transporte interno o externo. La programación de viajes se administra aparte, en la pestaña Despachos.

Al pasar un pedido a Despacho, un perfil operativo autorizado confirma que está procesado y revisado. Se registra quién confirmó y cuándo, sin generar registros de producción, asignar operadores ni calcular pagos automáticamente. Puede completarse el registro de mano de obra posteriormente.

Las tarjetas listas ya no muestran “Sin programar” ni solicitan programar producción. Las etapas comerciales, precios e historial se conservan. Las tareas pueden seguir cerrando automáticamente la producción cuando toda su cantidad está validada.

## Cambios incluidos

- Panel con cinco accesos: Optimizador de Tableros, Optimizador de Placas, Cotizador de Productos, Cotizador de Servicios y Despachos. Proyectos y pedidos siguen accesibles desde el panel y CRM.
- Cotizaciones de productos y servicios con formulario propio de cliente y proyecto, sin pasos de optimización. Pueden vincularse a un proyecto existente del mismo cliente antes de facturar, conservando sus importes e historial.
- Categorías de selección abreviadas; tabla compacta de piezas con terminaciones L1–L4, asignación masiva, dibujo opcional y medidas redondeadas. Corrige el error de interfaz con referencias pendientes; muestra la pieza que requiere corrección antes de calcular.
- Cuadrícula visible antes de pegar, con Material, Nombre, Cantidad, Largo, Ancho, Tipo tapacanto, L1, L2, L3 y L4. Reconoce códigos exactos de materiales seleccionados y tapacantos; las asociaciones ambiguas requieren elección. Conserva la importación avanzada.
- Matriz nueva: **104 servicios** con código, unidad, venta neta, venta mínima neta y pago por unidad. Mantiene los 840 productos anteriores. Los servicios sustituidos quedan como referencias históricas inactivas.
- Cada pedido facturado y pagado genera sus tareas por los servicios vendidos. Producción, Logística, Instalación y Administración asignan operadores o subcontratistas, distribuyendo cantidades sin exceder lo cotizado. La excepción manual se identifica como servicio no codificado y exige motivo.
- Permite iniciar producción y registrar cantidades validadas sin responsable; la asignación posterior conserva fecha, cantidad y tarifa. Un registro sin responsable no puede pagarse.
- Pago por cantidad validada y tarifa del servicio, sin exigir horas o minutos. Informe por persona/servicio/período y CSV. Conserva importes y tarifas de los registros anteriores, incluidos los que utilizaban modalidades antiguas.
- En placas, el corte base se cobra por placa completa. El corte bruto por ml se vende únicamente como servicio adicional o para saldos/retazos; no se agrega automáticamente sobre el corte base. Biselado y 45° usan la tarifa correspondiente a Neolith o Cuarzo/Granito.
- Mantiene disco único editable de 2 a 5 mm, 3 mm predeterminados; material de tapacanto al 105% e instalación al 100%; despachos, calendarios, Salice, permisos, pagos y autoría al pie.

## Datos anteriores

Conserva usuarios, contraseñas, fotografías, proyectos, cotizaciones, códigos, revisiones, importes y pagos. Consultar o editar solo comentarios mantiene el cálculo guardado; cambiar medidas, materiales o servicios crea R+1 con motor 6.1 y archiva la anterior. Las dimensiones y precios personalizados mantienen sus revisiones.

La matriz actual expresa ranurado por **ml**. Las ventas anteriores por placa conservan su unidad e importe. Una revisión técnica de una línea antigua sin sucesor equivalente requiere elegir el nuevo servicio y su cantidad; no convierte placas a metros automáticamente.

Los costos de ejecución siguen separados del pago de mano de obra: la matriz no incluye una columna de costo total, por lo que no se inventan valores. Administración con permiso de costos o Super Administrador los configura; se complementan con insumos y activos del proyecto.

## Ejecución

Node.js 24, Express, PostgreSQL y Vite. Dependencias fijadas en `package-lock.json`; SheetJS incluido en `vendor/`.

```bash
npm ci --include=dev
npm test
npm run build
npm start
```

`/api/health` informa `6.1.1`. Conserva `DATABASE_URL`: sin base, desarrollo utiliza memoria temporal. Matriz original en `catalog/MATRIZ_PRODUCTOS_SERVICIOS_V6.1.xlsx`; regeneración del código semilla mediante `npm run matrix:import:v61`. Conserva los catálogos y motores históricos.

Documentación: [carga GitHub/Render](SUBIR_A_GITHUB_Y_RENDER.txt), [servicios y pagos](docs/SERVICIOS_Y_PAGOS_V6.1.md), [validación](docs/VALIDACION_V6.1.1.md), [autoría](COPYRIGHT.txt).

Paquete validado localmente. No se ha publicado en GitHub ni desplegado en Render desde esta sesión.
