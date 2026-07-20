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

function renderCard(card) {
  const fragment = cardTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".card-item");
  const statusBadge = fragment.querySelector(".status-badge");
  const link = fragment.querySelector(".card-link");

  article.dataset.cardId = card.id;
  statusBadge.textContent = STATUS_LABELS[card.status] ?? card.status;
  statusBadge.classList.add(`status-${card.status}`);
  fragment.querySelector(".card-id").textContent = card.id;
  fragment.querySelector(".festival-label").textContent = FESTIVAL_LABELS[card.festival] ?? card.festival;
  fragment.querySelector(".card-title").textContent = card.title;
  fragment.querySelector(".card-message").textContent = card.message;
  fragment.querySelector(".canonical-path").textContent = card.canonicalPath;
  fragment.querySelector(".short-code").textContent = `/${card.shortCode}`;
  fragment.querySelector(".publish-note").textContent = card.publicUrl ? "正式網址已設定" : "尚未設定正式網址";

  link.href = `../${card.cardPath}`;
  link.setAttribute("aria-label", `開啟${card.title}`);

  cardList.append(fragment);
}

async function loadCards() {
  try {
    const response = await fetch("../data/cards.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const cards = Array.isArray(data.cards) ? data.cards : [];

    cards.forEach(renderCard);
    cardCount.textContent = String(cards.length);
    publishedCount.textContent = String(cards.filter((card) => card.status === "published").length);
    catalogStatus.textContent = cards.length ? `共 ${cards.length} 張賀卡` : "目前沒有賀卡";
  } catch (error) {
    cardCount.textContent = "0";
    publishedCount.textContent = "0";
    catalogStatus.textContent = "無法讀取賀卡資料，請確認使用本機伺服器開啟。";
    catalogStatus.classList.add("is-error");
    console.error("Failed to load greeting card catalog:", error);
  }
}

loadCards();
