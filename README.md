# Warframe 即時工具（Warframe Live Tools）

一個免安裝的靜態網頁工具，協助《Warframe》玩家掌握兩類時效性高的資訊：**本期 Prime 重生（Prime Resurgence）販售的遺物與其獎勵**，以及 **warframe.market 上自己掛單物品的即時行情**。Prime 重生資料由瀏覽器直接讀取公開 API；市場資料在使用者按下更新時，由 GitHub Actions 代為抓取。整個專案不需要自架伺服器、不需要登入，也不蒐集任何使用者資料。

> 線上版本：<https://kao-chih-yuan.github.io/wf-live/>

---

## 解決的問題

| 情境 | 過去的做法 | 本工具的做法 |
|---|---|---|
| Prime 重生每兩週左右輪替一次，想知道這一期的遺物能開出什麼 | 逐一到 Wiki 查每顆遺物的獎勵表 | 一鍵讀取本期商品，自動展開每顆遺物的 6 項獎勵、稀有度與掉落機率 |
| 想知道哪些遺物裡有自己還沒取得段位經驗的物品 | 人工對照自己的收集清單 | 匯入收集進度後，自動標示「尚未完成」的獎勵，並可只顯示相關遺物 |
| 在 warframe.market 掛單後，想確認自己的價格是否具競爭力 | 逐一點進每個物品頁面，手動篩選線上玩家與等級 | 自動列出所有出售中的掛單，並並排顯示同等級、線上遊戲中玩家的最低賣價與最高收購價 |
| 想判斷物品價格的近期走勢 | 另開物品頁面切換統計圖 | 滑過「價格走勢」即可預覽 48 小時／90 天成交價走勢，並標示自己的價格 |

## 功能

### 本期 Prime 重生
- 讀取商人 Varzia 本期的販售清單、開始與結束日期，並計算剩餘天數。
- 將遺物對應到完整的獎勵資料：繁體中文名稱（以遊戲繁中語系為準）與英文名稱、常見／罕見／稀有分級，以及「完整（Intact）」與「光輝（Radiant）」兩種精煉狀態的掉落機率。
- 每項獎勵可直接連到 warframe.market 的物品頁面。
- 可匯入收集進度（由配套的段位清單工具產生的備份碼），標示尚未完成的物品並提供篩選。
- 更新後產生「本期代碼」並提供一鍵複製，可匯入配套的段位清單工具，在該工具內對照收集進度。

### 交易市場
- 輸入 warframe.market 帳號後，自動讀取該帳號所有公開的出售（WTS）掛單。
- 每筆掛單旁列出 5～15 筆其他玩家的價格：
  - 僅計入「線上遊戲中（Online in game）」的玩家；
  - 自動對齊掛單物品的等級（例如滿級 MOD 只與滿級的價格比較）；
  - 標示自己的價格是否為最低，或與最低賣價的差距與排名。
- 支援依「價差」「價格」「名稱」排序，便於找出需要調整價格的掛單。
- 價格走勢浮窗：以 SVG 繪製中位成交價、移動平均與最低～最高區間，滑鼠移動可查看單日數據；行動裝置以點擊開啟。

## 技術架構

- **單一 HTML 檔案**：HTML、CSS、JavaScript 與所需的靜態資料全部內嵌在 `index.html`，無第三方函式庫。
- **兩種資料取得方式，依 API 的跨網站政策（CORS）而定**：
  - warframestat.us 允許網頁跨網站讀取，因此「本期 Prime 重生」由瀏覽器以 `fetch` 即時讀取。
  - warframe.market 的 API 不接受其他網站的網頁直接讀取，因此改為「按需代抓」：
    1. 使用者按下「讀取我的 WTS 並更新價格」，網頁以 GitHub REST API 觸發 `workflow_dispatch`，並傳入帳號名稱。
    2. GitHub Actions 執行 `scripts/fetch-market.mjs`（Node.js，無相依套件），抓取掛單、行情與成交統計，輸出 `market.json` 並推送到 `data` 分支（每次覆寫，不累積歷史）。
    3. 網頁輪詢執行狀態，完成後透過 GitHub Contents API 讀回 `market.json` 並顯示；GitHub API 允許跨網站讀取，因此不受限制。
  - 觸發更新需要使用者自行建立、只限本專案且只有 Actions 權限的 Fine-grained 權杖，權杖只存在使用者瀏覽器的 `localStorage`，不會寫入專案或傳送到其他地方。讀取上次的資料則不需要權杖。
  - 抓取程式以固定間隔送出請求並在遇到 HTTP 429 時退避重試，遵守 warframe.market 每秒 3 次的請求限制。
