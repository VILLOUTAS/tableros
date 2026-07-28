# Cotizador online — Casa Diseño Multiespacio

Versión 2.4.0 del cotizador y optimizador de cortes. Incluye acceso seguro con
usuarios diferenciados, base PostgreSQL, catálogo completo importado desde
Excel y persistencia de proyectos.

## Funciones incluidas

- Logo oficial Casa Diseño Multiespacio.
- Inicio de sesión real: claves cifradas con bcrypt, cookie `HttpOnly`, token
  CSRF y bloqueo temporal por intentos repetidos.
- Perfiles Administrador, Comercial, Producción y Cliente.
- Creación masiva de hasta 200 usuarios desde una plantilla Excel, con
  validación previa de correo, perfil, estado, clave y duplicados.
- Claves iniciales temporales: cada usuario nuevo debe reemplazarlas en su
  primer ingreso antes de acceder a proyectos.
- Matriz de permisos visible en el módulo Usuarios y cambio de perfil reservado
  al Administrador.
- Proyectos con nombre de cliente como único dato obligatorio.
- Estados Cotización, Venta y Producción.
- 145 tableros y 121 tapacantos del Excel entregado.
- Selección progresiva por categoría y búsqueda por código, nombre o marca.
- Selección de múltiples tipos de tablero dentro de un mismo proyecto.
- Asignación de cada pieza a uno de los tableros seleccionados, tanto en el
  ingreso manual como en la importación Excel.
- Espacio para imágenes de materiales.
- Código de pieza autogenerado y nombre del elemento opcional.
- Edición directa de largo, ancho y cantidad desde el listado de piezas, con
  validación inmediata contra las dimensiones del tablero y la veta.
- Validación manual, Excel y servidor para impedir piezas mayores que el
  tablero seleccionado, considerando el sentido de la veta.
- Importación Excel de piezas con revisión previa.
- Plantilla Excel incluida como archivo descargable directo, sin generación
  dinámica en el navegador.
- Optimización longitudinal prioritaria o sin prioridad de eje.
- Optimización, planos de corte y subtotales separados por cada tablero.
- Listado general de piezas optimizadas con medida terminada, medida de corte,
  cantidad solicitada, cantidad optimizada y placas asignadas.
- Listado específico en cada hoja de corte con las piezas que se fabrican desde
  esa placa.
- Corte cobrado por tablero.
- Servicio de tapacanto por metro lineal: 0,4 mm $500; 1,0 mm $600;
  1,5 mm $700; 2,0 mm $850.
- Descuentos independientes para tableros, tapacantos y servicios.
- Plano monocromático con proyecto, cliente, cotización, estado, responsable,
  material y número de placa.
- Medidas parciales en los cuatro lados, acumuladas exteriores, veta y cortes
  completos, con tapacantos diferenciados por grosor y patrón de línea.
- Identificación de cada tapacanto mediante código T1/T2/T3, color de alto
  contraste, patrón propio y trazos paralelos cuando dos piezas contiguas
  llevan terminaciones distintas.
- Cotas interiores desplazadas hacia el centro y con respaldo blanco para
  evitar que los tapacantos oculten sus valores.
- Guardado de proyectos disponible para Administrador, Comercial, Producción
  y Cliente, respetando la visibilidad y estados autorizados para cada perfil.
- Centro de notificaciones para Administradores y aviso por correo de nuevas
  cotizaciones a `contacto@cdchile.cl` y a los Administradores activos, cuando
  el servicio de correo está configurado.
- PDF de fabricación con listado general al inicio, plano de cada placa y
  listado completo de piezas asociado a cada hoja de corte.

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
Build Command: npm ci --include=dev && npm run test && npm run build
Start Command: npm start
Health Check Path: /api/health
```

Variables:

```text
NODE_ENV=production
DATABASE_URL=<Internal Database URL de PostgreSQL>
NOTIFICATION_TO_EMAIL=contacto@cdchile.cl
RESEND_API_KEY=<clave API de Resend>
NOTIFICATION_FROM_EMAIL=Casa Diseño <cotizaciones@tu-dominio.cl>
```

## Notificación de nuevas cotizaciones

El aviso interno funciona automáticamente y aparece en **Notificaciones** para
todos los Administradores activos. La aplicación consulta nuevas alertas cada
60 segundos.

Para enviar también un correo, crea una cuenta en Resend, verifica el dominio
del remitente y agrega estas variables en **Render → Web Service → Environment**:

```text
RESEND_API_KEY=<clave API de Resend>
NOTIFICATION_FROM_EMAIL=Casa Diseño <cotizaciones@tu-dominio.cl>
NOTIFICATION_TO_EMAIL=contacto@cdchile.cl
```

Cada nueva cotización se envía a `contacto@cdchile.cl`. También se incluyen los
correos de todos los usuarios Administrador activos y cualquier dirección
adicional configurada en `NOTIFICATION_TO_EMAIL`, separada por coma o punto y
coma. La aplicación elimina destinatarios repetidos.

Si Render muestra `Empty build command; skipping build`, el servicio todavía
está configurado como Static Site y debe reemplazarse por un Web Service.

## Primera apertura

Cuando la tabla de usuarios está vacía, la aplicación muestra “Crear
administrador”. No existe una clave predeterminada. Usa un correo válido y una
clave de al menos 10 caracteres. El Administrador puede crear los demás
usuarios, importar cuentas desde Excel y cambiar perfiles, claves y estado de
las cuentas. Todas las cuentas creadas por el Administrador reciben una clave
temporal que deben reemplazar al iniciar sesión.

## Importación masiva de usuarios

En **Usuarios → Importar usuarios desde Excel**, descarga
`Plantilla_Usuarios_Casa_Diseno.xlsx`. Las columnas son:

```text
nombre_completo
correo
perfil
cliente_empresa
clave_temporal
activo
```

Los valores admitidos en `perfil` son `admin`, `comercial`, `produccion` y
`cliente`. En `activo`, usa `si` o `no`. La clave temporal debe tener al menos
10 caracteres. Antes de crear las cuentas se muestra una revisión de filas
válidas y observaciones.

## Ejecutar localmente

Requiere Node.js 24:

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
nombre_elemento_opcional
codigo_material_opcional
largo
ancho
cantidad
veta
notas
```

Si el código viene vacío, se genera automáticamente como `P-001`, `P-002`, etc.
El nombre del elemento también puede quedar vacío. En
`codigo_material_opcional` puedes escribir el código de uno de los tableros
seleccionados, por ejemplo `62-EGGER-1502`. Si la celda queda vacía, la pieza
se asigna al tablero activo en el formulario.

## Verificación

```bash
npm test
npm run build
```

Las pruebas cubren catálogo, autenticación, permisos, notificaciones, tarifas,
descuentos, límites de piezas, medidas de corte y modos de optimización.
