"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const APOD_API_URL = "https://api.nasa.gov/planetary/apod";
const APOD_PAGE_URL = "https://science.nasa.gov/apod/";
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

function getNasaDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/New_York",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function decodeHtml(value) {
  const entities = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== "#") {
      return entities[entity.toLowerCase()] || match;
    }

    const codePoint = entity[1].toLowerCase() === "x"
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
  });
}

function getMetaContent(html, property) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:name|property)=["']([^"']+)["']/i);
    const content = tag.match(/\bcontent=["']([^"']*)["']/i);
    if (name && content && name[1].toLowerCase() === property) {
      return decodeHtml(content[1]);
    }
  }
  return "";
}

function htmlToText(html) {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function getPageVideoUrl(html) {
  const metaVideo = getMetaContent(html, "og:video:secure_url")
    || getMetaContent(html, "og:video:url")
    || getMetaContent(html, "og:video");
  if (metaVideo) {
    return metaVideo;
  }

  const elements = html.match(/<(?:iframe|video|source)\b[^>]*>/gi) || [];
  for (const element of elements) {
    const source = element.match(/\b(?:src|data-src)=["']([^"']+)["']/i);
    if (!source) {
      continue;
    }

    const url = decodeHtml(source[1]);
    if (/youtube\.com|youtu\.be|vimeo\.com|\.mp4(?:[?#]|$)|\.webm(?:[?#]|$)/i.test(url)) {
      return url;
    }
  }
  return "";
}

async function sendOfficialApod(date, response, fetchImpl) {
  let pageResponse;
  try {
    pageResponse = await fetchImpl(`${APOD_PAGE_URL}?date=${encodeURIComponent(date)}`);
  } catch {
    sendJson(response, 502, { error: "Não foi possível conectar à página oficial da NASA." });
    return;
  }

  if (!pageResponse.ok) {
    sendJson(response, 502, { error: "A página oficial da NASA não conseguiu carregar esta data." });
    return;
  }

  let html;
  try {
    html = await pageResponse.text();
  } catch {
    sendJson(response, 502, { error: "A página oficial da NASA retornou uma resposta inválida." });
    return;
  }

  const publishedDate = getMetaContent(html, "article:published_time").slice(0, 10);
  if (publishedDate && publishedDate !== date) {
    sendJson(response, 404, { error: "O APOD desta data ainda não está disponível." });
    return;
  }

  const title = getMetaContent(html, "og:title")
    .replace(/^APOD:\s*\d{4}\s+[a-z]+\s+\d{1,2}\s*[–—-]\s*/i, "")
    .replace(/\s*-\s*Nasa Science$/i, "")
    .trim();
  const descriptionElement = html.match(/<p\b[^>]*class=["'][^"']*media-detail-hero__description[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  const explanation = descriptionElement
    ? htmlToText(descriptionElement[1]).replace(/^Explanation:\s*/i, "")
    : "";
  const videoUrl = getPageVideoUrl(html);
  const imageUrl = getMetaContent(html, "og:image");
  const mediaUrl = videoUrl || imageUrl;

  if (!title || !explanation || !mediaUrl) {
    sendJson(response, 502, { error: "A página oficial da NASA não trouxe os dados da imagem." });
    return;
  }

  sendJson(response, 200, {
    date: publishedDate || date,
    title,
    explanation,
    media_type: videoUrl ? "video" : "image",
    url: mediaUrl,
  });
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

  if (date > getNasaDate()) {
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

  if (data.title === "NASA Science" || /nasa-logo@2x\.png/i.test(data.url)) {
    await sendOfficialApod(date, response, fetchImpl);
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
