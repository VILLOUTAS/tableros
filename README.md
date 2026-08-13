# Cotizador online — Casa Diseño Multiespacio

Versión 3.3.2 del cotizador y optimizador de cortes. Incluye acceso seguro con
usuarios diferenciados, base PostgreSQL, catálogo completo importado desde
Excel y persistencia de proyectos.

## Funciones incluidas

- Catálogo general independiente, accesible antes o durante una cotización,
  con tableros y tapacantos ordenados por categoría, imágenes, colores,
  formatos y precios netos.
- Gestión de catálogo exclusiva para Administradores: permite crear y editar
  tableros y tapacantos, categorías, medidas, precios, códigos e imágenes sin
  modificar GitHub. Cada edición genera una revisión nueva para que los
  proyectos existentes conserven la ficha anterior del producto.
- Acceso Visitante sin cuenta: solicita nombre, correo, teléfono y ciudad,
  permite consultar el catálogo y enviar una cotización, pero bloquea la
  descarga PDF. El Visitante elige su ejecutivo; Administración y el Comercial
  reciben el proyecto, una alerta interna y el correo configurado.
- Colaboración comercial: el responsable o Administración puede sumar otros
  Comerciales para ayudar a preparar una cotización, manteniendo identificado
  al ejecutivo principal.
- Carga masiva disponible desde Proyecto y Piezas. El Excel estándar se valida
  con progreso visible, diagnóstico por fila y confirmación antes de incorporar
  el lote. También se pueden pegar filas copiadas desde cualquier Excel,
  asignando una vez el tablero, tapacanto y lados del grupo.
- Eliminación protegida exclusiva de Administradores. La cotización desaparece
  de los paneles, pero queda preservada en la base para auditoría.
- Autoregistro Cliente con inicio de sesión automático y campos ampliados para
  razón social, RUT, dirección de facturación, giro y dirección del proyecto.
- Flujo completo: Cotización, Facturación, Facturado y pagado, Producción,
  Despacho y Entregado.
- Comercial gestiona sus proyectos y los asignados hasta Facturado y pagado;
  desde ese punto conserva consulta detallada de producción.
- Producción visualiza todos los estados y solo puede intervenir desde
  Facturado y pagado hasta Entregado. Administración mantiene edición total.
- CRM con las seis columnas del flujo, incluyendo oportunidades previas a
  fábrica y registro en tiempo real de pedidos entregados.
- Cada hoja de corte informa ML de corte, ML total de enchape y ML por tipo de
  tapacanto. Las leyendas se distribuyen en líneas separadas y se incluyen
  espacios manuscritos para Cortador, Enchapador, Supervisor y Despachador.
- Logo oficial Casa Diseño Multiespacio.
- Inicio de sesión real: claves cifradas con bcrypt, cookie `HttpOnly`, token
  CSRF y bloqueo temporal por intentos repetidos.
- Perfiles Administrador, Comercial, Producción y Cliente.
- Autoregistro de clientes con nombre, correo y teléfono obligatorios; empresa,
  RUT y ubicación opcionales. Cada Cliente ve únicamente sus proyectos.
- Los Clientes asignan su cotización a un Comercial activo, que la recibe en
  su panel y puede enviarla a Producción después de confirmar el pago.
- Creación masiva de hasta 200 usuarios desde una plantilla Excel, con
  validación previa de correo, perfil, estado, clave y duplicados.
- Claves iniciales temporales: cada usuario nuevo debe reemplazarlas en su
  primer ingreso antes de acceder a proyectos.
- Matriz de permisos visible en el módulo Usuarios y cambio de perfil reservado
  al Administrador.
- Proyectos con nombre de cliente como único dato obligatorio.
- Flujo de estados Cotización, Facturación, Facturado y pagado, Producción,
  Despacho y Entregado.
- Administrador, Comercial, Cliente y Visitante pueden originar Cotizaciones.
  Comercial confirma Facturación y pago; Producción continúa desde la orden
  pagada hasta su entrega.
