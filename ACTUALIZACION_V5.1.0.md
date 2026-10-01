# Actualizar V5.0.0 a V5.1.0

Este paquete actualiza el **mismo repositorio, servicio de Render y base
PostgreSQL**. No necesita una base nueva ni volver a ingresar cotizaciones.

## Antes de desplegar

1. Conserva el paquete/commit V5.0.0 y un respaldo actualizado de la base.
   Ejemplo, desde un equipo autorizado con conexión a la base:
   `pg_dump "$DATABASE_URL" --format=custom --file=respaldo_pre_v51.dump`.
   El respaldo se guarda fuera del repositorio.
2. Ensaya esta versión sobre una copia de la base actual. Las pruebas del
   paquete usan datos sintéticos y no sustituyen esa comprobación.
3. Mantén las variables DATABASE_URL, NODE_ENV y correo del servicio actual.
   No reemplaces tu `.env` con archivos del paquete.

## Carga en GitHub y Render

1. Descomprime el ZIP y coloca **su contenido en la raíz del repositorio
   existente**, reemplazando los archivos correspondientes. No cargues
   únicamente el ZIP ni agregues una carpeta contenedora encima del proyecto.
2. Incluye `v51-server.mjs`, `v5-server.mjs`, `server.mjs`, `src/`, `scripts/`,
   `catalog/`, `public/`, `vendor/`, `tests/`, `package.json` y `package-lock.json`.
   Conserva ambos catálogos: el antiguo sirve para las revisiones históricas.
3. Despliega el servicio existente con:
   - Build: `npm ci --include=dev && npm test && npm run build`
   - Start: `npm start`
   - Node: 24
4. Comprueba `/api/health`: versión `5.1.0`, base `postgresql`.

No crees otro Blueprint, Web Service ni PostgreSQL. Los nombres antiguos de
`render.yaml` permanecen para conservar la identidad del despliegue existente.
El paquete no incluye credenciales ni datos productivos.

## Qué hace el primer inicio

- Conserva proyectos, usuarios, precios históricos, archivos e imágenes.
- Amplía el tipo de catálogo para admitir servicios.
- Guarda una copia de la configuración anterior dentro de la base.
- Activa las categorías acordadas y las 471 referencias del nuevo Excel.
- Retira del catálogo vigente las referencias/revisiones anteriores sin borrarlas.
- Inicializa el consumo de disco en 3 mm y las tarifas de ida del Excel,
  manteniendo las bases fijas de V5.0, el origen y las comunas guardadas.
- Habilita las tres agendas. Las fechas antiguas siguen visibles como
  programaciones de Tableros o Placas; al editarlas se guarda su programación
  independiente. No se inventan fechas para proyectos que no las tenían.

La migración es repetible: los reinicios posteriores no vuelven a sustituir
la configuración que hayas editado. No recalcula ni cambia códigos dentro de
cotizaciones guardadas. Una nueva revisión técnica utiliza productos vigentes
cuando su equivalencia está verificada; en otro caso solicita seleccionarlos.

## Revisión inicial

1. Entra con la cuenta habitual. Las contraseñas se conservan.
2. Abre varias cotizaciones antiguas: comprueba SKU, importes, planos e historial.
3. Abre CRM de Producción con perfiles internos; comprueba que Cliente y Visita
   no tengan acceso. Revisa estados y las tres agendas por mes.
4. Programa Tableros, Placas e Instalaciones del mismo proyecto en fechas
   diferentes. Comprueba que la nota de venta conserve su estado e importe.
5. Busca por cliente, comercial y proyecto.
6. En Administración filtra una categoría y ensaya edición individual y
   agrupada de dimensiones. Las cotizaciones guardadas deben conservarse.
7. Completa los siete espesores pendientes descritos en `docs/CATALOGO_V5.1.md`.
   Los tres servicios sin precio permanecen Por cotizar.
8. Revisa tarifas, mínimos y dimensiones antes de emitir una orden nueva.
   Ensaya disco de 3 y 4 mm, 102% de material de tapacanto y 100% de servicio.
9. Verifica un despacho de ida. Conserva la distancia vial verificada, sin
   multiplicarla por dos. Revisa los precios por km y bases en Configuración.
10. Descarga un PDF nuevo. El ejemplo incluido usa datos ficticios.

## Cuenta principal y recuperación

La promoción de la cuenta administradora de Edmundo se conserva de V5.0. No
se crea una cuenta ni una contraseña nueva al actualizar. Si requiere promoverse
una cuenta existente autorizada, se mantiene `npm run admin:promote-owner`.

Si aparece un problema, conserva la base y revisa el despliegue sobre una
copia. No vacíes tablas ni restaures un respaldo antiguo encima de pedidos
nuevos. Una versión anterior no conoce todos los campos V5.1; evita usarla
para editar registros que ya contienen revisiones nuevas.
