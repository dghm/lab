const DATASETS = {
  daily: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  valuation: "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL",
  revenue: "https://openapi.twse.com.tw/v1/opendata/t187ap05_L",
  balance: "https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci",
  concentration: "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5"
};

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { Allow: "GET" }, body: "Method Not Allowed" };
  }

  const dataset = event.queryStringParameters && event.queryStringParameters.dataset;
  const upstreamUrl = DATASETS[dataset];
  if (!upstreamUrl) {
    return { statusCode: 400, body: "Unknown dataset" };
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
      return { statusCode: 502, body: "Upstream returned HTTP " + response.status };
    }

    if (dataset !== "concentration") {
      try {
        const parsed = JSON.parse(body);
        if (!Array.isArray(parsed)) throw new Error("Expected an array");
      } catch (error) {
        return { statusCode: 502, body: "Upstream returned an unexpected format" };
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": dataset === "concentration" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=1800"
      },
      body: body
    };
  } catch (error) {
    return {
      statusCode: 502,
      body: error && error.name === "AbortError" ? "Upstream request timed out" : "Upstream request failed"
    };
  } finally {
    clearTimeout(timeout);
  }
};