- Administración puede editar todo. Producción consulta las etapas previas e
  interviene desde Facturado y pagado; Comercial conserva consulta detallada
  después de liberar la orden.
- 147 tableros y 121 tapacantos del Excel entregado, incluyendo MASISA Blanco
  Lisa de 15 y 18 mm en formato 2500 × 1830 mm.
- Selección progresiva por categoría y búsqueda por código, nombre o marca.
- Selección de múltiples tipos de tablero dentro de un mismo proyecto.
- Asignación de cada pieza a uno de los tableros seleccionados, tanto en el
  ingreso manual como en la importación Excel.
- Espacio para imágenes de materiales.
- Código de pieza asignado recién al generar la optimización/hoja de corte y
  nombre del elemento opcional.
- Edición directa de largo, ancho y cantidad desde el listado de piezas, con
  validación inmediata contra las dimensiones del tablero y la veta.
- Validación manual, Excel y servidor para impedir piezas mayores que el
  tablero seleccionado, considerando el sentido de la veta.
- Importación Excel con lectura visible, vista previa y confirmación explícita:
  muestra las líneas, unidades y observaciones antes de incorporar el lote.
- Pegado directo de filas copiadas desde otro Excel, asignando una sola vez el
  tablero, tapacanto y lados L1/L2/A1/A2 para cada lote por color.
- Detección automática de la hoja de cortes aunque haya sido renombrada, y de
  encabezados aunque estén desplazados por títulos o instrucciones.
- Diagnóstico de importación por fila y campo: informa filas válidas,
  rechazadas y vacías, explica cada error y permite descargar un CSV de
  correcciones.
- Los tableros utilizados en el Excel se buscan en el catálogo completo y se
  agregan automáticamente al proyecto, aunque no estuvieran seleccionados en
  la pantalla Material.
- Plantilla Excel dinámica incluida como archivo descargable directo, con los
  147 tableros y 121 tapacantos del catálogo, filtros progresivos,
  autocompletado y 499 filas preparadas.
- Cada fila del Excel puede utilizar un tablero distinto; la validación
  automática indica si la pieza cabe en la plancha según la veta.
- Selección de tapacantos independientes para L1, L2, A1 y A2 mediante filtros
  por tipo y producto; la asignación se incorpora automáticamente al proyecto.
- Asignación rápida de los cuatro lados por todas las piezas, por tablero o por
  un conjunto de piezas marcadas.
- Disposición gráfica de lados: L1 superior, L2 inferior, A1 izquierdo y A2
  derecho.
- Optimización longitudinal prioritaria o sin prioridad de eje.
- Optimización, planos de corte y subtotales separados por cada tablero.
- Listado específico en la misma hoja de cada plano de corte, con todas las
  piezas y retazos que se obtienen de esa placa.
- Corte cobrado automáticamente por tablero: Melamina 15/18 mm a $7.500 neto y
  EGR/u otros tableros a $10.500 neto.
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
  evitar que los tapacantos oculten sus valores; tipografía ampliada para
  impresión y nombres completos de tapacantos distribuidos en varias líneas.
- Navegación directa entre las cinco secciones sin recorrerlas una por una.
- Guardado de proyectos disponible para Administrador, Comercial, Producción
  y Cliente, respetando la visibilidad y estados autorizados para cada perfil.
- Centro de notificaciones para Administradores, Comerciales y Producción.
- Al marcar una orden como Facturada y pagada, el Comercial deja de modificarla
  y los usuarios de Producción reciben una alerta visible.
- Aviso por correo de nuevas
  cotizaciones a `contacto@cdchile.cl` y a los Administradores activos, cuando
  el servicio de correo está configurado.
- PDF de fabricación con una hoja inseparable por placa: plano, lista completa
  de piezas y retazos, y casillas impresas para Corte, Enchape y
  Supervisión/Despacho.
- Retazos reutilizables codificados en el plano y en los listados.
- Etiquetas térmicas PDF de 50 × 70 mm para Administrador y Producción.
- Catálogo visual V3 con 273 imágenes incorporadas desde un único ZIP. Render
  las carga automáticamente en PostgreSQL sin sobrescribir imágenes
  personalizadas; el Administrador también puede importar otro ZIP.
