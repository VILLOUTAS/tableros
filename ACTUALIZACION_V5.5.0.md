# Actualización a V5.5.0

Instala sobre el **mismo repositorio, servicio de Render y PostgreSQL**. No requiere crear usuarios ni volver a ingresar cotizaciones. La base de código es V5.1.0 y conserva los motores históricos anteriores.

## 1. Respaldo

1. Conserva el commit o paquete actualmente instalado.
2. Respalda PostgreSQL desde un equipo autorizado, antes del despliegue. Ejemplo con herramientas PostgreSQL y `DATABASE_URL` configurada:

   ```bash
   pg_dump "$DATABASE_URL" --format=custom --file=respaldo_pre_v55.dump
   ```

   Mantén el respaldo fuera de GitHub. Conserva también las imágenes externas que utilice tu instalación.
3. Ensaya sobre una copia de la base real. Las pruebas incluidas usan datos sintéticos; no se ha accedido a producción.
4. Conserva `DATABASE_URL`, `NODE_ENV`, correo y dominio del servicio. No reemplaces secretos con `.env.example`.

## 2. Archivos y despliegue

Descomprime el ZIP y copia **su contenido a la raíz del repositorio existente**. `package.json` debe quedar directamente en esa raíz. Conserva `.git`, la configuración privada y los archivos propios ajenos al paquete. No basta con subir el ZIP como un solo archivo.

Incluye `server.mjs`, `v5-server.mjs`, `v51-server.mjs`, `v55-server.mjs`, `src/`, `scripts/`, `catalog/`, `public/`, `vendor/`, `tests/`, documentos y ambos `package*.json`. No elimines los catálogos históricos.

Comprueba antes de subir:

```bash
npm ci --include=dev
npm test
npm run build
```

| Parámetro | Valor |
|---|---|
| Node | 24.x |
| Build | `npm ci --include=dev && npm test && npm run build` |
| Start | `npm start` |
| Health check | `/api/health` |
| Base | La misma `DATABASE_URL` existente |

`render.yaml` conserva los nombres previos para respetar la instalación. No crees otro Blueprint, Web Service ni PostgreSQL. Incluye despliegue automático por commit: si tu servicio lo usa, subir el commit inicia el despliegue.

## 3. Primer inicio

- Ejecuta las migraciones en orden sin vaciar las tablas existentes.
- Guarda la configuración anterior y registra las revisiones de catálogo retiradas.
- Activa las familias, subcategorías y 868 referencias. Inicializa comunas, pesos y rendimientos.
- Conserva fotografías y costos administrativos con equivalencia de producto verificable.
- Habilita los roles, tareas, registros de producción, tarifas y recursos nuevos.
- Los reinicios no vuelven a sustituir los parámetros editados por Administración.
- Mantiene códigos, precios, cálculos, estados, facturas, guías e historial. Los cambios descriptivos conservan el cálculo; los técnicos generan otra revisión.

La migración V5.5 es transaccional y bloquea ejecuciones simultáneas. Los registros con versión rechazan guardar sobre una edición concurrente y solicitan actualizar los datos.

## 4. Comprobación inicial

1. Revisa `/api/health`: versión `5.5.0` y PostgreSQL. Entra con tu cuenta habitual.
2. Compara cotizaciones antiguas con el respaldo: códigos, importes, estados, documentos, planos e historial.
3. Comprueba el aviso Casa Diseño Multiespacio® en el pie de las pantallas.
4. Prueba el CRM por estados y fecha de inicio; programa las cuatro agendas por separado.
5. Completa medidas, precios, pesos y compatibilidades indicados en `docs/PENDIENTES_CATALOGO_V5.5.csv`.
6. Ensaya despacho a Concepción y fuera del área local, incluido descuento y mínimo.
7. Cotiza 100 ml de tapacanto instalado: V5.5 debe cobrar 105 ml de material y 100 ml de servicio. V5.1 sin modificar conserva el 102% histórico.
8. Revisa el disco predeterminado de 3 mm. Puedes cambiarlo entre 2 y 5 mm para cotizaciones nuevas.
9. Crea operadores y vincula sus cuentas si necesitan entrar a la plataforma. Configura las tarifas reales: no se han inventado remuneraciones.
10. Asigna trabajos, valida producción y revisa reportes por persona. Completa insumos, uso de activos y costos antes de considerar final el informe económico.
11. Revisa los perfiles Cliente, Comercial, Operador, Finanzas y Administrador. El Superadministrador concede los permisos específicos de usuarios/costos.
12. Descarga PDF de tableros y de servicios sin tableros. La muestra incluida contiene datos ficticios.

## Recuperación

No se crea una cuenta principal ni contraseña nueva. Se conserva `npm run admin:promote-owner` para promover la cuenta autorizada indicada en su código; no crea cuentas ni altera contraseñas.

Si el despliegue falla, conserva la base y revisa el problema sobre una copia. No vacíes tablas ni restaures automáticamente un respaldo antiguo encima de pedidos nuevos. Ensaya cualquier retorno al código anterior en una copia: no conoce todos los campos V5.5. Antes de restaurar datos, reconcilia la actividad posterior al respaldo.
