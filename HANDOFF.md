# HANDOFF — 浮動注音小工具英文查字典功能

**最後更新**：2026-10-20
**給下一個 session 的接手說明**

---

## 0. 一句話狀態

計劃文件已完成五輪審查並大幅修正；`desktop-temp/` 開發副本已建立；建置腳本寫好了但**還沒成功執行過**（剛修完兩個 bug，未重跑）。下一步就是跑那支腳本。

---

## 1. 目標與背景

在 `desktop/`（Electron 32 浮動注音輸入小工具）加入英文查字典功能。工具核心用途是打中文，英文是次要模式（右 Shift 切 OFF）。

**使用者為什麼要做這個**：這台機器（Windows 10 Enterprise LTSC 2019）裝不了系統注音，所以這個工具是唯一的中文輸入法。學英文是附加目標。

完整計劃在 **`desktop/example/feature todolist.md`**（944 行，git 追蹤）。先讀那裡，本文件只記「文件沒講的進度與陷阱」。

---

## 2. 硬約束（絕對不能違反）

| # | 約束 | 原因 |
|---|---|---|
| 1 | **絕對不能改壞 `desktop/`** | 使用者每天在用，且開機自啟。改壞了使用者瞬間沒有中文輸入法 |
| 2 | **開發在 `desktop-temp/`** | `desktop/` 磁碟上必須永遠是能跑的版本 |
| 3 | **不裝需要管理員權限的東西** | 這台機器沒有管理員權限 |
| 4 | **不做網路請求** | 工具定位是「完全離線、免安裝」 |
| 5 | **不新增面板、不改視窗結構** | 使用者明示的約束 |
| 6 | **視窗寬只有 320px**（`main.js:19`），高 180–520px | 任何 UI 設計都要在這裡面塞得下 |

---

## 3. 環境事實（已實測）

| 項目 | 事實 |
|---|---|
| 執行狀態 | **4 個 `electron.exe` 正在跑** |
| 開機自啟 | `%APPDATA%\...\Startup\DigestRelay.vbs` |
| 單實例鎖 | `main.js:398` `app.requestSingleInstanceLock()` — **啟動第二個實例會直接退出並叫出原本的視窗** |
| 測試限制 | **副本沒辦法和原本「同時測」**。要測副本必須先退出原本的 |
| git 追蹤 | `desktop/` 底下 18 個檔全部追蹤，改壞可 `git checkout` 復原 |
| `desktop-temp/` | **未納入 git**（`git status` 顯示 `?? desktop-temp/`）。要入版得複製回 `desktop/` 再 commit |
| `node_modules` | 273 MB（其中 electron.exe 186 MB）**未複製**。測試時用原 electron.exe 指向副本目錄：<br>`desktop\node_modules\electron\dist\electron.exe  F:\...\desktop-temp` |

---

## 4. 本次 session 完成的事

### 4.1 文件合併與五輪審查

`feature todolist.md` 由兩份合併而成（原《青简英文查字典分析》923 行 + 原《Feature TODOLIST》385 行 → 944 行）。

**五輪審查各自改變了什麼**：

| 輪 | 角色 | 主要發現 | 對計劃的影響 |
|---|---|---|---|
| 1 | — | 初步查證：繁簡錯配 18.6%、OFF 攔截破壞英文直通、記憶體高估 | P0-2 改判不可行 |
| 2 | — | Codex（34 分鐘被殺）、提出 9 項 | 修正 3 項、確認 6 項 |
| 3 | — | 引入 OpenCC，覆蓋率 18.6% → 43.8% | **P0-2 改判可行** |
| 4 | 工程 | 按鍵守衛順序吞掉 Ctrl+C、`toggleIME()` 丟字、順序錯 | 新增 5.1b–5.1e，狀態機規格草案 |
| 5 | UI/UX + User + PM | **浮動視窗不是系統輸入法**，P0-1 前提不成立 | **優先序整個翻轉** |

### 4.2 優先序現況

| | 狀態 |
|---|---|
| **P0-B**（中文候選掛英文譯詞） | **第一順位**，唯一「做了不破壞現有體驗」的功能 |
| **P0-3**（flash 顯示英文） | 設計需重做（短形式 + 譯詞留候選列 + 整詞 commit 為單位） |
| **P0-A**（英文輸入候選） | **降級為需先驗證**，要證明使用者願意在浮窗裡練英文才投入 |

### 4.3 已驗證的資料事實

