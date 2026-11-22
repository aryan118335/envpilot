// src/scanner.ts
import * as ts from "typescript";
import fg from "fast-glob";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/** Options for the auditor */
export interface AuditOptions {
  /** Project root directory */
  rootDir?: string;
  /** Glob patterns to ignore */
  ignore?: string[];
  /** Enable strict mode (non‑zero exit on issues) */
  strict?: boolean;
}

/** Serialized report structure */
export interface SerializedAuditReport {
  used: string[];
  declared: string[];
  missingInEnv: string[];
  unusedInEnv: string[];
  duplicates: string[];
}

/** Report structure */
export interface AuditReport {
  used: Set<string>;
  declared: Set<string>;
  missingInEnv: Set<string>;
  unusedInEnv: Set<string>;
  duplicates: Set<string>;
}

/** Read a .env‑style file and return a set of variable names */
function readEnvFile(filePath: string): Set<string> {
  const vars = new Set<string>();
  try {
    const raw = fs.readFileSync(filePath, { encoding: "utf8" });
    const parsed = dotenv.parse(raw);
    for (const key of Object.keys(parsed)) {
      vars.add(key);
    }
    // Detect duplicate keys (dotenv keeps last value)
    const seen = new Set<string>();
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (seen.has(key)) vars.add(key);
      seen.add(key);
    }
  } catch {}
  return vars;
}

/** Walk a source file and collect process.env usages */
function collectEnvUsages(sourceFile: ts.SourceFile, used: Set<string>) {
  function visit(node: ts.Node) {
    // process.env.VAR (dot notation)
    if (ts.isPropertyAccessExpression(node)) {
      const expr = node.expression;
      if (
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        expr.expression.text === "process" &&
        expr.name.text === "env"
      ) {
        used.add(node.name.text);
      }
    }
    // process.env["VAR"] (bracket notation)
    if (ts.isElementAccessExpression(node)) {
      const expr = node.expression;
      if (
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        expr.expression.text === "process" &&
        expr.name.text === "env"
      ) {
        const arg = node.argumentExpression;
        if (ts.isStringLiteral(arg)) {
          used.add(arg.text);
        }
      }
    }
    // const { VAR } = process.env;
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isPropertyAccessExpression(node.initializer)) {
      const init = node.initializer;
      if (
        ts.isIdentifier(init.expression) &&
        init.expression.text === "process" &&
        init.name.text === "env"
      ) {
        const name = node.name;
        if (ts.isObjectBindingPattern(name)) {
          for (const element of name.elements) {
            const propName = element.name;
            if (ts.isIdentifier(propName) || ts.isStringLiteral(propName)) {
              used.add(propName.text);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

/** Main audit function */
export async function auditProject(options: AuditOptions = {}): Promise<AuditReport> {
  const root = options.rootDir ? path.resolve(options.rootDir) : process.cwd();
  if (!fs.existsSync(root)) {
    throw new Error(`Directory not found: ${root}`);
  }
  const ignore = options.ignore ?? ["node_modules/**", "dist/**", "build/**", "coverage/**"];

  const files = await fg(["**/*.{js,jsx,ts,tsx}"], { cwd: root, absolute: true, ignore });
  const used = new Set<string>();
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, { encoding: "utf8" });
      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.ESNext, true);
      collectEnvUsages(sourceFile, used);
    } catch {}
  }

  const envPath = path.join(root, ".env");
  const examplePath = path.join(root, ".env.example");
  const declared = new Set<string>([...readEnvFile(envPath), ...readEnvFile(examplePath)]);

  // Duplicate detection (per file)
  const duplicates = new Set<string>();
  const dupHelper = (file: string) => {
    try {
      const raw = fs.readFileSync(file, { encoding: "utf8" });
      const seen = new Set<string>();
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        if (seen.has(key)) duplicates.add(key);
        seen.add(key);
      }
    } catch {}
  };
  dupHelper(envPath);
  dupHelper(examplePath);

  const missingInEnv = new Set<string>([...used].filter(v => !declared.has(v)));
  const unusedInEnv = new Set<string>([...declared].filter(v => !used.has(v)));

  const report: AuditReport = { used, declared, missingInEnv, unusedInEnv, duplicates };

  if (options.strict && (missingInEnv.size || unusedInEnv.size || duplicates.size)) {
    const msgs = [] as string[];
    if (missingInEnv.size) msgs.push(`${missingInEnv.size} missing`);
    if (unusedInEnv.size) msgs.push(`${unusedInEnv.size} unused`);
    if (duplicates.size) msgs.push(`${duplicates.size} duplicate`);
    throw new Error(`Strict mode failures: ${msgs.join(", ")}`);
  }

  return report;
}

export function serializeReport(report: AuditReport): SerializedAuditReport {
  return {
    used: Array.from(report.used).sort(),
    declared: Array.from(report.declared).sort(),
    missingInEnv: Array.from(report.missingInEnv).sort(),
    unusedInEnv: Array.from(report.unusedInEnv).sort(),
    duplicates: Array.from(report.duplicates).sort(),
  };
}

/** Convenience alias function returning structured serialized results directly */
export async function scanProject(
  dirOrOptions?: string | AuditOptions
): Promise<SerializedAuditReport> {
  const options: AuditOptions =
    typeof dirOrOptions === "string" ? { rootDir: dirOrOptions } : dirOrOptions ?? {};
  const report = await auditProject(options);
  return serializeReport(report);
}
