# Casa Diseño · Optimizador V5.0.0

Actualización de V4.1 para el repositorio y servicio existentes. Mantiene los
pedidos, usuarios, fotografías y cotizaciones en la misma base PostgreSQL.
**Para instalar, lee `ACTUALIZACION_V5.0.0.md`.**

## Interfaz y módulos

- Panel general con accesos a Tableros, Placas y Despachos, selección de mes,
  venta neta por comercial/familia y cantidades producidas.
- Navegación superior general; barra lateral solo dentro de una cotización.
- Un proyecto contiene cotizaciones independientes de Tableros y Placas.
  En Proyectos → + Cotización se agrega otra al mismo proyecto.
- Próximamente: Herrajes, Armado, Amoblamiento, Remodelación, Producción,
  Instalaciones y Otros. Las fichas de herrajes ya se pueden administrar.
- La agenda y los estados de producción existentes se conservan en el menú
  de usuario → Agenda de pedidos, mientras se prepara el módulo ampliado.

## Historial protegido

Consultar proyectos o cambiar nombre, cliente, dirección y comentarios no
recalcula la cotización. Cambiar medidas, cantidades, veta, materiales,
tapacantos, acabados o condiciones de cálculo genera una revisión al guardar.
El historial conserva la anterior y permite descargar su PDF.

Cada cálculo V5 guarda precios, parámetros, planos y resultados completos.
Un cambio posterior del catálogo no altera esas cotizaciones. La versión de
fila impide que dos usuarios sobrescriban sus cambios al guardar a la vez.

Los proyectos antiguos sin planos almacenados se representan con su motor
histórico V3/V4 y conservan el resumen monetario guardado. No es posible
recuperar una imagen de PDF que nunca fue almacenada: se reconstruye con los
datos disponibles y las reglas históricas, sin aplicar el rebaje V5.

La migración no borra ni vacía tablas de pedidos o usuarios, ni ejecuta
optimizaciones masivas. La antigua operación de archivo lógico queda
restringida al superadministrador, sin botón de eliminación en el listado V5.

## Excel y pegado directo

Selecciona primero los materiales. Después carga XLS, XLSX o CSV, o pega las
celdas en Material y piezas. El archivo original no se modifica.

1. Selecciona hoja, encabezados y rango de filas. Para varios bloques
   horizontales, incorpora uno y cambia las columnas para el siguiente.
2. Elige mm o cm para todo el bloque. Internamente se trabaja en mm; las
   cantidades y códigos no se multiplican. Puedes transponer filas/columnas.
3. Asigna las columnas de nombre, cantidad, Largo, Ancho, material, veta, tipo
   y cuatro lados. No se exige el orden de una plantilla.
4. Define L/T/SV, X u otros símbolos y códigos 1/2/3/4… según el cliente.
   Se admiten más de cuatro tapacantos. Los números en columnas de lados pueden
   interpretarse como longitudes marcadas activando la opción correspondiente.
5. Revisa la vista previa y corrige dimensiones, cantidad, veta o cada lado.
   Los errores bloquean la incorporación del bloque: corrige el rango o usa
   Omitir filas para excluir títulos, totales o piezas que no correspondan.
6. Guarda la interpretación para reutilizarla en este navegador. Se guardan
   columnas, símbolos y unidades; no se guarda el archivo del cliente.

| Campo | Significado |
|---|---|
| Largo | Eje L ingresado; puede ser menor que Ancho |
| Ancho | Eje A ingresado |
| Longitudinal | Veta paralela al Largo |
| Transversal | Veta paralela al Ancho |
| Sin veta | Permite ambas orientaciones |
| L1 / L2 | Superior / inferior, paralelos a Largo |
| A1 / A2 | Izquierdo / derecho, paralelos a Ancho |

Tableros admite tapacanto por lado. Placas admite Lineal, Biselado/Pulido o 45°.
Los códigos T1, T2… son únicos dentro de cada optimización y se mantienen en
todas sus hojas. En columnas agrupadas se define si un símbolo significa uno
o dos lados del eje; no se presupone el significado de un asterisco.

Los archivos deben tener celdas tabulares legibles. Archivos cifrados,
imágenes, fórmulas sin resultado guardado y varios datos dentro de una misma
celda requieren preparación. Límites: 12 MB por archivo, 20.000 filas y 300
columnas con contenido; por cotización, 3.000 filas de piezas y 10.000 unidades.

## Fabricación y precios

| Concepto | Regla V5 |
|---|---|
| Tableros | Rebaje previo de 10 mm por lado; consumo de disco 3 mm |
| Neolith 12 mm | Fábrica 3260 × 1660; útil 3200 × 1600 mm |
| Neolith 6 mm | Fábrica 3260 × 1560; útil 3200 × 1500 mm |
| Neolith | Reborde de 30 mm por lado; consumo 3 mm; color libre |
| Corte piedra | $75.000 netos por placa utilizada |
| Biselado / Pulido | $12.500 netos/ml del lado seleccionado |
| 45° | $7.500 netos/ml del lado seleccionado |

