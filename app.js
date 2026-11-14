const API_URL = "/api/apod";

const datePicker = document.querySelector("#date-picker");
const loadButton = document.querySelector("#load-button");
const statusMessage = document.querySelector("#status-message");
const apodContent = document.querySelector("#apod-content");
const mediaContainer = document.querySelector("#media-container");
const imageDate = document.querySelector("#image-date");
const imageTitle = document.querySelector("#image-title");
const imageExplanation = document.querySelector("#image-explanation");
const imageCredit = document.querySelector("#image-credit");

const dateParts = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/New_York",
  year: "numeric",
}).formatToParts(new Date());
const today = `${dateParts.find((part) => part.type === "year").value}-${dateParts.find((part) => part.type === "month").value}-${dateParts.find((part) => part.type === "day").value}`;
datePicker.max = today;
datePicker.value = today;

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

try {
  localStorage.removeItem("cosmos-nasa-api-key");
} catch {
  console.warn("Não foi possível remover do navegador uma chave salva por uma versão anterior.");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function showMedia(data) {
  mediaContainer.replaceChildren();

  if (data.media_type === "image") {
    const image = document.createElement("img");
    image.src = data.hdurl || data.url;
    image.alt = data.title || "Imagem astronômica do dia";
    image.loading = "lazy";
    mediaContainer.append(image);
    return;
  }

  if (data.media_type === "video") {
    const frame = document.createElement("iframe");
    frame.src = data.url;
    frame.title = data.title || "Vídeo astronômico do dia";
    frame.loading = "lazy";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    mediaContainer.append(frame);
    return;
  }

  throw new Error("A NASA retornou um tipo de mídia não compatível.");
}

async function loadPicture(date) {
  if (!date) {
    setStatus("Escolha uma data para continuar.", true);
    datePicker.focus();
    return;
  }

  loadButton.disabled = true;
  datePicker.disabled = true;
  apodContent.setAttribute("aria-busy", "true");
  setStatus("Buscando a imagem...");
  imageDate.textContent = "";
  imageTitle.textContent = "Preparando sua viagem";
  imageExplanation.textContent = "";
  imageCredit.textContent = "";
  mediaContainer.innerHTML = '<div class="media-placeholder"><span class="loader" aria-hidden="true"></span><span>Conectando com o universo...</span></div>';

  try {
    const query = new URLSearchParams({ date });
    const response = await fetch(`${API_URL}?${query}`);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = response.status === 429
        ? "O limite de consultas da NASA foi atingido. Tente novamente mais tarde."
        : data?.error || data?.message || "Não foi possível carregar a imagem agora.";
      throw new Error(message);
    }

    if (!data) {
      throw new Error("A NASA retornou uma resposta inválida. Tente novamente mais tarde.");
    }

    showMedia(data);
    imageDate.textContent = formatDate(data.date);
    imageTitle.textContent = data.title || "Imagem astronômica do dia";
    imageExplanation.textContent = data.explanation || "";
    imageCredit.textContent = data.copyright ? `Créditos: ${data.copyright}` : "Créditos: NASA";
    setStatus("");
  } catch (error) {
    mediaContainer.replaceChildren();
    const placeholder = document.createElement("div");
    placeholder.className = "media-placeholder";
    placeholder.textContent = "Não foi possível carregar esta imagem.";
    mediaContainer.append(placeholder);
    imageTitle.textContent = "A jornada foi interrompida";
    const message = error instanceof Error ? error.message : "Verifique sua conexão e tente novamente.";
    setStatus(message, true);
  } finally {
    loadButton.disabled = false;
    datePicker.disabled = false;
    apodContent.setAttribute("aria-busy", "false");
  }
}

loadButton.addEventListener("click", () => loadPicture(datePicker.value));
datePicker.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadPicture(datePicker.value);
  }
});

loadPicture(today);
