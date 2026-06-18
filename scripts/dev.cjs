const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");
const vite = path.join(frontendDir, "node_modules", ".bin", isWindows ? "vite.cmd" : "vite");
let shuttingDown = false;
const processes = [];

function quote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function backendHealth() {
  return new Promise((resolve) => {
    const request = http.get("http://localhost:5000/api/health", (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function startProcess(name, command, cwd) {
  const child = spawn(command, {
    cwd,
    stdio: "inherit",
    shell: true
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`${name} exited${signal ? ` with signal ${signal}` : ` with code ${code}`}.`);
    shutdown(code || 1);
  });

  processes.push(child);
}

async function main() {
  const frontendArgs = process.argv.slice(2).map(quote).join(" ");
  const frontendCommand = [quote(vite), frontendArgs].filter(Boolean).join(" ");

  if (await backendHealth()) {
    console.log("Backend already running on http://localhost:5000; starting frontend only.");
  } else {
    startProcess("backend", `${npm} run dev`, backendDir);
  }

  startProcess("frontend", frontendCommand, frontendDir);
}

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((error) => {
  console.error(error.message);
  shutdown(1);
});
