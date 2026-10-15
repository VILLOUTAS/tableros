# Actualización a V6.1.1

Actualiza la copia existente de `VILLOUTAS/tableros`, su servicio Render y la misma base PostgreSQL.

## Instalación

1. Conserva un respaldo de la base actual y del código desplegado.
2. Actualiza tu repositorio con Fetch/Pull. Copia el contenido del ZIP en la raíz, reemplazando archivos coincidentes y conservando las carpetas.
3. `package.json`, `server.mjs`, `v61-server.mjs` y `render.yaml` quedan en la raíz. Conserva `.git`, `.env`, `DATABASE_URL`, credenciales y fotografías propias ajenas al paquete.
4. Ejecuta con Node 24:

```bash
npm ci --include=dev
npm test
npm run build
```

5. Commit sugerido: `Actualizar Casa Diseño a V6.1.1`. Publica con tu cuenta autorizada.
6. En el servicio Render existente: Build `npm ci --include=dev && npm test && npm run build`; Start `npm start`; Health `/api/health`. Mantén la misma base.

No crees otra base ni otro servicio para esta actualización. No subas solo el ZIP ni una carpeta contenedora. El paquete contiene fuentes completas; no incluye secretos, dependencias instaladas, compilados ni datos de producción.

## Corrección incluida

Despacho del CRM representa un pedido procesado, revisado y listo para entrega o carga. No exige contratar transporte ni programar un viaje, aunque el cliente haya elegido retiro.

Al elegir Despacho, confirma la condición física del pedido. Producción, Logística y los demás perfiles operativos autorizados pueden hacerlo según sus permisos de estado. La confirmación guarda usuario y fecha y permite registrar o asignar mano de obra después. No genera cantidades producidas ni importes de pago por sí sola.

El calendario de viajes permanece independiente en Despachos. Entregado corresponde a la entrega efectiva y conserva los controles documentales existentes.

Esta corrección agrega metadatos en el documento del pedido; no requiere crear tablas nuevas ni modificar los usuarios o cotizaciones anteriores. El motor de cálculo se mantiene en 6.1.

## Primer inicio

La migración instala una sola vez la nueva jerarquía de Servicios y guarda la configuración anterior en `v61:config-before`. Mantiene las revisiones de productos/dimensiones; conserva los servicios antiguos como referencias históricas inactivas. No recalcula cotizaciones guardadas ni reinicia usuarios o contraseñas.

La matriz incluye 104 servicios y sus tres importes. Los costos totales de ejecución permanecen independientes y editables con permiso específico. Los registros antiguos conservan tarifas e importes, y no se marcan pagados sin un comprobante.

Los pedidos facturados y pagados o en producción/despacho generan las tareas faltantes. Una tarea ya existente para un servicio equivalente y la misma unidad evita duplicar esa cantidad. Los pedidos entregados no generan trabajo nuevo. Las nuevas tareas quedan sin asignar; revisa que el trabajo ya terminado tenga su registro y cierre.

Los servicios ausentes o con unidad modificada no se convierten automáticamente. Ranurado pasa de placa en referencias antiguas a ml en la matriz actual: al revisar técnicamente una venta, selecciona el servicio vigente e indica la cantidad real en ml. El historial mantiene la placa y su precio original.

## Comprobación posterior

- `/api/health`: `6.1.1` y base `postgresql`.
- Abre cotizaciones antiguas y comprueba sus importes, revisiones y fotografías.
- Panel: cinco flujos; ventas de productos/servicios con su propio formulario.
- Pega un bloque, revisa L1–L4 y comprueba la tabla de terminaciones.
- Pedido pagado: servicios automáticos, entrada a producción sin responsable y asignación posterior.
- CRM: confirma un pedido listo con retiro del cliente, sin programación de transporte; debe pasar a Despacho conservando registros de mano de obra y precios.
- Avance validado: cantidad por tarifa, informe por persona y panel de pagos según permisos.
- Verifica CRM, calendarios y despacho en los perfiles que los utilizan.

Pruebas locales con base simulada PostgreSQL; no se han cargado datos de prueba en tu base real. Para volver de versión, utiliza código y respaldo de base de la misma fecha y revisa los movimientos posteriores antes de restaurar.
