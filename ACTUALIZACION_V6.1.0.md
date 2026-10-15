# Actualización a V6.1.0

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

5. Commit sugerido: `Actualizar Casa Diseño a V6.1.0`. Publica con tu cuenta autorizada.
6. En el servicio Render existente: Build `npm ci --include=dev && npm test && npm run build`; Start `npm start`; Health `/api/health`. Mantén la misma base.

No crees otra base ni otro servicio para esta actualización. No subas solo el ZIP ni una carpeta contenedora. El paquete contiene fuentes completas; no incluye secretos, dependencias instaladas, compilados ni datos de producción.

## Primer inicio

La migración instala una sola vez la nueva jerarquía de Servicios y guarda la configuración anterior en `v61:config-before`. Mantiene las revisiones de productos/dimensiones; conserva los servicios antiguos como referencias históricas inactivas. No recalcula cotizaciones guardadas ni reinicia usuarios o contraseñas.

La matriz incluye 104 servicios y sus tres importes. Los costos totales de ejecución permanecen independientes y editables con permiso específico. Los registros antiguos conservan tarifas e importes, y no se marcan pagados sin un comprobante.

Los pedidos facturados y pagados o en producción/despacho generan las tareas faltantes. Una tarea ya existente para un servicio equivalente y la misma unidad evita duplicar esa cantidad. Los pedidos entregados no generan trabajo nuevo. Las nuevas tareas quedan sin asignar; revisa que el trabajo ya terminado tenga su registro y cierre.

Los servicios ausentes o con unidad modificada no se convierten automáticamente. Ranurado pasa de placa en referencias antiguas a ml en la matriz actual: al revisar técnicamente una venta, selecciona el servicio vigente e indica la cantidad real en ml. El historial mantiene la placa y su precio original.

## Comprobación posterior

- `/api/health`: `6.1.0` y base `postgresql`.
- Abre cotizaciones antiguas y comprueba sus importes, revisiones y fotografías.
- Panel: cinco flujos; ventas de productos/servicios con su propio formulario.
- Pega un bloque, revisa L1–L4 y comprueba la tabla de terminaciones.
- Pedido pagado: servicios automáticos, entrada a producción sin responsable y asignación posterior.
- Avance validado: cantidad por tarifa, informe por persona y panel de pagos según permisos.
- Verifica CRM, calendarios y despacho en los perfiles que los utilizan.

Pruebas locales con base simulada PostgreSQL; no se han cargado datos de prueba en tu base real. Para volver de versión, utiliza código y respaldo de base de la misma fecha y revisa los movimientos posteriores antes de restaurar.
