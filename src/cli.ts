#!/usr/bin/env node
// src/cli.ts
import { Command } from "commander";
import { auditProject, serializeReport, type AuditOptions } from "./scanner.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve package.json relative to this file (works from any cwd)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, "..", "package.json");
let pkg = { version: "0.0.0", description: "" };
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
} catch {
  // fallback: version stays as default
}

const program = new Command();
program
  .name("envpilot")
  .description("Environment configuration auditor for JS/TS projects")
  .version(pkg.version);

// ─── envpilot check ───────────────────────────────────────────────────────────
program
  .command("check")
  .description("Scan the project and report environment variable issues")
  .option("-d, --dir <projectDir>", "Root directory of the project to scan", ".")
  .option("-j, --json", "Output report as JSON")
  .option("-s, --strict", "Exit with code 1 if any issues are found")
  .option("-c, --config <path>", "Path to a JSON configuration file")
  .action(async (options) => {
    const auditOpts: AuditOptions = {
      rootDir: options.dir,
    };

    if (options.config) {
      try {
        const cfgPath = path.resolve(options.config);
        if (!fs.existsSync(cfgPath)) {
          console.error(`Error: Config file not found: ${cfgPath}`);
          process.exit(2);
        }
        const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
        Object.assign(auditOpts, cfg);
      } catch (e: any) {
        console.error("Failed to read config file:", e instanceof Error ? e.message : String(e));
        process.exit(2);
      }
    }

    let report;
    try {
      // Validate directory exists before scanning
      const resolvedDir = path.resolve(options.dir);
      if (!fs.existsSync(resolvedDir)) {
        console.error(`Error: Directory not found: ${resolvedDir}`);
        process.exit(2);
      }
      report = await auditProject(auditOpts);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }

    const ser = serializeReport(report);

    if (options.json) {
      console.log(JSON.stringify(ser, null, 2));
    } else {
      const hasIssues =
        ser.missingInEnv.length > 0 ||
        ser.unusedInEnv.length > 0 ||
        ser.duplicates.length > 0;

      console.log("\n╔══════════════════════════════════╗");
      console.log("║       EnvPilot — Scan Report      ║");
      console.log("╚══════════════════════════════════╝\n");
      console.log(`📁 Project : ${path.resolve(options.dir)}`);
      console.log(`🔍 Used    : ${ser.used.length > 0 ? ser.used.join(", ") : "(none)"}`);
      console.log(`📋 Declared: ${ser.declared.length > 0 ? ser.declared.join(", ") : "(none)"}`);
      console.log(
        `❌ Missing : ${ser.missingInEnv.length > 0 ? ser.missingInEnv.join(", ") : "(none)"}`
      );
      console.log(
        `⚠️  Unused  : ${ser.unusedInEnv.length > 0 ? ser.unusedInEnv.join(", ") : "(none)"}`
      );
      console.log(
        `🔁 Dupes   : ${ser.duplicates.length > 0 ? ser.duplicates.join(", ") : "(none)"}`
      );

      if (hasIssues) {
        console.log("\n⚠️  Issues detected.");
      } else {
        console.log("\n✅ No issues found.");
      }
    }

    if (options.strict) {
      const ser2 = serializeReport(report);
      const hasIssues =
        ser2.missingInEnv.length > 0 ||
        ser2.unusedInEnv.length > 0 ||
        ser2.duplicates.length > 0;
      if (hasIssues) {
        process.exit(1);
      }
    }
  });

// ─── envpilot init ────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Generate a starter .envpilot.json configuration file")
  .option("-d, --dir <projectDir>", "Directory to create config in", ".")
  .action((options) => {
    const cfgPath = path.resolve(options.dir, ".envpilot.json");
    if (fs.existsSync(cfgPath)) {
      console.error(`Config already exists: ${cfgPath}`);
      process.exit(1);
    }
    const starter = {
      rootDir: ".",
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/coverage/**",
        "**/.git/**"
      ],
      strict: false,
    };
    fs.writeFileSync(cfgPath, JSON.stringify(starter, null, 2) + "\n", "utf8");
    console.log(`✅ Created ${cfgPath}`);
    console.log(
      "   Edit it to customise ignored directories and strict mode."
    );
  });

// ─── envpilot report ─────────────────────────────────────────────────────────
program
  .command("report")
  .description("Generate a JSON report and save it to a file")
  .option("-d, --dir <projectDir>", "Root directory of the project to scan", ".")
  .option("-o, --out <file>", "Output file path", "envpilot-report.json")
  .action(async (options) => {
    let report;
    try {
      report = await auditProject({ rootDir: options.dir });
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }

    const ser = serializeReport(report);
    const output = {
      generatedAt: new Date().toISOString(),
      projectDir: path.resolve(options.dir),
      ...ser,
    };

    const outPath = path.resolve(options.out);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf8");
    console.log(`✅ Report saved to ${outPath}`);
    console.log(
      `   ${ser.used.length} used | ${ser.declared.length} declared | ` +
        `${ser.missingInEnv.length} missing | ${ser.unusedInEnv.length} unused | ` +
        `${ser.duplicates.length} duplicates`
    );
  });

program.parseAsync(process.argv);
