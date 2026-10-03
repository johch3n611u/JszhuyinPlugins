# jszhuyin desktop 調整 TODO

更新日期：2026-09-30
目標：依 AdjustmentSummary 的分析逐項修正，完成後再打包與驗收。

## P0：先修正會影響輸入與剪貼簿的問題

- [ ] 合併 renderer/ime.js:325-345 與 :505-514 的兩個 autoResize()，只保留 mirror 測量版本。
  - [ ] 空文字時縮回合理高度。
  - [ ] 長文字高度上限 520px。
  - [ ] 輸入、刪除、貼上、換行都不抖動。
- [ ] 修正 main.js:169-179 的失焦複製。
  - [ ] 使用 dirty flag，只在文字真的變更後複製一次。
  - [ ] 複製成功後清空 pendingCopyText。
  - [ ] 增加「失焦自動複製」設定，讓使用者可關閉。
  - [ ] 連續切換視窗不能重複覆蓋系統剪貼簿。
- [ ] 修正 renderer/ime.js:423-427 的右 Shift。
  - [ ] 忽略 event.repeat，長按只切換一次。
  - [ ] 測試短按、長按與遠端桌面。
- [ ] 修正 settings reset。
  - [ ] renderer/ime.js:148-174 同步 autoHideOnCommit。
  - [ ] reset 後托盤、UI 與 copy 行為一致。
- [ ] 修正快捷鍵註冊交易流程。
  - [ ] 先嘗試註冊新鍵，成功後才移除舊鍵。
  - [ ] 失敗時保留舊快捷鍵並顯示實際 active hotkey。
  - [ ] 啟動 fallback 失敗時顯示可復原訊息。

## P1：可靠性、安全與效能

- [ ] 為設定加入 settingsVersion、欄位白名單、型別與數值範圍驗證。
- [ ] 設定檔採暫存檔加 rename 的 atomic write，損壞時保留 backup。
- [ ] 為 window:setBounds 驗證有限數值，並依目前螢幕 workArea 校正位置。
- [ ] 外觀滑桿 input 只更新 CSS；在 change 或 200–500ms debounce 後才寫檔。
- [ ] 修正 main.js:216 的托盤提示，從 TOGGLE_HOTKEY_DEFAULT 動態產生。
- [ ] 移除未使用的 copied:notify/onCopied，或補齊成功/失敗事件。
- [ ] 加入 CSP、sandbox、will-navigate 與 setWindowOpenHandler。
- [ ] 評估移除 backgroundThrottling:false，並量測 CPU/記憶體/耗電。
- [ ] 加入 ESLint、格式化、TypeScript 或 JSDoc 型別。

## P2：測試與發佈

- [ ] 加入 IME engine 與候選選字 unit tests。
- [ ] 加入 Electron smoke test：啟動、單例、托盤、熱鍵、focus、blur、剪貼簿、關閉。
- [ ] 加入右 Shift、Enter、Escape、Shift+1–9、翻頁測試。
- [ ] 加入長文、空文字、損壞設定、快捷鍵衝突、DPI、多螢幕測試。
- [ ] 在 Windows 10 LTSC 2019 與 Windows 11 驗證。
- [ ] 升級 Electron 至 2026 仍受支援的穩定/LTS 線，先做相容性 spike。
- [ ] 使用 electron-builder 或 Forge 產生簽章安裝包與 portable 包。
- [ ] 發佈 SBOM、詞庫/model SHA-256 manifest、離線更新包與回滾方案。
- [ ] 導入 Renovate/Dependabot 與 Electron/Chromium CVE 追蹤。

## P3：離線優先 AI 功能

- [ ] 本地個人化選字：注音碼到候選 ID 的頻率與近期性。
  - [ ] 不儲存完整句子。
  - [ ] 支援撤銷上一個學習、清除全部、匯出/匯入、完全停用。
  - [ ] 使用 Windows DPAPI 或 OS secure storage。
- [ ] 受限候選 AI reranker。
  - [ ] 只排序現有 9–27 個候選。
  - [ ] 使用 Web Worker/utilityProcess，50–100ms soft deadline。
  - [ ] JSON schema 驗證，超時或錯誤回退 JSZhuyin。
  - [ ] 模型下載需明確操作，離線包提供 baseline。
- [ ] 選取文字後 AI 工具：校正、語氣、摘要、繁簡轉換。
  - [ ] 預設本地模型。
  - [ ] 雲端 provider 顯示目的地、文字預覽與同意按鈕。
  - [ ] API key 只存 OS credential vault。
  - [ ] 敏感資料遮罩、diff 預覽、取消與 timeout。
  - [ ] AI 輸出不可當成 IPC、命令或檔案路徑執行。

## 完成驗收

- [ ] 關閉 AI 後不建立網路連線。
- [ ] 核心輸入與剪貼簿回歸測試通過。
- [ ] node --check、lint、unit、Electron smoke test、打包檢查通過。
- [ ] 長按鍵、重複 blur、空文字、換螢幕、高 DPI 都有測試紀錄。
- [ ] 發佈包具備簽章、SBOM、hash manifest 與回滾方案。

---

# 2026-10-02 UI/UX 與 MCP proxy 追查紀錄

## 研究項目 F：desktop UI/UX 與配色產品審查

