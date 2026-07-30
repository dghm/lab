const STATUS_LABELS = {
  draft: "製作中",
  preview: "預覽",
  published: "公開中",
  archived: "已封存"
};

const FESTIVAL_LABELS = {
  "mid-autumn": "Mid-Autumn Festival",
  christmas: "Christmas",
  "lunar-new-year": "Lunar New Year"
};

const FESTIVAL_GLYPH = {
  "mid-autumn": "中",
  christmas: "聖",
  "lunar-new-year": "春"
};

// 檔期內依節慶時序排列：中秋 → 聖誕 → 隔年春節
const FESTIVAL_ORDER = { "mid-autumn": 0, christmas: 1, "lunar-new-year": 2 };

const ROSTER_STATUS = {
  sent: { cls: "sent", label: "已寄" },
  ready: { cls: "ready", label: "待寄出" },
  draft: { cls: "draft", label: "草稿" }
};

const cardList = document.querySelector("#card-list");
const cardTemplate = document.querySelector("#card-template");
const campaignSwitch = document.querySelector("#campaign-switch");
const catalogStatus = document.querySelector("#catalog-status");
const cardCount = document.querySelector("#card-count");
const publishedCount = document.querySelector("#published-count");
const personalCount = document.querySelector("#personal-count");

const modePreview = document.querySelector("#mode-preview");
const modeRoster = document.querySelector("#mode-roster");

const detailTitle = document.querySelector("#detail-title");
const previewStage = document.querySelector("#preview-stage");
const previewPlaceholder = document.querySelector(".preview-placeholder");
const deviceFrame = document.querySelector(".device-frame");
const previewIframe = document.querySelector("#card-preview");
const previewAddress = document.querySelector("#preview-address");
const previewState = document.querySelector("#preview-state");
const previewUrl = document.querySelector("#preview-url");
const openFullCard = document.querySelector("#open-full-card");
const deviceButtons = document.querySelectorAll(".device-button");

const rosterTitle = document.querySelector("#roster-title");
const rosterBody = document.querySelector("#roster-body");
const rosterCount = document.querySelector("#roster-count");
const rosterSrc = document.querySelector("#roster-src");
const rosterStat = document.querySelector("#roster-stat");
const rosterSearch = document.querySelector("#roster-search");

const greetingsById = new Map();
let selectedCardId = null;
let activeRoster = null;

function toCssUrl(path) {
  return `url("${path.replace(/["\\]/g, "\\$&")}")`;
}

function showMode(mode) {
  modePreview.hidden = mode !== "preview";
  modeRoster.hidden = mode !== "roster";
}

function selectCard(card, button) {
  selectedCardId = card.id;
  if (location.hash !== `#card=${card.id}`) {
    history.replaceState(null, "", `#card=${card.id}`);
  }
  document.querySelectorAll(".card-select").forEach((item) => {
    const isSelected = item === button;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-pressed", String(isSelected));
  });

  if (card.personalized) {
    showMode("roster");
    renderRoster(card);
  } else {
    showMode("preview");
    renderPreview(card);
  }
}

function renderPreview(card) {
  const cardUrl = `../${card.cardPath}`;
  detailTitle.textContent = card.title;
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
  if (card.previewImage) {
    previewStage.style.setProperty("--glow-image", toCssUrl(`../${card.previewImage}`));
  } else {
    previewStage.style.removeProperty("--glow-image");
  }
  previewStage.classList.remove("is-empty");
}

function renderRoster(card) {
  const data = greetingsById.get(card.id);
  rosterTitle.textContent = `${card.title} · 逐客戶版本`;

  if (!data) {
    activeRoster = null;
    rosterBody.innerHTML = '<tr><td colspan="4" class="roster-empty">找不到祝賀資料（' + card.greetingsPath + '）。</td></tr>';
    rosterCount.textContent = "";
    rosterSrc.textContent = "";
    rosterStat.textContent = "";
    return;
  }

  activeRoster = data.greetings;
  rosterSearch.value = "";
  rosterSrc.textContent = data.sample
    ? "資料來源：Airtable「聖誕祝賀」表（目前為範例種子資料，正式資料由產生器覆蓋）"
    : "資料來源：Airtable「聖誕祝賀」表 · 短碼自動配發、永不重用";
  const tally = { sent: 0, ready: 0, draft: 0 };
  data.greetings.forEach((g) => { tally[g.status] = (tally[g.status] ?? 0) + 1; });
  rosterStat.textContent = `已寄 ${tally.sent} · 待寄 ${tally.ready} · 草稿 ${tally.draft}`;
  filterRoster("");
}

