const fs = require("node:fs");
const { timingSafeEqual } = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

const projectRoot = __dirname;
const logLevel = process.env.LOG_LEVEL || "info";
if (!["info", "silent"].includes(logLevel)) {
  console.error("LOG_LEVEL must be info or silent");
  process.exit(1);
}
const adminAuthorization = process.env.API_KEY
  ? Buffer.from(`Bearer ${process.env.API_KEY}`)
  : null;
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

function send(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET") {
    send(response, 405, "text/plain; charset=utf-8", "Method not allowed\n");
    return;
  }

  const pathname = new URL(request.url, "http://localhost").pathname;
  if (logLevel === "info") {
    console.log(`${request.method} ${pathname}`);
  }

  if (pathname === "/healthz") {
    send(response, 200, "application/json; charset=utf-8", '{"status":"ok"}\n');
    return;
  }

  if (pathname === "/admin/status") {
    if (!adminAuthorization) {
      send(response, 503, "text/plain; charset=utf-8", "Admin access is not configured\n");
      return;
    }
    const authorization = Buffer.from(request.headers.authorization || "");
    if (authorization.length !== adminAuthorization.length
        || !timingSafeEqual(authorization, adminAuthorization)) {
      send(response, 401, "text/plain; charset=utf-8", "Unauthorized\n");
      return;
    }
    send(response, 200, "application/json; charset=utf-8", JSON.stringify({ status: "ok", logLevel }) + "\n");
    return;
  }

  const staticFile = staticFiles.get(pathname);
  if (!staticFile) {
    send(response, 404, "text/plain; charset=utf-8", "Not found\n");
    return;
  }

  const [filename, contentType] = staticFile;
  fs.readFile(path.join(projectRoot, filename), (error, body) => {
    if (error) {
      send(response, 500, "text/plain; charset=utf-8", "Internal server error\n");
      return;
    }

    send(response, 200, contentType, body);
  });
});

const portValue = process.env.PORT || "8080";
if (!/^\d+$/.test(portValue)) {
  console.error(`Invalid PORT: ${portValue}`);
  process.exit(1);
}

const port = Number(portValue);
if (port < 1 || port > 65535) {
  console.error(`PORT must be between 1 and 65535: ${portValue}`);
  process.exit(1);
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Rythm is listening on port ${port}`);
});

function shutDown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
