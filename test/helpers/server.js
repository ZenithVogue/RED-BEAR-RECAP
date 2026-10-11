/* ============================================================
   Test helper — boot the real http server in a child process so
   environment overrides (providers, rate limits) are honoured.
   ============================================================ */
"use strict";

const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");

function startStudioServer(env = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env: { ...process.env, PORT: "0", QUIET: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`server did not start in time.\n${output}`));
    }, 15000);

    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/ready:?\s*http:\/\/[^:\s]+:(\d+)/i);
      if (match) {
        clearTimeout(timer);
        resolve({
          port: Number(match[1]),
          base: `http://127.0.0.1:${match[1]}`,
          output: () => output,
          stop: () =>
            new Promise((done) => {
              child.once("exit", () => done());
              child.kill("SIGTERM");
              setTimeout(() => child.kill("SIGKILL"), 2000).unref();
            }),
        });
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}\n${output}`));
    });
  });
}

async function postJson(base, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg", ...headers },
    body: JSON.stringify(body),
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { res, buffer };
}

module.exports = { startStudioServer, postJson };
