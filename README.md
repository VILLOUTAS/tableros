# Cotizador online — Casa Diseño Multiespacio

Versión 3.4.1 del cotizador y optimizador de cortes. Incluye acceso seguro con
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
- Ingreso de piezas en el paso 2: después de escoger el tablero se puede digitar
  manualmente o pegar directamente un bloque copiado desde cualquier Excel.
  Cada lote permite definir una vez el tablero, tapacanto y lados L1/L2/A1/A2.
- Dos modos de medida: “terminada” como opción predeterminada, que descuenta el
  tapacanto automáticamente, y “de corte ya descontada” como opción avanzada.
- Eliminación protegida exclusiva de Administradores. La cotización desaparece
  de los paneles, pero queda preservada en la base para auditoría.
- Autoregistro Cliente con inicio de sesión automático y campos ampliados para
  razón social, RUT, dirección de facturación, giro y dirección del proyecto.
- Flujo completo: Cotización, Facturación, Facturado y pagado, Producción,
  Despacho y Entregado.
- Número de factura obligatorio al liberar un pedido como Facturado y pagado,
  y número de guía obligatorio para marcarlo como Entregado. Ambos se muestran
  en el CRM y en los documentos de producción.
- Comercial gestiona sus proyectos y los asignados hasta Facturado y pagado;
  desde ese punto conserva consulta detallada de producción.
- Producción visualiza todos los estados y solo puede intervenir desde
  Facturado y pagado hasta Entregado. Administración mantiene edición total.
- CRM con las seis columnas del flujo, incluyendo oportunidades previas a
  fábrica y registro en tiempo real de pedidos entregados.
- Cada hoja de corte informa ML de corte, ML total de enchape y ML por tipo de
  tapacanto. Las leyendas se distribuyen en líneas separadas y se incluyen
  firmas para Cortador, Enchapador, Supervisor, Despacho y recepción conforme.
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
  ingreso manual como en el pegado masivo.
- Espacio para imágenes de materiales.
- Código de pieza asignado recién al generar la optimización/hoja de corte y
  nombre del elemento opcional.
- Edición directa de largo, ancho y cantidad desde el listado de piezas, con
  validación inmediata contra las dimensiones del tablero y la veta.
- Validación en navegador y servidor para impedir cortes menores que 50 × 50 mm
  o mayores que el tablero seleccionado, considerando el sentido de la veta.
- Pegado directo de filas copiadas desde otro Excel, asignando una sola vez el
  tablero, tapacanto y lados L1/L2/A1/A2 para cada lote por color.
- Vista previa del bloque pegado con filas válidas, unidades y explicación de
  errores antes de incorporar cada lote.
- Asignación rápida de los cuatro lados por todas las piezas, por tablero o por
  un conjunto de piezas marcadas.
- Disposición gráfica de lados: L1 superior, L2 inferior, A1 izquierdo y A2
  derecho.
- Optimización longitudinal prioritaria o sin prioridad de eje.
- Disco nominal de 2 mm y consumo efectivo predeterminado de 3 mm por pasada.
  La hoja muestra gráficamente el ancho consumido y numera la secuencia con
  posiciones acumuladas.
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
- Medidas parciales en los cuatro lados, acumuladas exteriores y cortes
  completos, con tapacantos monocromáticos diferenciados por patrón de línea.
- Interior limpio con código de producción y cotas ampliadas; el nombre y la
  información completa permanecen en el listado legible de la misma hoja.
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
- Hoja A4 apaisada de proporción fija, con márgenes mínimos, plano y listado
  ampliados y una franja horizontal inferior para las cinco firmas.
- Menú lateral y panel de parámetros con desplazamiento independiente, más una
  barra rápida para saltar directamente a cualquier hoja de corte.
- Retazos reutilizables codificados en el plano y en los listados.
- Etiquetas térmicas PDF de 50 × 70 mm para Administrador y Producción.
- Catálogo visual V3 con 273 imágenes incorporadas desde un único ZIP. Render
  las carga automáticamente en PostgreSQL sin sobrescribir imágenes
  personalizadas; el Administrador también puede importar otro ZIP.
- CRM de fábrica para Administrador y Producción con fechas de ejecución y
  entrega, las seis columnas del flujo y reportes diarios, semanales y
  mensuales de carga, tableros entregados y metros lineales enchapados.
- Categoría Neolith visible como “Próximamente”, todavía sin activar su
  optimización para no mezclar reglas de mecanizado con las de tableros.

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

La V3.4.0 mantiene la misma base de datos y no elimina usuarios, proyectos,
estados, cotizaciones, imágenes ni revisiones del catálogo. Los números de
factura y guía se guardan dentro del JSON existente del proyecto, por lo que no
requieren una migración destructiva. Los proyectos antiguos siguen abriendo
aunque todavía no tengan esos documentos.

La corrección V3.4.1 modifica únicamente la presentación del PDF y la
navegación en pantalla. Mantiene la misma base de datos y no altera usuarios,
proyectos, cotizaciones, estados, productos ni imágenes existentes.

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

## Pegado directo desde Excel

En el paso **Material y piezas**, selecciona el tablero, pulsa **Pegar desde
Excel**, copia las celdas del archivo recibido y pégalas en el recuadro. Se
reconocen `Largo`, `Ancho` y `Cantidad`; `Nombre` es opcional. Sin encabezados,
el orden esperado es Nombre, Largo, Ancho y Cantidad.

Para cada lote se selecciona un tapacanto y los lados donde se aplica:

```text
L1 = superior
L2 = inferior
A1 = izquierdo
A2 = derecho
```

El código se genera automáticamente como `P-001`, `P-002`, etc. al crear la
optimización. Para otro color o tapacanto, incorpora el lote y repite el pegado
con la nueva configuración. Ya no es necesario descargar y volver a subir una
plantilla de piezas.

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
