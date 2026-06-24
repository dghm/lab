(function () {
  var TWSE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
  var CACHE_KEY = "tw-stock-cache-v1";
  var WATCHLIST_KEY = "tw-stock-watchlist-v1";
  var CACHE_MAX_AGE_MS = 1000 * 60 * 30; // 30 minutes

  var stockMap = {}; // code -> {code, name, close, change, open, high, low, volume}
  var stockList = [];

  var searchInput = document.getElementById("search-input");
  var searchResults = document.getElementById("search-results");
  var searchStatus = document.getElementById("search-status");
  var watchlistBody = document.getElementById("watchlist-body");
  var refreshBtn = document.getElementById("refresh-btn");
  var updatedAt = document.getElementById("updated-at");

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
        tr.innerHTML =
          '<td>' + code + '</td><td colspan="7">查無資料</td>';
        var td = document.createElement("td");
        appendRemoveBtn(td, code);
        tr.appendChild(td);
        watchlistBody.appendChild(tr);
        return;
      }

      var changeClass = rec.change > 0 ? "price-up" : rec.change < 0 ? "price-down" : "";

      tr.innerHTML =
        "<td>" + rec.code + "</td>" +
        "<td>" + rec.name + "</td>" +
        '<td class="' + changeClass + '">' + rec.close + "</td>" +
        '<td class="' + changeClass + '">' + formatChange(rec) + "</td>" +
        "<td>" + rec.open + "</td>" +
        "<td>" + rec.high + "</td>" +
        "<td>" + rec.low + "</td>" +
        "<td>" + Number(rec.volume).toLocaleString("zh-TW") + "</td>";

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
