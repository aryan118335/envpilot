# EnvPilot Basic Example

This is a minimal demonstration project showing how EnvPilot detects environment variable inconsistencies.

## Files

- `.env`: Contains declared values (`PORT`, `DATABASE_URL`, `API_KEY`, `LEGACY_FLAG`, and duplicate `PORT`).
- `.env.example`: Template declaring expected variables (`PORT`, `DATABASE_URL`, `API_KEY`).
- `server.js`: References `PORT`, `DATABASE_URL`, `API_KEY`, and `REDIS_URL`.
- `run-audit.js`: Demonstrates the programmatic JavaScript API.

## 1. Run using CLI

From the repository root:

```bash
node dist/cli.js check --dir examples/basic
```

### Actual Output

```text
╔══════════════════════════════════╗
║       EnvPilot — Scan Report      ║
╚══════════════════════════════════╝

📁 Project : /path/to/envpilot/examples/basic
🔍 Used    : API_KEY, DATABASE_URL, PORT, REDIS_URL
📋 Declared: API_KEY, DATABASE_URL, LEGACY_FLAG, PORT
❌ Missing : REDIS_URL
⚠️  Unused  : LEGACY_FLAG
🔁 Dupes   : PORT

⚠️  Issues detected.
```

### JSON Output

```bash
node dist/cli.js check --dir examples/basic --json
```

```json
{
  "used": [
    "API_KEY",
    "DATABASE_URL",
    "PORT",
    "REDIS_URL"
  ],
  "declared": [
    "API_KEY",
    "DATABASE_URL",
    "LEGACY_FLAG",
    "PORT"
  ],
  "missingInEnv": [
    "REDIS_URL"
  ],
  "unusedInEnv": [
    "LEGACY_FLAG"
  ],
  "duplicates": [
    "PORT"
  ]
}
```

## 2. Run Programmatically

```bash
node examples/basic/run-audit.js
```
