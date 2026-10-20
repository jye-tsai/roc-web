# 混沌幻世 Realm of Chaos — jye 20261019 Revised Web Edition

原版 ROC（Realm of Chaos，Envy 2.2 衍生的中文 MUD）改寫成**純瀏覽器單機版**，手機、電腦都能玩，不用架伺服器。

- 線上遊玩：<https://jye-tsai.github.io/roc-web/>
- 原版程式碼（對照用）：`jye-tsai/ROCSource`（neversay/ROCSource 的鏡像）

## 怎麼玩

打開網址，輸入英文名字建立角色（或點已有的角色），就能開始。

- **手機**：下方是點選式快捷鍵，大部分操作都不用打字。畫面上有顏色的文字（人物、物品、出口、`look xxx` 提示）都可以點。
- **電腦**：跟原版一樣直接打指令；按「鍵盤」可以叫出快捷鍵。
- **存檔**：存在瀏覽器 localStorage。換手機或清除瀏覽資料前，請先按「匯出」備份，之後可以「匯入」。在電腦上用「開始遊戲.cmd」開啟的話（本機伺服器），存檔會寫進 `player\` 資料夾。
- **新手路線**：一開始在「混沌幻世的入口」，往南是新手學校，往上（up）是史卡拉貝城；隨時可按「回城」（recall）回到主城。

## 手機介面

| 區塊 | 內容 |
|---|---|
| 上方狀態列 | 生命／魔法／移動血條、等級、金錢 |
| 終端機 | 原版文字輸出；可點的字依種類上色（怪物橘、玩家粉紫、物品綠、擺設黃、指令／出口青） |
| 方向鍵 | 上／北／下／西／東／南，加上看、掃描、Enter。沒有出口的方向變淡，關著的門是橘色 |
| 固定按鈕 | 物品、狀態、技能、指令…（指令總表，所有指令分類列出，參數用選的） |
| 情境按鈕（黃框） | 遇到才出現：回城、交談、訓練、學技能、商店、攻擊、地上、開門／開鎖、站起、醒來、休息、睡覺 |
| 戰鬥模式 | 打架時自動換成：逃跑、回城、戰鬥技能、攻擊法術、治療法術、藥水 |
| 快捷列 | 物品、技能可以「釘」上去 |
| 登入／建角 | 種族、職業、Y/N 都是按鈕；可「記住密碼」，下次點 ⚡ 角色直接進遊戲 |

## 這個版本做了什麼（改版紀錄）

1. **單機引擎**：把原版 C 程式改寫成 JS（`engine/`），區域、怪物、物品、技能資料轉成 `data/`。站長帳號 Jye 保留（PBKDF2 密碼）。
2. **手機介面**：狀態血條、物品／裝備／地上面板、技能面板、快捷列、戰鬥快捷鍵、指令總表、門／容器／商店按鈕、文字可點選並上色。
3. **劇本系統（mob／room／obj program）**：依 ROCSource 原始碼完整重寫，包含 qmark、約 140 種條件判斷、callout、talk 話題。全部 18,855 段劇本都跑過沒有錯誤。
4. **登入畫面**：
   - 原版 ASCII 圖照 Big5 終端機的寬度排版（非 ASCII 字元佔 2 格），太寬時自動縮小。
   - 手機直向另外有 4 款精簡標題隨機出現。
   - 標示版本「jye 20261019 Revised Web Edition」。
5. **登入加速**：程式同時下載，世界資料在背景載入，登入畫面約 1 秒出現（原本約 12 秒）。
6. **train 指令**：依原版 `do_train` 移植（屬性、hp/mana/move/practice 與 `-r` 連續訓練）。
7. **快捷鍵改版**：方向鍵加大，指令按鈕改成依情境出現；加回城鍵。

## 還沒做／簡化的部分

和原版相比，下列功能還沒有或是簡化過：

**整套系統**
- 組隊：group、gtell、split（經驗分配已有 groupGain，但沒有組隊指令）
- 銀行：deposit、withdraw；存款欄位已經有了
- 幫派 clan、留言板 note、拍賣 bid、騎乘 ride／馬匹
- 進階職業轉職：skadv、skdemote（train 已支援進階職業的係數）
- 任務紀錄：check quest
- 飢餓／口渴：有欄位，但不會隨時間減少
- 線上多人：這是單機版，「線上玩家」和頻道聊天是 `sim.js` 模擬的

**法術**
- 205 個法術裡做了 72 個。
- 還缺的包括：word of recall、gate、mass heal、各種 breath、enchant 系列、elemental 系列、mana shield、polymorph other、resurrection 等。

**技能**
- 被動技能還沒有作用：fourth／fifth attack、fist fight、weapon master、armor mastery、regeneracy、blind fight、各武器攻擊熟練等。
- 指令型技能還沒做：bash door、circle、assassination、pick lock、poison weapon、snare、meditate、bandage、throw、charge、twin、lead、invoke、dark raid、stone form 等。

**其他玩家指令**
- compare、where、report、whois、wizlist、afk、auto／autocombat／autosac、description、fill、donate、repair、recover、bug／idea／typo。

**戰鬥公式（簡化）**
- 經驗值公式沒有完整移植 `xp_compute`。
- 死亡懲罰改成扣半級經驗、不會掉級。
- 防禦判定沒有 reposte、autocombat、fool foe 和種族修正。
- 多重施法只會施一次。

**刻意不做**
- 線上建區 OLC（aedit／redit…）。
- 只給伺服器用的站長指令：reboot、shutdown、ban、snoop 等。
- 劇本內部用的 `mp*` 指令（劇本系統內已經處理）。

## 檔案結構

```
index.html        終端機（ANSI→HTML）、輸入列、快捷鍵、CSS、載入器
engine/*.js       遊戲引擎（對應原版 .c 檔，檔頭註明對照）
ui/panel.js       手機介面：面板、快捷鍵、可點文字、登入按鈕
data/             core（說明、歡迎畫面）、const（種族／職業／指令表）、skills、index、areas/*.js
```
