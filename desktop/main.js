'use strict';

/**
 * 浮動注音輸入小工具 — Electron main process
 *
 * 職責：
 *   1. 建立 frameless、置頂、可拖曳的小視窗。
 *   2. 托盤圖示 + 全域熱鍵 (Ctrl+Shift+Z) 切換顯示/隱藏。
 *   3. IPC：剪貼簿寫入、縮到托盤、載入詞庫、視窗尺寸調整。
 *   4. 視窗位置持久化（userData/settings.json）。
 */

const { app, BrowserWindow, Tray, Menu, globalShortcut, clipboard, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

// ---- constants ----
const WIN_WIDTH = 320;
const WIN_HEIGHT = 320;
const TOGGLE_HOTKEY_DEFAULT = 'Ctrl+`';
const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');

let win = null;
let tray = null;
let isQuitting = false;
let pendingCopyText = '';  // renderer 傳來的最新文字，blur 時複製
let settings = { autoHideOnCommit: false, hotkey: 'Ctrl+`', bgOpacity: 0.25, bgColor: '#000000', blur: 24, offset: 4, radius: 10, x: undefined, y: undefined };
const SETTINGS_DEFAULTS = { autoHideOnCommit: false, hotkey: 'Ctrl+`', bgOpacity: 0.25, bgColor: '#000000', blur: 24, offset: 4, radius: 10 };

// ---- settings ----
function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH(), 'utf8');
    settings = Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* first run — defaults */ }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH()), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('[main] saveSettings failed:', e);
  }
}

// ---- tray icon (PNG built at runtime — no external asset needed) ----
function buildTrayIcon() {
  const S = 16;
  const BYTES_PER_ROW = S * 4;           // RGBA
  const stride = BYTES_PER_ROW + 1;      // +1 for PNG filter byte (value 0 = None)
  const raw = Buffer.alloc(S * stride);  // all zeros — filter byte 0 = None by default

  const inRoundedRect = (x, y) => {
    const cx = x < S / 2 ? 3 : S - 1 - 3;
    const cy = y < S / 2 ? 3 : S - 1 - 3;
    const dx = x - cx, dy = y - cy;
    if ((dx >= 0 && dx <= 3 && dy >= -4 && dy <= 4) || (dy >= 0 && dy <= 3 && dx >= -4 && dx <= 4) || (Math.abs(dx) <= 3 && Math.abs(dy) <= 3)) {
      return (dx * dx + dy * dy <= 9) || (Math.abs(dx) <= 2 && Math.abs(dy) <= 2);
    }
    return false;
  };

  for (let y = 0; y < S; y++) {
    const rowStart = y * stride;
    // raw[rowStart] = 0 already (filter None)
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      if (inRoundedRect(x, y)) {
        r = 0x25; g = 0x63; b = 0xEB; a = 255;
        // white caret indicator
        if (y >= 11 && y <= 12 && x >= 5 && x <= 10) { r = 255; g = 255; b = 255; }
      }
      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }

  // Build PNG manually (IHDR/IDAT/IEND) — deterministic, no external deps
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);

  return png;
}

// ---- window ----
function createWindow() {
  win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    x: settings.x,
    y: settings.y,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,      // 平常縮到托盤，不佔工作列
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // 設定置頂層級（screen-saver 確保在所有視窗之上，即使失焦）
  win.setAlwaysOnTop(true, 'screen-saver');

  // 位置記憶
  win.on('moved', () => {
    const b = win.getBounds();
    settings.x = b.x;
    settings.y = b.y;
    saveSettings();
  });

  // 每次聚焦時重新確保置頂 + 全透明
  win.on('focus', () => {
    win.setOpacity(1.0);
    if (!settings.autoHideOnCommit) {
      win.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  // 失焦時：複製 + 套用透明度
  win.on('blur', () => {
    if (pendingCopyText) {
      clipboard.writeText(pendingCopyText);
    }
    setTimeout(function () {
      if (!win) return;
      win.setOpacity(0.55);
      if (!settings.autoHideOnCommit) {
        win.setAlwaysOnTop(true, 'screen-saver');
      }
    }, 100);
  });

  // 關閉 = 縮到托盤（要真的退出請用托盤選單或 Ctrl+Q）
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => { win = null; });
}

function showWindow() {
  if (!win) return;
  win.show();
  win.setOpacity(1.0);
  win.focus();
  // 通知 renderer focus textarea
  if (win.webContents) {
    win.webContents.send('window:show');
  }
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) {
    win.hide();
  } else {
    showWindow();
  }
}

// ---- tray ----
function createTray() {
  tray = new Tray(require('electron').nativeImage.createFromBuffer(buildTrayIcon()));
  tray.setToolTip('浮動注音 — Ctrl+Shift+Z 切換');
  tray.on('click', () => toggleWindow());
  rebuildTrayMenu();
}

function setAutoHide(val) {
  settings.autoHideOnCommit = !!val;
  saveSettings();
  rebuildTrayMenu();
  // 同步到渲染程序
  if (win && win.webContents) {
    win.webContents.send('settings:changed', { autoHideOnCommit: settings.autoHideOnCommit });
  }
  // 自動隱藏 OFF → 確保視窗可見且永遠置頂
  if (!settings.autoHideOnCommit && win) {
    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
    win.focus();
    // 再次確保（防止某些系統在 focus 後又把視窗拉下去）
    setTimeout(() => {
      if (win && !settings.autoHideOnCommit) {
        win.setAlwaysOnTop(true, 'screen-saver');
        win.moveTop();
      }
    }, 200);
  }
}

function rebuildTrayMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: '送出後自動隱藏',
      type: 'checkbox',
      checked: settings.autoHideOnCommit,
      click: (item) => setAutoHide(item.checked)
    },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
}