- 日期時間：2026-10-02 14:33（Asia/Shanghai）
- 原始請求：以 Google 工程師與專案經理角度，確認 desktop 版畫面 UI/UX、配色與功能還需要修正什麼。
- 判斷：目前視覺方向乾淨，但產品還停留在「工程可用 prototype」；P0 應先處理輸入狀態、焦點可見性、設定可發現性與無障礙，再做 Material 風格細修。不要先增加 AI 按鈕或更多陰影設定。
- 證據：
  - renderer/index.html 的 focus CSS 使用 body:focus .card，但實際打字焦點通常在 textarea；因此主要輸入狀態不一定顯示 focus ring，應改為 :focus-within 或明確的 focus state。
  - settings-panel 以 display block 展開，body 設定 overflow:hidden；設定內容增加後沒有自己的 max-height/overflow-y，320px 視窗可能裁掉設定項目。
  - 候選項、色票、狀態與滑桿沒有 aria-label、role、aria-live、鍵盤 focus 樣式；色票是 div，無法靠 Tab 操作。
  - pagination 只有頁碼文字，沒有可見的上一頁/下一頁控制；使用者必須知道 Shift+方向鍵。
  - 「陰影濃度」同時改變 fake-box shadow alpha 與背景 alpha；控制名稱與實際效果不一致。
  - header placeholder 寫 Ctrl+C 複製，但程式另有失焦自動複製；使用者不易理解何時資料會進入剪貼簿。
  - 標題列只有設定按鈕，沒有明確隱藏/關閉或自動隱藏狀態；主要操作依賴托盤與全域熱鍵，學習成本高。
  - 配色檢查：#94a3b8/#f1f5f9 約 2.34:1、#cbd5e1/#ffffff 約 1.48:1、#16a34a/#ffffff 約 3.30:1；這些小字/placeholder/成功提示在一般文字情境對比不足。#334155/#f8fafc 約 9.90:1、#475569/#f8fafc 約 7.24:1，主要標籤基礎良好。
  - Google Material 3 官方頁面：https://m3.material.io/foundations/accessible-design/overview（擷取：2026-10-02）；可作為元件、狀態、可及性與一致間距的參考，不代表必須重做成 Material UI。
  - Microsoft Accessibility 官方文件：https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessibility-overview（擷取：2026-10-02）；強調 keyboard、screen reader、使用者自訂、high contrast 與 UI Automation。
- 建議實作任務：
  - [ ] P0 將 body:focus .card 改成 :focus-within + 明確 keyboard focus ring；測試 textarea、候選、設定按鈕與失焦狀態。
  - [ ] P0 將設定面板改為可滾動區域，限制高度並保留 Reset/取消可見；設定展開時自動調整視窗或顯示捲軸。
  - [ ] P0 補 aria-label、role、aria-live、tabindex 與 focus-visible；色票改成 button，候選改成 button/listbox/option 語意。
  - [ ] P0 提供可見的上一頁/下一頁按鈕與快捷鍵提示；候選頁碼以「第 n 頁，共 m 頁」顯示。
  - [ ] P1 將「陰影濃度」拆成 shadow opacity；背景維持固定或另設 background opacity，避免單一滑桿做兩件事。
  - [ ] P1 提供明確的「複製」「隱藏」操作與自動複製開關；placeholder 改成實際行為說明。
  - [ ] P1 補高對比主題、Windows high contrast、125%/150% DPI、reduced motion 與大字體驗收。
  - [ ] P1 簡化設定：保留快速鍵、複製行為、主題/高對比；陰影 blur/offset/radius 放進進階設定。
  - [ ] P2 建立產品指標：首次成功輸入時間、候選 top-1/top-3 命中率、取消率、設定完成率、誤複製率、鍵盤操作完成率。
- 風險等級：P0 可用性/無障礙高；P1 認知負擔中；單純品牌配色低。
- 驗收條件：
  - [ ] 只用鍵盤可完成開啟、輸入、候選選取、翻頁、複製、設定與隱藏。
  - [ ] 設定展開後所有控制可見或可捲動，不會被 320px 視窗裁掉。
  - [ ] focus ring 在 textarea、候選、按鈕與滑桿上清楚可見。
  - [ ] Narrator/NVDA 能讀出 IME ON/OFF、組字、候選、頁碼與複製結果。
  - [ ] 低對比小字與 placeholder 不再作為唯一狀態訊息；成功/警告同時有文字或圖示語意。
  - [ ] 使用者可明確知道文字何時會複製到剪貼簿，且能關閉自動複製。
- 未解問題：
  - [ ] 產品主目標是「快速貼上工具」還是「長時間編輯器」；兩者會導致不同的視窗大小與自動隱藏策略。
  - [ ] 是否接受移除高級陰影滑桿以換取更少設定與較穩定的 UI。
  - [ ] 是否需要真正的全系統 IME；若需要，renderer textarea 架構將不是長期終點。
- 狀態：待執行；優先於新增 AI UI。

## 本次可用來源

- https://www.electronjs.org/docs/latest/tutorial/security（Electron 安全；擷取 2026-10-02）
- https://www.electronjs.org/docs/latest/tutorial/updates（Electron 更新；擷取 2026-10-02）
- https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessibility-overview（Windows 無障礙；擷取 2026-10-02）
- https://learn.microsoft.com/en-us/windows/apps/develop/input/custom-text-input（Windows 自訂文字輸入；擷取 2026-10-02）
- https://onnxruntime.ai/docs/tutorials/web/（Electron/離線 ONNX Runtime Web；擷取 2026-10-02）
- https://m3.material.io/foundations/accessible-design/overview（Google Material 3 可及性入口；擷取 2026-10-02）
