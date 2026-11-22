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

/** Read a .env‑style file and return declared keys and duplicate keys */
function parseEnvFile(filePath: string): { declared: Set<string>; duplicates: Set<string> } {
  const declared = new Set<string>();
  const duplicates = new Set<string>();
  try {
    const raw = fs.readFileSync(filePath, { encoding: "utf8" });
    const parsed = dotenv.parse(raw);
    for (const key of Object.keys(parsed)) {
      declared.add(key);
    }
    // Detect duplicate keys (dotenv keeps the last value)
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
  return { declared, duplicates };
}

/** Helper to check if an expression is `process.env` */
function isProcessEnv(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      node.name.text === "env"
    );
  }
  if (ts.isElementAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "env"
    );
  }
  return false;
}

/** Walk a source file and collect process.env usages */
function collectEnvUsages(sourceFile: ts.SourceFile, used: Set<string>) {
  function visit(node: ts.Node) {
    // 1. process.env.VAR (dot notation)
    if (ts.isPropertyAccessExpression(node)) {
      if (isProcessEnv(node.expression)) {
        used.add(node.name.text);
      }
    }

    // 2. process.env["VAR"] (bracket notation)
    if (ts.isElementAccessExpression(node)) {
      if (isProcessEnv(node.expression)) {
        const arg = node.argumentExpression;
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          used.add(arg.text);
        }
      }
    }

    // 3. Destructuring in variable declaration: const { A, B: renamed } = process.env;
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isProcessEnv(node.initializer)
    ) {
      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (element.propertyName) {
            // e.g. { A: myVar } -> propertyName is "A"
            if (
              ts.isIdentifier(element.propertyName) ||
              ts.isStringLiteral(element.propertyName)
            ) {
              used.add(element.propertyName.text);
            }
          } else {
            // e.g. { A } -> element.name is "A"
            if (
              ts.isIdentifier(element.name) ||
              ts.isStringLiteral(element.name)
            ) {
              used.add(element.name.text);
            }
          }
        }
      }
    }

    // 4. Destructuring in assignment expression: ({ A, B: renamed } = process.env);
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isProcessEnv(node.right)
    ) {
      if (ts.isObjectLiteralExpression(node.left)) {
        for (const prop of node.left.properties) {
          if (ts.isShorthandPropertyAssignment(prop)) {
            used.add(prop.name.text);
          } else if (ts.isPropertyAssignment(prop)) {
            if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
              used.add(prop.name.text);
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
  const defaultIgnore = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.git/**"
  ];
  const ignore = options.ignore ? [...options.ignore] : defaultIgnore;

  const files = await fg(["**/*.{js,jsx,ts,tsx,mjs,cjs}"], {
    cwd: root,
    absolute: true,
    ignore,
    dot: false
  });
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

  const envData = parseEnvFile(envPath);
  const exampleData = parseEnvFile(examplePath);

  const declared = new Set<string>([...envData.declared, ...exampleData.declared]);
  const duplicates = new Set<string>([...envData.duplicates, ...exampleData.duplicates]);

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