- CRM de fábrica para Administrador y Producción con fechas de ejecución y
  entrega, las seis columnas del flujo y reportes diarios, semanales y
  mensuales de carga, tableros entregados y metros lineales enchapados.

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

### Actualizar desde V3.0.x, V3.1.0 o V3.2.0 sin perder información

Usa el mismo Web Service y la misma variable `DATABASE_URL`. Al iniciar, la
V3.3.0 agrega solamente la tabla `catalog_product_revisions` para administrar
el catálogo con historial. No elimina ni reemplaza tablas, usuarios, proyectos,
imágenes, cotizaciones ni estados existentes. Los productos editados conservan
su revisión anterior para las cotizaciones que ya los utilizaban.

La corrección V3.3.1 ordena la migración de `deleted_at` antes de crear su
índice. Esto permite actualizar bases provenientes de versiones antiguas sin
borrar ni reemplazar ningún registro.

La V3.3.2 modifica únicamente el flujo de ingreso masivo de piezas en el
cliente web. No cambia el esquema de base de datos ni elimina usuarios,
proyectos, estados, cotizaciones, imágenes o revisiones del catálogo.

Antes de desplegar se recomienda generar un respaldo de PostgreSQL. No crees
otra base de datos ni reemplaces `DATABASE_URL`, porque eso haría que la
aplicación aparezca vacía aunque la información anterior siga en la otra base.

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

## Gestionar el catálogo

La opción recomendada está en **Gestión de catálogo**, visible únicamente para
el perfil Administrador. Desde allí se pueden crear o editar tableros y
tapacantos y cargar una imagen individual. Los cambios quedan guardados en
PostgreSQL y no requieren editar GitHub.

El Excel sigue disponible como catálogo base para actualizaciones masivas:

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

## Imágenes de tableros y tapacantos

No es necesario subir más de 200 archivos a GitHub. En **Usuarios → Imágenes
masivas de productos**, el Administrador puede cargar un único ZIP con hasta
500 imágenes JPG, PNG o WEBP. Cada archivo debe llamarse como el código del
producto. Ejemplo:

```text
62-EGGER-1502.jpg
70-EGR-0019.webp
```

Las imágenes quedan guardadas en PostgreSQL y sobreviven a los despliegues de
Render. La carpeta `public/materiales/` continúa funcionando como respaldo.

## Plantilla dinámica Excel de piezas

La aplicación descarga una plantilla única para ingresar piezas de diferentes
tableros. `tipo_tablero_filtro` es opcional: si queda vacío,
`tablero_seleccion` muestra los 145 productos; al escoger una categoría, la
lista se limita a los productos de ese tipo. Las antiguas columnas de
autocompletado E–F–G ya no se muestran; largo, ancho y espesor de plancha se
calculan al final de la fila.

Cada lado puede recibir un tapacanto diferente. El tipo funciona como filtro y
el producto seleccionado se importa directamente:

```text
L1 = superior
L2 = inferior
A1 = izquierdo
A2 = derecho
```

Si el código viene vacío, se genera automáticamente como `P-001`, `P-002`, etc.
al crear la optimización/hoja de corte.
Las filas dinámicas sin datos se ignoran durante la importación. Antes de subir
el Excel, deben estar seleccionados en el paso Material todos los tableros
utilizados en sus filas.
El nombre del elemento también puede quedar vacío. Las selecciones de
tapacantos permanecen opcionales; un lado sin producto seleccionado se importa
sin tapacanto y puede completarse posteriormente en el paso Tapacantos.

## Verificación

```bash
npm test
npm run build
```

Las pruebas cubren catálogo, autenticación, permisos, notificaciones, tarifas,
descuentos, límites de piezas, medidas de corte y modos de optimización.

## Integración de pago (fase posterior)

El carrito y pago en línea con Mercado Pago o Transbank queda definido como una
fase posterior. No se activa en esta versión para evitar mezclar el cierre
operativo de cotización/producción con credenciales y conciliación de pagos.
