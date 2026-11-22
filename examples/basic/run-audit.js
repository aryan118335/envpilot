// examples/basic/run-audit.js
import { scanProject } from "envpilot";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Running EnvPilot Programmatic Audit on example project...\n");

  const report = await scanProject(__dirname);

  console.log("Audit Result:");
  console.log("-------------");
  console.log("Used in code      :", report.used);
  console.log("Declared in env   :", report.declared);
  console.log("Missing in env    :", report.missingInEnv);
  console.log("Unused in env     :", report.unusedInEnv);
  console.log("Duplicates in env :", report.duplicates);
}

main().catch((err) => {
  console.error("Error during audit:", err);
  process.exit(1);
});
