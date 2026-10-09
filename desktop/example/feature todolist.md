# Feature TODOLIST — 青簡英文能力融入 JszhuyinPlugins desktop

**分析日期**：2026-10-08  
**參考文件**：`青简英文查字典分析.md`  
**目標**：把 qingjian-main 的英文查字典能力融入浮動注音小工具，對「學習英文」幫助最大。

---

## 分析結論

### 使用情境約束

桌面工具的核心用途是**打中文**（Windows LTSC 無法裝系統注音），英文是次要模式（右 Shift 切 OFF）。工作流：

```
打注音 → 中文候選 → 選字 → textarea → 失焦自動複製 → 貼到別處
```

英文學習功能必須：
1. **不干擾中文輸入流程**（主要用途）
2. **在現有 UI 內運作**（不新增面板，不改窗口結構）
3. **創造英文曝光機會**（被動 + 主動）

### 青簡兩條資料線的學習價值對比

| 線 | 資料 | 學習類型 | 使用情境 | 學習收益評估 |
|---|---|---|---|---|
| **線B**（glossary-en） | 中→英釋義 | 被動曝光 | 打中文候選右側顯示英文譯詞 | 每次打中文都接觸英文，但用戶注意力在選中文詞，英文可能被忽略 |
| **線A**（english.tsv + glossary-zh） | 英文詞表 + 英→中釋義 | 主動練習 | 注音 OFF 時打英文，出候選+中文釋義 | 用戶刻意打英文時的學習時刻，注意力集中 |

**關鍵洞察**：線A（主動練習）的學習收益**高於**線B（被動曝光）。因為：
- 打英文時用戶在主動回憶拼寫，這正是記憶形成的時刻
- 中文釋義幫助建立「拼寫 ↔ 詞義」關聯
- 被動曝光（線B）在用戶注意力在別處時效果打折

但線B仍有價值：**不改工作流**的前提下創造英文接觸機會，成本極低（Map 查表）。

### 最高學習收益的融入點

**擴展 flashCopied**：選中文詞後，不只閃「已複製 ✓」，改為閃「开发 → development」。

理由：
- 不改工作流，只改提示文字
- 每次打中文都是一次微學習時刻（1.4 秒的英文接觸）
- 用戶已經習慣看這個 flash 位置，改內容比新增 UI 更自然
- 可以記錄到個人學習日誌（見 P1）

---

## 優先序

### P0 — 核心學習迴圈（高收益，符合現有 UI）

#### P0-1：英文模式候選 + 中文釋義（線A + glossary-zh）

**學習價值**：主動練習路徑。注音 OFF 時打英文出候選 + 中文釋義，幫助拼寫正確 + 詞義關聯。

**實作**：
- 移植 qingjian 的 `WordList` 到 JS（Map + 排序陣列 + 二分搜尋）
- 移植 `suggest()` 三段式（精確命中 → 前綴補全 → 拼錯糾正）
- 移植 `within_one_edit()`（拼錯糾正，≥4 字母才觸發）
- 移植 `adapt_case()`（大小寫跟隨輸入）
- 載入 `glossary-zh.tsv` 建 Map，候選右側顯示中文釋義

**資料**：
- `english.tsv`：94,568 詞，2.2MB（詞\t編碼\tZipf頻率）
- `glossary-zh.tsv`：44,924 詞，~1MB（英→中釋義）

**接入點**：
- `renderer/ime.js`：`handleKeyDown` 的 `!imeEnabled` 分支 → 改為攔截字母鍵，走英文候選管線
- `renderCandidates()`：英文候選渲染，右側加中文釋義
- `main.js`：新增 `english:load` IPC（載入 english.tsv + glossary-zh.tsv）
- `preload.js`：新增 `loadEnglish()` API

**UI 設計**：
- 英文候選與中文候選共用同一個 candidates div
- 每個候選項：`[序號] word  中文釋義`
- 釋義用較小字級、較淺顏色，不搶主詞焦點
- PAGE_SIZE=9 不變

**常數**（借鑑青簡）：
- `MIN_COMPLETION_LETTERS = 3`：至少 3 字母才出前綴補全
- `MIN_CORRECTION_LETTERS = 4`：至少 4 字母才做拼錯糾正
- `ENGLISH_MODE_CANDIDATES = 18`：英文模式最多候選數（可依 UI 調整，9 也夠）

---

#### P0-2：中文候選掛英文譯詞（線B）

