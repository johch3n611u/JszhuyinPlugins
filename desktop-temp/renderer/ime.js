'use strict';

/**
 * 浮動注音 — renderer 應用邏輯（整合版 v2）
 *
 * 唯一輸入框 + Right Shift 切換注音：
 *   - 注音 ON：按鍵進注音引擎 → 選字 → 送進 textarea
 *   - 注音 OFF：按鍵直接打英文/數字進 textarea
 *   - Right Shift 按兩下 = 切換開關
 *   - 候選字點擊或 Shift+數字 選取
 */

/* global JSZhuyinLayoutMapper, ImeClient, api */

(function () {

  var client = null;
  var initialized = false;
  var PAGE_SIZE = 9;
  var page = 0;

  // 注音開關（預設 ON）
  var imeEnabled = true;

  // Right Shift 單擊切換
  var TOGGLE_KEY = 'Shift';

  // 自動隱藏偏好
  var autoHideOnCommit = false;

  // 快速鍵錄製
  var recording = false;
  var currentHotkey = 'Ctrl+`';

  // 文字框自動撐開
  var resizeRafId = 0;

  // DOM
  var elCompositionLine = document.getElementById('composition-line');
  var elCompositionText = document.getElementById('composition-text');
  var elCandidates = document.getElementById('candidates');
  var elPagination = document.getElementById('pagination');
  var elPageInfo = document.getElementById('page-info');
  var elFlash = document.getElementById('copy-flash');
  var elStatus = document.getElementById('ime-status');
  var elTextArea = document.getElementById('text-area');
  var elBtnSettings = document.getElementById('btn-settings');
  var elSettingsPanel = document.getElementById('settings-panel');
  var elHotkeyDisplay = document.getElementById('hotkey-display');
  var elBtnRecord = document.getElementById('btn-record');
  var elHotkeyMsg = document.getElementById('hotkey-msg');
  var elCard = document.getElementById('card');
  var elFakeBox = document.getElementById('fake-box');
  var elOpacitySlider = document.getElementById('opacity-slider');
  var elOpacityVal = document.getElementById('opacity-val');
  var elColorSwatches = document.querySelectorAll('.color-swatch');
  var elBlurSlider = document.getElementById('blur-slider');
  var elBlurVal = document.getElementById('blur-val');
  var elOffsetSlider = document.getElementById('offset-slider');
  var elOffsetVal = document.getElementById('offset-val');
  var elRadiusSlider = document.getElementById('radius-slider');
  var elRadiusVal = document.getElementById('radius-val');
  var elBtnReset = document.getElementById('btn-reset');

  // ---- 初始化 ----
  function init() {
    if (initialized) return;
    initialized = true;

    // 讀取偏好
    if (typeof api !== 'undefined' && api.getSettings) {
      api.getSettings().then(function (s) {
        if (s && typeof s.autoHideOnCommit === 'boolean') autoHideOnCommit = s.autoHideOnCommit;
        if (s && s.hotkey) {
          currentHotkey = s.hotkey;
          elHotkeyDisplay.textContent = currentHotkey;
        }
        // 套用外觀設定
        if (s && typeof s.bgOpacity === 'number') {
          elOpacitySlider.value = Math.round(s.bgOpacity * 100);
          elOpacityVal.textContent = Math.round(s.bgOpacity * 100) + '%';
        }
        if (s && s.bgColor) {
          elColorSwatches.forEach(function (sw) {
            sw.classList.toggle('active', sw.getAttribute('data-color') === s.bgColor);
          });
        }
        if (s && typeof s.blur === 'number') {
          elBlurSlider.value = s.blur;
          elBlurVal.textContent = s.blur;
        }
        if (s && typeof s.offset === 'number') {
          elOffsetSlider.value = s.offset;
          elOffsetVal.textContent = s.offset;
        }
        if (s && typeof s.radius === 'number') {
          elRadiusSlider.value = s.radius;
          elRadiusVal.textContent = s.radius;
        }
        applyStyle();
      }).catch(function () {});
    }
    if (typeof api !== 'undefined' && api.onSettingsChanged) {
      api.onSettingsChanged(function (data) {
        if (data && typeof data.autoHideOnCommit === 'boolean') autoHideOnCommit = data.autoHideOnCommit;
      });
    }

    // ---- 設定面板 ----
    elBtnSettings.addEventListener('click', function (evt) {
      evt.stopPropagation();
      elSettingsPanel.classList.toggle('visible');
    });

    // ---- 外觀設定：透明度滑桿 ----
    elOpacitySlider.addEventListener('input', function () {
      var val = parseInt(elOpacitySlider.value, 10);
      elOpacityVal.textContent = val + '%';
      applyAppearance();
    });
    elOpacitySlider.addEventListener('change', function () {
      applyAppearance();
    });

    // ---- 外觀設定：背景色 ----
    elColorSwatches.forEach(function (swatch) {
      swatch.addEventListener('click', function () {
        elColorSwatches.forEach(function (s) { s.classList.remove('active'); });
        swatch.classList.add('active');
        applyAppearance();
      });
    });

    // ---- 陰影 & 圓角設定 ----
    elBlurSlider.addEventListener('input', function () {
      elBlurVal.textContent = elBlurSlider.value;
      applyStyle();
    });
    elOffsetSlider.addEventListener('input', function () {
      elOffsetVal.textContent = elOffsetSlider.value;
      applyStyle();
    });
    elRadiusSlider.addEventListener('input', function () {
      elRadiusVal.textContent = elRadiusSlider.value;
      applyStyle();
    });

    // ---- 還原預設 ----
    elBtnReset.addEventListener('click', function () {
      if (typeof api === 'undefined' || !api.resetSettings) return;
      api.resetSettings().then(function (s) {
        if (!s) return;
        // 還原滑桿
        elOpacitySlider.value = Math.round(s.bgOpacity * 100);
        elOpacityVal.textContent = Math.round(s.bgOpacity * 100) + '%';
        elBlurSlider.value = s.blur;
        elBlurVal.textContent = s.blur;
        elOffsetSlider.value = s.offset;
        elOffsetVal.textContent = s.offset;
        elRadiusSlider.value = s.radius;
        elRadiusVal.textContent = s.radius;
        // 還原顏色
        elColorSwatches.forEach(function (sw) {
          sw.classList.toggle('active', sw.getAttribute('data-color') === s.bgColor);
        });
        // 還原熱鍵
        currentHotkey = s.hotkey;
        elHotkeyDisplay.textContent = s.hotkey;
        elHotkeyMsg.textContent = '✓ 已還原預設';
        elHotkeyMsg.className = 'hotkey-msg ok';
        setTimeout(function () { elHotkeyMsg.textContent = ''; }, 2000);
        // 套用樣式
        applyStyle();
      });
    });

    // ---- 快速鍵錄製 ----
    elBtnRecord.addEventListener('click', function (evt) {
      evt.stopPropagation();
      if (recording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    document.addEventListener('keydown', function (evt) {
      if (!recording) return;
      evt.preventDefault();
      evt.stopPropagation();

      // ESC 取消
      if (evt.key === 'Escape') {
        cancelRecording();
        return;
      }

      // 忽略單獨按修飾鍵
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(evt.key)) return;

      // 組合鍵
      var parts = [];
      if (evt.ctrlKey) parts.push('Ctrl');
      if (evt.altKey) parts.push('Alt');
      if (evt.shiftKey) parts.push('Shift');
      if (evt.metaKey) parts.push('Super');
      // 主鍵
      var key = evt.key;
      if (key === ' ') key = 'Space';
      else if (key === '`') key = '`';
      else if (key.length === 1) key = key.toUpperCase();
      parts.push(key);

      var hotkeyStr = parts.join('+');
      attemptSetHotkey(hotkeyStr);
    }, true);

    document.addEventListener('keydown', handleKeyDown, true);

    // 複製後自動隱藏
    elTextArea.addEventListener('copy', function () {
      if (autoHideOnCommit && typeof api !== 'undefined' && api.hideWindow) {
        setTimeout(function () { api.hideWindow(); }, 400);
      }
    });

    // textarea 內 ESC = reset 注音組字
    elTextArea.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && imeEnabled && client && client.compositionActive) {
        evt.preventDefault();
        evt.stopPropagation();
        client.handleKey('Escape');
        elCompositionText.textContent = '';
        elCompositionLine.classList.remove('visible');
        elCandidates.innerHTML = '';
        elPagination.classList.remove('visible');
      }
    }, true);

    // textarea 內容變動 → 自動撐開
    elTextArea.addEventListener('input', scheduleAutoResize);

    // 熱鍵叫出視窗時 → 自動 focus textarea
    if (typeof api !== 'undefined' && api.onWindowShow) {
      api.onWindowShow(function () {
        elTextArea.focus();
      });
    }

    // 失焦時送出目前組字
    window.addEventListener('blur', function () {
      if (imeEnabled && client && client.compositionActive && client.candidates[0]) {
        client.handleKey('Enter');
      }
    });

    // 視窗隱藏時自動複製 → 改由主程序 blur 處理（renderer 失焦後被 throttle）
    // 改為：每次 textarea 內容變動 → 傳到主程序，主程序 blur 時複製
    elTextArea.addEventListener('input', function () {
      if (typeof api !== 'undefined' && api.updateText) {
        api.updateText(elTextArea.value);
      }
    });

    // 主程序複製完成 → 顯示「已複製」
    if (typeof api !== 'undefined' && api.onCopied) {
      api.onCopied(function () {
        flashCopied();
      });
    }

    // 邊緣拖曳
    initEdgeResize();
    loadEngine();
    updateStatusUI();
  }

  // ---- 注音開關 UI ----
  function updateStatusUI() {
    if (imeEnabled) {
      elStatus.textContent = '注音 ON';
      elStatus.className = 'ime-status on';
    } else {
      elStatus.textContent = '注音 OFF';
      elStatus.className = 'ime-status off';
    }
  }

  // ---- 陰影 & 圓角設定 ----
  function applyStyle() {
    var blur = parseInt(elBlurSlider.value, 10);
    var offset = parseInt(elOffsetSlider.value, 10);
    var radius = parseInt(elRadiusSlider.value, 10);
    var alpha = parseInt(elOpacitySlider.value, 10) / 100;
    var activeSwatch = document.querySelector('.color-swatch.active');
    var hex = activeSwatch ? activeSwatch.getAttribute('data-color') : '#000000';
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    // 假盒子：shadow + 圓角 + 半透明背景
    elFakeBox.style.boxShadow = '0 ' + offset + 'px ' + blur + 'px rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    elFakeBox.style.borderRadius = radius + 'px';
    elFakeBox.style.background = 'rgba(255,255,255,' + (parseInt(elOpacitySlider.value, 10) / 100) + ')';
    if (typeof api !== 'undefined' && api.setAppearance) {
      api.setAppearance({ bgOpacity: alpha, bgColor: hex, blur: blur, offset: offset, radius: radius });
    }
  }

  // ---- 文字框自動撐開（mirror div 測量，無迴圈） ----
  var mirrorDiv = null;
  var lastWindowH = 0;

  function getMirrorDiv() {
    if (!mirrorDiv) {
      mirrorDiv = document.createElement('div');
      mirrorDiv.style.cssText =
        'position:absolute;visibility:hidden;white-space:pre-wrap;word-break:break-all;' +
        'overflow:hidden;pointer-events:none;top:0;left:0;z-index:-1;' +
        'font-family:inherit;font-size:14px;line-height:1.6;padding:8px 10px;';
      document.body.appendChild(mirrorDiv);
    }
    return mirrorDiv;
  }

  function autoResize() {
    if (typeof api === 'undefined' || !api.setWindowContentHeight) return;
    if (!elTextArea.value) return;

    // 用 mirror div 測量內容實際高度
    var mirror = getMirrorDiv();
    mirror.style.width = elTextArea.offsetWidth + 'px';
    mirror.textContent = elTextArea.value;
    var contentH = mirror.scrollHeight;

    // 避免微小變化造成抖動
    var fixedH = 126;
    var totalH = Math.max(180, fixedH + contentH);
    if (Math.abs(totalH - lastWindowH) < 4) return;
    lastWindowH = totalH;

    // textarea 高度 = 內容高度（不捲動）
    elTextArea.style.height = contentH + 'px';
    // 視窗高度跟著長
    api.setWindowContentHeight(totalH);
  }

  function toggleIME() {
    // 如果正在組字，先送出
    if (imeEnabled && client && client.compositionActive && client.candidates[0]) {
      client.handleKey('Enter');
    }
    imeEnabled = !imeEnabled;
    updateStatusUI();
    if (!imeEnabled) {
      if (client) client.handleKey('Escape');
      elCompositionText.textContent = '';
      elCompositionLine.classList.remove('visible');
      elCandidates.innerHTML = '';
      elPagination.classList.remove('visible');
      elTextArea.focus();
    }
  }

  // ---- 快速鍵錄製 ----
  function startRecording() {
    recording = true;
    elBtnRecord.textContent = '按下一組快速鍵…';
    elBtnRecord.classList.add('recording');
    elHotkeyMsg.textContent = '按 ESC 取消';
    elHotkeyMsg.className = 'hotkey-msg';
    // 暫時解除目前的快速鍵，避免錄製時觸發 toggle
    if (typeof api !== 'undefined' && api.unregisterHotkey) {
      api.unregisterHotkey();
    }
  }

  function stopRecording() {
    recording = false;
    elBtnRecord.textContent = '設定';
    elBtnRecord.classList.remove('recording');
    elHotkeyMsg.textContent = '';
  }

  function cancelRecording() {
    stopRecording();
    // 回復原本的快速鍵
    if (typeof api !== 'undefined' && api.reregisterHotkey) {
      api.reregisterHotkey();
    }
  }

  function attemptSetHotkey(hotkeyStr) {
    elHotkeyMsg.textContent = '設定中…';
    elHotkeyMsg.className = 'hotkey-msg';
    if (typeof api === 'undefined' || !api.setHotkey) {
      elHotkeyMsg.textContent = 'API 不可用';
      elHotkeyMsg.className = 'hotkey-msg error';
      stopRecording();
      return;
    }
    api.setHotkey(hotkeyStr).then(function (result) {
      if (result && result.ok) {
        currentHotkey = hotkeyStr;
        elHotkeyDisplay.textContent = hotkeyStr;
        elHotkeyMsg.textContent = '✓ 已設定：' + hotkeyStr;
        elHotkeyMsg.className = 'hotkey-msg ok';
        stopRecording();
      } else {
        elHotkeyMsg.textContent = (result && result.error) || '設定失敗';
        elHotkeyMsg.className = 'hotkey-msg error';
        stopRecording();
      }
    }).catch(function (err) {
      elHotkeyMsg.textContent = '錯誤：' + (err.message || err);
      elHotkeyMsg.className = 'hotkey-msg error';
      stopRecording();
    });
  }

  // ---- 鍵盤處理 ----
  function handleKeyDown(evt) {
    // ---- 右 Shift 單擊切換注音 ----
    if (evt.key === TOGGLE_KEY && evt.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT) {
      evt.preventDefault();
      evt.stopPropagation();
      toggleIME();
      return;
    }

    // ---- 注音 OFF → 不攔截任何鍵，讓 textarea 正常打英文 ----
    if (!imeEnabled) return;

    // ---- 注音 ON 以下才攔截 ----
    if (!client || !client._initialized) return;
    if (resizing) return;
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
    if (evt.isComposing) return;

    var code = evt.code;
    var shiftKey = evt.shiftKey;

    // Shift+Digit1..9 選候選
    if (shiftKey && JSZhuyinLayoutMapper.isSelectionKey(code)) {
      var selIdx = JSZhuyinLayoutMapper.getSelectionIndexFromDOM3Code(code);
      if (selIdx !== -1 && client.compositionActive) {
        var cand = selectAt(selIdx);
        if (cand) {
          evt.preventDefault();
          var idx = client.candidates.indexOf(cand);
          if (idx !== -1) client.selectCandidate(idx);
          return;
        }
      }
    }

    // Shift+← → 翻頁
    if (shiftKey && code === 'ArrowRight') { if (nextPage()) evt.preventDefault(); return; }
    if (shiftKey && code === 'ArrowLeft')  { if (prevPage()) evt.preventDefault(); return; }

    var symbol = JSZhuyinLayoutMapper.getSymbolFromDOM3Code(code, shiftKey);
    var isSpecialKey = (code === 'Enter' || code === 'Backspace' ||
                        code === 'Escape' || code === 'Space');

    if (!symbol && !isSpecialKey) {
      // 注音 ON 時吃掉不相干按鍵（避免打進 textarea）
      if (client.compositionActive) evt.preventDefault();
      return;
    }

    var key = symbol || code;
    var handled = client.handleKey(key);
    if (handled) {
      evt.preventDefault();
      evt.stopPropagation();
    } else {
      if (!client.compositionActive) renderAll();
    }
  }

  // ---- 文字插入 ----
  function insertTextToEditor(text) {
    if (!text) return;
    var start = elTextArea.selectionStart;
    var end = elTextArea.selectionEnd;
    var val = elTextArea.value;
    elTextArea.value = val.substring(0, start) + text + val.substring(end);
    var pos = start + text.length;
    elTextArea.selectionStart = elTextArea.selectionEnd = pos;
    scheduleAutoResize();
    // 同步到主程序（blur 時複製用）
    if (typeof api !== 'undefined' && api.updateText) {
      api.updateText(elTextArea.value);
    }
  }

  // ---- 文字框自動撐開視窗 ----
  function scheduleAutoResize() {
    if (resizeRafId) return;
    resizeRafId = requestAnimationFrame(function () {
      resizeRafId = 0;
      autoResize();
    });
  }

  function autoResize() {
    if (typeof api === 'undefined' || !api.setWindowContentHeight) return;
    if (!elTextArea.value) return; // 空的不 resize
    elTextArea.style.height = 'auto';
    var contentH = elTextArea.scrollHeight;
    var fixedH = 126; // 標題列 + IME區 + padding + 邊框
    var totalH = fixedH + contentH;
    api.setWindowContentHeight(totalH);
    elTextArea.style.height = contentH + 'px';
  }

  // ---- 複製閃示 ----
  var flashTimer = null;
  function flashCopied() {
    elFlash.classList.add('show');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { elFlash.classList.remove('show'); }, 1400);
  }

  // ---- 引擎回呼 ----
  function onCompositionUpdate(symbols) {
    if (symbols) {
      elCompositionText.textContent = symbols;
      elCompositionLine.classList.add('visible');
    } else {
      elCompositionText.textContent = '';
      elCompositionLine.classList.remove('visible');
    }
    renderAll();
  }

  function onCandidatesChange() {
    page = 0;
    renderAll();
  }

  function onCompositionEnd(text) {
    if (!text) { renderAll(); return; }
    insertTextToEditor(text);
    elCompositionText.textContent = '';
    elCompositionLine.classList.remove('visible');
    elCandidates.innerHTML = '';
    page = 0;
    flashCopied();
  }

  // ---- 引擎載入 ----
  function loadEngine() {
    client = new ImeClient();
    var dictPromise;
    if (typeof api !== 'undefined' && api.loadDictionary) {
      dictPromise = api.loadDictionary().then(function (buf) {
        var u8 = new Uint8Array(buf);
        return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      });
    } else {
      dictPromise = Promise.reject(new Error('api.loadDictionary 不存在'));
    }
    dictPromise.then(function (dictBuffer) {
      return client.init({
        oncompositionupdate: onCompositionUpdate,
        oncandidateschange: onCandidatesChange,
        oncompositionend: onCompositionEnd
      }, dictBuffer);
    }).then(function () {
      renderAll();
      // 初始不呼叫 autoResize — 視窗已由 main.js 設定好高度
    }).catch(function (err) {
      console.error('[浮動注音] 引擎載入失敗:', err);
    });
  }

  // ---- 候選渲染 ----
  function renderAll() {
    if (!client) return;
    var composing = client.compositionActive && elCompositionLine.classList.contains('visible');
    if (composing || (client.candidates && client.candidates.length)) {
      renderCandidates();
    } else {
      elCandidates.innerHTML = '';
      elPagination.classList.remove('visible');
    }
  }

  function renderCandidates() {
    var cands = client.candidates || [];
    elCandidates.innerHTML = '';
    if (!cands.length) { elPagination.classList.remove('visible'); return; }

    var start = page * PAGE_SIZE;
    cands.slice(start, start + PAGE_SIZE).forEach(function (candidate, i) {
      var item = document.createElement('div');
      item.className = 'candidate-item' + (i === 0 ? ' selected' : '');
      item.setAttribute('data-offset', i);
      var idx = document.createElement('span');
      idx.className = 'candidate-index';
      idx.textContent = (i + 1);
      var txt = document.createElement('span');
      txt.textContent = candidate[0];
      item.appendChild(idx);
      item.appendChild(txt);
      item.addEventListener('mousedown', function (evt) {
        evt.preventDefault();
        selectAndCommit(parseInt(item.getAttribute('data-offset'), 10));
      });
      elCandidates.appendChild(item);
    });

    var totalPages = Math.ceil(cands.length / PAGE_SIZE);
    if (totalPages > 1) {
      elPagination.classList.add('visible');
      elPageInfo.textContent = (page + 1) + ' / ' + totalPages;
    } else {
      elPagination.classList.remove('visible');
    }
  }

  function selectAt(offset) {
    if (!client) return null;
    return client.candidates[page * PAGE_SIZE + offset] || null;
  }
  function selectAndCommit(offset) {
    var cand = selectAt(offset);
    if (!cand) return;
    var idx = client.candidates.indexOf(cand);
    if (idx !== -1) client.selectCandidate(idx);
  }
  function nextPage() {
    if (!client) return false;
    var total = Math.ceil((client.candidates || []).length / PAGE_SIZE);
    if (page + 1 < total) { page++; renderCandidates(); return true; }
    return false;
  }
  function prevPage() {
    if (page > 0) { page--; renderCandidates(); return true; }
    return false;
  }

  // ---- 邊緣拖曳 ----
  var EDGE = 12;
  var resizing = false, resizeDir = '';
  var resizeStartX = 0, resizeStartY = 0, resizeStartBounds = null;
  var resizeRafId = 0, pendingBounds = null;

  function initEdgeResize() {
  // ---- 邊緣拖曳 ----
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener('mouseup', onMouseUp, false);
  }
  function getEdgeDir(cx, cy) {
    var w = window.innerWidth, h = window.innerHeight;
    var onL = cx < EDGE, onR = cx > w - EDGE;
    var onT = cy < EDGE, onB = cy > h - EDGE;
    if (onT && onL) return 'nw'; if (onT && onR) return 'ne';
    if (onB && onL) return 'sw'; if (onB && onR) return 'se';
    if (onL) return 'w'; if (onR) return 'e';
    if (onT) return 'n'; if (onB) return 's';
    return '';
  }
  var CURSOR_MAP = {
    n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',
    ne:'nesw-resize',sw:'nesw-resize',nw:'nwse-resize',se:'nwse-resize'
  };
  function onMouseMove(evt) {
    if (resizing) {
      if (!resizeStartBounds) return;
      var dx = evt.clientX - resizeStartX, dy = evt.clientY - resizeStartY;
      var b = resizeStartBounds;
      var nb = { x:b.x, y:b.y, width:b.width, height:b.height };
      if (resizeDir.indexOf('e')!==-1) nb.width = b.width+dx;
      if (resizeDir.indexOf('w')!==-1) { nb.width = b.width-dx; nb.x = b.x+dx; }
      if (resizeDir.indexOf('s')!==-1) nb.height = b.height+dy;
      if (resizeDir.indexOf('n')!==-1) { nb.height = b.height-dy; nb.y = b.y+dy; }
      pendingBounds = nb;
      if (!resizeRafId) {
        resizeRafId = requestAnimationFrame(function () {
          resizeRafId = 0;
          if (pendingBounds && typeof api!=='undefined' && api.setWindowBounds) {
            api.setWindowBounds(pendingBounds);
            pendingBounds = null;
          }
        });
      }
      return;
    }
    var tgt = evt.target;
    if (tgt.closest('.titlebar') || tgt.tagName==='TEXTAREA') {
      document.body.style.cursor = '';
      return;
    }
    var dir = getEdgeDir(evt.clientX, evt.clientY);
    document.body.style.cursor = dir ? CURSOR_MAP[dir] : '';
  }
  function onMouseDown(evt) {
    if (evt.button!==0) return;
    if (evt.target.closest('.titlebar') || evt.target.tagName==='TEXTAREA' ||
        evt.target.closest('button')) return;
    var dir = getEdgeDir(evt.clientX, evt.clientY);
    if (!dir) return;
    resizing = true; resizeDir = dir;
    resizeStartX = evt.clientX; resizeStartY = evt.clientY;
    document.body.style.cursor = CURSOR_MAP[dir];
    if (typeof api!=='undefined' && api.getWindowBounds) {
      api.getWindowBounds().then(function (b) { resizeStartBounds = b; });
    }
    evt.preventDefault(); evt.stopPropagation();
  }
  function onMouseUp() {
    if (!resizing) return;
    resizing = false; resizeDir = ''; resizeStartBounds = null; pendingBounds = null;
    if (resizeRafId) { cancelAnimationFrame(resizeRafId); resizeRafId = 0; }
    document.body.style.cursor = '';
  }

  // ===== start =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();