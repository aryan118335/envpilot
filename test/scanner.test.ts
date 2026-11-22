import { auditProject, serializeReport, scanProject } from "../src/scanner.js";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

describe("EnvPilot Automated Test Suite", () => {
  const baseDir = path.resolve(process.cwd(), "test", "fixtures");

  beforeAll(() => {
    fs.mkdirSync(baseDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Scanner & Syntax Detection
  // ─────────────────────────────────────────────────────────────
  describe("Scanner: Access Patterns", () => {
    const testDir = path.join(baseDir, "patterns");

    beforeAll(() => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, "app.ts"),
        `
        // Dot notation
        const a = process.env.DOT_VAR;
        
        // Bracket notation with string literal
        const b = process.env["BRACKET_VAR"];
        const c = process.env['SINGLE_BRACKET_VAR'];

        // Destructuring
        const { DESTRUCT_ONE, DESTRUCT_TWO } = process.env;
        `
      );
    });

    test("detects dot notation, bracket notation, and destructuring", async () => {
      const report = await scanProject(testDir);
      expect(report.used).toEqual(
        expect.arrayContaining([
          "DOT_VAR",
          "BRACKET_VAR",
          "SINGLE_BRACKET_VAR",
          "DESTRUCT_ONE",
          "DESTRUCT_TWO",
        ])
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. False Positives: Comments and Strings
  // ─────────────────────────────────────────────────────────────
  describe("False Positives Prevention", () => {
    const testDir = path.join(baseDir, "false-positives");

    beforeAll(() => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, "code.js"),
        `
        // process.env.SINGLE_LINE_COMMENT
        /* 
           process.env.MULTI_LINE_COMMENT 
           process.env["MULTI_LINE_BRACKET"]
        */
        const text1 = "process.env.FAKE_STRING";
        const text2 = 'process.env["ANOTHER_FAKE_STRING"]';
        const text3 = \`process.env.TEMPLATE_LITERAL_FAKE\`;

        // Real reference to ensure scanner works on the file
        const real = process.env.REAL_VAR;
        `
      );
    });

    test("ignores process.env occurrences inside comments and strings", async () => {
      const report = await scanProject(testDir);
      expect(report.used).toEqual(["REAL_VAR"]);
      expect(report.used).not.toContain("SINGLE_LINE_COMMENT");
      expect(report.used).not.toContain("MULTI_LINE_COMMENT");
      expect(report.used).not.toContain("MULTI_LINE_BRACKET");
      expect(report.used).not.toContain("FAKE_STRING");
      expect(report.used).not.toContain("ANOTHER_FAKE_STRING");
      expect(report.used).not.toContain("TEMPLATE_LITERAL_FAKE");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Environment Parser: Empty, Quoted, Duplicates, Comments
  // ─────────────────────────────────────────────────────────────
  describe("Environment Parser", () => {
    const testDir = path.join(baseDir, "parser");

    beforeAll(() => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, ".env"),
        `
        # Comment line
        EMPTY_VAL=
        SINGLE_QUOTED='hello world'
        DOUBLE_QUOTED="foo bar"
        DUP_KEY=first_val
        DUP_KEY=second_val
        `
      );
      fs.writeFileSync(
        path.join(testDir, "app.ts"),
        `
        console.log(process.env.EMPTY_VAL);
        console.log(process.env.SINGLE_QUOTED);
        console.log(process.env.DOUBLE_QUOTED);
        console.log(process.env.DUP_KEY);
        `
      );
    });

    test("parses empty, single quoted, double quoted values, and detects duplicate keys", async () => {
      const report = await scanProject(testDir);
      expect(report.declared).toEqual(
        expect.arrayContaining([
          "EMPTY_VAL",
          "SINGLE_QUOTED",
          "DOUBLE_QUOTED",
          "DUP_KEY",
        ])
      );
      expect(report.duplicates).toContain("DUP_KEY");
      expect(report.missingInEnv).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Analyzer: Missing and Unused Variables
  // ─────────────────────────────────────────────────────────────
  describe("Analyzer: Missing and Unused Variables", () => {
    const testDir = path.join(baseDir, "analyzer");

    beforeAll(() => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, ".env"),
        `
        USED_VAR=1
        UNUSED_VAR=2
        `
      );
      fs.writeFileSync(
        path.join(testDir, "index.ts"),
        `
        const a = process.env.USED_VAR;
        const b = process.env.MISSING_VAR;
        `
      );
    });

    test("identifies missing variables and declared unused variables correctly", async () => {
      const report = await scanProject(testDir);
      expect(report.missingInEnv).toEqual(["MISSING_VAR"]);
      expect(report.unusedInEnv).toEqual(["UNUSED_VAR"]);
      expect(report.used).toEqual(expect.arrayContaining(["USED_VAR", "MISSING_VAR"]));
      expect(report.declared).toEqual(expect.arrayContaining(["USED_VAR", "UNUSED_VAR"]));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Example Comparison: .env vs .env.example
  // ─────────────────────────────────────────────────────────────
  describe("Comparison: .env vs .env.example", () => {
    const testDir = path.join(baseDir, "examples");

    beforeAll(() => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, ".env"), `SECRET_A=secret_value\n`);
      fs.writeFileSync(path.join(testDir, ".env.example"), `SECRET_A=\nPUBLIC_B=\n`);
      fs.writeFileSync(
        path.join(testDir, "app.js"),
        `
        console.log(process.env.SECRET_A);
        console.log(process.env.PUBLIC_B);
        `
      );
    });

    test("unifies variables from both .env and .env.example", async () => {
      const report = await scanProject(testDir);
      expect(report.declared).toEqual(expect.arrayContaining(["SECRET_A", "PUBLIC_B"]));
      expect(report.missingInEnv).toHaveLength(0);
      expect(report.unusedInEnv).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. File Handling: Missing Files & Invalid Paths
  // ─────────────────────────────────────────────────────────────
  describe("File Handling & Robustness", () => {
    test("handles project without .env or .env.example gracefully", async () => {
      const testDir = path.join(baseDir, "no-env");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, "index.js"), `const x = process.env.FOO;`);

      const report = await scanProject(testDir);
      expect(report.used).toEqual(["FOO"]);
      expect(report.declared).toEqual([]);
      expect(report.missingInEnv).toEqual(["FOO"]);
    });

    test("throws an error when provided an invalid directory path", async () => {
      await expect(scanProject("/invalid/nonexistent/directory/xyz123")).rejects.toThrow(
        /Directory not found/
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Project Handling: Ignored Directories
  // ─────────────────────────────────────────────────────────────
  describe("Project Handling: Ignored Directories", () => {
    const testDir = path.join(baseDir, "ignores");

    beforeAll(() => {
      fs.mkdirSync(path.join(testDir, "node_modules", "some-dep"), { recursive: true });
      fs.mkdirSync(path.join(testDir, "dist"), { recursive: true });
      fs.mkdirSync(path.join(testDir, "src"), { recursive: true });

      // Ignored references
      fs.writeFileSync(
        path.join(testDir, "node_modules", "some-dep", "dep.js"),
        `const dep = process.env.DEP_IGNORED_VAR;`
      );
      fs.writeFileSync(
        path.join(testDir, "dist", "bundle.js"),
        `const bundle = process.env.DIST_IGNORED_VAR;`
      );

      // Scanned reference
      fs.writeFileSync(
        path.join(testDir, "src", "index.ts"),
        `const app = process.env.VALID_SRC_VAR;`
      );
    });

    test("ignores node_modules and dist by default", async () => {
      const report = await scanProject(testDir);
      expect(report.used).toContain("VALID_SRC_VAR");
      expect(report.used).not.toContain("DEP_IGNORED_VAR");
      expect(report.used).not.toContain("DIST_IGNORED_VAR");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Programmatic API: Types and Strict Mode
  // ─────────────────────────────────────────────────────────────
  describe("Programmatic API Behavior", () => {
    const testDir = path.join(baseDir, "api-strict");

    beforeAll(() => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, "app.ts"),
        `const x = process.env.MISSING_ENV_VAR;`
      );
    });

    test("auditProject returns Set structures and throws in strict mode", async () => {
      const rawReport = await auditProject({ rootDir: testDir, strict: false });
      expect(rawReport.used instanceof Set).toBe(true);
      expect(rawReport.missingInEnv.has("MISSING_ENV_VAR")).toBe(true);

      const serialized = serializeReport(rawReport);
      expect(Array.isArray(serialized.missingInEnv)).toBe(true);
      expect(serialized.missingInEnv).toContain("MISSING_ENV_VAR");

      await expect(auditProject({ rootDir: testDir, strict: true })).rejects.toThrow(
        /Strict mode failures/
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. CLI End-to-End Execution
  // ─────────────────────────────────────────────────────────────
  describe("CLI Execution via Process", () => {
    const cliPath = path.resolve(process.cwd(), "dist", "cli.js");
    const testDir = path.join(baseDir, "cli-test");

    beforeAll(() => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, ".env"), `PORT=3000\n`);
      fs.writeFileSync(
        path.join(testDir, "server.js"),
        `const p = process.env.PORT;\nconst missing = process.env.SECRET;`
      );
    });

    test("cli check returns exit code 0 and valid output", () => {
      const output = execSync(`node "${cliPath}" check --dir "${testDir}"`, {
        encoding: "utf8",
      });
      expect(output).toContain("EnvPilot — Scan Report");
      expect(output).toContain("SECRET");
    });

    test("cli check --json returns valid JSON object", () => {
      const output = execSync(`node "${cliPath}" check --dir "${testDir}" --json`, {
        encoding: "utf8",
      });
      const parsed = JSON.parse(output);
      expect(parsed.used).toEqual(expect.arrayContaining(["PORT", "SECRET"]));
      expect(parsed.missingInEnv).toEqual(["SECRET"]);
    });

    test("cli check --strict exits with code 1 when issues exist", () => {
      expect(() => {
        execSync(`node "${cliPath}" check --dir "${testDir}" --strict`, {
          stdio: "pipe",
        });
      }).toThrow();
    });

    test("cli init creates a .envpilot.json configuration file", () => {
      const initDir = path.join(baseDir, "init-run");
      fs.mkdirSync(initDir, { recursive: true });
      const output = execSync(`node "${cliPath}" init --dir "${initDir}"`, {
        encoding: "utf8",
      });
      expect(output).toContain("Created");
      const cfgPath = path.join(initDir, ".envpilot.json");
      expect(fs.existsSync(cfgPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      expect(content.rootDir).toBe(".");
      expect(content.ignore).toContain("**/node_modules/**");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Code Quality & Security (Milestone 7 verification)
  // ─────────────────────────────────────────────────────────────
  describe("Security and Advanced Scanner Robustness", () => {
    const testDir = path.join(baseDir, "advanced-syntax");

    beforeAll(() => {
      fs.mkdirSync(testDir, { recursive: true });
      // .env with sensitive secrets and duplicate keys
      fs.writeFileSync(
        path.join(testDir, ".env"),
        `SUPER_SECRET_TOKEN=my-super-secret-password-12345\nDATABASE_PASSWORD=production_root_pass\n`
      );
      // Syntax covering aliased destructuring, assignment destructuring, and malformed files
      fs.writeFileSync(
        path.join(testDir, "complex.mjs"),
        `
        // Aliased destructuring
        const { API_KEY: myAlias, PORT = 3000 } = process.env;

        // Destructuring assignment to existing variables
        let USER, ROLE;
        ({ USER, ROLE: myRole } = process.env);

        // Process['env'] bracket variation
        const db = process['env'].DB_NAME;
        const host = process["env"]['HOST_NAME'];
        `
      );
      // Malformed source file to verify scanner does not crash on syntax errors
      fs.writeFileSync(
        path.join(testDir, "malformed.ts"),
        `function broken( { return ??? process.env.RECOVERED_FROM_MALFORMED;`
      );
    });

    test("never exposes secret values in serialized reports or console output", async () => {
      const report = await scanProject(testDir);
      const jsonString = JSON.stringify(report);
      expect(jsonString).not.toContain("my-super-secret-password-12345");
      expect(jsonString).not.toContain("production_root_pass");
      expect(report.unusedInEnv).toContain("SUPER_SECRET_TOKEN");
      expect(report.unusedInEnv).toContain("DATABASE_PASSWORD");
    });

    test("handles complex destructuring, alias, and process['env'] syntax", async () => {
      const report = await scanProject(testDir);
      expect(report.used).toEqual(
        expect.arrayContaining([
          "API_KEY",
          "PORT",
          "USER",
          "ROLE",
          "DB_NAME",
          "HOST_NAME",
          "RECOVERED_FROM_MALFORMED",
        ])
      );
    });

    test("cli check handles missing config file gracefully with exit code 2", () => {
      const cliPath = path.resolve(process.cwd(), "dist", "cli.js");
      try {
        execSync(`node "${cliPath}" check --config /nonexistent/config.json`, {
          stdio: "pipe",
        });
        throw new Error("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(2);
        expect(err.stderr.toString()).toContain("Config file not found");
      }
    });
  });
});
