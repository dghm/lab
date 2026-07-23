const DATASETS = {
  daily: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  valuation: "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL",
  revenue: "https://openapi.twse.com.tw/v1/opendata/t187ap05_L",
  balance: "https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci",
  concentration: "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5"
};

const ALLOWED_ORIGINS = new Set([
  "https://lab.dghm.tw",
  "https://dghm-taiwan-stock-tracker.netlify.app",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
]);

function headersFor(event, extra) {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const headers = Object.assign({ "Vary": "Origin" }, extra || {});
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: headersFor(event, { "Access-Control-Allow-Methods": "GET, OPTIONS" }),
      body: ""
    };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: headersFor(event, { Allow: "GET" }), body: "Method Not Allowed" };
  }

  const dataset = event.queryStringParameters && event.queryStringParameters.dataset;
  const upstreamUrl = DATASETS[dataset];
  if (!upstreamUrl) {
    return { statusCode: 400, headers: headersFor(event), body: "Unknown dataset" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, 15000);

  try {
    const response = await fetch(upstreamUrl, {
      headers: { Accept: dataset === "concentration" ? "text/csv,*/*" : "application/json" },
      signal: controller.signal
    });
    const body = await response.text();

    if (!response.ok) {
      return { statusCode: 502, headers: headersFor(event), body: "Upstream returned HTTP " + response.status };
    }

    if (dataset !== "concentration") {
      try {
        const parsed = JSON.parse(body);
        if (!Array.isArray(parsed)) throw new Error("Expected an array");
      } catch (error) {
        return { statusCode: 502, headers: headersFor(event), body: "Upstream returned an unexpected format" };
      }
    }

    return {
      statusCode: 200,
      headers: headersFor(event, {
        "Content-Type": dataset === "concentration" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=1800"
      }),
      body: body
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: headersFor(event),
      body: error && error.name === "AbortError" ? "Upstream request timed out" : "Upstream request failed"
    };
  } finally {
    clearTimeout(timeout);
  }
};
