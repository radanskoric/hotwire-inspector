import { spawn } from "node:child_process";

/** @type {Array<[name: string, command: string, args: string[]]>} */
const checks = [
  ["ESLint", "npm", ["run", "lint"]],
  ["Prettier", "npm", ["run", "format:check"]],
  ["Stylelint", "npm", ["run", "lint:css"]],
  ["Typecheck (checkJs)", "npm", ["run", "typecheck"]],
  ["Unit tests", "npm", ["test", "--", "--run"]],
  ["Coverage", "npm", ["run", "coverage"]],
  ["Vitest UI", "npm", ["run", "test:ui", "--", "--run"]],
  ["Chromium build", "npm", ["run", "build"]],
  ["Firefox build", "npm", ["run", "build:firefox"]],
  ["Chromium E2E", "npm", ["run", "test:e2e"]],
  ["Hybrid E2E", "npm", ["run", "test:e2e:hybrid"]],
  ["Firefox E2E", "npm", ["run", "test:e2e:firefox"]],
];

const results = [];

/**
 * @param {string} command
 * @param {string[]} args
 */
function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

/**
 * @param {[name: string, command: string, args: string[]]} check
 */
function runCheck([name, command, args]) {
  return new Promise((resolve) => {
    const formattedCommand = formatCommand(command, args);

    console.log(`\n▶ ${name}`);
    console.log(`$ ${formattedCommand}`);

    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", (error) => {
      resolve({
        name,
        command: formattedCommand,
        passed: false,
        detail: error.message,
      });
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ name, command: formattedCommand, passed: true });
        return;
      }

      const detail = signal ? `signal ${signal}` : `exit code ${code}`;
      resolve({ name, command: formattedCommand, passed: false, detail });
    });
  });
}

for (const check of checks) {
  results.push(await runCheck(check));
}

console.log("\nTest summary");
console.log("============");

for (const result of results) {
  const mark = result.passed ? "✅" : "❌";
  const detail = result.detail ? ` (${result.detail})` : "";
  console.log(`${mark} ${result.name}: ${result.command}${detail}`);
}

const failedCount = results.filter((result) => !result.passed).length;

if (failedCount > 0) {
  console.log(`\n${failedCount} check${failedCount === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed.");
}
