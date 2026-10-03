# 浮動注音輸入小工具 — Session Summary

**日期**：2026-09-05 ~ 2026-09-07  
**路徑**：`<repo>\desktop\`

---

## 起因

這台 Windows 10 Enterprise LTSC 2019 無法安裝微軟新注音（IMESC1 目錄缺失、無管理員權限）。在嘗試了多種免安裝方案後，決定用 Electron + jszhuyin 引擎打造一個桌面浮動注音小工具。

## 技術決策

| 決策 | 原因 |
|---|---|
| 選 Electron 當外殼 | 唯一不用管理員、能做浮動置頂視窗 + 剪貼簿 + 全域熱鍵、直接重用 JS 引擎的方案 |
| 重用 chrome/ 插件的 ImeClient + layout-mapper | 純 JS UMD，無框架依賴，可直接在 renderer 使用 |
| 詞庫由主程序 IPC 提供 | 避開 file:// CORS 限制 |
| 右 Shift 切換注音 ON/OFF | 模擬系統 IME 的切換體驗 |
| fake-box + card 分層架構 | 假盒子負責視覺效果（shadow/圓角/半透明），card 只負責內容 |
| 主程序負責複製 | renderer 失焦後被 throttle，Clipboard API 不生效 |
| `visibilitychange` + 主程序 blur | 確保失焦時自動複製到剪貼簿 |

## 檔案結構

```
desktop/
├── package.json              # electron devDep（v32）
├── main.js                   # 主程序：視窗、托盤、熱鍵、IPC、blur 複製
├── preload.js                # contextBridge API
├── start.bat                 # 離線啟動器（>nul 2>&1 抑制輸出）
├── install.bat               # 含 proxy 的 npm install
├── data/
│   └── database.data         # 詞庫（3.2MB）
└── renderer/
    ├── index.html            # UI（fake-box + card 架構）
    ├── ime.js                # 應用邏輯（注音/設定/自動撐開）
    └── lib/
        ├── bopomofo_encoder.js
        ├── jszhuyin.js
        ├── jszhuyin_data_pack.js
        ├── storage.js
        ├── data_loader.js
        ├── ime-client.js     # 已修改：支援預載詞庫 dictArrayBuffer
        └── layout-mapper.js
```

## 功能清單

### 核心輸入
- **注音輸入**：視窗內直接打注音 → 候選字 → 送進 textarea
- **右 Shift 切換**：注音 ON（打中文）/ OFF（打英文/數字）
- **唯一 textarea**：中文/英文/數字混排在同一個文字框
- **ESC reset**：正在組字時按 ESC 取消注音組字

### 視窗行為
- **fake-box + card 分層**：假盒子（shadow/圓角/半透明背景）包住 card（純白內容區）
- **永遠置頂**（auto-hide OFF）：`setAlwaysOnTop(true, 'screen-saver')`
- **失焦半透明**：opacity 0.55，聚焦恢復 1.0
- **可拖曳**：標題列 `-webkit-app-region: drag`
- **八方向邊緣拖拉**：12px 偵測區 + requestAnimationFrame 節流 + 動態漸層提示
- **位置記憶**：移動後存到 settings.json，下次啟動還原

### 自動化
- **失焦自動複製**：textarea 有內容 + 視窗失焦 → 主程序 `clipboard.writeText` → 通知 renderer 顯示「已複製 ✓」
- **注音送出自動提示**：中文字送進 textarea 時閃示「已複製 ✓」
- **熱鍵叫出自動 focus**：`Ctrl+`` 顯示視窗時自動 focus textarea
- **文字框自動撐開**：mirror div 測量內容高度 → 視窗跟著長高（上限 520px）

### 全域熱鍵
- **Ctrl+\`**：顯示/隱藏切換（可透過設定面板修改）
- **設定面板**：⚙ 按鈕 → 錄製新快速鍵 → 註冊 + 衝突檢測 + ESC 取消

### 設定面板（⚙）
| 設定 | 預設值 | 控制目標 |
|---|---|---|
| 顯示/隱藏熱鍵 | Ctrl+\` | `globalShortcut` |
| 陰影濃度 | 25% | fake-box box-shadow alpha |
| 陰影顏色 | 黑色 | fake-box box-shadow color |
| 模糊半徑 | 24 | fake-box box-shadow blur |
| 偏移距離 | 4 | fake-box box-shadow Y offset |
| 圓角 | 10 | fake-box + card border-radius |
| 還原預設按鈕 | — | 重設所有設定到預設值 |

### 托盤
- **右鍵選單**：「送出後自動隱藏」checkbox + 「退出」
- **點擊托盤**：顯示/隱藏視窗
- **自動隱藏**：複製後隱藏到托盤（托盤 checkbox 控制）

### 開機自動啟動
- `DigestRelay.bat` 直接呼叫 `electron.exe`（不經過 .bat，避免 CMD 彈窗）
- 位置：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DigestRelay.bat`

## 架構圖

