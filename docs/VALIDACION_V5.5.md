# Validación V5.5.0

Comprobación local realizada el 4 de octubre de 2026, con datos ficticios.

## Resultados

- **70 pruebas automatizadas aprobadas**, sin fallos.
- **Compilación Vite aprobada**: 310 módulos. La advertencia de tamaño del paquete cliente sigue presente por las herramientas de Excel/PDF; no impide compilar.
- Prueba real de navegador con inicio de sesión local y datos sintéticos: pie de autoría, panel, CRM/calendarios, despacho confirmado, operadores/tareas, creación y guardado de cotización solo de servicios, descarga PDF, cambio de disco predeterminado y edición de 68 rutas. Sin errores JavaScript de página.
- Revisión de capturas de escritorio y móvil. El calendario usa desplazamiento horizontal cuando no cabe en una pantalla pequeña.
- PDF de servicios renderizado y revisado visualmente, con cantidad por placa, neto, IVA y total.

## Cobertura relevante

| Área | Comprobación |
|---|---|
| Catálogo | 868 SKU únicos, familias, códigos Carbon/Cinnabar, Lamitech Noce y Dove, espesores de tapacanto, corte Stylelite y ranurado por placa |
| Migración | Esquema PostgreSQL compatible mediante PGlite, migración aditiva/repetible y datos históricos intactos; el primer inicio no duplica las semillas |
| Historial | Resumen y resultado de revisión anterior conservados; edición descriptiva no recalcula; edición técnica archiva revisión |
| Optimización | Motores 5.5/5.1/5.0, consumo de disco configurable y factores de tapacanto 105%/102%/100% |
| Despacho | Peso de tableros completos y tapacanto; precisión de tarifa original, factor 1,20, máximo descuento, mínimo local/nacional y peso desconocido pendiente |
| Agenda | Comercial sugiere, Logística confirma, control de versiones e importe facturado protegido incluso ante cambio de descuento |
| Salice | Base por acabado/serie, placa metálica, acoplamiento correcto y configurabilidad de mecanismos especiales; complementos no se reutilizan dos veces |
| Operadores | Jornada/colación, viernes proporcional, demanda distribuida, límites de asignación y minutos, cierre restringido y espera de toda la producción obligatoria |
| Pagos/costos | Tarifas históricas congeladas, faltantes explícitos, consolidación por proyecto y ocultación de importes a perfiles sin permisos |
| Roles | Comercial propio/asignado; Operador/Instalador asignado; consultas sin edición de Supervisor/Finanzas; bloqueo de parámetros y protección de datos para Cliente/Visitante |
| Integridad | Protección de concurrencia por versión y operaciones transaccionales |

## Evidencia incluida

- `VISTA_CRM_V5.5.png`
- `VISTA_DESPACHOS_V5.5.png`
- `VISTA_SERVICIOS_V5.5.png`
- `EJEMPLO_SERVICIOS_V5.5.pdf`

Las capturas y el PDF son ejemplos; no pertenecen a proyectos productivos. Los archivos de validación anteriores se conservan y están identificados con su versión.

## Alcance y pendientes

No se ha accedido a la base productiva ni se ha realizado un despliegue en GitHub/Render. La conexión disponible a `VILLOUTAS/tableros` devuelve `push: false`. La compatibilidad está verificada en pruebas sintéticas; antes del despliegue, ensaya con una copia de tu base y conserva un respaldo.

El catálogo tiene 12 formatos/espesores, 34 composiciones especiales Salice, tres precios y 212 pesos individuales por completar. Están detallados en `PENDIENTES_CATALOGO_V5.5.csv`; un producto puede tener varios pendientes. Se bloquea únicamente la operación que depende del dato faltante. Administración puede completarlos sin modificar el código.

Los rendimientos y pagos se calculan por persona. No se incluyen feriados, vacaciones o licencias automáticos, transferencias de dinero ni liquidaciones legales de sueldo. Los informes de costos requieren registrar todos los consumos, gastos y tarifas para representar el costo final del proyecto. El aviso de autoría incorporado no realiza por sí mismo una inscripción de software ni una patente.

## Repetir las comprobaciones

```bash
npm ci --include=dev
npm test
npm run build
```

La configuración de Render incluida ejecuta estas pruebas antes de compilar y comenzar el servicio.
