"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const APOD_API_URL = "https://api.nasa.gov/planetary/apod";
const STATIC_FILES = {
  "/": { name: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { name: "app.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { name: "styles.css", type: "text/css; charset=utf-8" },
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

async function handleApod(requestUrl, response, fetchImpl) {
  const apiKey = process.env.NASA_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    sendJson(response, 503, { error: "A chave da NASA não está configurada no servidor." });
    return;
  }

  const date = requestUrl.searchParams.get("date");
  if (!date || !isValidDate(date)) {
    sendJson(response, 400, { error: "Escolha uma data válida." });
    return;
  }

  if (date > new Date().toISOString().slice(0, 10)) {
    sendJson(response, 400, { error: "A data não pode estar no futuro." });
    return;
  }

  const query = new URLSearchParams({ api_key: apiKey.trim(), date });
  let nasaResponse;
  try {
    nasaResponse = await fetchImpl(`${APOD_API_URL}?${query}`);
  } catch {
    sendJson(response, 502, { error: "Não foi possível conectar à API da NASA." });
    return;
  }

  let data;
  try {
    data = await nasaResponse.json();
  } catch {
    sendJson(response, 502, { error: "A API da NASA retornou uma resposta inválida." });
    return;
  }

  if (!nasaResponse.ok) {
    const status = nasaResponse.status === 429 ? 429 : 502;
    const message = nasaResponse.status === 429
      ? "O limite de consultas da NASA foi atingido. Tente novamente mais tarde."
      : nasaResponse.status === 401 || nasaResponse.status === 403
        ? "A chave configurada no servidor não foi aceita pela NASA."
        : `A API da NASA não conseguiu atender à solicitação (HTTP ${nasaResponse.status}).`;
    sendJson(response, status, { error: message });
    return;
  }

  if (
    !data ||
    typeof data.date !== "string" ||
    typeof data.title !== "string" ||
    typeof data.explanation !== "string" ||
    !["image", "video"].includes(data.media_type) ||
    typeof data.url !== "string"
  ) {
    sendJson(response, 502, { error: "A API da NASA retornou dados incompletos." });
    return;
  }

  const apod = {
    date: data.date,
    title: data.title,
    explanation: data.explanation,
    media_type: data.media_type,
    url: data.url,
  };
  if (typeof data.hdurl === "string") {
    apod.hdurl = data.hdurl;
  }
  if (typeof data.copyright === "string") {
    apod.copyright = data.copyright;
  }

  sendJson(response, 200, apod);
}

async function handleRequest(request, response, fetchImpl) {
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url, "http://localhost");
  if (requestUrl.pathname === "/api/apod") {
    await handleApod(requestUrl, response, fetchImpl);
    return;
  }

  const file = STATIC_FILES[requestUrl.pathname];
  if (!file) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  fs.readFile(path.join(__dirname, file.name), (error, content) => {
    if (error) {
      sendJson(response, 500, { error: "Não foi possível carregar a página." });
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": file.type,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  });
}

function createServer(fetchImpl = globalThis.fetch) {
  return http.createServer((request, response) => {
    handleRequest(request, response, fetchImpl).catch(() => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendJson(response, 500, { error: "O servidor não conseguiu processar a solicitação." });
    });
  });
}

if (require.main === module) {
  createServer().listen(PORT, "127.0.0.1", () => {
    console.log(`Cosmos disponível em http://localhost:${PORT}`);
  });
}

module.exports = { createServer };
