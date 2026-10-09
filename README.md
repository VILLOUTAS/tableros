# Casa Diseño Multiespacio · Optimizador V6.0.0

Actualización para `VILLOUTAS/tableros`, su servicio y la misma base PostgreSQL. Comienza por [ACTUALIZACION_V6.0.0.md](ACTUALIZACION_V6.0.0.md).

## Cambios incluidos

- Menú: **Panel, Proyectos, CRM Producción, Catálogo de Productos, Catálogo de Servicios, Despachos, Administración**, con visibilidad según perfil.
- Catálogos separados y desplegables por grupo, familia, línea/marca y variante. Matriz corregida: 43 rutas de Productos y 80 de Servicios. Tapacantos dentro de Tableros; Despachos fuera del catálogo de servicios.
- Conserva las 868 referencias de la V5.5. Agrega 60 fichas de servicios pendientes de configurar, con códigos provisionales `V6-SRV-…`, unidad, costo, venta y venta mínima editables. No se inventan precios ni códigos oficiales.
- Panel de servicios por pagar para **Super Administrador, Administración, Logística y Finanzas**: producción validada del mes, pagado, saldo total pendiente y registros sin tarifa. Detalle por persona/servicio/proyecto y descarga CSV.
- Registro de pagos realizados por Super Administrador, Administración y Finanzas; Logística solo consulta. Fecha y comprobante obligatorios, por líneas completas. Bloquea pagos duplicados. No ejecuta transferencias ni admite abonos parciales.
- Tareas por persona vinculadas a los servicios cotizados; incluye fabricación e instalación. Tarifa de mano de obra independiente del costo del servicio y del precio al cliente. Conserva la tarifa usada en cada avance.
- Elimina el aviso general de referencia histórica. Asocia automáticamente sucesores conocidos; una referencia sin correspondencia segura se señala en la pieza afectada y requiere corregirla antes de guardar.
- Mantiene las reglas anteriores de disco, 105% de material de tapacanto / 100% de instalación, despachos, Salice, jornada, metas y autoría al pie.

## Datos anteriores

La migración no recalcula cotizaciones ni cambia estados. Conserva usuarios, contraseñas, revisiones, códigos, importes, tarifas y fotografías. Una modificación técnica genera R+1 con motor 6.0 y archiva la anterior; solo consultar o cambiar comentarios mantiene el cálculo guardado. La configuración de categorías anterior queda respaldada internamente.

Ranurado conserva sus referencias y cobro por placa. Al no aparecer en la nueva matriz, queda en el bloque de servicios anteriores conservados y Administración puede asignarle categoría.

## Configuración inicial

Configura códigos definitivos, unidades, venta y venta mínima de las nuevas fichas en Administración → Servicios. Los costos requieren Super Administrador o Administrador con permiso específico. Configura las tarifas por persona y tarea antes de validar producción. Cambiar tarifas posteriormente no modifica registros validados.

Revisa movimientos anteriores ya pagados o sin tarifa antes de preparar liquidaciones: no se presumen comprobantes inexistentes ni se aplican tarifas retroactivamente.

Persisten los pendientes de catálogo 5.5, incluidas 12 referencias sin medidas/espesor completos. Ver [catálogos y pendientes](docs/CATALOGO_V6.md).

## Ejecución

Node.js 24, Express, PostgreSQL y Vite. Dependencias fijadas; SheetJS incluido en `vendor/`.

```bash
npm ci --include=dev
npm test
npm run build
npm start
```

`/api/health` informa `6.0.0`. Conserva `DATABASE_URL`: desarrollo sin base usa memoria temporal. Matriz fuente en `catalog/MATRIZ_PRODUCTOS_SERVICIOS_V6.xlsx`; regeneración con `npm run matrix:import:v60`. No elimines ni regeneres catálogos históricos para actualizar esta versión.

Documentación: [carga GitHub/Render](SUBIR_A_GITHUB_Y_RENDER.txt), [pagos y permisos](docs/PAGOS_OPERADORES_V6.md), [validación](docs/VALIDACION_V6.md), [autoría](COPYRIGHT.txt).

El paquete se probó localmente. No se ha subido ni desplegado desde esta sesión.