// ---- IPC ----
function registerIpc() {
  // 複製文字到剪貼簿
  ipcMain.handle('clipboard:write', (e, text) => {
    if (typeof text === 'string' && text.length) {
      clipboard.writeText(text);
    }
    return true;
  });

  // 縮到托盤
  ipcMain.handle('window:hide', () => {
    if (win) win.hide();
    return true;
  });

  // Renderer 請求調整視窗高度（文字框自動撐開用）
  ipcMain.handle('window:setContentHeight', (e, height) => {
    if (!win) return;
    const minH = 180, maxH = 520;
    const target = Math.max(minH, Math.min(maxH, Math.round(height)));
    const [cw] = win.getContentSize();
    win.setContentSize(cw, target);
  });

  // 取得目前視窗 bounds（邊緣拖曳用）
  ipcMain.handle('window:getBounds', () => {
    if (!win) return null;
    return win.getBounds();
  });

  // Renderer 請求調整視窗大小與位置（邊緣拖曳用）
  ipcMain.handle('window:setBounds', (e, bounds) => {
    if (!win) return;
    const minW = 200, minH = 80;
    const w = Math.max(minW, Math.round(bounds.width));
    const h = Math.max(minH, Math.round(bounds.height));
    win.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: w,
      height: h
    }, false);  // animate=false → 直接跳到目標，不插值
  });

  // 載入詞庫（從主程序讀檔，避開 file:// CORS）
  ipcMain.handle('dictionary:load', () => {
    const dictPath = path.join(__dirname, 'data', 'database.data');
    try {
      return fs.readFileSync(dictPath);
    } catch (err) {
      console.error('[main] dictionary:load failed:', err);
      throw err;
    }
  });

  // 取得設定
  ipcMain.handle('settings:get', () => {
    return {
      autoHideOnCommit: settings.autoHideOnCommit,
      hotkey: settings.hotkey || TOGGLE_HOTKEY_DEFAULT,
      bgOpacity: settings.bgOpacity,
      bgColor: settings.bgColor,
      blur: settings.blur,
      offset: settings.offset,
      radius: settings.radius
    };
  });

  // 設定外觀（陰影 + 圓角）
  ipcMain.handle('settings:setAppearance', (e, opts) => {
    if (typeof opts.bgOpacity === 'number') settings.bgOpacity = opts.bgOpacity;
    if (typeof opts.bgColor === 'string') settings.bgColor = opts.bgColor;
    if (typeof opts.blur === 'number') settings.blur = opts.blur;
    if (typeof opts.offset === 'number') settings.offset = opts.offset;
    if (typeof opts.radius === 'number') settings.radius = opts.radius;
    saveSettings();
    return true;
  });

  // 變更全域熱鍵
  ipcMain.handle('hotkey:set', (e, newHotkey) => {
    if (!newHotkey || typeof newHotkey !== 'string') {
      return { ok: false, error: '無效的快速鍵' };
    }
    globalShortcut.unregisterAll();
    const ok = globalShortcut.register(newHotkey, toggleWindow);
    if (ok) {
      settings.hotkey = newHotkey;
      saveSettings();
      return { ok: true };
    } else {
      // 註冊失敗，回復原本的
      const fallback = settings.hotkey || TOGGLE_HOTKEY_DEFAULT;
      globalShortcut.register(fallback, toggleWindow);
      return { ok: false, error: `「${newHotkey}」無法使用，可能與其他程式衝突` };
    }
  });

  // 暫時解除全域熱鍵（錄製時避免觸發 toggle）
  ipcMain.handle('hotkey:unregister', () => {
    globalShortcut.unregisterAll();
    return true;
  });

  // 重新註冊熱鍵（錄製取消時回復）
  ipcMain.handle('hotkey:reregister', () => {
    const hotkey = settings.hotkey || TOGGLE_HOTKEY_DEFAULT;
    globalShortcut.unregisterAll();
    globalShortcut.register(hotkey, toggleWindow);
    return true;
  });

  // 還原預設設定
  ipcMain.handle('settings:reset', () => {
    settings = Object.assign({}, SETTINGS_DEFAULTS, { x: settings.x, y: settings.y });
    saveSettings();
    // 重設熱鍵
    globalShortcut.unregisterAll();
    globalShortcut.register(settings.hotkey, toggleWindow);
    return settings;
  });

  // renderer 更新 textarea 內容到主程序（blur 時複製用）
  ipcMain.handle('text:update', (e, text) => {
    pendingCopyText = typeof text === 'string' ? text : '';
    return true;
  });

  // renderer 通知已複製
  ipcMain.handle('copied:notify', () => true);
}

// ---- lifecycle ----
app.whenReady().then(() => {
  loadSettings();

  // 單一實例（必須在 createWindow 之前）
  app.on('second-instance', () => showWindow());
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;   // 已有另一個實例在跑，直接退出
  }

  createWindow();
  registerIpc();

  // 全域熱鍵（使用儲存的設定）
  const hotkey = settings.hotkey || TOGGLE_HOTKEY_DEFAULT;
  const ok = globalShortcut.register(hotkey, toggleWindow);
  console.log('[main] globalShortcut', hotkey, '→', ok ? 'ok' : 'FAILED');
  if (!ok) {
    console.warn('[main] 熱鍵註冊失敗，嘗試預設值');
    globalShortcut.register(TOGGLE_HOTKEY_DEFAULT, toggleWindow);
  }

  createTray();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// 關閉視窗時不要直接退出（縮到托盤）
app.on('window-all-closed', (e) => {
  // 不退出 — 任務還在托盤
});