function filterRoster(query) {
  if (!activeRoster) return;
  const q = query.trim().toLowerCase();
  const rows = activeRoster.filter((g) => {
    if (!q) return true;
    return [g.to, g.org, g.shortCode, g.message].some((v) => (v ?? "").toLowerCase().includes(q));
  });

  rosterCount.innerHTML = `顯示 <b>${rows.length}</b> / ${activeRoster.length} 份`;

  if (!rows.length) {
    rosterBody.innerHTML = '<tr><td colspan="4" class="roster-empty">沒有符合的客戶。</td></tr>';
    return;
  }

  rosterBody.innerHTML = rows.map((g) => {
    const s = ROSTER_STATUS[g.status] ?? { cls: "draft", label: g.status };
    const message = g.message
      ? `<td class="msg-cell"><span>${escapeHtml(g.message)}</span></td>`
      : '<td class="msg-cell is-empty">（祝賀詞撰寫中）</td>';
    const code = g.shortCode
      ? `<code>/${escapeHtml(g.shortCode)}</code>`
      : '<span class="no-code">—</span>';
    return `<tr>
      <td class="client">${escapeHtml(g.to)}<small>${escapeHtml(g.org ?? "")}</small></td>
      ${message}
      <td><span class="st ${s.cls}">${s.label}</span></td>
      <td>${code}</td>
    </tr>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function renderCard(card) {
  const fragment = cardTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".card-item");
  const selectButton = fragment.querySelector(".card-select");
  const statusBadge = fragment.querySelector(".status-badge");
  const kindTag = fragment.querySelector(".kind-tag");
  const crossTag = fragment.querySelector(".cross-tag");
  const thumbnail = fragment.querySelector(".card-thumbnail");
  const fallback = fragment.querySelector(".thumbnail-fallback");

  article.dataset.cardId = card.id;
  if (card.status === "archived") selectButton.classList.add("archived");
  selectButton.setAttribute("aria-label", `在右側顯示${card.title}`);
  selectButton.setAttribute("aria-pressed", "false");

  statusBadge.textContent = STATUS_LABELS[card.status] ?? card.status;
  statusBadge.classList.add(`status-${card.status}`);

  kindTag.textContent = card.personalized ? "個人化" : "公版";
  if (card.personalized) kindTag.classList.add("personal");

  if (card.year !== card.campaign) crossTag.hidden = false;

  if (card.previewImage) {
    thumbnail.src = `../${card.previewImage}`;
    thumbnail.alt = `${card.title}最終畫面縮圖`;
    fallback.hidden = true;
  } else {
    thumbnail.remove();
    fallback.textContent = FESTIVAL_GLYPH[card.festival] ?? "";
    fallback.classList.add(`fest-${card.festival}`);
  }

  fragment.querySelector(".festival-label").textContent = FESTIVAL_LABELS[card.festival] ?? card.festival;
  fragment.querySelector(".card-title").textContent = card.title;
  fragment.querySelector(".card-message").textContent = card.message;
  fragment.querySelector(".canonical-path").textContent = card.canonicalPath;
  fragment.querySelector(".short-code").textContent = `/${card.shortCode}`;

  const previewAction = fragment.querySelector(".preview-action");
  const publishNote = fragment.querySelector(".publish-note");
  if (card.personalized) {
    const count = greetingsById.get(card.id)?.greetings.length ?? 0;
    previewAction.textContent = "查看逐客戶清單";
    publishNote.textContent = count ? `共 ${count} 份` : "尚無版本";
  } else {
    previewAction.textContent = "在右側預覽";
    publishNote.textContent = card.publicUrl ? "正式網址已設定" : "尚未發布";
  }

  selectButton.addEventListener("click", () => selectCard(card, selectButton));
  cardList.append(fragment);
  return selectButton;
}

function renderCampaign(campaign, campaigns, selectId) {
  const cards = campaigns.get(campaign);
  catalogStatus.textContent = `${campaign} 檔期 · ${cards.length} 張`;

  document.querySelectorAll(".campaign-btn").forEach((btn) => {
    const isActive = Number(btn.dataset.campaign) === campaign;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  cardList.innerHTML = "";
  const buttons = cards.map((card) => renderCard(card));
  let targetIndex = selectId ? cards.findIndex((card) => card.id === selectId) : 0;
  if (targetIndex < 0) targetIndex = 0;
  if (buttons[targetIndex]) selectCard(cards[targetIndex], buttons[targetIndex]);
}

function buildCampaigns(cards) {
  const map = new Map();
  cards.forEach((card) => {
    if (!map.has(card.campaign)) map.set(card.campaign, []);
    map.get(card.campaign).push(card);
  });
  for (const list of map.values()) {
    list.sort((a, b) => (FESTIVAL_ORDER[a.festival] ?? 9) - (FESTIVAL_ORDER[b.festival] ?? 9));
  }
  return map;
}

function renderCampaignSwitch(campaigns, onSelect) {
  const years = [...campaigns.keys()].sort((a, b) => b - a);
  campaignSwitch.innerHTML = "";
  years.forEach((year) => {
    const count = campaigns.get(year).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "campaign-btn";
    btn.dataset.campaign = year;
    btn.setAttribute("role", "tab");
    btn.innerHTML = `<b>${year}</b><small>${count} 張</small>`;
    btn.addEventListener("click", () => onSelect(year));
    campaignSwitch.append(btn);
  });
  return years;
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

rosterSearch.addEventListener("input", (event) => filterRoster(event.target.value));

async function loadGreetings(cards) {
  const personalized = cards.filter((card) => card.personalized && card.greetingsPath);
  await Promise.all(personalized.map(async (card) => {
    try {
      const response = await fetch(`../${card.greetingsPath}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data.greetings)) greetingsById.set(card.id, data);
    } catch (error) {
      console.error(`Failed to load greetings for ${card.id}:`, error);
    }
  }));
}

