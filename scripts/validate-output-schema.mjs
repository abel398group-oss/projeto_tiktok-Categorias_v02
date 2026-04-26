/**
 * Valida `output/dados_produtos.json` e `output/dados_lojas.json` contra `schemas/*.schema.json`.
 * Uso: npm run validate:schemas (a partir da raiz do repositório).
 */
import { readFile, access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const pairs = [
  {
    name: "dados_produtos",
    dataPath: path.join(root, "output", "dados_produtos.json"),
    schemaPath: path.join(root, "schemas", "dados_produtos.schema.json")
  },
  {
    name: "dados_lojas",
    dataPath: path.join(root, "output", "dados_lojas.json"),
    schemaPath: path.join(root, "schemas", "dados_lojas.schema.json")
  }
];

async function fileExists(p) {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function printErrors(validate, label) {
  const err = validate.errors;
  if (!err?.length) {
    return;
  }
  for (const e of err) {
    const where = (e.instancePath || "/") + (e.keyword === "required" && e.params?.missingProperty
      ? ` (missing: ${e.params.missingProperty})`
      : "");
    console.error(`  [${label}] ${e.keyword} ${where}: ${e.message}`);
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
let hadMissingFile = false;
let hadInvalid = false;

for (const { name, dataPath, schemaPath } of pairs) {
  if (!(await fileExists(dataPath))) {
    console.error(
      `Ficheiro em falta: ${path.relative(root, dataPath)}. Gere a coleta (ex.: npm run coleta) ou copie os JSON para output/ antes de validar.`
    );
    hadMissingFile = true;
    continue;
  }
  if (!(await fileExists(schemaPath))) {
    console.error(`Schema em falta: ${path.relative(root, schemaPath)}`);
    hadMissingFile = true;
    continue;
  }
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const data = JSON.parse(await readFile(dataPath, "utf8"));
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    console.error(`Validação JSON Schema falhou: ${name}`);
    printErrors(validate, name);
    hadInvalid = true;
  } else {
    console.log(`OK: ${name} (${path.relative(root, dataPath)})`);
  }
}

if (hadMissingFile) {
  process.exit(1);
}
if (hadInvalid) {
  process.exit(1);
}

if (!hadMissingFile && !hadInvalid) {
  console.log("Validação concluída: todos os ficheiros de output obedecem ao schema.");
}
