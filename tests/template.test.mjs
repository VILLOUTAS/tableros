import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readSheet } from "read-excel-file/node";

const templatePath = fileURLToPath(
  new URL("../public/Plantilla_Piezas_Casa_Diseno.xlsx", import.meta.url),
);
const usersTemplatePath = fileURLToPath(
  new URL("../public/Plantilla_Usuarios_Casa_Diseno.xlsx", import.meta.url),
);

test("incluye una plantilla Excel descargable y compatible con la importación", async () => {
  assert.equal(existsSync(templatePath), true);
  const rows = await readSheet(templatePath);
  assert.deepEqual(rows[0], [
    "codigo_opcional",
    "nombre_elemento_opcional",
    "tipo_tablero_filtro",
    "tablero_seleccion",
    "largo",
    "ancho",
    "cantidad",
    "veta",
    "notas",
    "L1_tipo_tapacanto",
    "L1_tapacanto",
    "L2_tipo_tapacanto",
    "L2_tapacanto",
    "A1_tipo_tapacanto",
    "A1_tapacanto",
    "A2_tipo_tapacanto",
    "A2_tapacanto",
    "largo_plancha_auto",
    "ancho_plancha_auto",
    "espesor_mm_auto",
    "validacion_automatica",
    "fila_dinamica",
  ]);
  assert.equal(rows.length, 500);
  assert.equal(rows[1][21], 1);
  assert.equal(rows[499][21], 499);
});

test("incluye una plantilla Excel de usuarios para la carga masiva", async () => {
  assert.equal(existsSync(usersTemplatePath), true);
  const rows = await readSheet(usersTemplatePath);
  assert.deepEqual(rows[0], [
    "nombre_completo",
    "correo",
    "perfil",
    "cliente_empresa",
    "clave_temporal",
    "activo",
  ]);
  assert.equal(rows[1][0], "Juan Pérez");
  assert.equal(rows[1][2], "comercial");
  assert.equal(rows[2][2], "produccion");
  assert.equal(rows[3][2], "cliente");
});