**學習價值**：被動曝光。打注音選中文詞時候選右側顯示英文譯詞。

**實作**：
- 載入 `glossary-en.tsv` 建 Map（中→英釋義）
- `renderCandidates()` 時對每個中文候選查表，右側顯示英文
- 查不到留空，不影響主流程

**資料**：
- `glossary-en.tsv`：232,213 詞，6.5MB（中→英釋義，含詞性標註）

**UI 設計**：
- **只在第一個（選中的）候選顯示英文譯詞**，避免 9 候選都加英文導致變寬
- 格式：`[1] 开发  development`
- 其他候選維持現狀（只有中文）

**接入點**：
- `renderer/ime.js`：`renderCandidates()` 查 `glossaryEnMap`
- `main.js`：新增 `glossaryEn:load` IPC
- `preload.js`：新增 `loadGlossaryEn()` API

**注意**：
- glossary-en.tsv 6.5MB，renderer 啟動時解析一次，之後 Map.get() 快
- 詞性標註（`v. develop`）可選擇性顯示或隱藏，初版可先不顯示詞性，只顯示譯詞

---

#### P0-3：送出時閃示英文翻譯（擴展 flashCopied）

**學習價值**：微學習時刻。把每次打中文變成一次英文接觸，不改工作流。

**實作**：
- `onCompositionEnd()` 或 `selectAndCommit()` 時，查 glossary-en 得到中文詞的英文譯詞
- 修改 `flashCopied()` 顯示內容：
  - 有英文譯詞：`已複製 ✓  开发 → development`
  - 無英文譯詞：`已複製 ✓`（維持現狀）
- 時間：1.4 秒（現有 flashCopied 時間）或可延長至 2 秒讓用戶看清楚

**學習原理**：
- 用戶剛打出「开发」，腦中還是中文概念
- 此刻顯示「development」，建立即時的「中文概念 ↔ 英文詞」連結
- 每次打中文都重複一次，形成間隔重複效果

**接入點**：
- `renderer/ime.js`：`onCompositionEnd()` 查 glossaryEnMap → 傳入 flashCopied()
- 或 `selectAndCommit()` 時查表

**可選延伸**：
- 同時記錄到個人學習日誌（P1-5），記下「用戶今天看過 開发→development」

---

### P1 — 學習支援（中收益，低成本）

#### P1-4：CEFR 詞彙等級標示

**學習價值**：幫助學習者知道詞彙難度是否適合自己（A1 初級 → C2 專家級）。

**實作**：
- 載入 `levels-en.tsv` 建 Map（詞→CEFR等級）
- 英文候選渲染時查表，顯示等級標籤

**資料**：
- `levels-en.tsv`：102KB，約 8,844 詞有 CEFR 等級
  - A1: 1,083 / A2: 1,272 / B1: 2,174 / B2: 2,490 / C1: 929 / C2: 896

**UI 設計**：
- 英文候選格式：`[1] development [B2]  發展`
- 等級標籤用小圓角標籤，顏色區分：
  - A1/A2：綠色（基礎）
  - B1/B2：藍色（中級）
  - C1/C2：紫色（高級）
  - 無等級：不顯示標籤

**接入點**：
- `renderer/ime.js`：`renderCandidates()` 查 `levelsMap`
- `main.js`：新增 `levels:load` IPC
- `preload.js`：新增 `loadLevels()` API

---

#### P1-5：個人學習日誌（無 UI）

**學習價值**：記錄用戶實際接觸過哪些英文詞，為未來 SRS（間隔複習）打基礎。

**實作**：
- JSON 檔案落盤（`%APPDATA%/floating-zhuyin/vocab-log.json`）
- 記錄兩類事件：
  1. **英文模式 commit**：用戶選了哪個英文詞 + 時間 + 次數
  2. **中文 commit 時的英文曝光**：選了哪個中文詞 + 對應的英文譯詞 + 時間（P0-3 的 flash）

**資料結構**：
```json
{
  "words": {
    "development": {
      "firstSeen": "2026-10-08T10:30:00Z",
      "lastSeen": "2026-10-08T14:20:00Z",
      "seenCount": 5,
      "committedCount": 2,
      "source": "english_mode",
      "cefr": "B2"
    },
    "开发": {
      "lastEnglish": "development",
      "lastSeen": "2026-10-08T11:00:00Z",
      "seenCount": 3,
      "source": "chinese_gloss"
    }
  },
  "daily": {
    "2026-10-08": {
      "englishCommitted": 12,
      "chineseWithGloss": 45,
      "uniqueWords": 28
    }
  }
}
```