Piedras valoriza los servicios, sin venta de la placa ni tapacantos. Otras
piedras requieren una ficha con su formato de fábrica. El PDF incluye resumen,
listado con veta y lados y las hojas de corte.

Los descuentos se validan en el servidor: máximo 50%, limitado por el mayor
entre costo y mínimo de venta de cada producto/servicio. Si el precio de lista
es inferior a ese límite, se exige corregirlo. Visitas y clientes cotizan sin
descuento. IVA: 19%. Los precios de servicios y fletes son netos.

## Catálogo y roles

Incluye la taxonomía de Aglomerados, MDF, Otros Tableros, Neolith, Otras Placas,
Bisagras, Guías Correderas y Sistemas de Elevación, con sus subcategorías.
Las fichas incluyen nombre, código, proveedor, formato, espesor, precio,
stock, color, foto y estado. El stock es informativo: no se descuentan
existencias ni se registran movimientos de bodega en esta versión.

Se agregan 18 variantes MDF delgado una cara con los formatos, espesores y
colores solicitados. Quedan **inactivas**, con stock no informado, hasta completar
proveedor y precios. No se inventan valores comerciales.

| Perfil | Facultades |
|---|---|
| Superadministrador | Todos los accesos, configuración y usuarios |
| Administrador | Proyectos, categorías, productos, venta y fotografías |
| Comercial | Cotizaciones propias/asignadas, colaboradores y descuentos limitados |
| Producción | Proyectos, fabricación, productos y fotos; no cambia precios/costos |
| Instalación | Rol preparado para el próximo módulo, sin administración |
| Logística | Proyectos, despachos y entrega; no modifica cálculos |
| Supervisor | Consulta de proyectos e informes |
| Finanzas | Proyectos, costos/mínimos e informes de venta neta |
| Cliente | Sus cotizaciones, documentos y seguimiento |
| Visita | Catálogo y cotización sin login, costos ni descuentos |

Los roles internos son acumulables. Cliente se mantiene exclusivo. Compra y
mínimos solo se envían al navegador de Finanzas y Superadministrador. Un
Administrador puede combinarse con Finanzas si necesita ese acceso. Los
productos nuevos creados por Producción quedan inactivos hasta valorizarlos.

La cuenta `edmundo@villoutas.cl` se promueve automáticamente si ya era
administradora. Para otro caso, consulta la guía de actualización.

## Despachos

Origen: **Casa Diseño · Bodega — 53GC+2J, 4030000 Concepción, Bío Bío**.
Se conserva el enlace de Maps suministrado como referencia de ubicación.

| Familia | Neto de ida |
|---|---|
| Tableros | $10.000 + $100 × km |
| Placas | $20.000 + $100 × km |
| Herrajes | $7.500 + $50 × km |
| Otros | $200 × km |

En envíos mixtos se toma el **mayor valor final**, no la suma. Se exige calle y
comuna. El superadministrador carga kilómetros por carretera desde la bodega
al centro de cada comuna y una referencia de verificación. La tabla parte
vacía: sin distancia verificada, queda **Por cotizar**.

No requiere API pagada ni autocompletado. Los enlaces abren Maps para comprobar
origen/destino; no geocodifican ni calculan automáticamente distancias. Cada
flete guarda su tarifa y no se recalcula después de facturado.

## Criterios del panel

Ventas: primer ingreso a **Facturado y pagado**, configurable a Facturación.
Se guarda el importe y comercial de ese hito. Familias operativas: Tableros,
Placas y Despachos. Los fletes se suman una vez al registrar factura y fecha.

Producción: primer ingreso a **Despacho**, conservando el conteo al llegar a
Entregado. Se registran tableros/placas utilizados y metros instalados o
terminados. Una revisión posterior no vuelve a sumar producción; un trabajo
adicional se ingresa como otra cotización.

Los históricos sin fecha del hito se muestran como pendientes de información
y se excluyen del mes; no se usa la última edición para inventar su fecha.
El mes usa `America/Santiago`. Los comerciales ven sus proyectos accesibles.
Los informes son de gestión, no un libro contable ni facturación tributaria.

## Desarrollo y validación

Node.js 24, Express, PostgreSQL y Vite. SheetJS 0.20.3 se incluye en `vendor/`.

```bash
npm ci --include=dev
npm test
npm run build
npm start
```

Sin `DATABASE_URL`, el modo local usa memoria temporal para pruebas. En
producción PostgreSQL es obligatorio. La migración SQL se prueba con PostgreSQL
embebido (PGlite) y registros de ensayo, sin acceder a la base productiva.
Consulta `docs/VALIDACION_V5.md`. Los manuales anteriores están en
`docs/historial/`; para instalar V5 rige la guía nueva.
