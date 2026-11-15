const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { after, before, test } = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
let service;
let port;
let output = "";
const adminKey = randomBytes(16).toString("hex");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close(() => resolve(address.port));
    });
  });
}

function request(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const request = http.get(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        headers,
        timeout: 2_000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            elapsedMs: Date.now() - startedAt,
            headers: response.headers,
            status: response.statusCode,
          });
        });
      },
    );

    request.once("timeout", () => request.destroy(new Error("Request timed out")));
    request.once("error", reject);
  });
}

async function waitUntilReady() {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    if (service.exitCode !== null) {
      throw new Error(`Service exited before becoming ready (code ${service.exitCode})`);
    }

    try {
      const response = await request("/healthz");
      if (response.status === 200) return;
    } catch {
      // The server can refuse connections briefly while Node starts.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Service did not become ready within 5 seconds");
}

before(async () => {
  port = await getFreePort();
  service = spawn("./scripts/run.sh", {
    cwd: projectRoot,
    detached: true,
    env: { ...process.env, PORT: String(port), LOG_LEVEL: "silent", API_KEY: adminKey },
    stdio: ["ignore", "pipe", "pipe"],
  });
  service.stdout.on("data", (chunk) => { output += chunk.toString(); });
  service.stderr.on("data", (chunk) => { output += chunk.toString(); });
  await waitUntilReady();
});

after(() => {
  if (service && service.exitCode === null) {
    process.kill(-service.pid, "SIGTERM");
  }
});

test("GET / serves the habit tracker", async () => {
  const response = await request("/");

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /^text\/html/);
  assert.match(response.body, /Ритм — трекер привычек/);
});

test("GET /healthz reports a fast and non-empty health status", async () => {
  const response = await request("/healthz");

  assert.equal(response.status, 200);
  assert.ok(response.body.trim());
  assert.deepEqual(JSON.parse(response.body), { status: "ok" });
  assert.ok(response.elapsedMs < 1_000, `health check took ${response.elapsedMs}ms`);
});

test("GET /app.js serves the application code", async () => {
  const response = await request("/app.js");

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /^text\/javascript/);
  assert.match(response.body, /ritm-habits-v1/);
});

test("an unknown path returns 404", async () => {
  const response = await request("/missing");

  assert.equal(response.status, 404);
});

test("admin status requires the runtime secret", async () => {
  assert.equal((await request("/admin/status")).status, 401);
  assert.equal((await request("/admin/status", { Authorization: "Bearer invalid" })).status, 401);
  const response = await request("/admin/status", { Authorization: `Bearer ${adminKey}` });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { status: "ok", logLevel: "silent" });
});

test("LOG_LEVEL=silent suppresses request logs and the secret never appears in logs", async () => {
  await request("/admin/status", { Authorization: `Bearer ${adminKey}` });
  assert.ok(!output.includes("GET /"));
  assert.ok(!output.includes(adminKey));
});
