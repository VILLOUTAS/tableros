# Actualización segura a V4.0.0

Esta versión está preparada para reemplazar el código de V3.4.3 sin borrar la
base PostgreSQL ni los proyectos ya optimizados.

## Antes de desplegar

1. Generar un respaldo de PostgreSQL desde Render.
2. Confirmar que el servicio mantiene exactamente la misma variable
   `DATABASE_URL`.
3. Subir el contenido de este paquete a la misma rama de GitHub usada por el
   Web Service.
4. No crear otra base y no borrar el servicio anterior antes de verificar la
   nueva compilación.

El comando de Render se mantiene:

```text
Build Command: npm ci --include=dev && npm run test && npm run build
Start Command: npm start
Health Check Path: /api/health
```

## Migración de datos

Al iniciar, el servidor ejecuta una migración aditiva:

- agrega `app_users.roles` si no existe;
- copia el rol histórico de cada usuario a ese arreglo;
- conserva `app_users.role` por compatibilidad;
- no elimina tablas, usuarios, proyectos, cotizaciones, imágenes ni
  revisiones del catálogo.

Los proyectos V3 que no contienen `settings.calculationVersion` se abren como
`legacy-v3`. Conservan rebaje 0 y su geometría previa. La interfaz ofrece un
botón explícito para reoptimizarlos con V4; hasta que ese botón se use y se
guarde, no se cambian sus reglas.

## Reglas de V4

- Largo y Ancho no se ordenan por magnitud.
- Longitudinal sigue el Largo ingresado.
- Transversal sigue el Ancho ingresado.
- Sin veta permite rotación.
- Tableros: rebaje 10 mm por cada lado.
- Neolith: rebaje 30 mm por cada lado y kerf de 3 mm.
- Neolith 12 mm: formato nominal 3200 × 1600 mm; útil 3140 × 1540 mm.
- Neolith 6 mm: formato nominal 3200 × 1500 mm; útil 3140 × 1440 mm.
- El mapa T1, T2, etc. es único por proyecto.

## Verificación posterior

1. Abrir un proyecto histórico y confirmar el aviso “Proyecto histórico
   protegido”.
2. Crear un proyecto nuevo y comprobar el rebaje en el plano.
3. Descargar el PDF y revisar resumen, listado completo y hojas por placa.
4. Probar un usuario con roles Comercial + Producción.
5. Crear una prueba Neolith con Biselado-Pulido y 45°.

La batería incluida se ejecuta con `npm test` y cubre compatibilidad histórica,
semántica de veta, rebajes, códigos globales de tapacanto, Neolith y perfiles
múltiples.