- **離線資料對照**：遺物獎勵表、物品中英文名稱、物品圖示等相對固定的資料，在產生網頁時由 [WFCD warframe-items](https://github.com/WFCD/warframe-items) 預先整理並內嵌，執行時只需讀取會變動的部分（本期商品、即時掛單與成交統計），減少請求次數。
- **本機快取**：最近一次讀取的結果、物品基本資料與成交統計會存在瀏覽器的 `localStorage`，重新開啟頁面時可立即顯示上次的資料。
- **響應式設計**：同一份頁面在桌機與手機皆可使用，並支援系統的深色模式。

### 使用的公開資料來源

| 用途 | 來源 |
|---|---|
| 本期 Prime 重生商品 | [warframestat.us API](https://docs.warframestat.us/)（`/pc/vaultTrader`） |
| 掛單、物品資訊（GitHub Actions 抓取） | [warframe.market API v2](https://warframe.market/)（`/v2/orders/user/{slug}`、`/v2/item/{id}`、`/v2/orders/item/{slug}`） |
| 成交統計（GitHub Actions 抓取） | warframe.market API v1（`/v1/items/{slug}/statistics`） |
| 遺物獎勵、物品名稱與圖示 | [WFCD warframe-items](https://github.com/WFCD/warframe-items) |

## 使用方式

1. 開啟部署後的網址（或下載 `index.html` 以瀏覽器開啟；部分瀏覽器會限制本機檔案存取外部 API，建議使用網址開啟）。
2. **本期 Prime 重生**：按「更新本期 Prime 重生」。如需標示尚未完成的物品，展開「匯入段位清單的進度」並貼上備份碼。
3. **交易市場**：第一次使用時，依頁面「設定 GitHub 權杖」的步驟建立權杖並貼上（只需一次）。之後輸入 warframe.market 個人頁網址的最後一段（帳號代稱），按「讀取我的 WTS 並更新價格」，約 1～2 分鐘後自動顯示結果。也可以在 Actions 頁面的「Update market data」手動 **Run workflow**。

### 專案結構

```
index.html                     網頁本體（含內嵌資料）
scripts/fetch-market.mjs       抓取市場資料、輸出 market.json
.github/workflows/market.yml   按需觸發：抓取資料並推送到 data 分支
```

## 隱私

- 本工具不設任何後端伺服器。觸發更新時，帳號名稱會作為參數傳給本專案的 GitHub Actions，抓取結果存放在本專案的 `data` 分支（公開）。
- GitHub 權杖、匯入的進度與快取資料只保存在使用者自己瀏覽器的 `localStorage`，清除瀏覽器資料即可移除。
- 只會「讀取」公開資料，不會建立、修改或刪除任何 warframe.market 掛單；設為隱藏的掛單不在公開資料中，因此不會顯示。

## 限制

- 資料的即時性與正確性取決於上述第三方 API；若 API 調整格式或暫停服務，相關功能可能暫時無法使用。
- 市場資料為按下更新當下的快照，每次更新需等待 GitHub Actions 執行約 1～2 分鐘；尖峰時段排隊可能更久。
- 遺物獎勵表為產生網頁時的版本，遊戲更新加入新遺物後需要重新產生。

## 版權與聲明

本專案為玩家自製的非官方工具，與 Digital Extremes 無任何關聯，亦未獲其背書。《Warframe》及相關名稱、圖像之版權均屬 Digital Extremes Ltd. 所有。物品資料與圖示取自社群維護的 WFCD 專案，交易與統計資料取自 warframe.market 與 warframestat.us 的公開 API，各自依其服務條款提供。