**接入點**：
- `renderer/ime.js`：commit 時呼叫 `api.logVocabEvent()`
- `main.js`：新增 `vocab:log` IPC，寫入 JSON 檔
- `preload.js`：新增 `logVocabEvent()` API

**注意**：
- 靜默記錄，不顯示任何 UI（不干擾當前使用）
- 檔案大小控制：只記錄最近 90 天，定期清理
- 為未來 P2-6（詞彙統計面板）和 SRS 功能準備資料

---

### P2 — 擴展（待評估）

#### P2-6：設定面板加詞彙統計

**學習價值**：可視化學習進度，提供動機。

**實作**：
- 設定面板新增「詞彙統計」區塊
- 顯示：
  - 今天接觸過多少英文詞
  - 按 CEFR 等級分佈（圓餅圖或長條圖）
  - 累計學習詞數

**資料來源**：P1-5 的個人學習日誌

**UI 設計**：
- 設定面板底部加一個可收合的區塊
- 簡單數字 + 分佈條，不需要複雜圖表庫

---

#### P2-7：中英混輸（注音 ON 時打英文字母也出英文候選）

**學習價值**：便利性 > 學習價值。注音 ON 時打 `database` 仍能出英文候選，不用切模式。

**成本**：
- 需要判斷「這段注音符號序列像不像合法注音」
- 青簡靠拼音切分器 + `unlikely_pinyin()` 判定
- 注音工具需要自建「不像話」判定（符號序列切不出合法注音組合）

**評估**：
- 右 Shift 切換已經能處理模式切換
- 混輸的邊界情況多（`taida` 是「太大」還是「他 + Ida」？）
- 學習收益低（用戶切模式時已經是主動行為）

**結論**：**延後**。等 P0/P1 上線後評估實際需求。

---

## 明確不建議做的

| 功能 | 不做的理由 |
|---|---|
| **拼音頭 + 英文尾切分** | 需要整套拼音語言模型（`static_score`/`penalty`/`segment()`），工作量接近重寫引擎。青簡的英文能力最深的部分，但對浮動注音小工具來說 ROI 極低。 |
| **雲端釋義兜底** | 工具定位是「完全離線、免安裝」。加網路請求破壞核心價值。 |
| **`.qj` mmap 容器** | 94k 詞在 JS Map 夠快，不需要二進制容器。Electron 啟動時解析 2MB TSV 可接受。 |
| **日文/西文詞表** | 目標是學英文，不是多語言。glossary-ja/es.tsv 不引入。 |

---

## 設計原則（借鑑青簡）

1. **策略判斷用靜態模型，不歸個人頻次管**
   - 「用哪種輸入方式」（中文/英文）的判斷不該被個人歷史綁架
   - 本工具：右 Shift 切換是明確的模式切換，不需要動態判斷

2. **釋義查不到留空，不影響主流程**
   - glossary 查不到時，候選正常顯示，只是沒有譯詞
   - 不拋錯、不阻塞、不改變候選排序

3. **個人詞表排除在「整段是英文詞」判定外**
   - 青簡的防死循環設計：個人詞表不算「整段是英文詞」，否則打不出來的拼音會被學成英文詞
   - 本工具：個人學習日誌只記錄，不影響候選產生（純粹的 log，不是詞表）

---

## 資產清單

| 檔案 | 條目數 | 大小 | 用途 |
|---|---|---|---|
| `example/qingjian-main/assets/lexicon/english.tsv` | 94,568 | 2.2MB | P0-1 英文詞表 |
| `example/qingjian-main/assets/glossary/glossary-zh.tsv` | 44,924 | ~1MB | P0-1 英→中釋義 |
| `example/qingjian-main/assets/glossary/glossary-en.tsv` | 232,213 | 6.5MB | P0-2/P0-3 中→英釋義 |
| `example/qingjian-main/assets/levels/levels-en.tsv` | ~8,844 | 102KB | P1-4 CEFR 等級 |

**資料複製**：實作時複製到 `desktop/data/` 下，與 `database.data` 並列。

---

## 接入點總覽

### main.js