```
[透明視窗]
  └── body (padding: 4px)
        └── .fake-box (假盒子)
              ├── box-shadow (設定控制)
              ├── border-radius (設定控制)
              ├── background rgba (設定控制)
              └── overflow: hidden → 裁切 card
              └── .card (內容層)
                    ├── .titlebar (拖曳 + 狀態 + 設定按鈕)
                    ├── .settings-panel (設定面板，可收合)
                    ├── .ime (組字 + 候選)
                    └── textarea (唯一輸入框)
```

## IPC 通訊

| Channel | 方向 | 用途 |
|---|---|---|
| `dictionary:load` | renderer → main | 載入詞庫 ArrayBuffer |
| `clipboard:write` | renderer → main | 複製文字到剪貼簿 |
| `window:hide` | renderer → main | 縮到托盤 |
| `window:setBounds` | renderer → main | 邊緣拖拉調整大小 |
| `window:getBounds` | renderer → main | 取得目前視窗 bounds |
| `window:setContentHeight` | renderer → main | 自動撐開視窗高度 |
| `settings:get` | renderer → main | 取得所有設定 |
| `settings:setAppearance` | renderer → main | 設定外觀（陰影/圓角） |
| `hotkey:set` | renderer → main | 變更全域熱鍵 |
| `hotkey:unregister` | renderer → main | 錄製時暫時解除熱鍵 |
| `hotkey:reregister` | renderer → main | 錄製取消時回復熱鍵 |
| `text:update` | renderer → main | textarea 內容同步（blur 複製用） |
| `settings:reset` | renderer → main | 還原預設設定 |
| `settings:changed` | main → renderer | 托盤改設定時通知 |
| `window:show` | main → renderer | 熱鍵叫出時通知 focus |
| `copied:ok` | main → renderer | 複製完成通知顯示提示 |

## 修正過的 Bug

| Bug | 原因 | 修正 |
|---|---|---|
| 自動隱藏沒勾選但仍自動隱藏 | 預設值 `true` + 只啟動時讀一次設定 | 改預設 `false` + IPC `settings:changed` 即時同步 |
| 邊緣拖拉闪烁變形 | 透明視窗位置+大小同時改變 + animate=true | animate=false + requestAnimationFrame 節流 |
| Ctrl+Space 無法註冊 | 被 Windows 系統占用（中英文切換） | 改用 Ctrl+` |
| 失焦後不在最上層 | alwaysOnTop 層級不夠高 | 改用 `'screen-saver'` 層級 + blur/focus 都重設 |
| 關閉自動隱藏後視窗消失 | show() 時序問題 | show + setAlwaysOnTop + moveTop + 200ms 延遲重設 |
| 設定按鈕無法變更快速鍵 | 錄製時按下目前熱鍵觸發 toggleWindow | 錄製開始時 unregisterHotkey，結束後 reregister |
| 自動複製失效 | renderer blur 後被 throttle，Clipboard API 不生效 | 改由主程序 blur 處理 clipboard.writeText |
| 「已複製」提示看不到 | 事件在 renderer throttle 後才送到 | 改為注音送出時就顯示（視窗有焦點） |
| `flashCopied is not defined` | 編輯過程中誤刪函式定義 | 加回 flashCopied 函式 |
| 自動大小乱跳 | `elTextArea.style.height = 'auto'` 造成 layout 迴圈 | 用 mirror div 測量 + 4px threshold 防抖動 |
| CMD 視窗彈出 | DigestRelay 呼叫 .bat 檔案 | 直接呼叫 electron.exe + >nul 2>&1 |
| `nul` 檔案干擾 git | bash 解讀 `>nul` 導向建出實體檔案 | 移除 nul 檔案 |

## 重用的原始碼

| 來源 | 檔案 | 用途 |
|---|---|---|
| `chrome/src/ime-client.js` | `renderer/lib/ime-client.js` | 引擎客戶端（已修改：支援 dictArrayBuffer） |
| `chrome/src/ui/layout-mapper.js` | `renderer/lib/layout-mapper.js` | 鍵盤物理碼 → 注音符號映射 |
| `chrome/lib/*.js` | `renderer/lib/*.js` | 引擎核心 |
| `shared/data/database.data` | `data/database.data` | 詞庫 |

## 環境需求

- **Node.js** v22.18.0（`D:\nodejs`）
- **Electron** v32（已安裝在 `node_modules/electron/`）
- **Proxy**：`http://127.0.0.1:15722`（僅安裝時需要，運行時完全離線）
- **無需管理員權限**

## 使用方式

1. 雙擊 `start.bat` 或開機自動啟動
2. **右 Shift** → 切換注音 ON/OFF
3. 注音 ON → 打注音 → 選字 → 中文字進 textarea
4. 注音 OFF → 打英文/數字直接進 textarea
5. **ESC** → 取消目前注音組字
6. **Ctrl+\`** → 顯示/隱藏視窗
7. **離開視窗** → 自動複製 textarea 內容到剪貼簿 + 閃示「已複製 ✓」
8. **⚙ 設定** → 修改熱鍵/陰影/圓角/還原預設
