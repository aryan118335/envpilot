# EnvPilot

> **Developer-first environment configuration auditor for JavaScript and TypeScript projects.**
> Detect missing, unused, and inconsistent environment variables before deployment using static AST analysis.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%7C%206.x-blue.svg)](https://www.typescriptlang.org)

---

## Table of Contents

- [Overview](#overview)
- [The Problem EnvPilot Solves](#the-problem-envpilot-solves)
- [Key Features](#key-features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
  - [`envpilot check`](#envpilot-check)
  - [`envpilot init`](#envpilot-init)
  - [`envpilot report`](#envpilot-report)
  - [Global Flags](#global-flags)
- [Programmatic API](#programmatic-api)
  - [JavaScript (ESM)](#javascript-esm)
  - [TypeScript](#typescript)
  - [API Reference](#api-reference)
- [Configuration (`.envpilot.json`)](#configuration-envpilotjson)
- [Supported Syntax & Access Patterns](#supported-syntax--access-patterns)
- [Supported File Extensions](#supported-file-extensions)
- [Default Ignored Directories](#default-ignored-directories)
- [Security Guarantee](#security-guarantee)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**EnvPilot** inspects your JavaScript and TypeScript codebases to ensure environment variables accessed at runtime (`process.env.VAR`) actually match what is declared in your `.env` and `.env.example` files.

Unlike naive regex-based scanners, EnvPilot uses the official **TypeScript compiler AST (Abstract Syntax Tree) API** to analyze code. It accurately recognizes dot notation, bracket notation, and object destructuring while ignoring false positives in comments, string literals, and template strings.

---

## The Problem EnvPilot Solves

In modern Node.js, full-stack, and frontend applications:
1. **Missing Variables Crash Production:** Code references `process.env.DATABASE_URL`, but someone forgot to add it to `.env` or production secrets. The app crashes at runtime instead of at build time.
2. **Outdated `.env.example` Templates:** Teammates pull the repository, copy `.env.example` to `.env`, and spend hours debugging missing variables that were never documented.
3. **Dead / Unused Declarations:** Stale variables accumulate in `.env` files across years of refactoring, leading to confusion and security risks.
4. **Duplicate Declarations:** Duplicate keys in `.env` files cause values to be silently overwritten depending on parser order.

EnvPilot runs locally and in CI to audit your environment contract before you deploy.

---

## Key Features

- 🔍 **Static AST Parsing:** Powered by the TypeScript compiler API. No regex guesses, zero execution of your project's code.
- 🛡️ **Zero Secret Exposure:** EnvPilot parses only variable names. Actual environment values (passwords, tokens, connection strings) are **never** logged, exposed in reports, or leaked in errors.
- 🎯 **Eliminates False Positives:** Process.env occurrences inside single-line comments, block comments, string literals, or Markdown are ignored.
- 🔀 **Covers Real-World Syntax:** Supports dot access (`process.env.VAR`), bracket access (`process.env["VAR"]`), aliased destructuring (`const { VAR: local } = process.env`), assignment destructuring (`({ PORT } = process.env)`), and `process['env']`.
- 📁 **Comprehensive File Support:** Scans `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, and `.cjs` files.
- 🚦 **CI-Friendly Strict Mode:** Exits with code `1` if missing, unused, or duplicate variables are detected.
- 📊 **Multiple Output Formats:** Formatted terminal summaries and machine-readable JSON reports.
- 📦 **Dual Interface:** Full-featured command-line interface (CLI) and typed programmatic JavaScript/TypeScript API.

---

## Installation

### As a Project Dependency (Recommended for CI & Scripts)

```bash
npm install --save-dev envpilot
# or
yarn add -D envpilot
# or
pnpm add -D envpilot
```

### Global Installation (For ad-hoc CLI usage)

```bash
npm install -g envpilot
```

---

## Quick Start

### 1. Scan your current project

```bash
npx envpilot check
```

Example terminal output:

```text
╔══════════════════════════════════╗
║       EnvPilot — Scan Report      ║
╚══════════════════════════════════╝

📁 Project : /my-app
🔍 Used    : API_KEY, DATABASE_URL, PORT
📋 Declared: API_KEY, DATABASE_URL, OLD_TOKEN
❌ Missing : PORT
⚠️  Unused  : OLD_TOKEN
🔁 Dupes   : (none)

⚠️  Issues detected.
```

### 2. Add to your `package.json` scripts

```json
{
  "scripts": {
    "env:check": "envpilot check --strict"
  }
}
```

---

## CLI Reference

### `envpilot check`

Scans the project and reports environment variable status.

```bash
envpilot check [options]
```

| Option | Shorthand | Description | Default |
|---|---|---|---|
| `--dir <projectDir>` | `-d` | Path to the project root directory | `.` |
| `--json` | `-j` | Output result as formatted JSON | `false` |
| `--strict` | `-s` | Exit with code `1` if any missing, unused, or duplicate variables exist | `false` |
| `--config <path>` | `-c` | Path to custom `.envpilot.json` configuration file | — |

#### Examples

```bash
# Basic scan
envpilot check

# Scan custom subfolder in strict mode
envpilot check --dir ./packages/backend --strict

# Output JSON for CI tool integration
envpilot check --json
```

---

### `envpilot init`

Generates a starter `.envpilot.json` configuration file in the project directory.

```bash
envpilot init
# or in a subproject
envpilot init --dir ./services/api
```

---

### `envpilot report`

Scans the project and writes a timestamped JSON report to disk.

```bash
envpilot report [options]
```

| Option | Shorthand | Description | Default |
|---|---|---|---|
| `--dir <projectDir>` | `-d` | Target project directory | `.` |
| `--out <file>` | `-o` | Output file path | `envpilot-report.json` |

#### Example

```bash
envpilot report --out ./reports/env-audit.json
```

---

### Global Flags

- `-V, --version`: Output the current installed version of EnvPilot.
- `-h, --help`: Display help and command usage.

---

## Programmatic API

EnvPilot exports an ES module interface with full TypeScript typings.

### JavaScript (ESM)

```javascript
import { scanProject } from "envpilot";

const report = await scanProject("./my-app");

console.log("Variables used in code:", report.used);
console.log("Variables missing from env files:", report.missingInEnv);
console.log("Declared but unused variables:", report.unusedInEnv);
console.log("Duplicate declarations:", report.duplicates);
```

### TypeScript

```typescript
import {
  scanProject,
  auditProject,
  serializeReport,
  type AuditOptions,
  type AuditReport,
  type SerializedAuditReport
} from "envpilot";

const options: AuditOptions = {
  rootDir: "./packages/server",
  strict: false,
  ignore: ["**/dist/**", "**/test/**"]
};

// High-level API returning sorted string arrays
const result: SerializedAuditReport = await scanProject(options);

// Low-level API returning ES Sets
const rawReport: AuditReport = await auditProject(options);
const formatted: SerializedAuditReport = serializeReport(rawReport);
```

### API Reference

#### `scanProject(dirOrOptions?: string | AuditOptions): Promise<SerializedAuditReport>`
Convenience wrapper that runs an audit and returns serialized arrays. Accepts either a directory path string or an `AuditOptions` object.

#### `auditProject(options?: AuditOptions): Promise<AuditReport>`
Low-level scanner function. Returns an `AuditReport` where each category is an ES `Set<string>`. If `options.strict` is `true` and issues are present, it throws an error.

#### `serializeReport(report: AuditReport): SerializedAuditReport`
Converts `AuditReport` sets into sorted arrays suitable for JSON output.

#### Types

```typescript
export interface AuditOptions {
  rootDir?: string;
  ignore?: string[];
  strict?: boolean;
}

export interface SerializedAuditReport {
  used: string[];
  declared: string[];
  missingInEnv: string[];
  unusedInEnv: string[];
  duplicates: string[];
}
```

---

## Configuration (`.envpilot.json`)

You can create a `.envpilot.json` configuration file in your project root or pass one via `--config <path>`.

### Valid Configuration Example

```json
{
  "rootDir": ".",
  "ignore": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.git/**",
    "**/fixtures/**"
  ],
  "strict": false
}
```

### Options Description

| Key | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `"."` | Root directory of the source code to audit. |
| `ignore` | `string[]` | `["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.git/**"]` | Glob patterns of directories/files to ignore. |
| `strict` | `boolean` | `false` | When `true`, causes the audit to throw or exit with non-zero code if issues are found. |

---

## Supported Syntax & Access Patterns

EnvPilot identifies the following source code patterns:

```javascript
// Dot access
const port = process.env.PORT;

// Bracket notation (single and double quotes)
const db = process.env["DATABASE_URL"];
const key = process.env['API_KEY'];

// No-substitution template literals
const host = process.env[`DB_HOST`];

// Destructuring declaration
const { JWT_SECRET, CACHE_TTL } = process.env;

// Destructuring with property renaming / aliases
const { STRIPE_KEY: stripeSecret } = process.env;

// Destructuring with default values
const { NODE_ENV = "development" } = process.env;

// Assignment destructuring
let REDIS_URL;
({ REDIS_URL } = process.env);

// process['env'] variation
const token = process['env'].AUTH_TOKEN;
const debug = process["env"]["DEBUG"];
```

---

## Supported File Extensions

EnvPilot scans the following source file extensions:
- `.js` (JavaScript)
- `.jsx` (JavaScript React)
- `.ts` (TypeScript)
- `.tsx` (TypeScript React)
- `.mjs` (ES Modules)
- `.cjs` (CommonJS Modules)

---

## Default Ignored Directories

To ensure fast scans and avoid false positives, the following directories are excluded by default:
- `**/node_modules/**`
- `**/dist/**`
- `**/build/**`
- `**/coverage/**`
- `**/.git/**`

---

## Security Guarantee

- **No Value Extraction:** EnvPilot extracts only variable **names/keys**. It never reads, logs, or stores values assigned in `.env` files.
- **No Network Activity:** EnvPilot operates completely locally and offline. It never transmits project structure or configuration data anywhere.
- **No Destructive Operations:** EnvPilot runs strictly read-only audits. It will never modify or delete your `.env` or source files.

---

## Known Limitations

- **Dynamic Access:** Statically untraceable patterns like `const k = "API_KEY"; process.env[k];` cannot be detected statically without runtime execution.
- **String Concatenation / Computed Keys:** Accesses such as `process.env["KEY_" + suffix]` cannot be statically resolved.
- **Custom Wrapper Functions:** Calls through custom accessor helpers (e.g., `config.get("DATABASE_URL")`) are not tracked unless they directly access `process.env`.

---

## Troubleshooting

### Q: EnvPilot reports "Directory not found"
**A:** Ensure the `--dir` path is correct and accessible relative to your current working directory.

### Q: Why is my `.env` file not picked up?
**A:** EnvPilot looks for `.env` and `.env.example` in the specified `rootDir`. If your `.env` file is named `.env.local` or `.env.production`, copy or symlink it to `.env` or `.env.example` before scanning.

### Q: Why are my build files being scanned?
**A:** If your build outputs to an unusual directory (e.g., `./out` or `./public/build`), add that path to `ignore` in `.envpilot.json` or pass custom ignore options.

---

## Contributing

Contributions and feedback are welcome!

1. Fork the repository on GitHub: [`https://github.com/aryan118335/envpilot`](https://github.com/aryan118335/envpilot)
2. Clone your fork and install dependencies:
   ```bash
   git clone https://github.com/aryan118335/envpilot.git
   cd envpilot
   npm install
   ```
3. Run tests and linting:
   ```bash
   npm test
   npm run lint
   npm run build
   ```
4. Create a feature branch and submit a Pull Request.

---

## License

This project is licensed under the [MIT License](LICENSE).