| IPC Channel | 用途 | 對應 Feature |
|---|---|---|
| `english:load` | 載入 english.tsv + glossary-zh.tsv | P0-1 |
| `glossaryEn:load` | 載入 glossary-en.tsv | P0-2, P0-3 |
| `levels:load` | 載入 levels-en.tsv | P1-4 |
| `vocab:log` | 寫入個人學習日誌 JSON | P1-5 |
| `vocab:stats` | 讀取統計資料（給 P2-6） | P2-6 |

### preload.js

| API | 對應 IPC | 對應 Feature |
|---|---|---|
| `loadEnglish()` | `english:load` | P0-1 |
| `loadGlossaryEn()` | `glossaryEn:load` | P0-2, P0-3 |
| `loadLevels()` | `levels:load` | P1-4 |
| `logVocabEvent(event)` | `vocab:log` | P1-5 |
| `getVocabStats()` | `vocab:stats` | P2-6 |

### renderer/ime.js

| 函式 | 修改內容 | 對應 Feature |
|---|---|---|
| `handleKeyDown` | `!imeEnabled` 分支 → 攔截字母鍵走英文候選 | P0-1 |
| `renderCandidates` | 英文候選渲染 + 中文釋義 + CEFR 標籤 | P0-1, P1-4 |
| `renderCandidates` | 中文候選第一項顯示英文譯詞 | P0-2 |
| `onCompositionEnd` / `selectAndCommit` | 查 glossary → flashCopied 顯示英文 | P0-3 |
| `flashCopied(text?)` | 接受參數，顯示中英對照 | P0-3 |
| `init` | 載入英文資料（Promise.all） | 全部 |
| commit 相關 | 記錄到 vocab log | P1-5 |

### renderer/index.html

| 元素 | 修改內容 | 對應 Feature |
|---|---|---|
| `.candidate-item` | 加子元素：`.candidate-gloss`（中文釋義）+ `.candidate-level`（CEFR 標籤） | P0-1, P1-4 |
| `.copy-flash` | 內容可含中英對照，調整字級 | P0-3 |
| `.settings-panel` | （P2-6）加詞彙統計區塊 | P2-6 |

---

## 實作順序建議

1. **P0-1**（英文模式候選 + 中文釋義）— 核心功能，先建立英文候選管線
2. **P0-2**（中文候選掛英文譯詞）— 與 P0-1 共用 glossary 載入邏輯
3. **P0-3**（送出時閃示英文）— 擴展現有 flashCopied，成本極低
4. **P1-4**（CEFR 標示）— 加在 P0-1 的英文候選渲染上
5. **P1-5**（學習日誌）— 純後端，不影響 UI
6. **P2-6**（詞彙統計）— 依 P1-5 資料做可視化
7. **P2-7**（混輸）— 視實際需求決定

---

## Codex 審查紀錄

**審查時間**：2026-10-08  
**審查方式**：`codex exec -c model_reasoning_effort=high`  
**結果**：Codex 反覆要求 TODO Markdown 路徑確認，未提供實質分析（3 次嘗試均被路徑確認阻擋）。

**處理**：基於已完成的充分研究（`青简英文查字典分析.md` 全文 + desktop 專案核心檔案 `main.js`/`ime.js`/`preload.js`/`index.html` + 資料資產覆蓋率確認）直接產出本文件。

**自我審查重點**：
- ✅ 線A（主動練習）優先於線B（被動曝光）— 符合記憶形成原理
- ✅ flashCopied 擴展是最高 ROI 的融入點 — 不改工作流，只改提示文字
- ✅ 不建議做拼音頭+英文尾 — 需要引擎級能力，ROI 極低
- ✅ 個人學習日誌靜默運作 — 不干擾當前使用，為未來 SRS 準備資料
- ⚠️ glossary-en.tsv 6.5MB 啟動解析耗時 — 可能需要 worker thread 或延遲載入
- ⚠️ 中文候選只在第一項顯示英文 — 可能錯過其他候選的英文接觸，但避免 UI 變寬

---

## 附：關鍵常數（借鑑青簡）

| 常數 | 值 | 用途 |
|---|---|---|
| `MIN_COMPLETION_LETTERS` | 3 | 至少 3 字母才出英文前綴補全 |
| `MIN_CORRECTION_LETTERS` | 4 | 至少 4 字母才做拼錯糾正 |
| `ENGLISH_MODE_CANDIDATES` | 18 | 英文模式最多候選數（可調） |
| `PAGE_SIZE` | 9 | 候選分頁大小（現有，不變） |
| `FLASH_DURATION` | 1400ms | 複製閃示時間（現有，可延長至 2000ms） |
