'use strict';

/**
 * 浮動注音 — preload
 *
 * 用 contextBridge 把主程序的 IPC 安全地暴露給 renderer。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /** 複製文字到系統剪貼簿 */
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),

  /** 縮到托盤 */
  hideWindow: () => ipcRenderer.invoke('window:hide'),

  /** 依內容高度自動調整視窗高度 */
  setWindowContentHeight: (height) => ipcRenderer.invoke('window:setContentHeight', height),

  /** 精確設定視窗 bounds（邊緣拖曳用） */
  setWindowBounds: (bounds) => ipcRenderer.invoke('window:setBounds', bounds),

  /** 取得目前視窗 bounds（邊緣拖曳用） */
  getWindowBounds: () => ipcRenderer.invoke('window:getBounds'),

  /** 載入詞庫 ArrayBuffer（主程序 fs 讀檔） */
  loadDictionary: () => ipcRenderer.invoke('dictionary:load'),

  /** 取得偏好設定 */
  getSettings: () => ipcRenderer.invoke('settings:get'),

  /** 變更全域熱鍵 */
  setHotkey: (hotkey) => ipcRenderer.invoke('hotkey:set', hotkey),

  /** 暫時解除全域熱鍵（錄製時用） */
  unregisterHotkey: () => ipcRenderer.invoke('hotkey:unregister'),

  /** 重新註冊熱鍵（錄製取消時用） */
  reregisterHotkey: () => ipcRenderer.invoke('hotkey:reregister'),

  /** 設定外觀（陰影 + 圓角） */
  setAppearance: (opts) => ipcRenderer.invoke('settings:setAppearance', opts),
  onSettingsChanged: (cb) => ipcRenderer.on('settings:changed', (e, data) => cb(data)),

  /** 監聽視窗顯示（熱鍵叫出時通知 renderer focus） */
  onWindowShow: (cb) => ipcRenderer.on('window:show', () => cb()),

  /** 更新 textarea 內容到主程序（blur 時複製用） */
  updateText: (text) => ipcRenderer.invoke('text:update', text),

  /** 監聽主程序複製完成通知 */
  onCopied: (cb) => ipcRenderer.on('copied:ok', () => cb()),

  /** 還原預設設定 */
  resetSettings: () => ipcRenderer.invoke('settings:reset')
});