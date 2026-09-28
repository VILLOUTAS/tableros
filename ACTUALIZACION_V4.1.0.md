# Actualización V4.1.0 — Tableros y placas separados

## Cambios operativos

- El paso 1 exige elegir `Tableros · Maderas` o `Placas · Piedras`.
- Una misma cotización no puede mezclar ambos tipos de material.
- El flujo de tableros mantiene rebaje de 10 mm por lado, tapacantos y servicio
  de enchape.
- El flujo de placas no muestra tapacantos. Cobra $75.000 netos por cada placa
  utilizada y permite indicar en L1, L2, A1 y A2 uno de estos valores:
  - Sin servicio adicional / corte bruto.
  - Biselado o Pulido: $12.500 netos por metro lineal.
  - Corte 45°: $7.500 netos por metro lineal.

## Formatos Neolith corregidos

| Espesor | Placa de fábrica | Despunte | Superficie útil |
| --- | --- | --- | --- |
| 12 mm | 3260 × 1660 mm | 30 mm por lado | 3200 × 1600 mm |
| 6 mm | 3260 × 1560 mm | 30 mm por lado | 3200 × 1500 mm |

El consumo del disco se mantiene en 3 mm por cada pasada interior.

## Pegado directo desde Excel

- Largo, Ancho y Cantidad continúan siendo los únicos campos obligatorios.
- La pantalla detecta y permite mapear Nombre, Veta, L1, L2, A1 y A2 aunque el
  cliente use otros encabezados u orden de columnas.
- Si el Excel no incluye esos datos, se puede definir una veta predeterminada
  y escoger un tapacanto diferente para cada lado.
- En el flujo de placas, los cuatro selectores corresponden a acabados, no a
  tapacantos.
- Antes de incorporar el lote se puede corregir la veta y los cuatro lados de
  cada fila individualmente.

## Protección de información existente

- No se elimina ni reemplaza ninguna tabla, usuario, cotización, proyecto,
  estado, imagen o revisión del catálogo.
- `workType` se guarda dentro del JSON existente de cada proyecto, por lo que
  no requiere una migración destructiva de PostgreSQL.
- Los proyectos V3 permanecen en modo `legacy-v3`.
- Los proyectos V4.0 conservan sus dimensiones Neolith anteriores y cualquier
  valorización histórica. Solo adoptan las reglas V4.1 cuando el usuario pulsa
  expresamente `Migrar a V4.1` y vuelve a guardar.
- Para actualizar en Render se debe mantener exactamente la misma
  `DATABASE_URL`.

## Verificación antes de publicar

```bash
npm ci --include=dev
npm test
npm run build
```

Luego prueba una cotización de tableros y otra de Neolith antes de reemplazar
el acceso de producción.
