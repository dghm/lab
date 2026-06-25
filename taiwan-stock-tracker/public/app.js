(function () {
  var TWSE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
  var BWIBBU_URL = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL";
  var REVENUE_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap05_L";
  var BALANCE_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap07_L";
  var CONCENTRATION_URL = "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5";

  var CACHE_KEY = "tw-stock-cache-v1";
  var WATCHLIST_KEY = "tw-stock-watchlist-v1";
  var CACHE_MAX_AGE_MS = 1000 * 60 * 30; // 30 minutes
  var FUNDAMENTALS_MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12 hours

  var stockMap = {}; // code -> {code, name, close, change, open, high, low, volume}
  var stockList = [];

  // lazily-loaded fundamentals datasets, keyed by company code
  var valuationMap = null; // PER / dividend yield / PBR
  var revenueMap = null; // monthly revenue
  var balanceMap = null; // balance sheet
  var concentrationMap = null; // TDCC shareholding distribution (by tier)
  var fundamentalsLoading = false;

  var searchInput = document.getElementById("search-input");
  var searchResults = document.getElementById("search-results");
  var searchStatus = document.getElementById("search-status");
  var watchlistBody = document.getElementById("watchlist-body");
  var refreshBtn = document.getElementById("refresh-btn");
  var updatedAt = document.getElementById("updated-at");

  var modalOverlay = document.getElementById("detail-modal");
  var modalBody = document.getElementById("detail-modal-body");
  var modalTitle = document.getElementById("detail-modal-title");
  var modalClose = document.getElementById("detail-modal-close");

  function loadWatchlist() {
    try {
      return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveWatchlist(list) {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  }

  function addToWatchlist(code) {
    var list = loadWatchlist();
    if (list.indexOf(code) === -1) {
      list.push(code);
      saveWatchlist(list);
      renderWatchlist();
    }
  }

  function removeFromWatchlist(code) {
    var list = loadWatchlist().filter(function (c) {
      return c !== code;
    });
    saveWatchlist(list);
    renderWatchlist();
  }

  function setStatus(el, text, isError) {
    el.textContent = text || "";
    el.classList.toggle("error", !!isError);
  }

  function parseRecord(item) {
    var change = parseFloat(item.Change);
    if (isNaN(change)) change = 0;
    var close = parseFloat(item.ClosingPrice);
    var prevClose = isNaN(close) ? null : close - change;
    var changePct = prevClose && prevClose !== 0 ? (change / prevClose) * 100 : 0;
    return {
      code: item.Code,
      name: item.Name,
      open: item.OpeningPrice,
      high: item.HighestPrice,
      low: item.LowestPrice,
      close: item.ClosingPrice,
      change: change,
      changePct: changePct,
      volume: item.TradeVolume
    };
  }

  function buildMap(records) {
    var map = {};
    records.forEach(function (r) {
      map[r.code] = r;
    });
    return map;
  }

  function readCache() {
    try {
      var raw = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (!raw || !raw.records || !raw.fetchedAt) return null;
      return raw;
    } catch (e) {
      return null;
    }
  }

  function writeCache(records) {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ records: records, fetchedAt: Date.now() })
    );
  }

  function applyData(records, fetchedAt) {
    stockList = records;
    stockMap = buildMap(records);
    if (fetchedAt) {
      updatedAt.textContent = "資料時間：" + new Date(fetchedAt).toLocaleString("zh-TW");
    }
    renderWatchlist();
  }

  function fetchStockData(force) {
    var cached = readCache();
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS) {
      applyData(cached.records, cached.fetchedAt);
      return Promise.resolve();
    }

    setStatus(searchStatus, "更新資料中…", false);
    return fetch(TWSE_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var records = data.map(parseRecord);
        writeCache(records);
        applyData(records, Date.now());
        setStatus(searchStatus, "", false);
      })
      .catch(function (err) {
        if (cached) {
          applyData(cached.records, cached.fetchedAt);
          setStatus(searchStatus, "無法取得最新資料，顯示快取資料（" + err.message + "）", true);
        } else {
          setStatus(searchStatus, "無法取得資料：" + err.message, true);
        }
      });
  }

  function formatChange(rec) {
    var sign = rec.change > 0 ? "+" : "";
    return sign + rec.change.toFixed(2) + " (" + sign + rec.changePct.toFixed(2) + "%)";
  }

  // ---- fundamentals (valuation / revenue / balance sheet) ----

  function findField(obj, label, excludeLabel) {
    if (Object.prototype.hasOwnProperty.call(obj, label)) return obj[label];
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf(label) !== -1 && (!excludeLabel || k.indexOf(excludeLabel) === -1)) {
        return obj[k];
      }
    }
    return undefined;
  }

  function recordCode(obj) {
    return obj.Code || obj["公司代號"] || obj["證券代號"] || "";
  }

  function fetchJsonCached(url, cacheKey, maxAge, force) {
    var cacheRaw = null;
    try {
      cacheRaw = JSON.parse(localStorage.getItem(cacheKey));
    } catch (e) {
      cacheRaw = null;
    }

    if (!force && cacheRaw && Date.now() - cacheRaw.fetchedAt < maxAge) {
      return Promise.resolve(cacheRaw.data);
    }

    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        localStorage.setItem(cacheKey, JSON.stringify({ data: data, fetchedAt: Date.now() }));
        return data;
      })
      .catch(function (err) {
        if (cacheRaw) return cacheRaw.data;
        throw err;
      });
  }

  function keyByCode(list) {
    var map = {};
    list.forEach(function (item) {
      var code = recordCode(item);
      if (code) map[code] = item;
    });
    return map;
  }

  // TDCC's open data endpoint returns either JSON or a plain CSV body depending
  // on dataset; handle both so a format change degrades gracefully instead of throwing.
  function parseJsonOrCsv(text) {
    var trimmed = text.replace(/^﻿/, "").trim();
    if (trimmed.charAt(0) === "[" || trimmed.charAt(0) === "{") {
      return JSON.parse(trimmed);
    }
    var lines = trimmed.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    var headers = lines[0].split(",").map(function (h) {
      return h.trim();
    });
    return lines.slice(1).map(function (line) {
      var cols = line.split(",");
      var obj = {};
      headers.forEach(function (h, i) {
        obj[h] = (cols[i] || "").trim();
      });
      return obj;
    });
  }

  function fetchTextCached(url, cacheKey, maxAge, force) {
    var cacheRaw = null;
    try {
      cacheRaw = JSON.parse(localStorage.getItem(cacheKey));
    } catch (e) {
      cacheRaw = null;
    }

    if (!force && cacheRaw && Date.now() - cacheRaw.fetchedAt < maxAge) {
      return Promise.resolve(cacheRaw.data);
    }

    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var data = parseJsonOrCsv(text);
        localStorage.setItem(cacheKey, JSON.stringify({ data: data, fetchedAt: Date.now() }));
        return data;
      })
      .catch(function (err) {
        if (cacheRaw) return cacheRaw.data;
        throw err;
      });
  }

  function groupConcentrationByCode(rows) {
    var byCode = {};
    rows.forEach(function (row) {
      var code = findField(row, "證券代號") || findField(row, "代號");
      if (!code) return;
      if (!byCode[code]) byCode[code] = [];
      byCode[code].push(row);
    });

    var result = {};
    Object.keys(byCode).forEach(function (code) {
      var rowsForCode = byCode[code];
      var latestDate = rowsForCode.reduce(function (max, row) {
        var d = findField(row, "資料日期") || "";
        return d > max ? d : max;
      }, "");
      result[code] = {
        date: latestDate,
        tiers: rowsForCode.filter(function (row) {
          return (findField(row, "資料日期") || "") === latestDate;
        })
      };
    });
    return result;
  }

  function ensureFundamentalsLoaded() {
    if (valuationMap && revenueMap && balanceMap && concentrationMap) {
      return Promise.resolve();
    }
    if (fundamentalsLoading) {
      return fundamentalsLoading;
    }

    fundamentalsLoading = Promise.all([
      fetchJsonCached(BWIBBU_URL, "tw-stock-valuation-v1", FUNDAMENTALS_MAX_AGE_MS, false),
      fetchJsonCached(REVENUE_URL, "tw-stock-revenue-v1", FUNDAMENTALS_MAX_AGE_MS, false),
      fetchJsonCached(BALANCE_URL, "tw-stock-balance-v1", FUNDAMENTALS_MAX_AGE_MS, false),
      fetchTextCached(CONCENTRATION_URL, "tw-stock-concentration-v1", FUNDAMENTALS_MAX_AGE_MS, false).catch(
        function () {
          return [];
        }
      )
    ]).then(function (results) {
      valuationMap = keyByCode(results[0]);
      revenueMap = keyByCode(results[1]);
      balanceMap = keyByCode(results[2]);
      concentrationMap = groupConcentrationByCode(results[3]);
    });

    return fundamentalsLoading;
  }

  function buildDetailRow(label, value) {
    return (
      '<div class="detail-row"><span class="detail-label">' +
      label +
      '</span><span class="detail-value">' +
      (value === undefined || value === null || value === "" ? "—" : value) +
      "</span></div>"
    );
  }

  function renderFundamentals(code, name) {
    var html = "";

    var val = valuationMap[code];
    html += '<h3 class="detail-section-title">市場評價</h3>';
    if (val) {
      var per = findField(val, "本益比") || val.PEratio;
      var yieldPct = findField(val, "殖利率") || val.DividendYield;
      var pbr = findField(val, "淨值比") || val.PBratio;
      html += buildDetailRow("本益比 (PER)", per);
      html += buildDetailRow("殖利率", yieldPct ? yieldPct + "%" : null);
      html += buildDetailRow("股價淨值比 (PBR)", pbr);
    } else {
      html += buildDetailRow("資料", "查無評價資料");
    }

    var rev = revenueMap[code];
    html += '<h3 class="detail-section-title">月營收</h3>';
    if (rev) {
      var period = findField(rev, "資料年月");
      var current = findField(rev, "當月營收");
      var momPct = findField(rev, "上月比較增減");
      var yoyPct = findField(rev, "去年同月增減") || findField(rev, "去年同月比較增減");
      html += buildDetailRow("資料年月", period);
      html += buildDetailRow("當月營收（千元）", current ? Number(current).toLocaleString("zh-TW") : null);
      html += buildDetailRow("較上月增減", momPct ? momPct + "%" : null);
      html += buildDetailRow("較去年同月增減", yoyPct ? yoyPct + "%" : null);
    } else {
      html += buildDetailRow("資料", "查無營收資料");
    }

    var bal = balanceMap[code];
    html += '<h3 class="detail-section-title">資產負債（關鍵比率）</h3>';
    if (bal) {
      var assets = parseFloat(findField(bal, "資產總額"));
      var liabilities = parseFloat(findField(bal, "負債總額"));
      var equity = parseFloat(findField(bal, "權益總額"));
      var currentAssets = parseFloat(findField(bal, "流動資產", "非流動"));
      var currentLiabilities = parseFloat(findField(bal, "流動負債", "非流動"));
      var debtRatio = !isNaN(assets) && assets !== 0 && !isNaN(liabilities) ? (liabilities / assets) * 100 : null;
      var currentRatio =
        !isNaN(currentAssets) && !isNaN(currentLiabilities) && currentLiabilities !== 0
          ? (currentAssets / currentLiabilities) * 100
          : null;
      html += buildDetailRow("資產總額（千元）", isNaN(assets) ? null : assets.toLocaleString("zh-TW"));
      html += buildDetailRow("負債總額（千元）", isNaN(liabilities) ? null : liabilities.toLocaleString("zh-TW"));
      html += buildDetailRow("權益總額（千元）", isNaN(equity) ? null : equity.toLocaleString("zh-TW"));
      html += buildDetailRow("負債比", debtRatio !== null ? debtRatio.toFixed(2) + "%" : null);
      html += buildDetailRow("流動比率", currentRatio !== null ? currentRatio.toFixed(2) + "%" : null);
    } else {
      html += buildDetailRow("資料", "查無資產負債資料（金融業等不適用一般業財報格式）");
    }

    html += '<h3 class="detail-section-title">股權分散（集保庫存週報）</h3>';
    var concentration = concentrationMap[code];
    if (concentration && concentration.tiers.length) {
      html += buildDetailRow("資料日期", concentration.date);
      html += '<table class="detail-table"><thead><tr><th>持股分級</th><th>人數</th><th>占集保庫存比例</th></tr></thead><tbody>';
      concentration.tiers.forEach(function (tier) {
        var level = findField(tier, "持股分級") || "";
        var holders = findField(tier, "人數") || "";
        var pct = findField(tier, "比例") || "";
        html +=
          "<tr><td>" + level + "</td><td>" + Number(holders || 0).toLocaleString("zh-TW") + "</td><td>" + pct + "%</td></tr>";
      });
      html += "</tbody></table>";
    } else {
      html += buildDetailRow("資料", "查無股權分散資料");
    }

    html += '<h3 class="detail-section-title">新聞與董監持股（外部連結）</h3>';
    html += '<div class="detail-links">';
    html +=
      '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://tw.stock.yahoo.com/quote/' +
      code +
      '.TW">Yahoo奇摩股市 — 個股總覽</a>';
    html +=
      '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://tw.stock.yahoo.com/quote/' +
      code +
      '.TW/news">Yahoo奇摩股市 — 相關新聞</a>';
    html +=
      '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://goodinfo.tw/tw/EquityDistributionClassHis.asp?STOCK_ID=' +
      code +
      '">Goodinfo — 股權分散表</a>';
    html +=
      '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://mops.twse.com.tw/mops/web/t05st03?TYPEK=&co_id=' +
      code +
      '">公開資訊觀測站 — 公司基本資料／董監持股</a>';
    html += "</div>";

    modalBody.innerHTML = html;
  }

  function openDetailModal(code, name) {
    modalTitle.textContent = code + " " + name;
    modalBody.innerHTML = '<div class="status-line">載入基本面資料中…</div>';
    modalOverlay.classList.add("open");

    ensureFundamentalsLoaded()
      .then(function () {
        renderFundamentals(code, name);
      })
      .catch(function (err) {
        modalBody.innerHTML =
          '<div class="status-line error">無法載入基本面資料：' +
          err.message +
          "</div>" +
          '<div class="detail-links">' +
          '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://tw.stock.yahoo.com/quote/' +
          code +
          '.TW">Yahoo奇摩股市 — 個股總覽</a>' +
          "</div>";
      });
  }

  function closeDetailModal() {
    modalOverlay.classList.remove("open");
  }

  modalClose.addEventListener("click", closeDetailModal);
  modalOverlay.addEventListener("click", function (e) {
    if (e.target === modalOverlay) closeDetailModal();
  });

  // ---- search / watchlist rendering ----

  function renderSearchResults(query) {
    searchResults.innerHTML = "";
    if (!query) return;

    var q = query.trim().toLowerCase();
    if (!q) return;

    var matches = stockList
      .filter(function (r) {
        return (
          r.code.toLowerCase().indexOf(q) !== -1 ||
          (r.name || "").toLowerCase().indexOf(q) !== -1
        );
      })
      .slice(0, 15);

    if (matches.length === 0) {
      var none = document.createElement("div");
      none.className = "status-line";
      none.textContent = "找不到符合的個股";
      searchResults.appendChild(none);
      return;
    }

    matches.forEach(function (rec) {
      var row = document.createElement("div");
      row.className = "search-result-item";

      var meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML =
        '<span class="code">' + rec.code + '</span><span class="name">' + rec.name + "</span>";

      var addBtn = document.createElement("button");
      addBtn.className = "btn btn-sm btn-primary";
      addBtn.textContent = "加入追蹤";
      addBtn.addEventListener("click", function () {
        addToWatchlist(rec.code);
      });

      row.appendChild(meta);
      row.appendChild(addBtn);
      searchResults.appendChild(row);
    });
  }

  function renderWatchlist() {
    var list = loadWatchlist();
    watchlistBody.innerHTML = "";

    if (list.length === 0) {
      var emptyRow = document.createElement("tr");
      emptyRow.className = "empty-row";
      var cell = document.createElement("td");
      cell.colSpan = 9;
      cell.textContent = "尚未追蹤任何個股，請使用上方搜尋新增。";
      emptyRow.appendChild(cell);
      watchlistBody.appendChild(emptyRow);
      return;
    }

    list.forEach(function (code) {
      var rec = stockMap[code];
      var tr = document.createElement("tr");

      if (!rec) {
        tr.innerHTML = '<td>' + code + '</td><td colspan="7">查無資料</td>';
        var td = document.createElement("td");
        appendRemoveBtn(td, code);
        tr.appendChild(td);
        watchlistBody.appendChild(tr);
        return;
      }

      var changeClass = rec.change > 0 ? "price-up" : rec.change < 0 ? "price-down" : "";

      tr.innerHTML =
        "<td>" + rec.code + "</td>" +
        '<td><button class="name-link" title="查看基本面詳細資料">' + rec.name + "</button></td>" +
        '<td class="' + changeClass + '">' + rec.close + "</td>" +
        '<td class="' + changeClass + '">' + formatChange(rec) + "</td>" +
        "<td>" + rec.open + "</td>" +
        "<td>" + rec.high + "</td>" +
        "<td>" + rec.low + "</td>" +
        "<td>" + Number(rec.volume).toLocaleString("zh-TW") + "</td>";

      tr.querySelector(".name-link").addEventListener("click", function () {
        openDetailModal(rec.code, rec.name);
      });

      var actionTd = document.createElement("td");
      appendRemoveBtn(actionTd, code);
      tr.appendChild(actionTd);

      watchlistBody.appendChild(tr);
    });
  }

  function appendRemoveBtn(td, code) {
    var btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.title = "取消追蹤";
    btn.textContent = "✕";
    btn.addEventListener("click", function () {
      removeFromWatchlist(code);
    });
    td.appendChild(btn);
  }

  searchInput.addEventListener("input", function () {
    renderSearchResults(searchInput.value);
  });

  refreshBtn.addEventListener("click", function () {
    fetchStockData(true);
  });

  fetchStockData(false);
})();