async function loadCards() {
  try {
    const response = await fetch("../data/cards.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const cards = Array.isArray(data.cards) ? data.cards : [];

    await loadGreetings(cards);

    cardCount.textContent = String(cards.length);
    publishedCount.textContent = String(cards.filter((card) => card.status === "published").length);
    let personalTotal = 0;
    greetingsById.forEach((value) => { personalTotal += value.greetings.length; });
    personalCount.textContent = String(personalTotal);

    if (!cards.length) {
      catalogStatus.textContent = "目前沒有賀卡";
      return;
    }

    const campaigns = buildCampaigns(cards);
    const years = renderCampaignSwitch(campaigns, (year) => renderCampaign(year, campaigns));

    // 深連結：#card=<id> 直接開啟指定賀卡；否則選最新一個「還有非封存賀卡」的檔期
    const hashId = new URLSearchParams(location.hash.slice(1)).get("card");
    const linked = hashId && cards.find((card) => card.id === hashId);
    if (linked) {
      renderCampaign(linked.campaign, campaigns, linked.id);
    } else {
      const active = years.find((year) => campaigns.get(year).some((c) => c.status !== "archived")) ?? years[0];
      renderCampaign(active, campaigns);
    }
  } catch (error) {
    cardCount.textContent = "0";
    publishedCount.textContent = "0";
    personalCount.textContent = "0";
    catalogStatus.textContent = "資料讀取失敗";
    catalogStatus.classList.add("is-error");
    console.error("Failed to load greeting card catalog:", error);
  }
}

setDevice("desktop");
loadCards();
