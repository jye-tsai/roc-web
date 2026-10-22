# ROC 連線轉接器（Cloudflare Worker）

瀏覽器不能直接開 telnet（TCP）連線。這支 Worker 把網頁送來的 WebSocket 轉成 TCP，連到實體站台 `roc.csie.org:5555`。

- 只會連到設定好的站台（`MUD_HOST`／`MUD_PORT`），不能拿來連別的地方。
- 只接受 `ALLOW_ORIGIN` 列出的網站來源（預設是 GitHub Pages 和本機測試）。

## 部署方法 A：用 Cloudflare 網頁後台（不用裝任何東西）

1. 登入 <https://dash.cloudflare.com>，左側選 **Workers & Pages** → **Create** → **Create Worker**。
2. 名稱填 `roc-relay`，按 **Deploy**。
3. 按 **Edit code**，把 `worker.js` 的內容整個貼上，取代原本的程式，再按 **Deploy**。
4. 回到這個 Worker 的 **Settings → Variables and Secrets**，視需要新增變數（不加就用預設值）：
   - `MUD_HOST` = `roc.csie.org`
   - `MUD_PORT` = `5555`
   - `ALLOW_ORIGIN` = `https://jye-tsai.github.io`
5. 記下網址，例如 `https://roc-relay.<你的帳號>.workers.dev`。

## 部署方法 B：用 wrangler 指令

```sh
npm install -g wrangler
cd relay
wrangler login
wrangler deploy
```

## 使用

- 打開 <https://jye-tsai.github.io/roc-web/?remote>，或在單機版登入畫面按「🌐 連線到實體站台」。
- 第一次會要你輸入轉接器網址（例如 `wss://roc-relay.xxx.workers.dev`），之後會記在這台裝置上。
- 也可以直接用網址帶入：`https://jye-tsai.github.io/roc-web/?remote&relay=wss://roc-relay.xxx.workers.dev`
- 中文若是亂碼，按輸入列的「編碼」切換：自動 → UTF-8 → Big5。

免費方案每天有 10 萬次請求的額度，一條 WebSocket 連線只算一次。
