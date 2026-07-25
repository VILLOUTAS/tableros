# Cotizador online — Casa Diseño Multiespacio

Versión 2.0 del cotizador y optimizador de cortes. Incluye acceso seguro con
usuarios diferenciados, base PostgreSQL, catálogo completo importado desde
Excel y persistencia de proyectos.

## Funciones incluidas

- Logo oficial Casa Diseño Multiespacio.
- Inicio de sesión real: claves cifradas con bcrypt, cookie `HttpOnly`, token
  CSRF y bloqueo temporal por intentos repetidos.
- Perfiles Administrador, Comercial, Producción y Cliente.
- Proyectos con nombre de cliente como único dato obligatorio.
- Estados Cotización, Venta y Producción.
- 145 tableros y 121 tapacantos del Excel entregado.
- Selección progresiva por categoría y búsqueda por código, nombre o marca.
- Espacio para imágenes de materiales.
- Código de pieza autogenerado y nombre del elemento obligatorio.
- Importación Excel de piezas con revisión previa.
- Optimización longitudinal prioritaria o sin prioridad de eje.
- Corte cobrado por tablero.
- Servicio de tapacanto por metro lineal: 0,4 mm $500; 1,0 mm $600;
  1,5 mm $700; 2,0 mm $850.
- Descuentos independientes para tableros, tapacantos y servicios.
- Plano con nombre/código, medidas en los cuatro lados, acumuladas exteriores,
  veta, cortes completos y tapacantos diferenciados.

## Publicar en Render

Esta versión **no funciona como Static Site**, porque la autenticación y la base
de datos necesitan un proceso Node.js permanente.

### Opción recomendada: Blueprint

1. Sube todos los archivos de este paquete a la rama `main` de GitHub.
2. En Render elige **New → Blueprint**.
3. Conecta el repositorio y selecciona `render.yaml`.
4. Render creará `cotizador-casa-diseno-v2` como **Web Service** y
   `cotizador-casa-diseno-v2-db` como base **PostgreSQL**, vinculada mediante
   `DATABASE_URL`. Los nombres V2 evitan que Render intente convertir el Static
   Site existente, porque el tipo de un servicio no se puede modificar.
5. Espera a que `/api/health` esté disponible y abre la URL del nuevo servicio.
6. La primera pantalla pedirá crear la cuenta Administrador.
7. Después de comprobar la nueva URL, puedes retirar el Static Site anterior.

No elimines el sitio anterior antes de probar el nuevo servicio.

### Configuración manual equivalente

Primero crea una base PostgreSQL en Render. Después crea un **Web Service**
conectado al repositorio:

```text
Runtime: Node
Build Command: npm ci && npm run test && npm run build
Start Command: npm start
Health Check Path: /api/health
```

Variables:

```text
NODE_ENV=production
DATABASE_URL=<Internal Database URL de PostgreSQL>
```

Si Render muestra `Empty build command; skipping build`, el servicio todavía
está configurado como Static Site y debe reemplazarse por un Web Service.

## Primera apertura

Cuando la tabla de usuarios está vacía, la aplicación muestra “Crear
administrador”. No existe una clave predeterminada. Usa un correo válido y una
clave de al menos 10 caracteres. El Administrador puede crear los demás
usuarios y cambiar perfiles, claves y estado de las cuentas.

## Ejecutar localmente

Requiere Node.js 20 o superior:

```bash
npm install
npm run build
npm start
```

Sin `DATABASE_URL` se usa una base temporal en memoria para desarrollo. Para
persistencia local, define una URL PostgreSQL antes de ejecutar `npm start`.

## Actualizar el catálogo

El archivo fuente está en:

```text
catalog/TABLEROS_PARA_COTIZADOR.xlsx
```

Para regenerar `src/catalog.generated.js`:

```bash
npm run catalog:import
```

La importación usa la hoja `Sheet0`, “Precio base de venta neto” como precio del
cotizador y conserva precio mínimo y precio de compra como información visible
solo para el Administrador.

## Imágenes de materiales

Agrega archivos JPG en `public/materiales/`. El nombre esperado es el código del
producto en minúsculas, sin tildes ni símbolos, usando guiones. Ejemplo:

```text
Código: 62-EGGER-1502
Archivo: public/materiales/62-egger-1502.jpg
```

Mientras una imagen no exista, se muestra una muestra de color y la aplicación
continúa funcionando.

## Formato Excel de piezas

La aplicación descarga una plantilla y reconoce:

```text
codigo_opcional
nombre_o_codigo_del_elemento
largo
ancho
cantidad
veta
notas
```

Si el código viene vacío, se genera automáticamente como `P-001`, `P-002`, etc.

## Verificación

```bash
npm test
npm run build
```

Las pruebas cubren catálogo, autenticación, permisos, tarifas, descuentos,
medidas de corte y modos de optimización.
