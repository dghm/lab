const STATUS_LABELS = {
  draft: "草稿",
  preview: "預覽",
  published: "已發布",
  archived: "已封存"
};

const FESTIVAL_LABELS = {
  "mid-autumn": "Mid-Autumn Festival",
  christmas: "Christmas",
  "lunar-new-year": "Lunar New Year"
};

const cardList = document.querySelector("#card-list");
const cardTemplate = document.querySelector("#card-template");
const catalogStatus = document.querySelector("#catalog-status");
const cardCount = document.querySelector("#card-count");
const publishedCount = document.querySelector("#published-count");
const previewTitle = document.querySelector("#preview-title");
const previewStage = document.querySelector("#preview-stage");
const previewPlaceholder = document.querySelector(".preview-placeholder");
const deviceFrame = document.querySelector(".device-frame");
const previewIframe = document.querySelector("#card-preview");
const previewAddress = document.querySelector("#preview-address");
const previewState = document.querySelector("#preview-state");
const previewUrl = document.querySelector("#preview-url");
const openFullCard = document.querySelector("#open-full-card");
const deviceButtons = document.querySelectorAll(".device-button");

let selectedCardId = null;

function getCardUrl(card) {
  return `../${card.cardPath}`;
}

function toCssUrl(path) {
  return `url("${path.replace(/["\\]/g, "\\$&")}")`;
}

function selectCard(card, button) {
  selectedCardId = card.id;

  document.querySelectorAll(".card-select").forEach((item) => {
    const isSelected = item === button;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-pressed", String(isSelected));
  });

  const cardUrl = getCardUrl(card);
  previewTitle.textContent = card.title;
  previewIframe.src = cardUrl;
  previewIframe.title = `${card.title}預覽`;
  previewAddress.textContent = card.canonicalPath;
  previewState.textContent = STATUS_LABELS[card.status] ?? card.status;
  previewState.className = `preview-state status-${card.status}`;
  previewUrl.textContent = card.publicUrl ?? "正式網址尚未設定";
  openFullCard.href = cardUrl;
  openFullCard.hidden = false;
  previewPlaceholder.hidden = true;
  deviceFrame.hidden = false;
  previewStage.style.setProperty("--glow-image", toCssUrl(`../${card.previewImage}`));
  previewStage.classList.remove("is-empty");
}

function renderCard(card) {
  const fragment = cardTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".card-item");
  const selectButton = fragment.querySelector(".card-select");
  const statusBadge = fragment.querySelector(".status-badge");
  const thumbnail = fragment.querySelector(".card-thumbnail");

  article.dataset.cardId = card.id;
  selectButton.setAttribute("aria-label", `在預覽區顯示${card.title}`);
  selectButton.setAttribute("aria-pressed", "false");
  statusBadge.textContent = STATUS_LABELS[card.status] ?? card.status;
  statusBadge.classList.add(`status-${card.status}`);
  thumbnail.src = `../${card.previewImage}`;
  thumbnail.alt = `${card.title}最終畫面縮圖`;
  fragment.querySelector(".card-id").textContent = card.id;
  fragment.querySelector(".festival-label").textContent = FESTIVAL_LABELS[card.festival] ?? card.festival;
  fragment.querySelector(".card-title").textContent = card.title;
  fragment.querySelector(".card-message").textContent = card.message;
  fragment.querySelector(".canonical-path").textContent = card.canonicalPath;
  fragment.querySelector(".short-code").textContent = `/${card.shortCode}`;
  fragment.querySelector(".publish-note").textContent = card.publicUrl ? "正式網址已設定" : "尚未發布";
  selectButton.addEventListener("click", () => selectCard(card, selectButton));

  cardList.append(fragment);
  return selectButton;
}

function setDevice(device) {
  previewStage.dataset.device = device;
  deviceButtons.forEach((button) => {
    const isActive = button.dataset.device === device;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

deviceButtons.forEach((button) => {
  button.addEventListener("click", () => setDevice(button.dataset.device));
});

async function loadCards() {
  try {
    const response = await fetch("../data/cards.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const cards = Array.isArray(data.cards) ? data.cards : [];
    let firstButton = null;

    cards.forEach((card, index) => {
      const button = renderCard(card);
      if (index === 0) firstButton = button;
    });

    cardCount.textContent = String(cards.length);
    publishedCount.textContent = String(cards.filter((card) => card.status === "published").length);
    catalogStatus.textContent = cards.length ? `${cards.length} 張` : "目前沒有賀卡";

    if (cards.length && firstButton) {
      selectCard(cards[0], firstButton);
    }
  } catch (error) {
    cardCount.textContent = "0";
    publishedCount.textContent = "0";
    catalogStatus.textContent = "資料讀取失敗";
    catalogStatus.classList.add("is-error");
    console.error("Failed to load greeting card catalog:", error);
  }
}

setDevice("desktop");
loadCards();