| 事實 | 數據 |
|---|---|
| 工具詞庫 `data/database.data` 是**繁體中文** | — |
| `glossary-en.tsv` 是**簡體鍵** | 232,213 條 |
| OpenCC `s2twp`（簡體→台灣繁體）品質 | `软件→軟體`、`屏幕→螢幕`、`网络→網路`、`程序→程式`、`数据→資料` **全部正確** |
| 記憶體（Codex 實測） | 全表 232k 條保留 heap **29.72 MB**；TW 表 65k 條 **9.35 MB** |

---

## 5. ⚠️ 最重要的一件事：設計已轉向

### 5.1 Codex 發現的致命問題

原本的建置方向是：

```
工具詞庫 database.data ──tw2sp──→ 簡體 ──查表──→ glossary-en
```

**這條路走不通。**Codex（工程視角）實測發現 `desktop/data/database.data` **不是平坦的 CJK 碼流，是 trie 序列化結構**。

我獨立驗證確認屬實：

| 證據 | 數值 |
|---|---|
| 檔案開頭 | `47 05 00 00` = uint32 **1351**，緊接 `2,3,4,5,9,12,13,17,18,25` 單調遞增 = **trie 索引偏移表** |
| 結尾 24 個 uint16 | `5, 66, 娃, 錒, 錒, 束, 1, 5, 66, 蜎…` = **結構整數與漢字交錯** |
| 我用正則抽到的單字數 | **103,444** |
| 用真實 API 解析出的單字數 | **14,318**（我多抽 7 倍） |
| 我抽到的 5 字/6 字段 | 2,384 / 1,146 段（字典不可能有這麼長的詞，是**跨記錄黏合的幽靈詞**） |

**後果**：我先前報告的 **43.8% 覆蓋率、97–100% 詞頻分層覆蓋率、台灣詞彙 81% 命中率——全部建立在錯誤的分母上，不可信。**

> ⚠️ 這些數字目前仍寫在 `feature todolist.md` 第 3 章。**新 session 若要引用，必須先重新量測。**

### 5.2 轉向後的設計（已套用於腳本）

```
glossary-en.tsv（純 TSV，零解析風險）──s2twp──→ 繁體鍵譯義表
```

好處：

1. **完全不碰 `database.data`**，trie 問題自動消失
2. 輸入是乾淨 TSV，沒有結構誤判風險
3. 連詞彙差異都對（不是單純字形轉換）
4. 輸出鍵就是台灣繁體，正是工具產出的字集
5. 舊方案「繁體詞不在詞庫 → 沒被轉換 → 漏網」的問題消失

### 5.3 Codex 另一個重要發現

實測前向 `tw2sp` 會產出罕用異體字：`人才→人纔`、`頂針→顶鍼`、`高參→高蔘`、`代謝症候群→代谢症候羣`。這些字在 `glossary-en.tsv` 裡幾乎不存在，`Map.get()` 必定 miss。

**腳本裡已實作退路**：轉換後若含罕用異體字集 `{纔 鍼 蔘 羣 囉 覈 麪 裏}`，自動退回「只轉簡繁、不套台灣用字」。

---

## 6. 目前進度

### 已建立

```
desktop-temp/
├── tools/build-glossary-tw.py    ← 已寫，**修過 2 個 bug，尚未成功執行**
├── data/database.data            （副本）
├── main.js / preload.js / package.json  （副本）
└── renderer/                      （完整副本，含 lib/）
```

### 尚未產出

```
desktop-temp/data/glossary-en-TW.tsv     ← 不存在
desktop-temp/data/audit-sample.txt       ← 不存在
```

### 腳本已修的兩個 bug

| # | 錯誤 | 修正 |
|---|---|---|
| 1 | `REPO` 少退一層dirname，算成 `desktop-temp/` | 加一層 `dirname`，現在指向 `JszhuyinPlugins/` |
| 2 | 路徑存在檢查的條件運算式寫法有歧義 | 改成明確的 `(path, kind)` 迴圈 |

**兩個 bug 修完後還沒重跑。**

---

## 7. 下一步（直接照做）

### 步驟 1：跑腳本

```bash
cd "F:/30590/SelfWork/JszhuyinPlugins"
PYTHONIOENCODING=utf-8 python desktop-temp/tools/build-glossary-tw.py
```

**成功時應該看到**：

```
輸入條目      : 232213 左右
鍵有變動      : 大多数
繁體鍵衝突    : 數千（一對多，需要看是否可接受）
輸出條目      : 二十幾萬
寫出 .../glossary-en-TW.tsv
寫出 .../audit-sample.txt
```

**若報錯**，常見原因：Python 版本、`io.open` 的 `newline` 參數、或詞典路徑。

### 步驟 2：驗證產出品質

