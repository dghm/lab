<?php
require_once __DIR__ . '/db.php';

/**
 * 外部資料抓取 + 快取。
 * 所有抓取都在伺服器端進行（cURL），避免瀏覽器 CORS 問題。
 */

/** 從快取讀取，未過期則回傳價格，否則回傳 null。 */
function cache_get(string $symbol): ?float
{
    $ttl = (int) config()['price_cache_ttl'];
    $stmt = db()->prepare(
        'SELECT price, fetched_at FROM price_cache WHERE symbol = ?'
    );
    $stmt->execute([$symbol]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $age = time() - strtotime($row['fetched_at']);
    return $age <= $ttl ? (float) $row['price'] : null;
}

function cache_put(string $symbol, float $price): void
{
    $stmt = db()->prepare(
        'INSERT INTO price_cache (symbol, price, fetched_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE price = VALUES(price), fetched_at = NOW()'
    );
    $stmt->execute([$symbol, $price]);
}

/** 通用 cURL GET。 */
function http_get(string $url, array $headers = []): ?string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (myInvestment dashboard)',
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($body !== false && $code === 200) ? $body : null;
}

/**
 * 抓 USD→TWD 匯率（以及其他幣別）。回傳 [幣別 => 兌 TWD 匯率]。
 * 來源：open.er-api.com（免金鑰）。TWD 對自己固定為 1。
 */
function fetch_fx_rates(array $currencies): array
{
    $out = ['TWD' => 1.0];
    foreach ($currencies as $cur) {
        if ($cur === 'TWD') {
            continue;
        }
        $sym    = "fx:$cur";
        $cached = cache_get($sym);
        if ($cached !== null) {
            $out[$cur] = $cached;
            continue;
        }
        // 以該幣別為基準，取對 TWD 的匯率
        $json = http_get("https://open.er-api.com/v6/latest/" . urlencode($cur));
        if ($json) {
            $data = json_decode($json, true);
            if (isset($data['rates']['TWD'])) {
                $rate = (float) $data['rates']['TWD'];
                cache_put($sym, $rate);
                $out[$cur] = $rate;
                continue;
            }
        }
        // 抓不到時，沿用快取中最後一次的值（即使過期），避免整頁壞掉
        $stmt = db()->prepare('SELECT price FROM price_cache WHERE symbol = ?');
        $stmt->execute([$sym]);
        $last = $stmt->fetchColumn();
        $out[$cur] = $last !== false ? (float) $last : 0.0;
    }
    return $out;
}

/**
 * 抓台股即時價。回傳 [代號 => 價格(TWD)]。
 * 來源：TWSE MIS API。先試上市(tse)，再試上櫃(otc)。
 * 取最新成交價 z，收盤前若為 '-' 則退而取昨收 y。
 */
function fetch_tw_stock_prices(array $tickers): array
{
    $out     = [];
    $toFetch = [];
    foreach ($tickers as $t) {
        $t = trim($t);
        if ($t === '') {
            continue;
        }
        $cached = cache_get("tw_stock:$t");
        if ($cached !== null) {
            $out[$t] = $cached;
        } else {
            $toFetch[] = $t;
        }
    }
    if (!$toFetch) {
        return $out;
    }

    // 同時查 tse 與 otc，命中哪個算哪個
    $chParts = [];
    foreach ($toFetch as $t) {
        $chParts[] = "tse_{$t}.tw";
        $chParts[] = "otc_{$t}.tw";
    }
    $exCh = implode('|', $chParts);
    $url  = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?json=1&ex_ch=' . urlencode($exCh);
    $json = http_get($url, ['Referer: https://mis.twse.com.tw/stock/']);

    if ($json) {
        $data = json_decode($json, true);
        foreach (($data['msgArray'] ?? []) as $row) {
            $code  = $row['c'] ?? null;
            if (!$code) {
                continue;
            }
            $price = null;
            foreach (['z', 'y', 'o', 'pz'] as $k) {   // 成交 / 昨收 / 開盤 / 上次成交
                if (isset($row[$k]) && is_numeric($row[$k])) {
                    $price = (float) $row[$k];
                    break;
                }
            }
            if ($price !== null) {
                cache_put("tw_stock:$code", $price);
                $out[$code] = $price;
            }
        }
    }

    // 仍抓不到的，沿用舊快取值（若有）
    foreach ($toFetch as $t) {
        if (!isset($out[$t])) {
            $stmt = db()->prepare('SELECT price FROM price_cache WHERE symbol = ?');
            $stmt->execute(["tw_stock:$t"]);
            $last = $stmt->fetchColumn();
            if ($last !== false) {
                $out[$t] = (float) $last;
            }
        }
    }
    return $out;
}

