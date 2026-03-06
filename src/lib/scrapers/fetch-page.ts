const DEFAULT_TIMEOUT_MS = 20_000;

type FetchPageResult = {
  finalUrl: string;
  html: string;
  usedPuppeteer: boolean;
};

function isLikelyBlocked(status: number, html: string): boolean {
  if (status === 403 || status === 429 || status === 503) {
    return true;
  }

  const lowered = html.toLowerCase();
  return (
    lowered.includes("cloudflare") ||
    lowered.includes("attention required") ||
    lowered.includes("checking your browser") ||
    lowered.includes("ddos protection")
  );
}

async function fetchWithHttp(url: string, timeoutMs: number): Promise<{ finalUrl: string; html: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
      },
    });

    const html = await res.text();
    return { finalUrl: res.url || url, html, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithPuppeteer(url: string, timeoutMs: number): Promise<{ finalUrl: string; html: string }> {
  const puppeteerModule = await import("puppeteer");
  const browser = await puppeteerModule.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
    const html = await page.content();
    return { finalUrl: page.url(), html };
  } finally {
    await browser.close();
  }
}

export async function fetchPageHtml(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FetchPageResult> {
  const direct = await fetchWithHttp(url, timeoutMs);

  if (!isLikelyBlocked(direct.status, direct.html)) {
    return { finalUrl: direct.finalUrl, html: direct.html, usedPuppeteer: false };
  }

  const fallback = await fetchWithPuppeteer(url, timeoutMs);
  return { finalUrl: fallback.finalUrl, html: fallback.html, usedPuppeteer: true };
}