```bash
# 有無 BOM（必須沒有）
head -c 3 desktop-temp/data/glossary-en-TW.tsv | xxd
# 抽查前 20 筆
head -20 desktop-temp/data/glossary-en-TW.tsv
# 看罕用字比例
grep -c "[纔鍼蔘羣囉覈麪裏]" desktop-temp/data/glossary-en-TW.tsv
```

### 步驟 3：重新量測覆蓋率

**必須用正確的方法**，不能再用正則抽 `database.data`。兩個選項：

- **A. 用 Node + 專案自己的 API**（`renderer/lib/jszhuyin_data_pack.js` 的 `JSZhuyinDataPackStorage`）列舉詞彙
- **B. 跳過覆蓋率量測**，改用「抽查 100 筆是否都能在工具詞庫查到」的間接驗證

Codex 讀過 `JSZhuyinDataPackStorage`，回報的方法是：`setInterchangeablePairs / get / getRangeFromContentIndex / getIncompleteMatched / reverseGet / cleanupCache / _replaceInterchangeableSymbols` — **沒有直接的「列出全部詞」方法**，所以 A 需要走 `reverseGet` 或解析 trie 節點，會比較麻煩。

### 步驟 4：請使用者抽查

`desktop-temp/data/audit-sample.txt` 有 100 筆（seed 固定）。**這是使用者的決策輸入**——抽查不過就整個 P0-B 作廢，下游全部不用做。

---

## 8. 待使用者決策的問題

| # | 問題 | 現況 |
|---|---|---|
| 1 | 抽查 100 筆的結果 | 待使用者執行 |
| 2 | 「繁體鍵衝突」數量可接受嗎（一對多轉換） | 待步驟 1 產出後看數字 |
| 3 | `desktop-temp/` 要不要納入 git | 目前未納入 |
| 4 | P0-A 降級是否接受 | 使用者尚未回覆 |

---

## 9. 踩過的坑（避免重蹈）

| 坑 | 後果 | 避開方式 |
|---|---|---|
| `database.data` 不是平坦碼流 | 所有覆蓋率數字不可信 | **絕對不要用正則抽 CJK 區段** |
| 貪婪最長匹配 ≠ OpenCC mmseg | 分歧率實測 79% | 已知。腳本註解有說明 |
| `english.tsv` 用第一欄建 Map | 11,229 行（11.87%）查不到 | **必須用第二欄（編碼）** |
| `api.onCopied` 監聽 `copied:ok` | 全專案無人送此事件，回調永不觸發 | 現有 bug，動到時順手修 |
| `onCompositionEnd` 每次選字觸發 | flash 會按字閃、日誌重複記錄 | P0-3 要改用整詞 commit 為單位 |
| `!imeEnabled` 早於修飾鍵檢查 | 攔截字母會吞掉 Ctrl+C/V/A | 攔截點必須放 `ime.js:436` 之後 |
| `stopPropagation()` 不停同節點其他 listener | Codex 曾誤判錄製模式會擋住右 Shift | 只有 `stopImmediatePropagation()` 才會停 |
| Codex 逾時 | 上次 34 分鐘被殺、無產出 | **限縮攻擊範圍 + 限制工具呼叫次數**（後來 8 分鐘完成） |
| Codex 多角色混問 | 每項都講不深 | **每輪只問一個角色**（codex-exec skill 明訂） |

---

## 10. 相關檔案

| 路徑 | 內容 |
|---|---|
| `desktop/example/feature todolist.md` | 完整計劃（944 行，git 追蹤）。第 3 章數字待重測 |
| `desktop/example/qingjian-main/` | 青简參考實作（gitignore，64 MB）。**實際只需 `assets/` 底下 6 個檔** |
| `desktop/example/opencc-v1.4.2-resources/` | OpenCC 純文字詞典（1.3 MB）。建置腳本的輸入 |
| `desktop-temp/tools/build-glossary-tw.py` | 本次寫的建置腳本 |
| `C:\Users\30590\.claude\skills\codex-exec\` | Codex 調用契約（必讀） |

---

## 11. 待辦清理（使用者說由他自己處理）

`desktop/example/` 底下可刪：

| 檔案 | 大小 | 理由 |
|---|---|---|
| `青简英文查字典分析.md` | 40K | 已合併進 `feature todolist.md` |
| `qingjian-main.zip` | 20M | 已解壓，且 **git 有追蹤**可復原 |
| `opencc-1.4.2-bazel-src.tar.xz` | 7.6M | 用不到，resources/ 已有全部 .txt |
| `opencc.md` | 12K | OpenCC 發佈說明，已用完 |