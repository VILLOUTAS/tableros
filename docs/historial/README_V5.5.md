# Casa Diseño Multiespacio · Optimizador V5.5.0

Actualización para `VILLOUTAS/tableros` y su servicio existente. Mantiene la misma base PostgreSQL. Comienza por [ACTUALIZACION_V5.5.0.md](ACTUALIZACION_V5.5.0.md).

## Cambios incluidos

- Catálogo activo de **868 referencias**: 158 tableros, 176 placas, 150 tapacantos, 356 herrajes y 28 servicios. Categorías y dimensiones editables individualmente o por selección de productos.
- CRM de Producción interno, vista por estados y calendario según fecha de inicio. Agendas independientes de Tableros, Placas, Instalaciones y Despachos. Buscador por cliente, comercial, proyecto o código.
- Despacho opcional calculado con el peso de productos completos utilizados, incluidos sobrantes. Tarifas originales por kg, factor 1,20, descuento máximo 50% y mínimos netos. Comercial propone; Logística o Producción confirma o reasigna.
- Disco de 3 mm por defecto, configurable entre 2 y 5 mm. Tapacanto material al 105% y servicio al 100% en cálculos V5.5.
- Cotización de herrajes y servicios sin necesidad de agregar tableros. Adicionales y despacho incluidos en totales y PDF.
- Relaciones Salice: acabado, exclusividad de la serie 800, placa metálica obligatoria, cubrecazoleta opcional y acoplamientos de guías. Los mecanismos especiales sin relación confirmada se configuran antes de cotizar.
- Operadores, tareas por persona, jornada de 42 horas, metas por servicio, avance validado y reportes de productividad y pago. Tarifas por operador/tarea, vigencia y conservación de la tarifa usada en cada registro.
- Insumos, uso de activos y gastos por cotización; plantillas por servicio y costos consolidados del proyecto. La mano de obra validada se incorpora una sola vez.
- Matriz de 12 perfiles y permisos específicos de usuarios/costos para Administradores. Los controles también se aplican en el servidor.
- Aviso de autoría al pie: **© 2026 Casa Diseño Multiespacio®**. Aplicación de autoría de Casa Diseño Multiespacio, marca registrada. Todos los derechos reservados.

## Datos anteriores

La migración no recalcula las cotizaciones existentes. Conserva usuarios, contraseñas, códigos, importes, documentos, imágenes, estados y revisiones guardadas. Los productos anteriores siguen disponibles para interpretar el historial y dejan de ofrecerse en cotizaciones nuevas. Una modificación técnica archiva la revisión anterior y calcula la siguiente con V5.5. Las equivalencias se basan en la identidad del producto, no solo en su código.

Las versiones antiguas sin plano completo almacenado se reconstruyen con su motor histórico; el resumen monetario guardado se conserva. Actualizar el código no sustituye un respaldo de la base.

## Documentación

- [Actualización y respaldo](ACTUALIZACION_V5.5.0.md).
- [Carga en GitHub y Render](SUBIR_A_GITHUB_Y_RENDER.txt).
- [Reglas comerciales, producción, roles y costos](docs/REGLAS_V5.5.md).
- [Catálogo y datos pendientes](docs/CATALOGO_V5.5.md).
- [Pendientes por SKU, en CSV](docs/PENDIENTES_CATALOGO_V5.5.csv).
- [Pruebas realizadas](docs/VALIDACION_V5.5.md).
- [Aviso de autoría y dependencias](COPYRIGHT.txt).

Hay 12 productos con medidas/espesor por completar, tres servicios con precio cero y relaciones especiales de Salice por confirmar. Los pesos faltantes se identifican por SKU y bloquean la valorización automática del despacho correspondiente. No se asignan valores ficticios para ocultar estos pendientes.

## Ejecución

Node.js 24, Express, PostgreSQL y Vite. Las dependencias están fijadas en `package-lock.json`; SheetJS está incluido en `vendor/`.

```bash
npm ci --include=dev
npm test
npm run build
npm start
```

Configura las variables del servicio existente. `.env.example` es una referencia sin credenciales. Sin `DATABASE_URL`, el desarrollo local usa memoria temporal; producción requiere PostgreSQL. `/api/health` identifica la versión `5.5.0`.

Las fuentes recibidas se conservan en `catalog/PRODUCTOS_V5.5.xlsx`, `catalog/RUTAS_V5.5.xlsx` y `catalog/PESOS_V5.5.xlsx`. El catálogo puede regenerarse con `npm run catalog:import:v55`; las rutas, con `node scripts/import-routes-v55.mjs`. Son semillas del código; las ediciones administrativas persistidas se guardan en la base. No regeneres catálogos históricos para actualizar V5.5.

El paquete está preparado y probado localmente. No se ha subido a GitHub ni desplegado en producción desde esta sesión.