/**
 * 基金淨值（實驗性）。回傳 [ISIN => 每單位淨值(原幣)]。
 *
 * 銀行通路基金沒有穩定的免費公開 API，且各家識別碼不一，
 * 因此目前以「手動更新淨值」為主，這裡只負責回快取值。
 * 之後若找到可用來源（例如以 ISIN 查境外基金資訊觀測站），
 * 在下方填入抓取邏輯並 cache_put("fund:$isin", $nav) 即可自動接上，
 * 前端、估值都不用改。
 */
function fetch_fund_navs(array $isins): array
{
    $out = [];
    foreach (array_unique($isins) as $isin) {
        $isin = trim($isin);
        if ($isin === '') {
            continue;
        }
        $cached = cache_get("fund:$isin");
        if ($cached !== null) {
            $out[$isin] = $cached;
        }
        // TODO: 在此加入以 ISIN 抓淨值的來源，成功時 cache_put("fund:$isin", $nav)
    }
    return $out;
}

/**
 * 財經宏觀：美國 10 年期公債殖利率與相關新聞。
 * 殖利率採 FRED DGS10（日資料，來源為聯準會 H.15）；新聞只保留 Google News RSS
 * 的標題、來源、日期與連結。結果以暫存檔快取 30 分鐘，避免拖慢首頁。
 */
function fetch_macro_dashboard(): array
{
    $cacheFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR
        . 'myinvestment-macro-cache.json';
    if (is_file($cacheFile) && time() - filemtime($cacheFile) <= 1800) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($cached) && isset($cached['yield'])) {
            $cached['cached'] = true;
            return $cached;
        }
    }

    $result = [
        'yield' => fetch_us10y_yield(),
        'news' => fetch_us10y_news(),
        'source' => 'FRED DGS10 / Federal Reserve H.15',
        'sourceUrl' => 'https://fred.stlouisfed.org/series/DGS10',
        'fetchedAt' => date(DATE_ATOM),
        'cached' => false,
    ];
    if ($result['yield'] !== null) {
        @file_put_contents(
            $cacheFile,
            json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            LOCK_EX
        );
    }
    return $result;
}

function fetch_us10y_yield(): ?array
{
    // 限制近四個月，避免下載完整歷史資料在共享主機上超過 cURL 逾時。
    $start = date('Y-m-d', strtotime('-4 months'));
    $csv = http_get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=' . rawurlencode($start));
    if ($csv === null) {
        return null;
    }
    $points = [];
    foreach (preg_split('/\R/', trim($csv)) as $line) {
        $cols = str_getcsv($line);
        if (count($cols) < 2 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $cols[0]) || !is_numeric($cols[1])) {
            continue;
        }
        $points[] = ['date' => $cols[0], 'value' => (float) $cols[1]];
    }
    if (count($points) < 2) {
        return null;
    }

    $count = count($points);
    $latest = $points[$count - 1];
    $changeBp = static fn(float $from): float => round(($latest['value'] - $from) * 100, 1);
    return [
        'date' => $latest['date'],
        'value' => $latest['value'],
        'dayBp' => $changeBp($points[$count - 2]['value']),
        'weekBp' => $changeBp($points[max(0, $count - 6)]['value']),
        'monthBp' => $changeBp($points[max(0, $count - 23)]['value']),
        'points' => array_slice($points, -30),
    ];
}

function fetch_us10y_news(): array
{
    $query = rawurlencode('美國 10 年期 公債 殖利率 when:14d');
    $xmlText = http_get("https://news.google.com/rss/search?q={$query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant");
    if ($xmlText === null || !function_exists('simplexml_load_string')) {
        return [];
    }
    $xml = @simplexml_load_string($xmlText, SimpleXMLElement::class, LIBXML_NOCDATA | LIBXML_NONET);
    if ($xml === false) {
        return [];
    }

    $news = [];
    foreach ($xml->channel->item as $item) {
        $link = trim((string) $item->link);
        if (!str_starts_with($link, 'https://news.google.com/')) {
            continue;
        }
        $source = trim((string) $item->source);
        $title = trim((string) $item->title);
        if ($source !== '' && str_ends_with($title, ' - ' . $source)) {
            $title = substr($title, 0, -strlen(' - ' . $source));
        }
        $news[] = [
            'title' => $title,
            'source' => $source,
            'publishedAt' => date(DATE_ATOM, strtotime((string) $item->pubDate)),
            'url' => $link,
        ];
        if (count($news) >= 5) {
            break;
        }
    }
    return $news;
}
