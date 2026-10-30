// 由 GitHub Actions 執行：讀取指定帳號（環境變數 WM_USER）的 warframe.market 出售掛單、
// 各物品線上遊戲中玩家的買賣價格（對齊等級）與成交統計，輸出成 market.json。
// 工作流程會把結果推到 data 分支，網頁再透過 GitHub API 讀取（GitHub API 允許跨網站讀取）。
import { writeFile } from "node:fs/promises";

const WM = "https://api.warframe.market";
const OUT = process.argv[2] || "market.json";
const user = String(process.env.WM_USER || "").trim().toLowerCase().replace(/^.*\/profile\//, "").replace(/[/?#].*$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(WM + path, { headers: { Accept: "application/json", "User-Agent": "wf-live (GitHub Actions; personal price tracker)" } });
    await sleep(400); // warframe.market 限制每秒 3 次
    if (r.status === 429) { await sleep(3000); continue; }
    if (!r.ok) {
      const body = (await r.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
      const cf = /just a moment|cloudflare|cf-ray|attention required/i.test(body) ? "（被 Cloudflare 防護擋下）" : "";
      throw new Error(`${path} -> HTTP ${r.status}${cf}`);
    }
    return r.json();
  }
  throw new Error(`${path} -> too many retries`);
}

const out = { user, t: Date.now(), orders: [], items: {}, book: {}, stats: {}, errors: [] };
if (!user) {
  out.errors.push("沒有提供 warframe.market 帳號");
} else {
  let mine = { data: [] };
  try { mine = await get(`/v2/orders/user/${encodeURIComponent(user)}`); }
  catch (e) { out.errors.push(`讀取 ${user} 的掛單失敗：${e.message}`); }
  const sells = (mine.data || []).filter((o) => o.type === "sell");
  for (const o of sells) {
    try {
      let it = out.items[o.itemId];
      if (!it) {
        const d = (await get(`/v2/item/${o.itemId}`)).data;
        it = out.items[o.itemId] = { slug: d.slug, gameRef: d.gameRef || "", name: d.i18n?.en?.name || d.slug, maxRank: d.maxRank ?? null, tags: d.tags || [] };
      }
      const rank = it.maxRank != null ? (o.rank ?? 0) : null;
      const ord = { id: o.id, itemId: o.itemId, slug: it.slug, platinum: o.platinum, quantity: o.quantity, rank };
      out.orders.push(ord);
      const key = `${ord.slug}|${rank ?? ""}`;
      const all = (await get(`/v2/orders/item/${ord.slug}`)).data || [];
      const ok = (x) => x.user?.status === "ingame" && x.user?.slug !== user && (rank == null || (x.rank ?? 0) === rank);
      out.book[key] = {
        t: Date.now(),
        sells: all.filter((x) => x.type === "sell" && ok(x)).sort((a, b) => a.platinum - b.platinum).slice(0, 15).map((x) => [x.platinum, x.quantity]),
        buys: all.filter((x) => x.type === "buy" && ok(x)).sort((a, b) => b.platinum - a.platinum).slice(0, 15).map((x) => [x.platinum, x.quantity]),
      };
      try {
        const sc = (await get(`/v1/items/${ord.slug}/statistics`)).payload?.statistics_closed || {};
        const pick = (a) => (a || []).filter((x) => rank == null || x.mod_rank == null || x.mod_rank === rank)
          .map((x) => [Date.parse(x.datetime), x.median ?? x.avg_price, x.min_price, x.max_price, x.moving_avg ?? null, x.volume || 0]);
        out.stats[key] = { t: Date.now(), d90: pick(sc["90days"]), h48: pick(sc["48hours"]) };
      } catch (e) { out.errors.push(`統計 ${ord.slug}: ${e.message}`); }
    } catch (e) { out.errors.push(`${o.itemId}: ${e.message}`); }
  }
}
await writeFile(OUT, JSON.stringify(out));
console.log(`orders=${out.orders.length} errors=${out.errors.length}`);
for (const e of out.errors.slice(0, 10)) console.log(`::warning::${e}`);
if (!out.orders.length && out.errors.length) { console.log(`::error::${out.errors[0]}`); }
