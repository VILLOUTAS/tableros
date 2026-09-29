# Actualizar el servicio existente a V5.0.0

Usa **el mismo repositorio, servicio de Render y DATABASE_URL**. La actualización
no requiere otra base ni volver a ingresar pedidos y usuarios.

## Preparación

1. Obtén un respaldo de PostgreSQL con tu herramienta habitual. Un administrador
   con acceso a la conexión puede ejecutar:
   `pg_dump "$DATABASE_URL" --format=custom --file=respaldo_pre_v5.dump`.
   Conserva ese archivo fuera del repositorio.
2. Guarda el commit o paquete V4.1 que funciona y la configuración del servicio.
   Prueba V5 sobre una copia de la base antes de recibir pedidos reales: la
   suite incluida usa datos de ensayo, no la base del negocio.
3. Comprueba que el servicio mantiene su DATABASE_URL actual. La cuenta de
   Edmundo conserva su contraseña y pasa a superadministrador si ya era admin.

## GitHub y Render

1. Descomprime el paquete y carga **su contenido en la raíz del repositorio
   actual**, reemplazando los archivos correspondientes. No subas solo el ZIP
   ni crees una carpeta adicional encima del proyecto.
2. Incluye `package-lock.json`, `v5-server.mjs`, `src/`, `tests/`, `vendor/`,
   `public/` y `catalog/`. No reemplaces archivos `.env` propios. El paquete
   solo incluye `.env.example`, sin credenciales.
3. Realiza la carga completa en un commit y despliega el servicio existente.
   No crees otro Blueprint, Web Service ni PostgreSQL. Los nombres antiguos
   de `render.yaml` se mantienen deliberadamente; no renombres la base a V5.

- Build: `npm ci --include=dev && npm test && npm run build`
- Start: `npm start`
- Node.js: 24
- Conservar `NODE_ENV=production` y `DATABASE_URL`.
- Conservar variables de correo si se usan notificaciones.
- `/api/health` debe indicar PostgreSQL.

El inicio agrega `v5_documents` (configuración/fletes) y `projects.row_version`,
y amplía roles y tipos de catálogo. El historial de cálculo se guarda en el
payload de cada cotización. La migración es repetible y no borra pedidos,
usuarios, imágenes ni precios históricos, ni recalcula masivamente proyectos.

## Cuenta principal

Si `edmundo@villoutas.cl` existe con otro rol, después de iniciar V5 se puede
habilitar desde una consola administrada con la misma DATABASE_URL:

```bash
npm run admin:promote-owner
```

Solo habilita ese correo, conserva su clave y no modifica proyectos. Si la
cuenta no existe, créala con el administrador vigente antes de actualizar.
Para una instalación vacía, usa ese correo en la cuenta inicial. No se incluye
ninguna contraseña predeterminada.

## Primera revisión dentro de V5

1. Consulta proyectos antiguos y comprueba cliente, planos, importes y PDF.
2. Asigna los roles adicionales del equipo desde Usuarios.
3. Registra comunas, kilómetros viales de ida y referencia desde la bodega.
   Sin ello, el flete queda Por cotizar.
4. Configura costos y mínimos de servicios: no se inventan costos reales.
5. Completa precio, proveedor y stock de los MDF delgados antes de activarlos.
6. Ensaya la importación y revisa veta y lados antes de emitir una orden real.

## Si surge un problema

Conserva la base. Detén nuevas escrituras mientras revisas el despliegue; no
vacíes tablas ni restaures un respaldo antiguo encima de pedidos nuevos.
Los programas anteriores no conocen los campos V5 y no deben seguir editando
una base que ya recibió revisiones V5. Investiga sobre una copia y corrige el
despliegue conservando los datos actuales.
