<?php
/**
 * 設定檔範本。部署時複製成 config.php 並填入實際連線資訊。
 * config.php 已被 .gitignore 排除，不會進版控。
 *   cp config.sample.php config.php
 */
return [
    'db' => [
        'host'    => 'localhost',
        'name'    => 'your_db_name',
        'user'    => 'your_db_user',
        'pass'    => 'your_db_password',
        'charset' => 'utf8mb4',
    ],

    'base_currency'   => 'TWD',   // 基準幣別：所有資產換算成這個幣別加總
    'price_cache_ttl' => 900,     // 價格／匯率快取秒數（避免重複打外部 API）
];
