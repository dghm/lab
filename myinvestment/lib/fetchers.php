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
 * 殖利率採美國財政部 Daily Treasury Par Yield Curve Rates；新聞只保留 Google News RSS
 * 的標題、來源、日期與連結。結果以暫存檔快取 30 分鐘，避免拖慢首頁。
 */
function fetch_macro_dashboard(): array
{
    $cacheFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR
        . 'myinvestment-macro-cache-v2.json';
    if (is_file($cacheFile) && time() - filemtime($cacheFile) <= 1800) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($cached) && isset($cached['yield'], $cached['compass'])) {
            $cached['cached'] = true;
            return $cached;
        }
    }

    $yield = fetch_us10y_yield();
    $result = [
        'yield' => $yield,
        'compass' => $yield !== null ? build_market_compass($yield['points']) : null,
        'news' => fetch_us10y_news(),
        'source' => 'U.S. Treasury Daily Par Yield Curve Rates',
        'sourceUrl' => 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates',
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
    $year = (int) date('Y');
    $points = fetch_treasury_10y_year($year);
    if (count($points) < 30) {
        $points = array_merge(fetch_treasury_10y_year($year - 1), $points);
    }
    if (count($points) < 2) {
        return null;
    }
    usort($points, static fn(array $a, array $b): int => strcmp($a['date'], $b['date']));

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

function fetch_treasury_10y_year(int $year): array
{
    $url = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
        . "daily-treasury-rates.csv/{$year}/all?type=daily_treasury_yield_curve"
        . "&field_tdr_date_value={$year}&page&_format=csv";
    $csv = http_get($url);
    if ($csv === null) {
        return [];
    }

    $lines = preg_split('/\R/', trim($csv));
    $header = str_getcsv(array_shift($lines));
    $dateIndex = array_search('Date', $header, true);
    $twoYearIndex = array_search('2 Yr', $header, true);
    $tenYearIndex = array_search('10 Yr', $header, true);
    if ($dateIndex === false || $twoYearIndex === false || $tenYearIndex === false) {
        return [];
    }

    $points = [];
    foreach ($lines as $line) {
        $cols = str_getcsv($line);
        if (!isset($cols[$dateIndex], $cols[$twoYearIndex], $cols[$tenYearIndex])
            || !is_numeric($cols[$twoYearIndex]) || !is_numeric($cols[$tenYearIndex])) {
            continue;
        }
        $date = DateTime::createFromFormat('m/d/Y', $cols[$dateIndex]);
        if ($date === false) {
            continue;
        }
        $points[] = [
            'date' => $date->format('Y-m-d'),
            'value' => (float) $cols[$tenYearIndex],
            'twoYear' => (float) $cols[$twoYearIndex],
        ];
    }
    return $points;
}

function fetch_treasury_real_10y_year(int $year): array
{
    $url = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
        . "daily-treasury-rates.csv/{$year}/all?type=daily_treasury_real_yield_curve"
        . "&field_tdr_date_value={$year}&page&_format=csv";
    $csv = http_get($url);
    if ($csv === null) {
        return [];
    }

    $lines = preg_split('/\R/', trim($csv));
    $header = str_getcsv(array_shift($lines));
    $dateIndex = array_search('Date', $header, true);
    $tenYearIndex = array_search('10 YR', $header, true);
    if ($dateIndex === false || $tenYearIndex === false) {
        return [];
    }

    $points = [];
    foreach ($lines as $line) {
        $cols = str_getcsv($line);
        if (!isset($cols[$dateIndex], $cols[$tenYearIndex]) || !is_numeric($cols[$tenYearIndex])) {
            continue;
        }
        $date = DateTime::createFromFormat('m/d/Y', $cols[$dateIndex]);
        if ($date !== false) {
            $points[] = ['date' => $date->format('Y-m-d'), 'value' => (float) $cols[$tenYearIndex]];
        }
    }
    usort($points, static fn(array $a, array $b): int => strcmp($a['date'], $b['date']));
    return $points;
}

/**
 * 市場羅盤只描述環境傾向，不產生買賣指令。門檻是為個人儀表板提供一致、
 * 可解釋的觀察尺度，不是統計預測模型。
 */
function build_market_compass(array $nominalPoints): ?array
{
    if (count($nominalPoints) < 2) {
        return null;
    }
    $year = (int) date('Y');
    $realPoints = fetch_treasury_real_10y_year($year);
    if (count($realPoints) < 30) {
        $realPoints = array_merge(fetch_treasury_real_10y_year($year - 1), $realPoints);
        usort($realPoints, static fn(array $a, array $b): int => strcmp($a['date'], $b['date']));
    }
    if (count($realPoints) < 2) {
        return null;
    }

    $nCount = count($nominalPoints);
    $rCount = count($realPoints);
    $nominal = $nominalPoints[$nCount - 1];
    $nominalMonth = $nominalPoints[max(0, $nCount - 23)];
    $real = $realPoints[$rCount - 1];
    $realMonth = $realPoints[max(0, $rCount - 23)];
    $nominalChangeBp = round(($nominal['value'] - $nominalMonth['value']) * 100, 1);
    $realChangeBp = round(($real['value'] - $realMonth['value']) * 100, 1);
    $curve = round($nominal['value'] - $nominal['twoYear'], 2);
    $breakeven = round($nominal['value'] - $real['value'], 2);

    $fundingState = ($nominal['value'] >= 4.5 || $nominalChangeBp >= 15) ? 'caution'
        : ($nominalChangeBp <= -15 ? 'supportive' : 'neutral');
    $realState = ($real['value'] >= 2.0 || $realChangeBp >= 10) ? 'caution'
        : ($realChangeBp <= -10 ? 'supportive' : 'neutral');
    $curveState = $curve < 0 ? 'caution' : ($curve >= 0.25 ? 'supportive' : 'neutral');
    $inflationState = $breakeven >= 2.5 ? 'caution' : ($breakeven < 2.0 ? 'supportive' : 'neutral');

    $signals = [
        [
            'key' => 'funding', 'title' => '長期資金成本', 'value' => number_format($nominal['value'], 2) . '%',
            'state' => $fundingState,
            'label' => $fundingState === 'caution' ? '偏高' : ($fundingState === 'supportive' ? '下降中' : '平穩'),
            'detail' => '近月 ' . signed_bp($nominalChangeBp) . '；殖利率越高，股票與長債估值壓力通常越大。',
        ],
        [
            'key' => 'real', 'title' => '實質利率壓力', 'value' => number_format($real['value'], 2) . '%',
            'state' => $realState,
            'label' => $realState === 'caution' ? '估值承壓' : ($realState === 'supportive' ? '壓力減輕' : '中性'),
            'detail' => '近月 ' . signed_bp($realChangeBp) . '；科技、機器人等成長資產對此較敏感。',
        ],
        [
            'key' => 'curve', 'title' => '景氣曲線 10Y−2Y', 'value' => signed_pct($curve),
            'state' => $curveState,
            'label' => $curve < 0 ? '仍倒掛' : ($curve >= 0.25 ? '正斜率' : '偏平'),
            'detail' => '正值代表長債殖利率高於短債；曲線方向需搭配景氣與信用風險解讀。',
        ],
        [
            'key' => 'inflation', 'title' => '10 年通膨預期', 'value' => number_format($breakeven, 2) . '%',
            'state' => $inflationState,
            'label' => $inflationState === 'caution' ? '偏熱' : ($inflationState === 'supportive' ? '偏低' : '溫和'),
            'detail' => '以名目殖利率減實質殖利率估算；偏高時通常不利長天期債券。',
        ],
    ];

    $assetViews = [
        market_asset_view('台股／0050', [$fundingState, $realState], '留意外資與電子股估值；以定期投入取代單日追價。'),
        market_asset_view('科技／機器人成長基金', [$realState, $fundingState], '對實質利率最敏感，利率偏高時波動通常較大。'),
        market_asset_view('債券／房貸收益基金', [$fundingState, $inflationState], '殖利率偏高壓抑價格，但新投資收益率也會提高。'),
        market_asset_view('現金部位', [opposite_state($fundingState)], '利率偏高時保留現金的機會成本較低，可作為再平衡彈藥。'),
    ];

    return [
        'date' => min($nominal['date'], $real['date']),
        'signals' => $signals,
        'assetViews' => $assetViews,
        'disclaimer' => '依公開利率資料判讀環境傾向，非報酬預測或買賣建議。',
    ];
}

function signed_bp(float $value): string
{
    return ($value > 0 ? '+' : '') . number_format($value, 1) . ' bp';
}

function signed_pct(float $value): string
{
    return ($value > 0 ? '+' : '') . number_format($value, 2) . '%';
}

function opposite_state(string $state): string
{
    return $state === 'caution' ? 'supportive' : ($state === 'supportive' ? 'caution' : 'neutral');
}

function market_asset_view(string $name, array $states, string $detail): array
{
    $score = 0;
    foreach ($states as $state) {
        $score += $state === 'supportive' ? 1 : ($state === 'caution' ? -1 : 0);
    }
    $state = $score > 0 ? 'supportive' : ($score < 0 ? 'caution' : 'neutral');
    return [
        'name' => $name,
        'state' => $state,
        'label' => $state === 'supportive' ? '環境較有利' : ($state === 'caution' ? '環境偏逆風' : '環境中性'),
        'detail' => $detail,
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
