# CLAUDE.md — roc-web 開發說明

ROC（混沌幻世）中文 MUD 的瀏覽器單機版。純前端、沒有建置步驟，部署在 GitHub Pages：<https://jye-tsai.github.io/roc-web/>。
玩家說明與功能缺口請看 `README.md`。

## 原則

- **照原版**：行為以 ROCSource（`jye-tsai/ROCSource`，`ROC_SRC_UTF8/`）的 C 程式為準，不要用猜的。
  - 移植時在註解寫出對應的原始檔或函式，例如 `/* 對應 act_move.c do_train */`。
  - 不得已簡化的地方標「簡化：」，推測的地方標「推測：」。
- **風格**：程式碼精簡、單行密集，註解用繁體中文，請比照周圍程式碼的寫法。
- **使用者**：使用者講繁體中文，回覆也用繁體中文。

## 架構

- `index.html`
  - 終端機 `Term`：ANSI SGR 轉 HTML。
  - 自訂控制碼：`ESC[8z … ESC[9z` 包住 ASCII 圖，圖不會折行並自動縮放（`fitArt`）；非 ASCII 字元依 Big5 寬度佔 2 格（`artW`）。
  - 輸入列、快捷鍵事件，以及載入器。
- **載入器**：
  - `data/core,const,skills,index` 與 `engine/*` 用 `async=false` 平行下載、依序執行。
  - `data/areas/*.js` 在背景載入，完成後設 `ROC.areasReady`。
  - `R.boot` 先顯示登入畫面；第一次有輸入時才等 `R.worldReady`（裡面跑 `bootDb` 和 `startUpdate`）。
- **加新的 engine 檔**：要加到 `index.html` 載入器的清單裡。
- **引擎結構**：`engine/*.js` 每個檔都是 `(function(R){...})(ROC)`。
  - 指令註冊在 `R.cmds.xxx=function(ch,arg)`。
  - 指令解析用原版的指令表 `R.CONST.cmds`；表裡有、但沒有實作的指令會顯示「網頁版還沒開放」。
- **資料**：
  - 世界在 `R.world`（rooms、mobs、objs、players）。
  - 角色欄位：`perm[5]`（str/int/wis/dex/con）、`cls`、`race`、`pc.*`、`act` 與 `aff`（Set）、`affects`（陣列）。
- **劇本**：`engine/mprog.js`，依原版 mob_prog.c、room_prog.c、obj_prog.c 重寫。
  - 原版的處理順序：先代換 `$` 變數，再解譯。
  - 解譯時：room_mask 只攔現有指令；room_command 和 obj_command 只處理不存在的指令。
- **手機排版**：`R.cols` 是終端機一行的半形字數，由 `index.html` 的 `Term.measure` 設定。
  - `R.narrow()` 判斷是不是窄螢幕。
  - `R.fit(s)` 在窄螢幕時把原版的硬換行接回去。
  - 新的列表輸出要用 `R.narrow()` 或 `R.cols` 決定排版。
- **簡易模式**：設定在 `R.EASY`；`R.easy(ch)` 只要角色的 act 沒有 HARDCORE 就是開啟。
  - 調整難度只改這組常數，不要改到原版公式本身。
- **組隊**：`ch.group={leader,name,members}`；判斷是否同隊一律用 `R.isSameGroup`。
- **UI**：`ui/panel.js`。
  - 快捷鍵：平常模式用 `normalKeys(ch)` 依情境產生按鈕；戰鬥模式在 `renderCombatKeys`；方向鍵狀態在 `renderDir`。
  - 指令總表在 `CMD_CAT`。
  - 登入按鈕在 `renderChoices`。
  - 「記住密碼」用 `R.remember`，存成 localStorage 的 `roc.rem.*`。
- **存檔**：`engine/save.js` 的 `R.Store`。
  - 在 https 或 file 環境下存 localStorage。
  - 在本機 http 環境下會先試 `/api/players`，成功就改存 `player/` 資料夾；本機測試出現 404 是正常的。

## 改版必做

- 改了 JS 之後，把 `index.html` 裡的 `const V='...'` 換新號碼，例如 `20261020k` → `20261020l`。不換的話，手機會一直用快取裡的舊程式。
- commit 之後兩個分支都要推：`git push origin main && git push origin main:mobile-ui`。

## 測試

沒有測試框架，用 Playwright 加上手機模擬（iPhone 13）實際操作。

- 測試伺服器：在 repo 根目錄跑 `python3 -m http.server 8765`。
- 不要執行 `playwright install`。Chromium 已經裝好，路徑是 `/opt/pw-browsers`；node 模組在 `/opt/node22/lib/node_modules/playwright`。
- 建角流程依序輸入：名字、`y`、密碼、密碼、Enter、`human`、`y`、`m`、Enter、`mage`、`y`、Enter。
- 新角色出生在 3700（混沌幻世的入口）。新手學校是 3700–3760，主城聖殿是 3001。
- 每次改動都要確認：沒有 `pageerror`；手機截圖版面沒有跑掉；劇本相關的改動要把全部劇本重跑一次，確認沒有例外。
- 停止伺服器時，`pkill` 要單獨一行執行。跟其他指令串在一起時會回傳 144，讓後面的指令跟著中斷。
