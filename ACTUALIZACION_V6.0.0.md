# Actualización a V6.0.0

Actualiza sobre el repositorio `VILLOUTAS/tableros`, el servicio Render y la misma base PostgreSQL existentes.

## Preparación

Conserva un respaldo de la base actual y del código desplegado. La migración utiliza las tablas existentes y agrega documentos dentro de `v5_documents`; no elimina usuarios, proyectos, catálogo, tareas ni registros de producción.

Conserva `DATABASE_URL`, credenciales, correos y configuración privada. Las capturas contienen datos de prueba que no deben cargarse en producción.

## Archivos y despliegue

Descomprime el ZIP y copia su contenido en la raíz del repositorio, reemplazando archivos coincidentes. `package.json`, `server.mjs`, `v60-server.mjs` y `render.yaml` deben quedar en la raíz. Conserva la estructura de `src/`, `catalog/`, `scripts/`, `public/`, `tests/` y `vendor/`.

Conserva `.git`, `.env` y fotografías propias ajenas al paquete. No subas solo el ZIP ni una carpeta contenedora. El paquete no incluye dependencias instaladas, secretos, compilados ni respaldos de producción.

```bash
npm ci --include=dev
npm test
npm run build
```

Publica el commit con tu cuenta autorizada. En el servicio existente: Build `npm ci --include=dev && npm test && npm run build`; Start `npm start`; Health `/api/health`. Mantén la misma base.

## Primer inicio

La migración instala una sola vez la matriz de Productos/Servicios y guarda la configuración anterior. Cotizaciones guardadas conservan su motor e importes; una modificación técnica crea una revisión 6.0.

Configura las 60 nuevas fichas de servicios: códigos definitivos, unidades, venta, venta mínima y costos. Sin venta, venta mínima o unidad confirmada no se cotizan. No se inventan importes de mano de obra: configura primero las tarifas reales por persona/tarea.

Los registros antiguos sin comprobante aparecen pendientes; los que no tenían tarifa se identifican sin importe. Revisa los pagos ya realizados antes de preparar liquidaciones.

## Verificación posterior

- `/api/health`: versión `6.0.0` y base `postgresql`.
- Siete entradas principales según el perfil.
- Cotizaciones antiguas conservan importes, estados y revisiones.
- Catálogos desplegables, tapacantos en Tableros y Despachos independiente.
- Panel de pagos visible solo a los cuatro perfiles definidos.
- Una asignación y un avance validado calculan mano de obra con su tarifa individual.

Para regresar de versión, conserva código y respaldo de base de la misma fecha. Reconciliar movimientos posteriores exige revisión: no borres masivamente usuarios ni documentos.
