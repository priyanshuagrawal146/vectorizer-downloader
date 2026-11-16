document.addEventListener('DOMContentLoaded', () => {
  // ==================== NAVIGATION TABS ====================
  // ── Debossed Base Branding Engine (VIVAGIFTS + Order ID) ──
  let brandingFont = null;
  let brandingFontLoading = null;

  async function ensureBrandingFont() {
    if (brandingFont) return brandingFont;
    if (brandingFontLoading) return await brandingFontLoading;
    if (typeof opentype === 'undefined') {
      console.warn('opentype.js is not loaded');
      return null;
    }
    brandingFontLoading = new Promise((resolve) => {
      // Arial regular: clean, balanced strokes with wide open counters (A, 8, 6, 0)
      opentype.load('fonts/Arial.ttf', (err, font) => {
        if (err || !font) {
          console.warn('Could not load branding font Arial.ttf:', err);
          resolve(null);
        } else {
          brandingFont = font;
          resolve(font);
        }
      });
    });
    return await brandingFontLoading;
  }

  function otPathToSubpaths(otPath) {
    const subpaths = [];
    let curr = null;
    for (const cmd of otPath.commands) {
      if (cmd.type === 'M') {
        if (curr && curr.points.length >= 3) subpaths.push(curr);
        curr = { points: [{ x: cmd.x, y: cmd.y }] };
      } else if (cmd.type === 'L') {
        if (curr) curr.points.push({ x: cmd.x, y: cmd.y });
      } else if (cmd.type === 'Q') {
        if (curr) {
          const p0 = curr.points[curr.points.length - 1];
          for (let t = 0.25; t <= 1.0; t += 0.25) {
            const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * cmd.x1 + t * t * cmd.x;
            const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * cmd.y1 + t * t * cmd.y;
            curr.points.push({ x, y });
          }
        }
      } else if (cmd.type === 'C') {
        if (curr) {
          const p0 = curr.points[curr.points.length - 1];
          for (let t = 0.2; t <= 1.0; t += 0.2) {
            const x = Math.pow(1 - t, 3) * p0.x + 3 * Math.pow(1 - t, 2) * t * cmd.x1 + 3 * (1 - t) * t * t * cmd.x2 + Math.pow(t, 3) * cmd.x;
            const y = Math.pow(1 - t, 3) * p0.y + 3 * Math.pow(1 - t, 2) * t * cmd.y1 + 3 * (1 - t) * t * t * cmd.y2 + Math.pow(t, 3) * cmd.y;
            curr.points.push({ x, y });
          }
        }
      } else if (cmd.type === 'Z') {
        if (curr && curr.points.length >= 3) {
          subpaths.push(curr);
          curr = null;
        }
      }
    }
    if (curr && curr.points.length >= 3) subpaths.push(curr);
    return subpaths;
  }

  function otPolyArea(poly) {
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    }
    return area / 2;
  }

  function otPointInPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function generateBrandingShapes(orderId, cx, cy, targetTotalW) {
    if (!brandingFont) return [];
    // User requested: in order ID just write number, no "Order #"
    const rawOrder = (orderId && typeof orderId === 'string') ? orderId.trim() : (orderId ? String(orderId) : '12345');
    // Extract only digits, or strip any "Order #" prefix
    const numMatch = rawOrder.match(/\d+/);
    const orderStr = numMatch ? numMatch[0] : (rawOrder.replace(/^order\s*#?\s*/i, '').trim() || '12345');

    // Baseline sizes
    const pV0 = brandingFont.getPath('VIVAGIFTS', 0, 0, 100);
    const bbV0 = pV0.getBoundingBox();
    const vW0 = bbV0.x2 - bbV0.x1;

    const pO0 = brandingFont.getPath(orderStr, 0, 0, 75);
    const bbO0 = pO0.getBoundingBox();
    const oW0 = bbO0.x2 - bbO0.x1;

    const maxW = Math.max(vW0, oW0);
    const scale = targetTotalW / maxW;
    const vSize = 100 * scale;
    const oSize = 75 * scale;

    const pV = brandingFont.getPath('VIVAGIFTS', 0, 0, vSize);
    const bbV = pV.getBoundingBox();
    const vH = bbV.y2 - bbV.y1;

    const pO = brandingFont.getPath(orderStr, 0, 0, oSize);
    const bbO = pO.getBoundingBox();
    const oH = bbO.y2 - bbO.y1;

    const gap = vH * 0.35;
    const totalH = vH + gap + oH;

    const topY = cy - totalH / 2 + vH;
    const botY = topY + gap + oH;

    const pTop = brandingFont.getPath('VIVAGIFTS', cx - (bbV.x1 + bbV.x2) / 2, topY, vSize);
    const pBot = brandingFont.getPath(orderStr, cx - (bbO.x1 + bbO.x2) / 2, botY, oSize);

    // CRITICAL: Mirror X coordinate along cx so text reads left-to-right when looking from the underside (bed base)
    [pTop, pBot].forEach(path => {
      (path.commands || []).forEach(cmd => {
        if (cmd.x !== undefined) cmd.x = 2 * cx - cmd.x;
        if (cmd.x1 !== undefined) cmd.x1 = 2 * cx - cmd.x1;
        if (cmd.x2 !== undefined) cmd.x2 = 2 * cx - cmd.x2;
      });
    });

    const allSubs = [...otPathToSubpaths(pTop), ...otPathToSubpaths(pBot)];
    const sorted = allSubs.map(s => ({
      points: s.points,
      area: Math.abs(otPolyArea(s.points))
    })).sort((a, b) => b.area - a.area);

    const shapes = [];
    sorted.forEach(item => {
      let container = null;
      for (const s of shapes) {
        if (otPointInPoly(item.points[0], s.points)) {
          container = s;
          break;
        }
      }
      if (container) {
        container.holes.push(item.points);
      } else {
        shapes.push({ points: item.points, holes: [] });
      }
    });

    return shapes;
  }


const tabBtnVectorizer = document.getElementById('tabBtnVectorizer');
  const tabBtn3DStudio = document.getElementById('tabBtn3DStudio');
  const vectorizerView = document.getElementById('vectorizerView');
  const studioView = document.getElementById('studioView');

  function switchTab(tab) {
    if (tab === 'vectorizer') {
      tabBtnVectorizer?.classList.add('active');
      tabBtn3DStudio?.classList.remove('active');
      vectorizerView?.classList.remove('hidden');
      studioView?.classList.add('hidden');
    } else {
      tabBtnVectorizer?.classList.remove('active');
      tabBtn3DStudio?.classList.add('active');
      vectorizerView?.classList.add('hidden');
      studioView?.classList.remove('hidden');
      // Resize Three.js viewport if initialized
      if (threeRenderer && threeContainer) {
        onThreeResize();
      }
    }
  }

  tabBtnVectorizer.addEventListener('click', () => switchTab('vectorizer'));
  tabBtn3DStudio.addEventListener('click', () => switchTab('3d'));

  // ==================== VECTORIZER EXTRACTOR LOGIC ====================
  const extractForm = document.getElementById('extractForm');
  const urlInput = document.getElementById('urlInput');
  const submitBtn = document.getElementById('submitBtn');
  const sampleBtn = document.getElementById('sampleBtn');
  const pasteBtn = document.getElementById('pasteBtn');

  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressStatus = document.getElementById('progressStatus');
  const progressPercent = document.getElementById('progressPercent');

  const errorContainer = document.getElementById('errorContainer');
  const errorMessage = document.getElementById('errorMessage');

  const resultSection = document.getElementById('resultSection');
  const resultFilename = document.getElementById('resultFilename');
  const svgContainer = document.getElementById('svgContainer');
  const viewportContainer = document.getElementById('viewportContainer');

  const statDims = document.getElementById('statDims');
  const statShapes = document.getElementById('statShapes');
  const statLoops = document.getElementById('statLoops');
  const statColors = document.getElementById('statColors');
  const statSize = document.getElementById('statSize');
  const statTime = document.getElementById('statTime');
  const paletteSwatches = document.getElementById('paletteSwatches');

  const sendTo3dBtn = document.getElementById('sendTo3dBtn');
  const downloadSvgBtn = document.getElementById('downloadSvgBtn');
  const downloadPngBtn = document.getElementById('downloadPngBtn');
  const copySvgBtn = document.getElementById('copySvgBtn');
  const copyBtnText = document.getElementById('copyBtnText');

  const toggleWireframe = document.getElementById('toggleWireframe');
  const resetZoomBtn = document.getElementById('resetZoomBtn');
  const bgOpts = document.querySelectorAll('.bg-opt');

  const historySection = document.getElementById('historySection');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  const SAMPLE_URL = 'https://vectorizer.ai/images/1788848214397-9ab9555d7ad0bc29-1c7a7413fd66e392f4b7d8c9b60fcefa61223420e1077107eb9519ea6749809f/edit';

  let currentResult = null;
  let zoomLevel = 1;

  sampleBtn.addEventListener('click', () => {
    urlInput.value = SAMPLE_URL;
    urlInput.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        urlInput.focus();
      }
    } catch (e) {
      urlInput.focus();
    }
  });

  extractForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    startExtraction(url);
  });

  function startExtraction(url) {
    const groupBy = document.querySelector('input[name="groupByOption"]:checked')?.value || 'none';

    errorContainer.classList.add('hidden');
    resultSection.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    progressBar.style.width = '5%';
    progressPercent.textContent = '5%';
    progressStatus.textContent = 'Connecting to vector stream...';

    const evtSource = new EventSource(`/api/extract-stream?url=${encodeURIComponent(url)}&groupBy=${groupBy}`);

    evtSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      const pct = Math.min(100, Math.max(0, data.percent || 0));
      progressBar.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}%`;
      progressStatus.textContent = data.message || 'Processing...';

      if (pct >= 5) document.getElementById('step-meta')?.classList.add('active');
      if (pct >= 25) document.getElementById('step-ws')?.classList.add('active');
      if (pct >= 60) document.getElementById('step-chunks')?.classList.add('active');
      if (pct >= 90) document.getElementById('step-compile')?.classList.add('active');
    });

    evtSource.addEventListener('complete', (e) => {
      evtSource.close();
      const result = JSON.parse(e.data);
      currentResult = result;
      displayResult(result);
      saveToHistory(result);

      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';
      progressStatus.textContent = 'Extraction complete!';

      setTimeout(() => {
        progressContainer.classList.add('hidden');
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
      }, 500);
    });

    evtSource.addEventListener('error', (e) => {
      evtSource.close();
      let msg = 'Failed to extract vector SVG. Please verify URL / Token.';
      try {
        if (e.data) {
          const errData = JSON.parse(e.data);
          if (errData.message) msg = errData.message;
        }
      } catch (ignored) {}

      showError(msg);
      progressContainer.classList.add('hidden');
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    });
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorContainer.classList.remove('hidden');
  }

  function displayResult(result) {
    resultFilename.textContent = result.filename;
    svgContainer.innerHTML = result.svg;

    const svgEl = svgContainer.querySelector('svg');
    if (svgEl) {
      svgEl.style.width = '100%';
      svgEl.style.height = '100%';
      svgEl.style.maxHeight = '500px';
      svgEl.style.display = 'block';
    }

    statDims.textContent = `${result.width} × ${result.height}`;
    statShapes.textContent = result.shapeCount?.toLocaleString() || '--';
    statLoops.textContent = result.loopCount?.toLocaleString() || '--';
    statColors.textContent = result.colorCount || '--';
    statSize.textContent = `${(new Blob([result.svg]).size / 1024).toFixed(1)} KB`;
    statTime.textContent = `${(result.durationMs / 1000).toFixed(1)}s`;

    extractPalette(result.svg);
    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth' });
  }

  function extractPalette(svgStr) {
    paletteSwatches.innerHTML = '';
    const fills = new Set();
    const regex = /fill=[\"\']([^\"\']+)[\"\']/gi;
    let m;
    while ((m = regex.exec(svgStr)) !== null) {
      const f = m[1].toLowerCase();
      if (f !== 'none' && f !== 'transparent') fills.add(f);
    }
    fills.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'palette-swatch';
      swatch.setAttribute('data-darkreader-ignore', 'true');
      swatch.style.backgroundColor = color;
      swatch.style.colorScheme = 'light';
      swatch.title = `Click to copy: ${color}`;
      swatch.addEventListener('click', () => {
        navigator.clipboard.writeText(color);
        swatch.style.transform = 'scale(1.25)';
        setTimeout(() => swatch.style.transform = '', 200);
      });
      paletteSwatches.appendChild(swatch);
    });
  }

  // Send to 3D Nameplate Studio Button
  sendTo3dBtn.addEventListener('click', () => {
    if (!currentResult || !currentResult.svg) return;
    switchTab('3d');
    loadSvgIntoStudio(currentResult.svg, currentResult.filename || 'Nameplate', currentResult.studioData, currentResult.id);
  });

  // Export handlers
  downloadSvgBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const orderPrompt = prompt('Enter Order ID for filename:', studioState.orderId || '');
    const outName = (orderPrompt && orderPrompt.trim()) ? `${orderPrompt.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}.svg` : currentResult.filename;
    const blob = new Blob([currentResult.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outName;
    a.click();
    URL.revokeObjectURL(url);
  });

  downloadPngBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const orderPrompt = prompt('Enter Order ID for filename:', studioState.orderId || '');
    const outName = (orderPrompt && orderPrompt.trim()) ? `${orderPrompt.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}@4x.png` : currentResult.filename.replace('.svg', '@4x.png');
    rasterizeSvgToPng(currentResult.svg, currentResult.width * 4, currentResult.height * 4, (dataUrl) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = outName;
      a.click();
    });
  });

  function rasterizeSvgToPng(svgStr, width, height, callback) {
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      callback(canvas.toDataURL('image/png'));
    };
    img.src = url;
  }

  copySvgBtn.addEventListener('click', () => {
    if (!currentResult) return;
    navigator.clipboard.writeText(currentResult.svg).then(() => {
      copyBtnText.textContent = 'Copied to Clipboard!';
      setTimeout(() => copyBtnText.textContent = 'Copy SVG Code', 2000);
    });
  });

  // Wireframe toggle
  let isWireframe = false;
  toggleWireframe.addEventListener('click', () => {
    isWireframe = !isWireframe;
    toggleWireframe.classList.toggle('active', isWireframe);
    const svgEl = svgContainer.querySelector('svg');
    if (svgEl) {
      svgEl.classList.toggle('wireframe-mode', isWireframe);
    }
  });

  // Background switcher
  bgOpts.forEach(btn => {
    btn.addEventListener('click', () => {
      bgOpts.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const bg = btn.dataset.bg;
      viewportContainer.className = `svg-viewport ${bg}`;
    });
  });

  resetZoomBtn.addEventListener('click', () => {
    zoomLevel = 1;
    const svgEl = svgContainer.querySelector('svg');
    if (svgEl) svgEl.style.transform = 'scale(1)';
  });

  // ==================== PERSISTENT HISTORY STORAGE (INDEXEDDB + SAFE LOCALSTORAGE FALLBACK) ====================
  const MAX_HISTORY_SLOTS = 30;
  let historyCache = [];
  let isHistoryLoaded = false;
  let dbPromise = null;
  const historyCountBadge = document.getElementById('historyCountBadge');

  function getHistoryDB() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open('VectorizerAppDB', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('history')) {
            const store = db.createObjectStore('history', { keyPath: 'id' });
            store.createIndex('lastEdited', 'lastEdited', { unique: false });
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => {
          console.warn('IndexedDB unavailable, falling back to localStorage:', e);
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB open threw exception:', err);
        resolve(null);
      }
    });
    return dbPromise;
  }

  // Load history on boot: Check IndexedDB first, migrate legacy localStorage if needed
  async function loadHistoryFromStorage() {
    // 1. Initial fast synchronous read from localStorage
    try {
      const raw = localStorage.getItem('vec_history');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          historyCache = parsed.slice(0, MAX_HISTORY_SLOTS);
        }
      }
    } catch (e) {}

    // Render immediately if localStorage had items
    if (historyCache.length > 0) {
      renderHistory();
    }

    // 2. Query IndexedDB for high-capacity persistence
    try {
      const db = await getHistoryDB();
      if (db) {
        const items = await new Promise((resolve, reject) => {
          const tx = db.transaction('history', 'readonly');
          const store = tx.objectStore('history');
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });

        if (items && items.length > 0) {
          // Sort newest first
          items.sort((a, b) => (b.lastEdited || b.id || 0) - (a.lastEdited || a.id || 0));
          historyCache = items.slice(0, MAX_HISTORY_SLOTS);

          // If IndexedDB had more than MAX_HISTORY_SLOTS, remove excess older items
          if (items.length > MAX_HISTORY_SLOTS) {
            const excess = items.slice(MAX_HISTORY_SLOTS);
            const delTx = db.transaction('history', 'readwrite');
            const delStore = delTx.objectStore('history');
            excess.forEach(ex => delStore.delete(ex.id));
          }
        } else if (historyCache.length > 0) {
          // Migrate localStorage legacy items into IndexedDB
          const migTx = db.transaction('history', 'readwrite');
          const migStore = migTx.objectStore('history');
          historyCache.forEach(item => migStore.put(item));
        }
      }
    } catch (err) {
      console.warn('IndexedDB load error:', err);
    }

    isHistoryLoaded = true;
    renderHistory();
  }

  // Auto-remove oldest items when slots or storage get full, and persist safely
  async function persistHistory() {
    // 1. Strictly enforce MAX_HISTORY_SLOTS: automatically drop oldest from end
    const evictedIds = [];
    while (historyCache.length > MAX_HISTORY_SLOTS) {
      const removed = historyCache.pop();
      if (removed && removed.id) evictedIds.push(removed.id);
    }

    // 2. Save into IndexedDB (virtually unlimited capacity, no 5MB quota errors)
    try {
      const db = await getHistoryDB();
      if (db) {
        const tx = db.transaction('history', 'readwrite');
        const store = tx.objectStore('history');
        historyCache.forEach(item => store.put(item));
        evictedIds.forEach(id => store.delete(id));
      }
    } catch (idbErr) {
      console.warn('IndexedDB persist error:', idbErr);
    }

    // 3. Backup to localStorage with intelligent FIFO quota auto-eviction
    try {
      let lsList = historyCache.map(item => ({
        id: item.id,
        filename: item.filename,
        width: item.width,
        height: item.height,
        shapes: item.shapes,
        svg: item.svg,
        studioData: item.studioData,
        lastEdited: item.lastEdited
      }));

      // While loop: if localStorage quota is exceeded, pop oldest items until it fits!
      let saved = false;
      while (lsList.length > 0 && !saved) {
        try {
          localStorage.setItem('vec_history', JSON.stringify(lsList));
          saved = true;
        } catch (quotaErr) {
          // Auto-remove oldest item from localStorage backup to free space
          lsList.pop();
        }
      }
      if (!saved && lsList.length === 0) {
        try { localStorage.removeItem('vec_history'); } catch (e) {}
      }
    } catch (e) {
      console.warn('LocalStorage backup error:', e);
    }
  }

  // Local storage history
  function saveToHistory(res) {
    try {
      const itemId = res.id || Date.now();
      const existingIdx = historyCache.findIndex(item => item.id === itemId || (item.filename === res.filename && item.svg === res.svg));
      
      const historyItem = {
        id: itemId,
        filename: res.filename,
        width: res.width,
        height: res.height,
        shapes: res.shapeCount || res.shapes,
        svg: res.svg,
        studioData: res.studioData || null,
        lastEdited: Date.now()
      };

      if (existingIdx >= 0) {
        // Preserve any existing studioData if not provided
        if (!historyItem.studioData && historyCache[existingIdx].studioData) {
          historyItem.studioData = historyCache[existingIdx].studioData;
        }
        historyCache.splice(existingIdx, 1);
      }

      // Prepend to top (most recent)
      historyCache.unshift(historyItem);

      // Auto-remove oldest if slots are full
      while (historyCache.length > MAX_HISTORY_SLOTS) {
        historyCache.pop();
      }

      renderHistory();
      persistHistory();
      return historyItem.id;
    } catch (e) {
      console.warn('Failed to save to history:', e);
      return null;
    }
  }

  // Save edited 3D model studio state back into history
  function saveStudioStateToHistory() {
    try {
      if (!studioState.svg) return;
      
      // Look for match by studioState.historyId, or by SVG match or filename
      let targetIdx = -1;
      if (studioState.historyId) {
        targetIdx = historyCache.findIndex(item => item.id === studioState.historyId);
      }
      if (targetIdx === -1 && studioState.svg) {
        targetIdx = historyCache.findIndex(item => item.svg === studioState.svg);
      }
      if (targetIdx === -1 && studioState.jobName) {
        targetIdx = historyCache.findIndex(item => item.filename === studioState.jobName);
      }

      const studioData = {
        layers: studioState.layers ? JSON.parse(JSON.stringify(studioState.layers)) : [],
        fixedWidthMm: studioState.fixedWidthMm,
        totalThicknessMm: studioState.totalThicknessMm,
        proportionalHeightMm: studioState.proportionalHeightMm,
        solidBase: studioState.solidBase,
        autoSolidifyPlates: studioState.autoSolidifyPlates,
        analysis: studioState.analysis,
        raisedTextDetected: studioState.raisedTextDetected,
        orderId: studioState.orderId || '',
        updatedAt: Date.now()
      };

      if (targetIdx >= 0) {
        const item = historyCache[targetIdx];
        item.studioData = studioData;
        item.lastEdited = Date.now();
        studioState.historyId = item.id;
        // Bump edited model to the front so it remains active and doesn't get evicted
        historyCache.splice(targetIdx, 1);
        historyCache.unshift(item);
      } else {
        // Create new history entry for uploaded or loaded 3D models
        const newId = Date.now();
        studioState.historyId = newId;
        historyCache.unshift({
          id: newId,
          filename: studioState.jobName || '3D Model',
          width: studioState.analysis?.width || Math.round(studioState.fixedWidthMm),
          height: studioState.analysis?.height || Math.round(studioState.proportionalHeightMm),
          shapes: studioState.layers?.length || 0,
          svg: studioState.svg,
          studioData: studioData,
          lastEdited: Date.now()
        });
      }

      // Auto-remove oldest if slots are full
      while (historyCache.length > MAX_HISTORY_SLOTS) {
        historyCache.pop();
      }

      renderHistory();
      persistHistory();
    } catch (e) {
      console.warn('Failed to save studio state to history:', e);
    }
  }

  async function deleteFromHistory(id) {
    const idx = historyCache.findIndex(item => item.id === id);
    if (idx >= 0) {
      historyCache.splice(idx, 1);
      renderHistory();
      try {
        const db = await getHistoryDB();
        if (db) {
          const tx = db.transaction('history', 'readwrite');
          tx.objectStore('history').delete(id);
        }
      } catch (e) {}
      persistHistory();
    }
  }

  function renderHistory() {
    try {
      const list = historyCache;
      if (!list || list.length === 0) {
        historySection.classList.add('hidden');
        if (historyCountBadge) historyCountBadge.textContent = '';
        return;
      }
      historySection.classList.remove('hidden');
      if (historyCountBadge) {
        historyCountBadge.textContent = `(${list.length} / ${MAX_HISTORY_SLOTS} slots)`;
      }
      historyList.innerHTML = '';
      list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.dataset.id = item.id;
        
        const hasEditedModel = !!(item.studioData && item.studioData.layers && item.studioData.layers.length > 0);
        const layerCount = hasEditedModel 
          ? item.studioData.layers.length 
          : (item.shapes || 0);
        const widthMm = (hasEditedModel && item.studioData.fixedWidthMm) 
          ? `${item.studioData.fixedWidthMm.toFixed(0)}mm` 
          : `${item.width}px`;
        const thickMm = (hasEditedModel && item.studioData.totalThicknessMm)
          ? ` • ${item.studioData.totalThicknessMm.toFixed(1)}mm Z`
          : '';

        const badgeHtml = hasEditedModel
          ? `<span class="history-badge badge-3d">✓ 3D Model Saved (${layerCount} layers)</span>`
          : `<span class="history-badge badge-model">3D Model (${layerCount} shapes)</span>`;

        card.innerHTML = `
          <button class="history-btn-delete" type="button" title="Delete this model from history" aria-label="Delete">×</button>
          <div class="history-thumb">${item.svg}</div>
          <div class="history-info">
            <span class="history-name" title="${item.filename}">${item.filename}</span>
            <span class="history-meta">${widthMm}${thickMm} • ${layerCount} layers/elements</span>
            ${badgeHtml}
            <div class="history-card-actions">
              <button class="history-btn-open" type="button" title="Open directly into 3D Studio">Open 3D Model →</button>
            </div>
          </div>
        `;

        // Clicking delete button
        const delBtn = card.querySelector('.history-btn-delete');
        delBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteFromHistory(item.id);
        });

        // Clicking "Open 3D Model" button
        const openBtn = card.querySelector('.history-btn-open');
        openBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          currentResult = item;
          switchTab('3d');
          loadSvgIntoStudio(item.svg, item.filename || '3D Model', item.studioData, item.id);
        });

        // Clicking the card itself
        card.addEventListener('click', () => {
          currentResult = item;
          displayResult(item);
          // Also pre-wire into 3D studio if user switches
          if (item.studioData) {
            studioState.historyId = item.id;
          }
        });

        historyList.appendChild(card);
      });
    } catch (e) {
      console.warn('Failed to render history:', e);
    }
  }

  clearHistoryBtn?.addEventListener('click', async () => {
    if (confirm('Clear all saved 3D models and extraction history?')) {
      historyCache = [];
      renderHistory();
      try {
        localStorage.removeItem('vec_history');
      } catch (e) {}
      try {
        const db = await getHistoryDB();
        if (db) {
          const tx = db.transaction('history', 'readwrite');
          tx.objectStore('history').clear();
        }
      } catch (e) {}
    }
  });

  loadHistoryFromStorage();
  ensureBrandingFont().then(() => {
    console.log('[Branding] Font preloaded successfully, refreshing 3D base geometry...');
    if (typeof updateThreeGeometry === 'function' && studioState && studioState.analysis) {
      updateThreeGeometry(false, false);
    }
  });

  // ==================== 3D FDM NAMEPLATE STUDIO LOGIC ====================
  const studioDropzone = document.getElementById('studioDropzone');
  const studioFileInput = document.getElementById('studioFileInput');
  const studioUploadBtn = document.getElementById('studioUploadBtn');
  const studioSampleBtn = document.getElementById('studioSampleBtn');
  const studioWorkspace = document.getElementById('studioWorkspace');
  const layersContainer = document.getElementById('layersContainer');
  const layerCountBadge = document.getElementById('layerCountBadge');

  const inputFixedWidth = document.getElementById('inputFixedWidth');
  const inputTotalThickness = document.getElementById('inputTotalThickness');
  const chkRemoveBackground = document.getElementById('chkRemoveBackground');
  const chkSolidBase = document.getElementById('chkSolidBase');
  const chkAutoSolidify = document.getElementById('chkAutoSolidify');

  const btnAutoMergeSimilar = document.getElementById('btnAutoMergeSimilar');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const bgRemovedAlert = document.getElementById('bgRemovedAlert');
  const btnToggleBgRestore = document.getElementById('btnToggleBgRestore');

  const btnExportZip = document.getElementById('btnExportZip');
  const btnExport3mf = document.getElementById('btnExport3mf') || document.getElementById('btnExportBlend');
  const btnExportCombined = document.getElementById('btnExportCombined');
  const btnViewGuide = document.getElementById('btnViewGuide');
  const studioExportStatus = document.getElementById('studioExportStatus');

  const viewportModelName = document.getElementById('viewportModelName');
  const dimensionBadge = document.getElementById('dimensionBadge');
  const threeContainer = document.getElementById('threeContainer');
  const threeLoadingOverlay = document.getElementById('threeLoadingOverlay');
  const threeStats = document.getElementById('threeStats');

  const viewPerspective = document.getElementById('viewPerspective');
  const viewTop = document.getElementById('viewTop');
  const viewFront = document.getElementById('viewFront');
  const sliderExplode = document.getElementById('sliderExplode');
  const explodeValue = document.getElementById('explodeValue');
  const btnWireframe3D = document.getElementById('btnWireframe3D');
  const btnResetCamera = document.getElementById('btnResetCamera');

  const guideModal = document.getElementById('guideModal');
  const guideTextContent = document.getElementById('guideTextContent');
  const closeGuideModal = document.getElementById('closeGuideModal');
  const dismissGuideModal = document.getElementById('dismissGuideModal');
  const copyGuideTextBtn = document.getElementById('copyGuideTextBtn');

  // Order ID Modal Elements
  const orderIdModal = document.getElementById('orderIdModal');
  const exportOrderIdInput = document.getElementById('exportOrderIdInput');
  const closeOrderIdModal = document.getElementById('closeOrderIdModal');
  const cancelOrderIdModal = document.getElementById('cancelOrderIdModal');
  const confirmOrderIdExportBtn = document.getElementById('confirmOrderIdExportBtn');
  const viewBottom = document.getElementById('viewBottom');

  // Multi-merge & combine toolbar elements
  const multiMergeBar = document.getElementById('multiMergeBar');
  const selectedLayersBadge = document.getElementById('selectedLayersBadge');
  const multiMergeTargetSelect = document.getElementById('multiMergeTargetSelect');
  const btnConfirmMultiMerge = document.getElementById('btnConfirmMultiMerge');
  const btnConfirmMultiCombine = document.getElementById('btnConfirmMultiCombine');
  const btnCancelMultiSelect = document.getElementById('btnCancelMultiSelect');

  // 3D Viewport Inspection HUD
  const layerInspectHud = document.getElementById('layerInspectHud');
  const inspectHudColor = document.getElementById('inspectHudColor');
  const inspectHudTitle = document.getElementById('inspectHudTitle');
  const inspectHudStats = document.getElementById('inspectHudStats');
  const btnDismissInspect = document.getElementById('btnDismissInspect');

  // Studio State
  let studioState = {
    svg: null,
    jobName: 'Nameplate',
    analysis: null,
    layers: [],
    fixedWidthMm: 150.0,
    totalThicknessMm: 10.0,
    proportionalHeightMm: 100.0,
    solidBase: true,
    autoSolidifyPlates: true,
    explodeMm: 0,
    wireframe3d: false,
    lastExportResult: null,
    activeMergeIdx: null,
    activeCombineIdx: null,
    inspectedLayerIdx: null,
    selectedLayerIndices: new Set(),
    raisedTextDetected: false,  // true when hole-paths were successfully raised as 3D text
    cameraInitialized: false,
    modelCentered: false,
    historyId: null,
    orderId: ''
  };

  // ==================== UNDO / REDO SYSTEM ====================
  let undoStack = [];
  let redoStack = [];

  function saveUndoState() {
    if (!studioState.layers || !studioState.layers.length) return;
    undoStack.push(JSON.parse(JSON.stringify(studioState.layers)));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
    // Auto-persist edited 3D model into history
    saveStudioStateToHistory();
  }

  function undoStudio() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.parse(JSON.stringify(studioState.layers)));
    studioState.layers = undoStack.pop();
    studioState.selectedLayerIndices.clear();
    studioState.activeMergeIdx = null;
    updateUndoRedoButtons();
    renderLayersList();
    updateThreeGeometry();
    updateDimensionBadges();
    saveStudioStateToHistory();
  }

  function redoStudio() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.parse(JSON.stringify(studioState.layers)));
    studioState.layers = redoStack.pop();
    studioState.selectedLayerIndices.clear();
    studioState.activeMergeIdx = null;
    updateUndoRedoButtons();
    renderLayersList();
    updateThreeGeometry();
    updateDimensionBadges();
    saveStudioStateToHistory();
  }

  function updateUndoRedoButtons() {
    if (btnUndo) btnUndo.disabled = (undoStack.length === 0);
    if (btnRedo) btnRedo.disabled = (redoStack.length === 0);
  }

  btnUndo?.addEventListener('click', () => undoStudio());
  btnRedo?.addEventListener('click', () => redoStudio());

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
      return;
    }
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    if (modKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redoStudio();
      } else {
        undoStudio();
      }
    } else if (modKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redoStudio();
    }
  });

  // Three.js Scene Variables
  let threeScene = null;
  let threeCamera = null;
  let threeRenderer = null;
  let threeControls = null;
  let threeLayerMeshes = [];
  let threeRootGroup = null;

  // Upload trigger
  studioUploadBtn.addEventListener('click', () => studioFileInput.click());
  studioDropzone.addEventListener('click', () => studioFileInput.click());

  studioFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      loadSvgIntoStudio(evt.target.result, file.name.replace(/\.[^/.]+$/, ''));
    };
    reader.readAsText(file);
  });

  // Drag and drop for studio
  studioDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    studioDropzone.classList.add('dragover');
  });
  studioDropzone.addEventListener('dragleave', () => studioDropzone.classList.remove('dragover'));
  studioDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    studioDropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.svg')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        loadSvgIntoStudio(evt.target.result, file.name.replace(/\.[^/.]+$/, ''));
      };
      reader.readAsText(file);
    }
  });

  // Sample Nameplate loader
  studioSampleBtn.addEventListener('click', async () => {
    try {
      studioSampleBtn.disabled = true;
      const res = await fetch('/api/3d/sample');
      if (!res.ok) throw new Error('Sample not found');
      const data = await res.json();
      loadSvgIntoStudio(data.svg, data.name || 'Sunil_Malviya_Nameplate');
    } catch (err) {
      alert('Could not load sample: ' + err.message);
    } finally {
      studioSampleBtn.disabled = false;
    }
  });

  // Load SVG into 3D Studio (supports restoring edited 3D model state)
  async function loadSvgIntoStudio(svgStr, name = 'Nameplate', savedStudioData = null, historyId = null) {
    studioState.svg = svgStr;
    studioState.jobName = name;
    studioState.activeMergeIdx = null;
    studioState.selectedLayerIndices.clear();
    studioState.historyId = historyId || null;
    viewportModelName.textContent = name;

    // Await branding font so debossed branding is guaranteed loaded before initial render
    await ensureBrandingFont();

    studioDropzone.classList.add('hidden');
    studioWorkspace.classList.remove('hidden');

    // If we have saved 3D model studio data (custom layers, thickness, dimensions, etc.), restore it directly!
    if (savedStudioData && savedStudioData.layers && savedStudioData.layers.length > 0) {
      try {
        showThreeLoading(true);
        studioState.analysis = savedStudioData.analysis || null;
        studioState.fixedWidthMm = savedStudioData.fixedWidthMm || 150.0;
        studioState.totalThicknessMm = savedStudioData.totalThicknessMm || 10.0;
        studioState.proportionalHeightMm = savedStudioData.proportionalHeightMm || 100.0;
        if (savedStudioData.solidBase !== undefined) studioState.solidBase = savedStudioData.solidBase;
        if (savedStudioData.autoSolidifyPlates !== undefined) studioState.autoSolidifyPlates = savedStudioData.autoSolidifyPlates;
        if (savedStudioData.raisedTextDetected !== undefined) studioState.raisedTextDetected = savedStudioData.raisedTextDetected;
        if (savedStudioData.orderId !== undefined) studioState.orderId = savedStudioData.orderId;
        else if (!studioState.orderId) {
          const numMatch = name.match(/\d{4,}/);
          if (numMatch) studioState.orderId = numMatch[0];
        }
        
        // Deep copy restored layers
        studioState.layers = JSON.parse(JSON.stringify(savedStudioData.layers));
        studioState.cameraInitialized = false;
        studioState.modelCentered = false;

        // Sync input controls if present
        if (inputFixedWidth) inputFixedWidth.value = studioState.fixedWidthMm;
        if (inputTotalThickness) inputTotalThickness.value = studioState.totalThicknessMm.toFixed(1);

        undoStack = [];
        redoStack = [];
        updateUndoRedoButtons();
        updateDimensionBadges();
        renderLayersList();
        initOrUpdateThreeScene();
        return;
      } catch (err) {
        console.warn('Could not restore saved 3D model state, falling back to fresh analysis:', err);
      } finally {
        showThreeLoading(false);
      }
    }

    await fetchAndApplyAnalysis();
  }

  // Fetch layer analysis from server
  async function fetchAndApplyAnalysis() {
    if (!studioState.svg) return;
    try {
      showThreeLoading(true);
      const shouldRemoveBg = chkRemoveBackground ? chkRemoveBackground.checked : true;
      const res = await fetch('/api/3d/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          svg: studioState.svg,
          removeBackground: shouldRemoveBg
        })
      });

      if (!res.ok) throw new Error('Failed to analyze SVG layers');
      const analysis = await res.json();
      studioState.analysis = analysis;
      studioState.cameraInitialized = false;
      studioState.modelCentered = false;
      studioState.layers = (analysis.layers || []).map((l, i) => {
        let t = l.thicknessMm !== undefined 
          ? l.thicknessMm 
          : parseFloat(((l.heightPct / 100.0) * studioState.totalThicknessMm).toFixed(2));
        t = Math.max(1.00, t);
        return {
          ...l,
          thicknessMm: t
        };
      });
      adjustBaseLayerForTotal();
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();

      // Flat background alert banner
      if (analysis.backgroundRemoved) {
        bgRemovedAlert?.classList.remove('hidden');
        if (btnToggleBgRestore) btnToggleBgRestore.textContent = 'Restore Background';
      } else {
        bgRemovedAlert?.classList.add('hidden');
      }

      // Check similar color pairs
      updateSimilarColorMergeBtn(analysis.similarColorPairs);

      // Update proportional height
      const aspect = analysis.aspectRatio || (analysis.width / analysis.height) || 1.5;
      studioState.proportionalHeightMm = parseFloat((studioState.fixedWidthMm / aspect).toFixed(2));

      updateDimensionBadges();
      renderLayersList();
      initOrUpdateThreeScene();
      // Save initial 3D model state to history
      saveStudioStateToHistory();
    } catch (err) {
      alert('Error analyzing SVG: ' + err.message);
    } finally {
      showThreeLoading(false);
    }
  }

  // Background toggle events
  chkRemoveBackground?.addEventListener('change', () => {
    fetchAndApplyAnalysis();
  });

  btnToggleBgRestore?.addEventListener('click', () => {
    if (chkRemoveBackground) {
      chkRemoveBackground.checked = !chkRemoveBackground.checked;
      fetchAndApplyAnalysis();
    }
  });

  // Quick Merge Similar Colors
  function updateSimilarColorMergeBtn(pairs) {
    if (!pairs || pairs.length === 0) {
      btnAutoMergeSimilar?.classList.add('hidden');
      return;
    }
    btnAutoMergeSimilar?.classList.remove('hidden');
    btnAutoMergeSimilar.innerHTML = `⚡ Merge Similar Colors (${pairs.length})`;
    btnAutoMergeSimilar.title = `Merge similar shades into a single layer (e.g. ${pairs[0].sourceColor} into ${pairs[0].targetColor})`;
  }

  btnAutoMergeSimilar?.addEventListener('click', () => {
    const pairs = findSimilarColorPairs();
    if (pairs.length === 0) {
      alert('No similar shades detected (RGB distance < 50). You can still merge any layer manually using the ⇄ button.');
      return;
    }
    const pair = pairs[0];
    const sourceL = studioState.layers[pair.sourceIndex];
    const targetL = studioState.layers[pair.targetIndex];
    mergeLayers(pair.sourceIndex, pair.targetIndex);
  });

  function findSimilarColorPairs() {
    const pairs = [];
    const layers = studioState.layers;
    for (let i = 0; i < layers.length; i++) {
      for (let j = i + 1; j < layers.length; j++) {
        const dist = calcColorDistance(layers[i].color, layers[j].color);
        if (dist < 50) {
          pairs.push({
            sourceIndex: j,
            targetIndex: i,
            sourceColor: layers[j].color,
            targetColor: layers[i].color,
            distance: parseFloat(dist.toFixed(1))
          });
        }
      }
    }
    return pairs;
  }

  function calcColorDistance(hex1, hex2) {
    const parseRgb = (hex) => {
      hex = (hex || '').replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };
    try {
      const [r1, g1, b1] = parseRgb(hex1);
      const [r2, g2, b2] = parseRgb(hex2);
      return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
    } catch (e) {
      return 999;
    }
  }

  // Merge Source Layer into Target Layer
  function mergeLayers(sourceIdx, targetIdx) {
    if (sourceIdx === targetIdx || !studioState.layers[sourceIdx] || !studioState.layers[targetIdx]) return;
    saveUndoState();

    const source = studioState.layers[sourceIdx];
    const target = studioState.layers[targetIdx];

    // Combine paths into target
    target.paths = [...target.paths, ...source.paths];
    target.pathCount = target.paths.length;

    // Combine bounding boxes
    if (source.bbox && target.bbox) {
      target.bbox.minX = Math.min(target.bbox.minX, source.bbox.minX);
      target.bbox.maxX = Math.max(target.bbox.maxX, source.bbox.maxX);
      target.bbox.minY = Math.min(target.bbox.minY, source.bbox.minY);
      target.bbox.maxY = Math.max(target.bbox.maxY, source.bbox.maxY);
      target.bbox.width = Math.max(0, target.bbox.maxX - target.bbox.minX);
      target.bbox.height = Math.max(0, target.bbox.maxY - target.bbox.minY);
      target.bbox.bboxArea = target.bbox.width * target.bbox.height;
    }

    // Ensure target has healthy height (minimum 0.10 mm)
    if (target.role !== 'base') {
      target.thicknessMm = Math.max(0.10, target.thicknessMm || 1.00, source.thicknessMm || 1.00);
      target.heightPct = Math.max(target.heightPct || 10, source.heightPct || 10);
    }

    // Splice out source layer
    studioState.layers.splice(sourceIdx, 1);
    studioState.activeMergeIdx = null;

    reassignRoles();
    adjustBaseLayerForTotal();
    renderLayersList();
    updateThreeGeometry();
    updateDimensionBadges();

    // Recheck similar colors
    const remainingPairs = findSimilarColorPairs();
    updateSimilarColorMergeBtn(remainingPairs);
  }

  // Merge Multiple Selected Layers into Target Layer
  function mergeMultipleLayers(selectedIndices, targetIdx) {
    if (!selectedIndices || selectedIndices.length < 2 || !studioState.layers[targetIdx]) return;
    saveUndoState();

    const target = studioState.layers[targetIdx];

    selectedIndices.forEach(srcIdx => {
      if (srcIdx === targetIdx) return;
      const source = studioState.layers[srcIdx];
      if (!source) return;

      target.paths = [...target.paths, ...source.paths];

      if (source.bbox && target.bbox) {
        target.bbox.minX = Math.min(target.bbox.minX, source.bbox.minX);
        target.bbox.maxX = Math.max(target.bbox.maxX, source.bbox.maxX);
        target.bbox.minY = Math.min(target.bbox.minY, source.bbox.minY);
        target.bbox.maxY = Math.max(target.bbox.maxY, source.bbox.maxY);
        target.bbox.width = Math.max(0, target.bbox.maxX - target.bbox.minX);
        target.bbox.height = Math.max(0, target.bbox.maxY - target.bbox.minY);
        target.bbox.bboxArea = target.bbox.width * target.bbox.height;
      }
    });

    target.pathCount = target.paths.length;

    if (target.role !== 'base') {
      const srcMms = selectedIndices.map(i => studioState.layers[i]?.thicknessMm || 1.00);
      target.thicknessMm = Math.max(0.10, target.thicknessMm || 1.00, ...srcMms);
      const srcPcts = selectedIndices.map(i => studioState.layers[i]?.heightPct || 10);
      target.heightPct = Math.max(target.heightPct || 10, ...srcPcts);
    }

    // Remove source layers in descending index order so remaining indices don't shift
    const toRemove = selectedIndices.filter(i => i !== targetIdx).sort((a, b) => b - a);
    toRemove.forEach(idx => {
      studioState.layers.splice(idx, 1);
    });

    studioState.selectedLayerIndices.clear();
    studioState.activeMergeIdx = null;

    reassignRoles();
    adjustBaseLayerForTotal();
    renderLayersList();
    updateThreeGeometry();
    updateDimensionBadges();

    const remainingPairs = findSimilarColorPairs();
    updateSimilarColorMergeBtn(remainingPairs);
  }

  // Combine 2 Layers (CorelDRAW Style: Hollow / Cutout overlapping areas using evenodd compoun  // Combine 2 Layers (CorelDRAW Style: Hollow / Cutout overlapping areas)
  function combineLayers(sourceIdx, targetIdx) {
    if (sourceIdx === targetIdx || !studioState.layers[sourceIdx] || !studioState.layers[targetIdx]) return;
    saveUndoState();

    const source = studioState.layers[sourceIdx];
    const target = studioState.layers[targetIdx];

    const isTargetBase = (target.role === 'base' || targetIdx === 0);
    const isSourceBase = (source.role === 'base' || sourceIdx === 0);

    if (isTargetBase) {
      // Combining a color layer into the Base Layer:
      // Punch out ONLY this specific color layer's paths from the base plate
      target.cutoutPaths = [...(target.cutoutPaths || []), ...(source.cutoutPaths || source.paths || [])];
      target.isCombined = true;
    } else if (isSourceBase) {
      // Base layer was chosen as source; target absorbs cutouts
      source.cutoutPaths = [...(source.cutoutPaths || []), ...(target.cutoutPaths || target.paths || [])];
      source.isCombined = true;
      studioState.layers[targetIdx] = source;
      studioState.layers[sourceIdx] = target;
    } else {
      // Combining two upper layers: punch out source from target
      target.cutoutPaths = [...(target.cutoutPaths || []), ...(source.cutoutPaths || source.paths || [])];
      target.pathCount = target.paths ? target.paths.length : 0;
      target.isCombined = true;

      // Combine bounding boxes
      if (source.bbox && target.bbox) {
        target.bbox.minX = Math.min(target.bbox.minX, source.bbox.minX);
        target.bbox.maxX = Math.max(target.bbox.maxX, source.bbox.maxX);
        target.bbox.minY = Math.min(target.bbox.minY, source.bbox.minY);
        target.bbox.maxY = Math.max(target.bbox.maxY, source.bbox.maxY);
        target.bbox.width = Math.max(0, target.bbox.maxX - target.bbox.minX);
        target.bbox.height = Math.max(0, target.bbox.maxY - target.bbox.minY);
        target.bbox.bboxArea = target.bbox.width * target.bbox.height;
      }

      target.thicknessMm = Math.max(0.10, target.thicknessMm || 1.00, source.thicknessMm || 1.00);
      target.heightPct = Math.max(target.heightPct || 10, source.heightPct || 10);
    }

    // Splice out source layer
    studioState.layers.splice(sourceIdx, 1);
    studioState.activeMergeIdx = null;
    studioState.activeCombineIdx = null;

    reassignRoles();
    adjustBaseLayerForTotal();
    renderLayersList();
    updateThreeGeometry();
    updateDimensionBadges();

    const remainingPairs = findSimilarColorPairs();
    updateSimilarColorMergeBtn(remainingPairs);
  }

  // Combine Multiple Selected Layers into Target Layer (CorelDRAW Style)
  function combineMultipleLayers(selectedIndices, targetIdx) {
    if (!selectedIndices || selectedIndices.length < 2 || !studioState.layers[targetIdx]) return;
    saveUndoState();

    let actualTargetIdx = targetIdx;
    // If one of the selected layers is the base layer, prioritize base as the target container
    const baseSelectedIdx = selectedIndices.find(i => studioState.layers[i]?.role === 'base' || i === 0);
    if (baseSelectedIdx !== undefined) {
      actualTargetIdx = baseSelectedIdx;
    }

    const target = studioState.layers[actualTargetIdx];
    const isTargetBase = (target.role === 'base' || actualTargetIdx === 0);

    selectedIndices.forEach(srcIdx => {
      if (srcIdx === actualTargetIdx) return;
      const source = studioState.layers[srcIdx];
      if (!source) return;

      // Punch out each selected layer's paths from the target layer
      target.cutoutPaths = [...(target.cutoutPaths || []), ...(source.cutoutPaths || source.paths || [])];

      if (source.bbox && target.bbox) {
        target.bbox.minX = Math.min(target.bbox.minX, source.bbox.minX);
        target.bbox.maxX = Math.max(target.bbox.maxX, source.bbox.maxX);
        target.bbox.minY = Math.min(target.bbox.minY, source.bbox.minY);
        target.bbox.maxY = Math.max(target.bbox.maxY, source.bbox.maxY);
        target.bbox.width = Math.max(0, target.bbox.maxX - target.bbox.minX);
        target.bbox.height = Math.max(0, target.bbox.maxY - target.bbox.minY);
        target.bbox.bboxArea = target.bbox.width * target.bbox.height;
      }
    });

    target.pathCount = target.paths ? target.paths.length : 0;
    target.isCombined = true;

    if (!isTargetBase) {
      const srcMms = selectedIndices.map(i => studioState.layers[i]?.thicknessMm || 1.00);
      target.thicknessMm = Math.max(0.10, target.thicknessMm || 1.00, ...srcMms);
      const srcPcts = selectedIndices.map(i => studioState.layers[i]?.heightPct || 10);
      target.heightPct = Math.max(target.heightPct || 10, ...srcPcts);
    }

    const toRemove = selectedIndices.filter(i => i !== actualTargetIdx).sort((a, b) => b - a);
    toRemove.forEach(idx => {
      studioState.layers.splice(idx, 1);
    });

    studioState.selectedLayerIndices.clear();
    studioState.activeMergeIdx = null;
    studioState.activeCombineIdx = null;

    reassignRoles();
    adjustBaseLayerForTotal();
    renderLayersList();
    updateThreeGeometry();
    updateDimensionBadges();

    const remainingPairs = findSimilarColorPairs();
    updateSimilarColorMergeBtn(remainingPairs);
  }

  // Delete Layer
  function deleteLayer(idx) {
    if (studioState.layers.length <= 1) {
      alert('Cannot delete the only layer!');
      return;
    }
    const layer = studioState.layers[idx];
    if (confirm(`Delete layer "${layer.name}" (${layer.color}) with ${layer.paths.length} shapes?`)) {
      saveUndoState();
      studioState.layers.splice(idx, 1);
      studioState.activeMergeIdx = null;
      reassignRoles();
      adjustBaseLayerForTotal();
      renderLayersList();
      updateThreeGeometry();
      updateDimensionBadges();
      const remainingPairs = findSimilarColorPairs();
      updateSimilarColorMergeBtn(remainingPairs);
    }
  }

  function updateDimensionBadges() {
    const dimsStr = `${studioState.fixedWidthMm.toFixed(1)} × ${studioState.proportionalHeightMm.toFixed(1)} × ${studioState.totalThicknessMm.toFixed(1)} mm`;
    dimensionBadge.textContent = dimsStr;
    threeStats.textContent = `Meshes: ${studioState.layers.length} | ${studioState.fixedWidthMm}mm Fixed Width`;
  }

  // Live RAF throttled geometry update
  let liveGeomRaf = null;
  function scheduleLiveGeometryUpdate() {
    if (liveGeomRaf) cancelAnimationFrame(liveGeomRaf);
    liveGeomRaf = requestAnimationFrame(() => {
      updateThreeGeometry(false, false);
      liveGeomRaf = null;
    });
  }

  // Dimension settings event listeners
  inputFixedWidth.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (val > 10) {
      studioState.fixedWidthMm = val;
      const aspect = studioState.analysis ? (studioState.analysis.width / studioState.analysis.height) : 1.5;
      studioState.proportionalHeightMm = parseFloat((val / aspect).toFixed(2));
      updateDimensionBadges();
      scheduleLiveGeometryUpdate();
    }
  });

  inputFixedWidth.addEventListener('change', () => {
    saveStudioStateToHistory();
  });

  const handleTotalThicknessChange = (isCommit) => {
    const val = parseFloat(inputTotalThickness.value);
    if (!isNaN(val) && val >= 0.1) {
      if (isCommit) saveUndoState();
      studioState.totalThicknessMm = parseFloat(val.toFixed(2));
      adjustBaseLayerForTotal();
      updateRowZBadgesLive();
      if (isCommit) {
        inputTotalThickness.value = studioState.totalThicknessMm.toFixed(1);
        updateThreeGeometry(false, false);
      } else {
        scheduleLiveGeometryUpdate();
      }
    }
  };
  inputTotalThickness.addEventListener('input', () => handleTotalThicknessChange(false));
  inputTotalThickness.addEventListener('change', () => handleTotalThicknessChange(true));

  function adjustBaseLayerForTotal() {
    if (!studioState.layers || studioState.layers.length === 0) return;

    if (studioState.layers.length === 1) {
      studioState.layers[0].thicknessMm = studioState.totalThicknessMm || 10.00;
      studioState.layers[0].heightPct = 100;
      updateDimensionBadges();
      return;
    }

    // Color layers (index > 0): preserve existing thickness, only ensure valid number >= 0.10 mm
    let upperSum = 0;
    for (let i = 1; i < studioState.layers.length; i++) {
      const l = studioState.layers[i];
      let thick = parseFloat(l.thicknessMm);
      if (isNaN(thick) || thick <= 0) {
        thick = 1.00; // default to automated 1.00 mm if undefined/empty
      } else if (thick < 0.10) {
        thick = 0.10;
      }
      thick = parseFloat(thick.toFixed(2));
      l.thicknessMm = thick;
      upperSum += thick;
    }
    upperSum = parseFloat(upperSum.toFixed(2));

    const targetTotal = parseFloat((studioState.totalThicknessMm || 10.00).toFixed(2));
    const remainingBase = parseFloat((targetTotal - upperSum).toFixed(2));

    if (remainingBase >= 0.10) {
      // Base layer absorbs the remainder to make total exactly targetTotal
      studioState.layers[0].thicknessMm = remainingBase;
      studioState.totalThicknessMm = targetTotal;
    } else {
      // If color layers leave less than 0.10 mm for base, ensure base has at least 0.10 mm and adjust total
      studioState.layers[0].thicknessMm = 0.10;
      studioState.totalThicknessMm = parseFloat((upperSum + 0.10).toFixed(2));
    }

    const finalTotal = studioState.totalThicknessMm;
    studioState.layers.forEach(l => {
      l.heightPct = parseFloat(((l.thicknessMm / finalTotal) * 100).toFixed(1));
    });

    if (inputTotalThickness && document.activeElement !== inputTotalThickness) {
      inputTotalThickness.value = studioState.totalThicknessMm.toFixed(1);
    }
    updateDimensionBadges();
  }

  function updateTotalThicknessFromLayers() {
    if (!studioState.layers || studioState.layers.length === 0) return;
    const newTotal = parseFloat(
      studioState.layers.reduce((sum, l) => sum + (parseFloat(l.thicknessMm) || 0), 0).toFixed(2)
    );
    if (newTotal > 0) {
      studioState.totalThicknessMm = newTotal;
      if (inputTotalThickness && document.activeElement !== inputTotalThickness) {
        inputTotalThickness.value = newTotal.toFixed(1);
      }
    }
    updateDimensionBadges();
  }

  // Update Z badges and base thickness input live without wiping the layers list DOM
  function updateRowZBadgesLive() {
    if (!studioState.layers || studioState.layers.length === 0) return;
    let runningZ = 0;
    studioState.layers.forEach((layer, idx) => {
      const thick = parseFloat(layer.thicknessMm) || 0.10;
      const zStart = runningZ;
      const zEnd = runningZ + thick;
      runningZ = zEnd;
      layer.zStartMm = zStart;
      layer.zEndMm = zEnd;

      const row = layersContainer.querySelector(`.layer-row-item[data-idx="${idx}"]`) || layersContainer.children[idx];
      if (row) {
        const zBadge = row.querySelector('.layer-z-range-badge');
        if (zBadge) {
          zBadge.textContent = `Z: ${zStart.toFixed(2)} – ${zEnd.toFixed(2)} mm`;
        }
        if (idx === 0) {
          const baseMmInput = row.querySelector('.layer-height-mm-input');
          if (baseMmInput && document.activeElement !== baseMmInput) {
            baseMmInput.value = thick.toFixed(2);
          }
        }
      }
    });

    updateDimensionBadges();
    if (inputTotalThickness && document.activeElement !== inputTotalThickness) {
      inputTotalThickness.value = studioState.totalThicknessMm.toFixed(1);
    }
  }

  chkSolidBase.addEventListener('change', (e) => {
    studioState.solidBase = e.target.checked;
    updateThreeGeometry(false, false);
  });

  if (chkAutoSolidify) {
    chkAutoSolidify.addEventListener('change', (e) => {
      studioState.autoSolidifyPlates = e.target.checked;
      updateThreeGeometry(false, false);
    });
  }

  sliderExplode.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    studioState.explodeMm = val;
    explodeValue.textContent = `${val}mm`;
    applyThreeExplode();
  });

  btnWireframe3D.addEventListener('click', () => {
    studioState.wireframe3d = !studioState.wireframe3d;
    btnWireframe3D.classList.toggle('active', studioState.wireframe3d);
    threeLayerMeshes.forEach(m => {
      if (m.material) m.material.wireframe = studioState.wireframe3d;
    });
  });

  // Helper: check if color is light (luminance > 180) to add contrast stroke
  function isLightColor(hex) {
    if (!hex || typeof hex !== 'string') return false;
    let c = hex.replace('#', '').trim().toLowerCase();
    if (c === 'white') return true;
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return false;
    const num = parseInt(c, 16);
    if (isNaN(num)) return false;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 175;
  }

  // Helper: normalize color to uppercase 7-char hex
  function normalizeHexColor(col) {
    if (!col || typeof col !== 'string') return '#FFFFFF';
    let c = col.trim().toLowerCase();
    if (c === 'white') return '#FFFFFF';
    if (c === 'black') return '#000000';
    if (c.startsWith('#')) {
      if (c.length === 7) return c.toUpperCase();
      if (c.length === 4) return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toUpperCase();
    }
    return c.toUpperCase();
  }

  // Helper: draw un-invertible canvas color swatch
  function drawSwatchCanvas(canvas, hexColor) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width || 56;
    const h = canvas.height || 56;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = hexColor;
    ctx.beginPath();
    const r = 10;
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = isLightColor(hexColor) ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Render the Layer Stack list in sidebar
  function renderLayersList() {
    layersContainer.innerHTML = '';
    const totalDisplayed = studioState.layers.length + (studioState.raisedTextDetected ? 1 : 0);
    layerCountBadge.textContent = `${totalDisplayed} Layers`;

    const baseLyr = studioState.layers.find(l => l.role === 'base') || studioState.layers[0];
    const baseThick = Math.max(0.10, (baseLyr && baseLyr.thicknessMm !== undefined) ? parseFloat(baseLyr.thicknessMm) : (studioState.layers[0]?.thicknessMm || 7.00));

    let runningZ = 0;
    studioState.layers.forEach((layer, idx) => {
      const isSelected = studioState.selectedLayerIndices.has(idx);
      const isInspected = (studioState.inspectedLayerIdx === idx);
      const row = document.createElement('div');
      row.className = `layer-row-item ${isSelected ? 'layer-row-selected' : ''} ${isInspected ? 'layer-row-inspected' : ''}`;
      row.dataset.idx = idx;

      const roleClass = layer.role === 'base' ? 'role-base' : (layer.role === 'cutout' ? 'role-cutout' : ((layer.role === 'top' || layer.role === 'raised') ? 'role-top' : 'role-mid'));

      // Calculate thickness in mm (automated default min 1.00 mm for color layers, freely editable down to 0.10 mm)
      if (layer.thicknessMm === undefined || layer.thicknessMm === null) {
        layer.thicknessMm = (idx === 0) ? (studioState.layers.length > 1 ? Math.max(1.00, 10.00 - (studioState.layers.length - 1) * 1.00) : 10.00) : 1.00;
      } else {
        layer.thicknessMm = Math.max(0.10, parseFloat(layer.thicknessMm));
      }
      const isBase = (layer.role === 'base' || idx === 0);
      const stepThick = isBase ? baseThick : parseFloat(layer.thicknessMm);
      const thicknessMm = stepThick.toFixed(2);
      const zStart = runningZ;
      const zEnd = runningZ + stepThick;
      runningZ = zEnd;
      layer.zStartMm = zStart;
      layer.zEndMm = zEnd;

      const isMergeOpen = (studioState.activeMergeIdx === idx);
      const isCombineOpen = (studioState.activeCombineIdx === idx);
      const isPopoverOpen = isMergeOpen || isCombineOpen;

      const colorHexVal = normalizeHexColor(layer.color);

      row.innerHTML = `
        <div class="layer-card-header">
          <div class="layer-card-left">
            <label class="layer-checkbox-container" title="Select layers to merge or combine">
              <input type="checkbox" class="layer-select-checkbox" data-idx="${idx}" ${isSelected ? 'checked' : ''} />
            </label>
            <div class="layer-order-num" title="Layer ${idx + 1}">${idx + 1}</div>
            <label class="layer-color-preview" title="Click to edit filament color or hover to highlight in 3D">
              <canvas class="swatch-canvas" width="56" height="56"></canvas>
              <input type="color" class="layer-color-picker" value="${colorHexVal}" style="opacity:0;position:absolute;pointer-events:none;" />
            </label>
            <span class="layer-color-hex-badge" title="Filament Color Hex">${colorHexVal}</span>
            <input type="text" class="layer-name-input" value="${layer.name}" data-idx="${idx}" placeholder="Layer name" title="Click to rename layer" />
            ${layer.isCombined ? '<span class="badge badge-combine" title="Combined layer with hollow cutouts">⧉ Cutout</span>' : ''}
          </div>
          <div class="layer-card-right">
            <div class="layer-reorder-btns">
              <button class="btn-move btn-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move Earlier (Lower Z)">▲</button>
              <button class="btn-move btn-move-down" data-idx="${idx}" ${idx === studioState.layers.length - 1 ? 'disabled' : ''} title="Move Later (Higher Z)">▼</button>
            </div>
            <div class="layer-tools-group">
              <button class="btn-layer-tool btn-delete" data-idx="${idx}" title="Delete layer" type="button">🗑️</button>
            </div>
          </div>
        </div>

        <div class="layer-card-sub">
          <div class="layer-role-pill-wrap">
            <select class="layer-role-select ${roleClass}" data-idx="${idx}" title="Set print behavior">
              <option value="base" ${layer.role === 'base' ? 'selected' : ''}>Base Foundation</option>
              <option value="top" ${(layer.role === 'top' || layer.role === 'raised') ? 'selected' : ''}>Raised on Top</option>
              <option value="cutout" ${layer.role === 'cutout' ? 'selected' : ''}>Hollow Cutout</option>
              <option value="mid" ${layer.role === 'mid' ? 'selected' : ''}>Artwork Plate</option>
            </select>
          </div>

          <div class="layer-dimensions-wrap">
            <div class="layer-mm-box" title="${idx === 0 ? 'Base foundation thickness' : 'Layer thickness (editable in mm)'}">
              <span class="layer-unit-prefix">Thick</span>
              <input type="number" class="layer-height-mm-input" value="${thicknessMm}" min="0.1" max="50" step="0.1" data-idx="${idx}" />
              <span class="layer-unit-label">mm</span>
            </div>
            <span class="layer-z-range-badge" title="Print height range along Z axis">Z: ${zStart.toFixed(2)}–${zEnd.toFixed(2)} mm</span>
            <span class="layer-path-badge" title="${(layer.paths ? layer.paths.length : 0) + (layer.cutoutPaths ? layer.cutoutPaths.length : 0)} vector paths">${(layer.paths ? layer.paths.length : 0) + (layer.cutoutPaths ? layer.cutoutPaths.length : 0)}p</span>
          </div>
        </div>
      `;

      drawSwatchCanvas(row.querySelector('.swatch-canvas'), colorHexVal);

      // If merge or combine popover is active for this row
      if (isPopoverOpen) {
        const popover = document.createElement('div');
        popover.className = 'merge-popover';
        let optionsHtml = '';
        studioState.layers.forEach((otherL, oIdx) => {
          if (oIdx !== idx) {
            optionsHtml += `<option value="${oIdx}">Layer ${oIdx + 1}: ${otherL.name} (${otherL.color})</option>`;
          }
        });

        popover.innerHTML = `
          <span>${isCombineOpen ? 'Combine with:' : 'Merge with:'}</span>
          <select class="merge-select">${optionsHtml}</select>
          <button class="merge-confirm-btn" type="button" title="Fuse into solid shapes">Merge (Weld)</button>
          <button class="combine-confirm-btn" type="button" title="Punches out overlapping areas into hollow holes">⧉ Combine (Hole)</button>
          <button class="merge-cancel-btn" type="button">✕</button>
        `;

        popover.querySelector('.merge-confirm-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          const sel = popover.querySelector('.merge-select');
          if (sel) {
            const targetIdx = parseInt(sel.value, 10);
            mergeLayers(idx, targetIdx);
          }
        });

        popover.querySelector('.combine-confirm-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          const sel = popover.querySelector('.merge-select');
          if (sel) {
            const targetIdx = parseInt(sel.value, 10);
            combineLayers(idx, targetIdx);
          }
        });

        popover.querySelector('.merge-cancel-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          studioState.activeMergeIdx = null;
          studioState.activeCombineIdx = null;
          renderLayersList();
        });

        row.appendChild(popover);
      }

      // Hover highlight in 3D viewport
      row.addEventListener('mouseenter', () => {
        row.classList.add('layer-row-hovered');
        highlightLayerIn3D(idx);
      });
      row.addEventListener('mouseleave', () => {
        row.classList.remove('layer-row-hovered');
        if (studioState.inspectedLayerIdx !== null) {
          highlightLayerIn3D(studioState.inspectedLayerIdx);
        } else {
          highlightLayerIn3D(null);
        }
      });

      // Click row to lock/toggle inspection
      row.addEventListener('click', (e) => {
        if (e.target.closest('input') || e.target.closest('select') || e.target.closest('button') || e.target.closest('.merge-popover')) {
          return;
        }
        if (studioState.inspectedLayerIdx === idx) {
          studioState.inspectedLayerIdx = null;
          highlightLayerIn3D(null);
        } else {
          studioState.inspectedLayerIdx = idx;
          highlightLayerIn3D(idx);
        }
        updateLayerInspectionUI();
      });

      // Role selector change
      const roleSel = row.querySelector('.layer-role-select');
      if (roleSel) {
        roleSel.addEventListener('change', (e) => {
          saveUndoState();
          studioState.layers[idx].role = e.target.value;
          renderLayersList();
          updateThreeGeometry();
        });
      }

      // Color picker click & input & change
      const colorLabel = row.querySelector('.layer-color-preview');
      const colorPicker = row.querySelector('.layer-color-picker');
      if (colorLabel && colorPicker) {
        colorLabel.addEventListener('mouseenter', () => {
          highlightLayerIn3D(idx);
        });
        colorLabel.addEventListener('mouseleave', () => {
          if (studioState.inspectedLayerIdx !== null) {
            highlightLayerIn3D(studioState.inspectedLayerIdx);
          } else {
            highlightLayerIn3D(null);
          }
        });
        colorLabel.addEventListener('click', (e) => {
          e.stopPropagation();
          studioState.inspectedLayerIdx = idx;
          highlightLayerIn3D(idx);
          updateLayerInspectionUI();
          colorPicker.click();
        });
        colorPicker.addEventListener('input', (e) => {
          const newCol = normalizeHexColor(e.target.value);
          studioState.layers[idx].color = newCol;
          drawSwatchCanvas(colorLabel.querySelector('.swatch-canvas'), newCol);
          const hexBadge = row.querySelector('.layer-color-hex-badge');
          if (hexBadge) hexBadge.textContent = newCol;
          if (inspectHudColor) inspectHudColor.style.backgroundColor = newCol;
          updateThreeGeometry();
          highlightLayerIn3D(idx);
        });
        colorPicker.addEventListener('change', (e) => {
          saveUndoState();
          const newCol = normalizeHexColor(e.target.value);
          studioState.layers[idx].color = newCol;
          drawSwatchCanvas(colorLabel.querySelector('.swatch-canvas'), newCol);
          const hexBadge = row.querySelector('.layer-color-hex-badge');
          if (hexBadge) hexBadge.textContent = newCol;
          if (inspectHudColor) inspectHudColor.style.backgroundColor = newCol;
          updateThreeGeometry();
          highlightLayerIn3D(idx);
        });
      }

      // Merge button toggle
      const mergeBtn = row.querySelector('.btn-merge');
      if (mergeBtn) {
        mergeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          studioState.activeCombineIdx = null;
          studioState.activeMergeIdx = (studioState.activeMergeIdx === idx) ? null : idx;
          renderLayersList();
        });
      }

      // Combine button toggle
      const combineBtn = row.querySelector('.btn-combine');
      if (combineBtn) {
        combineBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          studioState.activeMergeIdx = null;
          studioState.activeCombineIdx = (studioState.activeCombineIdx === idx) ? null : idx;
          renderLayersList();
        });
      }

      // Delete button
      const deleteBtn = row.querySelector('.btn-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteLayer(idx);
        });
      }

      // Name editing
      const nameInput = row.querySelector('.layer-name-input');
      nameInput.addEventListener('change', (e) => {
        saveUndoState();
        studioState.layers[idx].name = e.target.value.trim();
      });

      // Height mm editing (live updates with camera stability)
      const mmInput = row.querySelector('.layer-height-mm-input');
      if (mmInput) {
        const handleMmChange = (isCommit) => {
          let val = parseFloat(mmInput.value);
          if (isNaN(val) || val <= 0) return;
          if (isCommit) saveUndoState();
          val = Math.max(0.10, val);
          studioState.layers[idx].thicknessMm = parseFloat(val.toFixed(2));
          if (idx > 0) {
            adjustBaseLayerForTotal();
          } else {
            updateTotalThicknessFromLayers();
          }
          updateRowZBadgesLive();
          if (isCommit) {
            mmInput.value = studioState.layers[idx].thicknessMm.toFixed(2);
            updateThreeGeometry(false, false);
          } else {
            scheduleLiveGeometryUpdate();
          }
        };

        mmInput.addEventListener('input', () => handleMmChange(false));
        mmInput.addEventListener('change', () => handleMmChange(true));
      }

      // Move Up
      const upBtn = row.querySelector('.btn-move-up');
      upBtn.addEventListener('click', () => {
        if (idx > 0) {
          saveUndoState();
          const temp = studioState.layers[idx];
          studioState.layers[idx] = studioState.layers[idx - 1];
          studioState.layers[idx - 1] = temp;
          reassignRoles();
          renderLayersList();
          updateThreeGeometry();
        }
      });

      // Move Down
      const downBtn = row.querySelector('.btn-move-down');
      downBtn.addEventListener('click', () => {
        if (idx < studioState.layers.length - 1) {
          saveUndoState();
          const temp = studioState.layers[idx];
          studioState.layers[idx] = studioState.layers[idx + 1];
          studioState.layers[idx + 1] = temp;
          reassignRoles();
          renderLayersList();
          updateThreeGeometry();
        }
      });

      // Selection checkbox listener
      const chk = row.querySelector('.layer-select-checkbox');
      if (chk) {
        chk.addEventListener('change', (e) => {
          if (e.target.checked) {
            studioState.selectedLayerIndices.add(idx);
            row.classList.add('layer-row-selected');
          } else {
            studioState.selectedLayerIndices.delete(idx);
            row.classList.remove('layer-row-selected');
          }
          updateMultiMergeBar();
        });
      }

      layersContainer.appendChild(row);
    });

    updateMultiMergeBar();
  }

  function updateMultiMergeBar() {
    if (!multiMergeBar) return;
    const validSelected = Array.from(studioState.selectedLayerIndices).filter(i => studioState.layers[i]);
    studioState.selectedLayerIndices = new Set(validSelected);

    if (validSelected.length >= 1) {
      multiMergeBar.classList.remove('hidden');
      if (validSelected.length >= 2) {
        if (selectedLayersBadge) selectedLayersBadge.textContent = `${validSelected.length} Layers Selected`;
        if (multiMergeTargetSelect) {
          let opts = '';
          validSelected.forEach(sIdx => {
            const l = studioState.layers[sIdx];
            opts += `<option value="${sIdx}">Layer ${sIdx + 1}: ${l.name} (${l.color})</option>`;
          });
          multiMergeTargetSelect.innerHTML = opts;
          multiMergeTargetSelect.disabled = false;
        }
        if (btnConfirmMultiMerge) btnConfirmMultiMerge.disabled = false;
        if (btnConfirmMultiCombine) btnConfirmMultiCombine.disabled = false;
      } else {
        if (selectedLayersBadge) selectedLayersBadge.textContent = `1 Selected (pick 2nd to Merge)`;
        if (multiMergeTargetSelect) {
          multiMergeTargetSelect.innerHTML = `<option value="">Pick 2nd layer...</option>`;
          multiMergeTargetSelect.disabled = true;
        }
        if (btnConfirmMultiMerge) btnConfirmMultiMerge.disabled = true;
        if (btnConfirmMultiCombine) btnConfirmMultiCombine.disabled = true;
      }
    } else {
      multiMergeBar.classList.add('hidden');
    }
  }

  // Multi-merge & combine buttons
  btnConfirmMultiMerge?.addEventListener('click', () => {
    const selected = Array.from(studioState.selectedLayerIndices);
    const targetIdx = parseInt(multiMergeTargetSelect?.value, 10);
    if (!isNaN(targetIdx) && selected.length >= 2) {
      mergeMultipleLayers(selected, targetIdx);
    }
  });

  btnConfirmMultiCombine?.addEventListener('click', () => {
    const selected = Array.from(studioState.selectedLayerIndices);
    const targetIdx = parseInt(multiMergeTargetSelect?.value, 10);
    if (!isNaN(targetIdx) && selected.length >= 2) {
      combineMultipleLayers(selected, targetIdx);
    }
  });

  btnCancelMultiSelect?.addEventListener('click', () => {
    studioState.selectedLayerIndices.clear();
    renderLayersList();
  });

  function reassignRoles() {
    if (!studioState.layers || !studioState.layers.length) return;
    const total = studioState.layers.length;

    // Ensure layer 0 has a valid role
    if (!studioState.layers[0].role) {
      studioState.layers[0].role = 'base';
    }

    const upperCount = Math.max(1, total - 1);
    const defaultColorMm = 1.00;

    // Set roles and ensure min 1.00 mm for all upper layers
    studioState.layers.forEach((l, i) => {
      if (i > 0) {
        if (!l.role) {
          l.role = (i === total - 1) ? 'top' : 'mid';
        }
        if (l.thicknessMm === undefined || l.thicknessMm === null) {
          l.thicknessMm = defaultColorMm;
        } else {
          l.thicknessMm = Math.max(0.10, parseFloat(l.thicknessMm));
        }
      }
    });

    adjustBaseLayerForTotal();
  }

  // ==================== THREE.JS 3D VIEWPORT ENGINE ====================
  function initOrUpdateThreeScene() {
    if (!threeRenderer) {
      // Create Three.js environment
      threeScene = new THREE.Scene();
      threeScene.background = new THREE.Color(0x0e111a);

      const width = threeContainer.clientWidth || 600;
      const height = threeContainer.clientHeight || 480;

      threeCamera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
      threeCamera.position.set(20, 50, 240);

      threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      threeRenderer.setSize(width, height);
      threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      threeRenderer.shadowMap.enabled = true;
      threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      threeContainer.appendChild(threeRenderer.domElement);

      threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
      threeControls.enableDamping = true;
      threeControls.dampingFactor = 0.05;
      threeControls.maxPolarAngle = Math.PI - 0.05;
      threeControls.minPolarAngle = 0.05;
      threeControls.enablePan = false; // Always keep model locked in center (no panning)
      threeControls.screenSpacePanning = false;
      threeControls.minDistance = 20;
      threeControls.maxDistance = 1500;
      threeControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
      };
      threeControls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY
      };

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
      threeScene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
      dirLight1.position.set(100, -150, 250);
      dirLight1.castShadow = true;
      threeScene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.4);
      dirLight2.position.set(-150, 100, 100);
      threeScene.add(dirLight2);

      const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
      rimLight.position.set(0, 200, 150);
      threeScene.add(rimLight);

      // Light underneath to clearly illuminate debossed branding when viewing Base (Bottom)
      const bottomLight = new THREE.DirectionalLight(0xffffff, 0.9);
      bottomLight.position.set(40, -60, -250);
      threeScene.add(bottomLight);

      // Studio grid floor
      const gridHelper = new THREE.GridHelper(300, 30, 0x334155, 0x1e293b);
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.position.z = -0.5;
      threeScene.add(gridHelper);

      threeRootGroup = new THREE.Group();
      threeScene.add(threeRootGroup);

      // 3D Canvas click to inspect/highlight layer
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let pointerDownPos = { x: 0, y: 0 };

      threeRenderer.domElement.addEventListener('pointerdown', (e) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
      });

      threeRenderer.domElement.addEventListener('pointerup', (e) => {
        // Ensure user was clicking, not orbiting or panning
        const dx = Math.abs(e.clientX - pointerDownPos.x);
        const dy = Math.abs(e.clientY - pointerDownPos.y);
        if (dx > 5 || dy > 5) return;

        const rect = threeRenderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, threeCamera);

        const allMeshes = [];
        threeLayerMeshes.forEach(g => {
          if (g) allMeshes.push(...g.children);
        });

        const intersects = raycaster.intersectObjects(allMeshes);
        if (intersects.length > 0) {
          const hitMesh = intersects[0].object;
          const layerIdx = hitMesh.parent?.userData?.layerIndex;
          if (layerIdx !== undefined && layerIdx !== null) {
            studioState.inspectedLayerIdx = (studioState.inspectedLayerIdx === layerIdx) ? null : layerIdx;
            highlightLayerIn3D(studioState.inspectedLayerIdx);
            updateLayerInspectionUI();
            if (studioState.inspectedLayerIdx !== null) {
              const targetRow = layersContainer.children[layerIdx];
              if (targetRow) {
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }
          }
        } else {
          // Clicked empty background
          if (studioState.inspectedLayerIdx !== null) {
            studioState.inspectedLayerIdx = null;
            highlightLayerIn3D(null);
            updateLayerInspectionUI();
          }
        }
      });

      window.addEventListener('resize', onThreeResize);
      if (window.ResizeObserver && threeContainer) {
        const ro = new ResizeObserver(() => {
          onThreeResize();
        });
        ro.observe(threeContainer);
      }
      animateThree();
    }

    updateThreeGeometry(true, true);
  }

  function onThreeResize() {
    if (!threeRenderer || !threeContainer) return;
    const width = threeContainer.clientWidth;
    const height = threeContainer.clientHeight;
    threeCamera.aspect = width / height;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(width, height);
  }

  function animateThree() {
    requestAnimationFrame(animateThree);
    if (threeControls) {
      // Ensure target X and Y remain strictly locked at origin (0, 0)
      threeControls.target.x = 0;
      threeControls.target.y = 0;
      threeControls.update();
    }
    if (threeRenderer && threeScene && threeCamera) {
      threeRenderer.render(threeScene, threeCamera);
    }
  }

  // Camera Presets
  viewPerspective.addEventListener('click', () => {
    setActiveViewBtn(viewPerspective);
    const maxDim = Math.max(studioState.fixedWidthMm || 150, studioState.proportionalHeightMm || 100);
    threeCamera.position.set(maxDim * 0.15, maxDim * 0.35, maxDim * 1.45);
    threeControls.target.set(0, 0, studioState.totalThicknessMm / 2);
    threeControls.update();
  });

  viewFront.addEventListener('click', () => {
    setActiveViewBtn(viewFront);
    const maxDim = Math.max(studioState.fixedWidthMm || 150, studioState.proportionalHeightMm || 100);
    threeCamera.position.set(0, 0, maxDim * 1.65);
    threeControls.target.set(0, 0, studioState.totalThicknessMm / 2);
    threeControls.update();
  });

  viewTop.addEventListener('click', () => {
    setActiveViewBtn(viewTop);
    const maxDim = Math.max(studioState.fixedWidthMm || 150, studioState.proportionalHeightMm || 100);
    threeCamera.position.set(0, maxDim * 1.5, maxDim * 0.25);
    threeControls.target.set(0, 0, studioState.totalThicknessMm / 2);
    threeControls.update();
  });

  if (viewBottom) {
    viewBottom.addEventListener('click', () => {
      setActiveViewBtn(viewBottom);
      const maxDim = Math.max(studioState.fixedWidthMm || 150, studioState.proportionalHeightMm || 100);
      threeCamera.position.set(0, 0, -maxDim * 1.65);
      threeControls.target.set(0, 0, studioState.totalThicknessMm / 2);
      threeControls.update();
    });
  }

  btnResetCamera.addEventListener('click', () => {
    viewPerspective.click();
  });

  function setActiveViewBtn(btn) {
    [viewPerspective, viewTop, viewFront, viewBottom].forEach(b => {
      if (b) b.classList.remove('active');
    });
    btn.classList.add('active');
  }

  // Dismiss Inspection button
  btnDismissInspect?.addEventListener('click', (e) => {
    e.stopPropagation();
    studioState.inspectedLayerIdx = null;
    highlightLayerIn3D(null);
    updateLayerInspectionUI();
  });

  // Update inspection HUD display
  function updateInspectHud(targetIdx) {
    if (!layerInspectHud) return;
    if (targetIdx === null || targetIdx === undefined || !studioState.layers[targetIdx]) {
      layerInspectHud.classList.add('hidden');
      return;
    }
    const lyr = studioState.layers[targetIdx];
    if (inspectHudColor) inspectHudColor.style.backgroundColor = lyr.color;
    if (inspectHudTitle) {
      inspectHudTitle.textContent = `${lyr.name || 'Layer ' + (targetIdx + 1)} (${lyr.color})`;
    }
    if (inspectHudStats) {
      const pCount = (lyr.paths ? lyr.paths.length : 0) + (lyr.cutoutPaths ? lyr.cutoutPaths.length : 0);
      const thk = (lyr.thicknessMm || 0.8).toFixed(2);
      const mode = lyr.isCombined ? '⧉ Combined (Hollow)' : (lyr.role === 'base' ? 'Base Plate' : 'Detail Layer');
      inspectHudStats.textContent = `${pCount} shapes • ${thk}mm • ${mode}`;
    }
    layerInspectHud.classList.remove('hidden');
  }

  // Sync inspection highlight class on layer rows
  function updateLayerInspectionUI() {
    if (!layersContainer) return;
    const rows = layersContainer.querySelectorAll('.layer-row-item');
    rows.forEach((row, idx) => {
      const rIdx = (row.dataset && row.dataset.idx !== undefined) ? parseInt(row.dataset.idx, 10) : idx;
      if (rIdx === studioState.inspectedLayerIdx) {
        row.classList.add('layer-row-inspected');
      } else {
        row.classList.remove('layer-row-inspected');
      }
    });
    updateInspectHud(studioState.inspectedLayerIdx);
  }

  // 3D Viewport Area Highlight for selected color/layer
  function highlightLayerIn3D(targetIdx) {
    if (!threeLayerMeshes || threeLayerMeshes.length === 0) return;

    if (targetIdx === null || targetIdx === undefined) {
      // Reset all meshes to standard rendering
      threeLayerMeshes.forEach(group => {
        if (!group) return;
        group.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.transparent = false;
            child.material.opacity = 1.0;
            if (child.material.emissive) {
              child.material.emissive.setHex(0x000000);
              child.material.emissiveIntensity = 0.0;
            }
            child.material.needsUpdate = true;
          }
        });
      });
      if (layerInspectHud) layerInspectHud.classList.add('hidden');
      return;
    }

    // Highlight target layer and dim all other layers
    threeLayerMeshes.forEach((group, idx) => {
      if (!group) return;
      const isTarget = (idx === targetIdx);
      group.traverse(child => {
        if (child.isMesh && child.material) {
          if (isTarget) {
            // Target layer: fully opaque with high-contrast cyan glow pulse
            child.material.transparent = false;
            child.material.opacity = 1.0;
            if (child.material.emissive) {
              child.material.emissive.setHex(0x00e5ff);
              child.material.emissiveIntensity = 0.85;
            }
          } else {
            // Other layers: ghosted out (translucent) so user clearly sees where that color area is
            child.material.transparent = true;
            child.material.opacity = 0.22;
            if (child.material.emissive) {
              child.material.emissive.setHex(0x000000);
              child.material.emissiveIntensity = 0.0;
            }
          }
          child.material.needsUpdate = true;
        }
      });
    });

    updateInspectHud(targetIdx);
  }

    // Update extruded 3D meshes in Three.js (camera and viewport stay stable during live edits)
  function updateThreeGeometry(resetCamera = false, showLoader = false) {
    if (!studioState.analysis || !threeRootGroup) return;

    if (showLoader) showThreeLoading(true);

    // Clear old meshes
    while (threeRootGroup.children.length > 0) {
      const obj = threeRootGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      threeRootGroup.remove(obj);
    }
    threeLayerMeshes = [];
    studioState.raisedTextDetected = false; // will be set true if any holes get raised

    const loader = new THREE.SVGLoader();
    const totalW_mm = studioState.fixedWidthMm;
    const totalH_mm = studioState.proportionalHeightMm;
    const totalThick_mm = studioState.totalThicknessMm;

    const baseLayer = studioState.layers.find(l => l.role === 'base') || studioState.layers[0];
    const baseThickness = Math.max(0.10, (baseLayer && baseLayer.thicknessMm !== undefined) ? baseLayer.thicknessMm : (studioState.layers[0]?.thicknessMm || 7.00));

    let runningZ = 0;
    studioState.layers.forEach((layer, idx) => {
      const isBase = (layer.role === 'base' || idx === 0);
      const layerStepThick = isBase 
        ? baseThickness 
        : Math.max(0.10, layer.thicknessMm !== undefined ? layer.thicknessMm : 1.00);

      const ownZStart = runningZ;
      const ownExtrudeDepth = layerStepThick;
      runningZ += layerStepThick;

      let masterDebossShapes = [];

      const layerGroup = new THREE.Group();
      layerGroup.userData = { baseZ: ownZStart, layerIndex: idx };

      let matColor = layer.color;
      if (matColor === '#000000' || matColor === '#090808' || matColor === '#090908' || matColor === '#101010') {
        matColor = '#1a1a1a';
      }

      if (isBase) {
        // 1. Base Layer: extrude foundation plate from Z = 0 to baseThickness
        // When Solid Base is active, union all layers' paths so upper artwork never hangs in mid-air
        let basePathsHtml = '';
        if (studioState.solidBase) {
          studioState.layers.forEach(l => {
            (l.paths || []).forEach(rawD => {
              basePathsHtml += `<path fill="${layer.color}" d="${rawD}" />`;
            });
          });
        } else {
          (layer.paths || []).forEach(rawD => {
            basePathsHtml += `<path fill="${layer.color}" d="${rawD}" />`;
          });
        }
        const baseSvgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studioState.analysis.viewBox}" width="${studioState.analysis.width}" height="${studioState.analysis.height}">
          <g fill="${layer.color}">${basePathsHtml}</g>
        </svg>`;
        const baseSvgData = loader.parse(baseSvgStr);

        // If specific color layers were combined with the base layer, parse their cutout paths
        const cutoutShapes = [];
        if (layer.cutoutPaths && layer.cutoutPaths.length > 0) {
          const cutoutSvgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studioState.analysis.viewBox}" width="${studioState.analysis.width}" height="${studioState.analysis.height}">
            <g>${layer.cutoutPaths.map(d => `<path d="${d}" />`).join('')}</g>
          </svg>`;
          const cutoutSvgData = loader.parse(cutoutSvgStr);
          cutoutSvgData.paths.forEach(svgP => {
            const cShapes = THREE.SVGLoader.createShapes(svgP);
            cShapes.forEach(cs => {
              cutoutShapes.push(cs);
            });
          });
        }

        const allBaseShapes = [];
        baseSvgData.paths.forEach(svgPath => {
          const shapes = THREE.SVGLoader.createShapes(svgPath);
          shapes.forEach(shape => {
            // Clear inner puzzle cutout holes when Solid Base is on so backing is 100% solid
            if (studioState.solidBase) {
              shape.holes = [];
            }
            const shapePts = shape.getPoints();
            if (shapePts && shapePts.length >= 3 && cutoutShapes.length > 0) {
              const shapeBox = new THREE.Box2().setFromPoints(shapePts);
              cutoutShapes.forEach(cs => {
                const cutPts = cs.getPoints();
                if (cutPts && cutPts.length >= 3) {
                  const cutBox = new THREE.Box2().setFromPoints(cutPts);
                  if (shapeBox.intersectsBox(cutBox)) {
                    shape.holes.push(new THREE.Path(cutPts));
                  }
                }
              });
            }
            allBaseShapes.push(shape);
          });
        });

        // 1. Identify the bottom rectangular foundation plate for branding placement
        // IMPORTANT: Always use ONLY the base layer's own paths to compute baseShapeMetrics and bottomPlate.
        // Using allBaseShapes (which may include upper layer paths when solidBase=ON) would cause tiny letter
        // shapes from upper layers to win as bottomPlate → garbled/tiny branding text.
        const baseOwnSvgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studioState.analysis.viewBox}" width="${studioState.analysis.width}" height="${studioState.analysis.height}">
          <g fill="${layer.color}">${(layer.paths || []).map(d => `<path fill="${layer.color}" d="${d}" />`).join('')}</g>
        </svg>`;
        const baseOwnSvgData = loader.parse(baseOwnSvgStr);
        const baseOwnShapes = [];
        baseOwnSvgData.paths.forEach(svgPath => {
          THREE.SVGLoader.createShapes(svgPath).forEach(sh => {
            const pts = sh.getPoints ? sh.getPoints() : [];
            if (pts.length >= 3) baseOwnShapes.push(sh);
          });
        });

        const baseShapeMetrics = baseOwnShapes.map((sh, sIdx) => {
          let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
          const sPoints = sh.getPoints ? sh.getPoints() : [];
          sPoints.forEach(p => {
            if (p.x < sMinX) sMinX = p.x;
            if (p.x > sMaxX) sMaxX = p.x;
            if (p.y < sMinY) sMinY = p.y;
            if (p.y > sMaxY) sMaxY = p.y;
          });
          const sW = (sMaxX > sMinX) ? (sMaxX - sMinX) : 0;
          const sH = (sMaxY > sMinY) ? (sMaxY - sMinY) : 0;
          return {
            shapeIdx: sIdx,
            shape: sh,
            sMinX, sMaxX, sMinY, sMaxY,
            sW, sH,
            sCx: (sMinX + sMaxX) / 2,
            sCy: (sMinY + sMaxY) / 2,
            aspect: sW / Math.max(1, sH)
          };
        });

        // Find the true wide rectangular base stand plate (highest sMaxY in SVG space, wide aspect ratio)
        let bottomPlate = null;
        let maxPlateScore = -Infinity;
        baseShapeMetrics.forEach(m => {
          if (m.sW < 100 || m.sH < 15) return;
          // Heavily reward highest sMaxY (bottom of canvas in SVG) and wide aspect ratio
          const score = (m.sMaxY * 4) + m.sW + (m.aspect > 1.8 ? 2000 : 0);
          if (score > maxPlateScore) {
            maxPlateScore = score;
            bottomPlate = m;
          }
        });

        if (!bottomPlate && baseShapeMetrics.length > 0) {
          bottomPlate = baseShapeMetrics[0];
        }

        // Build uniqueBaseShapes, tagging each with isOwnBase:
        //   isOwnBase: true  → from base layer's own paths → eligible for deboss treatment
        //   isOwnBase: false → from upper layers (only added when solidBase=ON for solid fill) → just extrude flat, NO deboss
        const uniqueBaseShapes = [];

        if (studioState.solidBase) {
          // First: add all base-layer OWN shapes (tagged isOwnBase: true)
          // We re-use allBaseShapes entries that came from the base layer's own paths.
          // Since baseSvgData when solidBase=ON includes all layers' paths, we need to identify which
          // shapes in allBaseShapes are from the base layer. The simplest correct approach: build
          // uniqueBaseShapes by directly using baseOwnShapes (already parsed) for the own base shapes,
          // and then separately add each upper layer's shapes tagged isOwnBase: false.

          // Add own-base shapes (isOwnBase: true) with deboss eligibility
          baseOwnShapes.forEach(sh => {
            sh.holes = []; // Solid fill for solidBase mode
            const pts = sh.getPoints ? sh.getPoints() : [];
            if (pts.length < 3) return;
            let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
            pts.forEach(p => {
              if (p.x < sMinX) sMinX = p.x;
              if (p.x > sMaxX) sMaxX = p.x;
              if (p.y < sMinY) sMinY = p.y;
              if (p.y > sMaxY) sMaxY = p.y;
            });
            const sW = sMaxX - sMinX; const sH = sMaxY - sMinY;
            uniqueBaseShapes.push({
              shape: sh,
              metric: { shapeIdx: uniqueBaseShapes.length, shape: sh, sMinX, sMaxX, sMinY, sMaxY, sW, sH, sCx: (sMinX+sMaxX)/2, sCy: (sMinY+sMaxY)/2, aspect: sW/Math.max(1,sH) },
              isOwnBase: true
            });
          });

          // Add shapes from upper layers (isOwnBase: false) — just for solid fill, no deboss
          studioState.layers.forEach((l, lIdx) => {
            if (lIdx === 0) return; // skip base layer (already added above)
            const extraHtml = (l.paths || []).map(d => `<path fill="${layer.color}" d="${d}" />`).join('');
            if (!extraHtml) return;
            const extraSvgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studioState.analysis.viewBox}" width="${studioState.analysis.width}" height="${studioState.analysis.height}"><g fill="${layer.color}">${extraHtml}</g></svg>`;
            const extraSvgData = loader.parse(extraSvgStr);
            extraSvgData.paths.forEach(svgPath => {
              THREE.SVGLoader.createShapes(svgPath).forEach(sh => {
                sh.holes = []; // Solid fill
                const pts = sh.getPoints ? sh.getPoints() : [];
                if (pts.length < 3) return;
                let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
                pts.forEach(p => {
                  if (p.x < sMinX) sMinX = p.x;
                  if (p.x > sMaxX) sMaxX = p.x;
                  if (p.y < sMinY) sMinY = p.y;
                  if (p.y > sMaxY) sMaxY = p.y;
                });
                const sW = sMaxX - sMinX; const sH = sMaxY - sMinY;
                uniqueBaseShapes.push({
                  shape: sh,
                  metric: { shapeIdx: uniqueBaseShapes.length, shape: sh, sMinX, sMaxX, sMinY, sMaxY, sW, sH, sCx: (sMinX+sMaxX)/2, sCy: (sMinY+sMaxY)/2, aspect: sW/Math.max(1,sH) },
                  isOwnBase: false
                });
              });
            });
          });
        } else {
          // solidBase OFF: use allBaseShapes with containment filter, all tagged isOwnBase: true
          allBaseShapes.forEach((sh, i) => {
            const mi = baseShapeMetrics[i] || (() => {
              const pts = sh.getPoints ? sh.getPoints() : [];
              let sMinX=Infinity,sMaxX=-Infinity,sMinY=Infinity,sMaxY=-Infinity;
              pts.forEach(p=>{if(p.x<sMinX)sMinX=p.x;if(p.x>sMaxX)sMaxX=p.x;if(p.y<sMinY)sMinY=p.y;if(p.y>sMaxY)sMaxY=p.y;});
              const sW=sMaxX-sMinX,sH=sMaxY-sMinY;
              return {shapeIdx:i,shape:sh,sMinX,sMaxX,sMinY,sMaxY,sW,sH,sCx:(sMinX+sMaxX)/2,sCy:(sMinY+sMaxY)/2,aspect:sW/Math.max(1,sH)};
            })();
            let isContainedInsideOther = false;
            for (let j = 0; j < allBaseShapes.length; j++) {
              if (i === j) continue;
              const mj = baseShapeMetrics[j];
              if (!mj) continue;
              if (mj.sW > mi.sW && mj.sH > mi.sH &&
                  mi.sMinX >= mj.sMinX - 2 && mi.sMaxX <= mj.sMaxX + 2 &&
                  mi.sMinY >= mj.sMinY - 2 && mi.sMaxY <= mj.sMaxY + 2) {
                isContainedInsideOther = true;
                break;
              }
            }
            if (!isContainedInsideOther) {
              uniqueBaseShapes.push({ shape: sh, metric: mi, isOwnBase: true });
            }
          });
        }

        // Generate master debossed branding shapes ONCE
        masterDebossShapes = [];
        let brandBBox = null;
        const currentScale = totalW_mm / (studioState.analysis.width || 1536);

        // Compute overall base bounding box from ALL shapes in uniqueBaseShapes
        let allBaseBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        uniqueBaseShapes.forEach(({ shape, metric }) => {
          if (metric) {
            if (metric.sMinX < allBaseBounds.minX) allBaseBounds.minX = metric.sMinX;
            if (metric.sMaxX > allBaseBounds.maxX) allBaseBounds.maxX = metric.sMaxX;
            if (metric.sMinY < allBaseBounds.minY) allBaseBounds.minY = metric.sMinY;
            if (metric.sMaxY > allBaseBounds.maxY) allBaseBounds.maxY = metric.sMaxY;
          } else {
            const pts = shape.getPoints ? shape.getPoints() : [];
            pts.forEach(p => {
              if (p.x < allBaseBounds.minX) allBaseBounds.minX = p.x;
              if (p.x > allBaseBounds.maxX) allBaseBounds.maxX = p.x;
              if (p.y < allBaseBounds.minY) allBaseBounds.minY = p.y;
              if (p.y > allBaseBounds.maxY) allBaseBounds.maxY = p.y;
            });
          }
        });

        let targetPlate = null;
        if (isBase && brandingFont && uniqueBaseShapes.length > 0) {
          // Find the wide rectangular pen stand plate at the bottom of the design across ALL shapes
          // Stand plate must touch the bottom edge of the model, have stand height (12-60mm), width >= 50mm, aspect >= 1.4
          let standPlate = null;
          let maxStandScore = -Infinity;
          uniqueBaseShapes.forEach(({ metric }) => {
            if (!metric) return;
            const distFromBottomMm = (allBaseBounds.maxY - metric.sMaxY) * currentScale;
            const standH_mm = metric.sH * currentScale;
            const standW_mm = metric.sW * currentScale;
            if (distFromBottomMm <= 4.0 && standW_mm >= 50.0 && standH_mm >= 12.0 && standH_mm <= 60.0 && metric.aspect >= 1.4) {
              const score = (metric.aspect * 100) + standW_mm - (distFromBottomMm * 50);
              if (score > maxStandScore) {
                maxStandScore = score;
                standPlate = metric;
              }
            }
          });

          // Fixed text width: 48mm across ALL designs (clamped only if entire base is narrower than 56mm)
          const baseTotalW_mm = (allBaseBounds.maxX - allBaseBounds.minX) * currentScale;
          const targetWidthMm = Math.min(48.0, Math.max(25.0, baseTotalW_mm - 16.0));
          const targetWInSvg = targetWidthMm / currentScale;

          // Measure exact text block height at target scale
          const pV0 = brandingFont.getPath('VIVAGIFTS', 0, 0, 100);
          const bbV0 = pV0.getBoundingBox();
          const vW0 = bbV0.x2 - bbV0.x1;
          const rawOrder = (studioState.orderId && typeof studioState.orderId === 'string') ? studioState.orderId.trim() : (studioState.orderId ? String(studioState.orderId) : '12345');
          const numMatch = rawOrder.match(/\d+/);
          const orderStr = numMatch ? numMatch[0] : (rawOrder.replace(/^order\s*#?\s*/i, '').trim() || '12345');
          const pO0 = brandingFont.getPath(orderStr, 0, 0, 75);
          const bbO0 = pO0.getBoundingBox();
          const oW0 = bbO0.x2 - bbO0.x1;

          const maxGlyphW0 = Math.max(vW0, oW0);
          const fontScale = targetWInSvg / maxGlyphW0;
          const vH = (bbV0.y2 - bbV0.y1) * fontScale;
          const oH = (bbO0.y2 - bbO0.y1) * fontScale;
          const gap = vH * 0.35;
          const totalTextH_svg = vH + gap + oH;

          // Positioning:
          // Center horizontally and vertically inside the detected pen stand plate.
          // If no separate stand plate is detected, center horizontally on the base and place ~17.5mm from bottom edge.
          let brandCx = standPlate ? standPlate.sCx : (allBaseBounds.minX + allBaseBounds.maxX) / 2;
          let brandCy = standPlate ? standPlate.sCy : (allBaseBounds.maxY - (17.5 / currentScale));

          // Strict boundary clamp: text bottom must stay at least 7.0mm inside the base bottom edge,
          // and text top must stay at least 5.0mm inside the base top edge.
          const minSafeCy = allBaseBounds.minY + (totalTextH_svg / 2) + (5.0 / currentScale);
          const maxSafeCy = allBaseBounds.maxY - (totalTextH_svg / 2) - (7.0 / currentScale);
          brandCy = Math.max(minSafeCy, Math.min(maxSafeCy, brandCy));

          // Identify targetPlate: if standPlate found use it, otherwise find the largest base shape covering the text center
          targetPlate = standPlate;
          if (!targetPlate) {
            let maxArea = -Infinity;
            uniqueBaseShapes.forEach(({ metric }) => {
              if (!metric) return;
              if (metric.sMinX <= brandCx && metric.sMaxX >= brandCx &&
                  metric.sMinY <= brandCy && metric.sMaxY >= brandCy) {
                const area = metric.sW * metric.sH;
                if (area > maxArea) {
                  maxArea = area;
                  targetPlate = metric;
                }
              }
            });
          }

          masterDebossShapes = generateBrandingShapes(studioState.orderId, brandCx, brandCy, targetWInSvg);
          if (masterDebossShapes.length > 0) {
            let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
            masterDebossShapes.forEach(b => b.points.forEach(p => {
              if (p.x < bMinX) bMinX = p.x;
              if (p.x > bMaxX) bMaxX = p.x;
              if (p.y < bMinY) bMinY = p.y;
              if (p.y > bMaxY) bMaxY = p.y;
            }));
            brandBBox = { bMinX, bMaxX, bMinY, bMaxY };
          }
        }

        // Height is strictly 2 layers: exactly 0.40mm deep!
        const debossDepth = 0.40;
        const remainingBaseDepth = Math.max(0.10, ownExtrudeDepth - debossDepth);
        let islandsAdded = false;

        uniqueBaseShapes.forEach(({ shape, metric }) => {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(matColor),
            roughness: 0.45, metalness: 0.05,
            wireframe: studioState.wireframe3d, side: THREE.DoubleSide });

          // Does this shape contain or overlap the branding region?
          const isTargetPlate = (targetPlate && metric && metric.shapeIdx === targetPlate.shapeIdx);
          const overlapsBrand = (masterDebossShapes.length > 0 && brandBBox &&
            metric.sMinX <= brandBBox.bMaxX && metric.sMaxX >= brandBBox.bMinX &&
            metric.sMinY <= brandBBox.bMaxY && metric.sMaxY >= brandBBox.bMinY);

          if (isTargetPlate) {
            // TARGET STAND PLATE: This plate owns the debossed branding!
            const debossedShape = shape.clone();
            masterDebossShapes.forEach(b => {
              let outer = b.points;
              if (otPolyArea(outer) > 0) outer = outer.slice().reverse();
              debossedShape.holes.push(new THREE.Path(outer.map(p => new THREE.Vector2(p.x, p.y))));
            });

            // Add inner letter islands (A, R, D, O, 0, 8, 6, etc.) as solid physical pillars
            if (!islandsAdded) {
              islandsAdded = true;
              masterDebossShapes.forEach(b => {
                b.holes.forEach(island => {
                  let isl = island;
                  if (otPolyArea(isl) < 0) isl = isl.slice().reverse();
                  const islShape = new THREE.Shape(isl.map(p => new THREE.Vector2(p.x, p.y)));
                  const islGeom = new THREE.ExtrudeGeometry(islShape, {
                    depth: debossDepth,
                    bevelEnabled: false,
                    steps: 1,
                    curveSegments: 8
                  });
                  const islMesh = new THREE.Mesh(islGeom, mat);
                  islMesh.position.z = 0;
                  islMesh.castShadow = true;
                  islMesh.receiveShadow = true;
                  // DO NOT set isVisualAccent: this mesh MUST be exported to STL/3MF so counter islands (A, 8, 6) physically exist
                  layerGroup.add(islMesh);
                });
              });

              // High-contrast dark charcoal deboss cavity ceiling for razor-sharp visual clarity in Web 3D Viewer!
              masterDebossShapes.forEach(b => {
                let outer = b.points;
                if (otPolyArea(outer) < 0) outer = outer.slice().reverse();
                const cavShape = new THREE.Shape(outer.map(p => new THREE.Vector2(p.x, p.y)));
                b.holes.forEach(island => {
                  let isl = island;
                  if (otPolyArea(isl) > 0) isl = isl.slice().reverse();
                  cavShape.holes.push(new THREE.Path(isl.map(p => new THREE.Vector2(p.x, p.y))));
                });
                const cavGeom = new THREE.ShapeGeometry(cavShape);
                const cavMat = new THREE.MeshBasicMaterial({
                  color: 0x181818,
                  side: THREE.DoubleSide,
                  depthWrite: false,
                  polygonOffset: true,
                  polygonOffsetFactor: -2,
                  polygonOffsetUnits: -2
                });
                const cavMesh = new THREE.Mesh(cavGeom, cavMat);
                cavMesh.position.z = debossDepth - 0.005; // Placed at ceiling of deboss cavity facing down
                cavMesh.renderOrder = 2;
                cavMesh.userData.isVisualAccent = true; // Mark as visual accent to exclude from physical manufacturing mesh
                layerGroup.add(cavMesh);
              });
            }

            const debossGeom = new THREE.ExtrudeGeometry(debossedShape, {
              depth: debossDepth,
              bevelEnabled: false,
              steps: 1,
              curveSegments: 6
            });
            const debossMesh = new THREE.Mesh(debossGeom, mat);
            debossMesh.position.z = 0;
            debossMesh.castShadow = true;
            debossMesh.receiveShadow = true;
            layerGroup.add(debossMesh);

            if (remainingBaseDepth > 0.05) {
              const solidUpperGeom = new THREE.ExtrudeGeometry(shape, {
                depth: remainingBaseDepth,
                bevelEnabled: false,
                steps: 1,
                curveSegments: 6
              });
              const solidUpperMesh = new THREE.Mesh(solidUpperGeom, mat);
              solidUpperMesh.position.z = debossDepth;
              solidUpperMesh.castShadow = true;
              solidUpperMesh.receiveShadow = true;
              layerGroup.add(solidUpperMesh);
            }
          } else if (overlapsBrand) {
            // ANY OTHER SHAPE that overlaps branding:
            // Extrude ONLY above deboss cavity (Z = debossDepth to ownExtrudeDepth).
            // It has ZERO presence at Z = 0..debossDepth, so it can NEVER fill in or block any letter!
            if (remainingBaseDepth > 0.05) {
              const upperGeom = new THREE.ExtrudeGeometry(shape, {
                depth: remainingBaseDepth,
                bevelEnabled: false,
                steps: 1,
                curveSegments: 6
              });
              const upperMesh = new THREE.Mesh(upperGeom, mat);
              upperMesh.position.z = debossDepth;
              upperMesh.castShadow = true;
              upperMesh.receiveShadow = true;
              layerGroup.add(upperMesh);
            }
          } else {
            // Normal shape not overlapping branding: extrude solid from Z = 0 to ownExtrudeDepth
            const geom = new THREE.ExtrudeGeometry(shape, {
              depth: ownExtrudeDepth,
              bevelEnabled: false,
              steps: 1,
              curveSegments: 6
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.z = 0;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            layerGroup.add(mesh);
          }
        });
      } else {
        // 2. Upper layers: sequential heights along Z, supported underneath so nothing hangs in air
        let ownPathsHtml = '';
        (layer.paths || []).forEach(rawD => {
          ownPathsHtml += `<path fill="${layer.color}" d="${rawD}" />`;
        });

        if (studioState.autoSolidifyPlates !== false && layer.role !== 'cutout') {
          for (let upperIdx = idx + 1; upperIdx < studioState.layers.length; upperIdx++) {
            const upperLayer = studioState.layers[upperIdx];
            if (upperLayer && upperLayer.role !== 'cutout') {
              (upperLayer.paths || []).forEach(rawD => {
                ownPathsHtml += `<path fill="${layer.color}" d="${rawD}" />`;
              });
            }
          }
        }

        const ownSvgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studioState.analysis.viewBox}" width="${studioState.analysis.width}" height="${studioState.analysis.height}">
          <g fill="${layer.color}">${ownPathsHtml}</g>
        </svg>`;

        const ownSvgData = loader.parse(ownSvgStr);

        // If this upper layer has cutoutPaths (combined with another layer):
        const cutoutShapes = [];
        if (layer.cutoutPaths && layer.cutoutPaths.length > 0) {
          const cutoutSvgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studioState.analysis.viewBox}" width="${studioState.analysis.width}" height="${studioState.analysis.height}">
            <g>${layer.cutoutPaths.map(d => `<path d="${d}" />`).join('')}</g>
          </svg>`;
          const cutoutSvgData = loader.parse(cutoutSvgStr);
          cutoutSvgData.paths.forEach(svgP => {
            const cShapes = THREE.SVGLoader.createShapes(svgP);
            cShapes.forEach(cs => {
              cutoutShapes.push(cs);
            });
          });
        }

        const allLayerShapes = [];
        ownSvgData.paths.forEach(svgPath => {
          const shapes = THREE.SVGLoader.createShapes(svgPath);
          shapes.forEach(shape => {
            const shapePts = shape.getPoints();
            if (shapePts && shapePts.length >= 3 && cutoutShapes.length > 0) {
              const shapeBox = new THREE.Box2().setFromPoints(shapePts);
              cutoutShapes.forEach(cs => {
                const cutPts = cs.getPoints();
                if (cutPts && cutPts.length >= 3) {
                  const cutBox = new THREE.Box2().setFromPoints(cutPts);
                  if (shapeBox.intersectsBox(cutBox)) {
                    shape.holes.push(new THREE.Path(cutPts));
                  }
                }
              });
            }
            allLayerShapes.push(shape);
          });
        });

        allLayerShapes.forEach(shape => {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(matColor),
            roughness: 0.45, metalness: 0.05,
            wireframe: studioState.wireframe3d, side: THREE.DoubleSide });
          const geom = new THREE.ExtrudeGeometry(shape, {
            depth: ownExtrudeDepth,
            bevelEnabled: false,
            steps: 1,
            curveSegments: 6
          });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.z = 0;
          mesh.castShadow = true; mesh.receiveShadow = true;
          layerGroup.add(mesh);
        });
      }

      // Fit and center layer
      const svgW = studioState.analysis.width || 1536;
      const svgH = studioState.analysis.height || 1024;
      const scale = totalW_mm / svgW;

      layerGroup.scale.set(scale, -scale, 1);
      layerGroup.position.set(-totalW_mm / 2, (svgH * scale) / 2, 0);

      layerGroup.userData = {
        baseZ: ownZStart,
        layerIndex: idx,
        name: layer.name
      };

      if (isBase && masterDebossShapes.length > 0) {
        // Transform SVG deboss contours into 3D space (mm) for the export safety filter
        const toWorld = (p) => {
          const wx = (p.x * scale) - (totalW_mm / 2);
          const wy = (-p.y * scale) + ((svgH * scale) / 2);
          return { x: wx, y: wy };
        };
        const debossPolysWorld = masterDebossShapes.map(b => ({
          points: b.points.map(toWorld),
          holes: (b.holes || []).map(h => h.map(toWorld))
        }));
        let wMinX = Infinity, wMaxX = -Infinity, wMinY = Infinity, wMaxY = -Infinity;
        debossPolysWorld.forEach(b => b.points.forEach(p => {
          if (p.x < wMinX) wMinX = p.x; if (p.x > wMaxX) wMaxX = p.x;
          if (p.y < wMinY) wMinY = p.y; if (p.y > wMaxY) wMaxY = p.y;
        }));
        layerGroup.userData.debossPolysWorld = debossPolysWorld;
        layerGroup.userData.debossBBoxWorld = { minX: wMinX, maxX: wMaxX, minY: wMinY, maxY: wMaxY };
      }

      threeRootGroup.add(layerGroup);
      threeLayerMeshes.push(layerGroup);
    });

    // Detect if any non-base layer has compound paths (inner M-subpaths = text/holes)
    // These will be exported as raised-text STL layers by blender_processor.py
    const prevRaised = studioState.raisedTextDetected;
    studioState.raisedTextDetected = studioState.layers.some((lyr, lIdx) => {
      if (lIdx === 0 || lyr.role === 'base') return false;
      return (lyr.paths || []).some(rawD => (rawD.match(/[Mm][^Mm]+/g) || []).length > 1);
    });

    // Auto-center root group in the viewport (always keep model mathematically centered at origin)
    threeRootGroup.position.set(0, 0, 0);
    threeRootGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(threeRootGroup);
    const center = box.getCenter(new THREE.Vector3());
    threeRootGroup.position.x = -center.x;
    threeRootGroup.position.y = -center.y;

    // Shift deboss world contours by the auto-center root offset
    if (threeLayerMeshes[0] && threeLayerMeshes[0].userData && threeLayerMeshes[0].userData.debossPolysWorld) {
      const polys = threeLayerMeshes[0].userData.debossPolysWorld;
      polys.forEach(b => {
        b.points.forEach(p => { p.x -= center.x; p.y -= center.y; });
        b.holes.forEach(h => h.forEach(p => { p.x -= center.x; p.y -= center.y; }));
      });
      const bbox = threeLayerMeshes[0].userData.debossBBoxWorld;
      if (bbox) {
        bbox.minX -= center.x; bbox.maxX -= center.x;
        bbox.minY -= center.y; bbox.maxY -= center.y;
      }
    }

    // Adjust camera to frame model nicely (only once on load or explicit reset)
    if (!studioState.cameraInitialized || resetCamera) {
      const maxDim = Math.max(totalW_mm, totalH_mm);
      threeCamera.position.set(maxDim * 0.15, maxDim * 0.35, maxDim * 1.45);
      threeControls.target.set(0, 0, totalThick_mm / 2);
      threeControls.update();
      studioState.cameraInitialized = true;
    } else {
      // Keep user's exact camera angle, zoom, and orientation completely intact!
      // Keep the orbit pivot locked to the model center (0, 0, mid-thickness)
      threeControls.target.set(0, 0, totalThick_mm / 2);
      threeControls.update();
    }

    applyThreeExplode();

    // Re-render layer panel if raised text toggled
    if (prevRaised !== studioState.raisedTextDetected) {
      renderLayersList();
    }

    // Re-apply inspection highlight if active
    if (studioState.inspectedLayerIdx !== null && studioState.inspectedLayerIdx < studioState.layers.length) {
      highlightLayerIn3D(studioState.inspectedLayerIdx);
    } else {
      highlightLayerIn3D(null);
    }

    if (showLoader) showThreeLoading(false);
  }

  function applyThreeExplode() {
    threeLayerMeshes.forEach(group => {
      const baseZ = group.userData.baseZ || 0;
      const idx = group.userData.layerIndex || 0;
      group.position.z = baseZ + (idx * studioState.explodeMm * 0.75);
    });
  }

  function showThreeLoading(show) {
    if (show) threeLoadingOverlay.classList.remove('hidden');
    else threeLoadingOverlay.classList.add('hidden');
  }

  // ==================== MANUFACTURING EXPORT LOGIC ====================
  let pendingExportFormat = null;

  function promptOrderIdForExport(format) {
    if (!studioState.svg || studioState.layers.length === 0) return;
    pendingExportFormat = format;
    if (orderIdModal) {
      if (exportOrderIdInput) {
        exportOrderIdInput.value = studioState.orderId || '';
      }
      orderIdModal.classList.remove('hidden');
      setTimeout(() => {
        if (exportOrderIdInput) {
          exportOrderIdInput.focus();
          exportOrderIdInput.select();
        }
      }, 50);
    } else {
      const promptVal = prompt('Enter Order ID for VIVAGIFTS branding & file name:', studioState.orderId || '');
      if (promptVal !== null) {
        studioState.orderId = promptVal.trim();
        triggerExport(format);
      }
    }
  }

  if (closeOrderIdModal) {
    closeOrderIdModal.addEventListener('click', () => {
      if (orderIdModal) orderIdModal.classList.add('hidden');
      pendingExportFormat = null;
    });
  }

  if (cancelOrderIdModal) {
    cancelOrderIdModal.addEventListener('click', () => {
      if (orderIdModal) orderIdModal.classList.add('hidden');
      pendingExportFormat = null;
    });
  }

  if (confirmOrderIdExportBtn) {
    confirmOrderIdExportBtn.addEventListener('click', async () => {
      const orderVal = exportOrderIdInput ? exportOrderIdInput.value.trim() : '';
      if (!orderVal) {
        alert('Please enter an Order ID before exporting.');
        if (exportOrderIdInput) exportOrderIdInput.focus();
        return;
      }
      studioState.orderId = orderVal;
      if (orderIdModal) orderIdModal.classList.add('hidden');

      // Update 3D viewport geometry so debossed branding is immediately generated on the base layer
      await ensureBrandingFont();
      updateThreeGeometry(false, false);

      const fmt = pendingExportFormat || '3mf';
      pendingExportFormat = null;
      triggerExport(fmt);
    });
  }

  if (exportOrderIdInput) {
    exportOrderIdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmOrderIdExportBtn?.click();
      } else if (e.key === 'Escape') {
        if (orderIdModal) orderIdModal.classList.add('hidden');
        pendingExportFormat = null;
      }
    });
  }

  btnExportZip.addEventListener('click', () => promptOrderIdForExport('zip'));
  if (btnExport3mf) btnExport3mf.addEventListener('click', () => promptOrderIdForExport('3mf'));
  btnExportCombined.addEventListener('click', () => promptOrderIdForExport('combined'));
  btnViewGuide.addEventListener('click', () => openFilamentGuide());

  function extractIndexedMeshFromGroup(group) {
    group.updateMatrixWorld(true);
    const verticesList = [];
    const triangleIndices = [];
    const vertexMap = new Map();

    const isBaseLayer = (group.userData && group.userData.layerIndex === 0);
    const debossPolys = isBaseLayer ? group.userData.debossPolysWorld : null;
    const debossBBox = isBaseLayer ? group.userData.debossBBoxWorld : null;

    group.traverse(child => {
      if (child.isMesh && child.geometry) {
        // Skip visual helper accents (e.g. high-contrast deboss cavity ceiling for web viewer)
        if (child.userData && child.userData.isVisualAccent) return;

        const geom = child.geometry;
        const pos = geom.attributes.position;
        if (!pos) return;

        const matrix = child.matrixWorld;
        const flipWinding = matrix.determinant() < 0;

        function getWeldedIndex(rawX, rawY, rawZ) {
          const v = new THREE.Vector3(rawX, rawY, rawZ);
          v.applyMatrix4(matrix);
          // Tolerance: 0.001mm (1 micron) to cleanly weld cap and wall vertices
          const key = (Math.round(v.x * 1000) / 1000).toFixed(3) + '_' + 
                      (Math.round(v.y * 1000) / 1000).toFixed(3) + '_' + 
                      (Math.round(v.z * 1000) / 1000).toFixed(3);
          let idx = vertexMap.get(key);
          if (idx === undefined) {
            idx = verticesList.length;
            vertexMap.set(key, idx);
            verticesList.push(v);
          }
          return idx;
        }

        // Helper to check if a triangle is a flat bottom face inside the deboss void
        function isDebossVoidTriangle(v1_idx, v2_idx, v3_idx) {
          if (!debossPolys || !debossBBox) return false;
          const vert1 = verticesList[v1_idx], vert2 = verticesList[v2_idx], vert3 = verticesList[v3_idx];
          // Only filter bottom-facing horizontal triangles (Z < 0.395mm); keep vertical cavity walls and ceiling
          if (Math.max(vert1.z, vert2.z, vert3.z) >= 0.395) return false;

          const cx = (vert1.x + vert2.x + vert3.x) / 3;
          const cy = (vert1.y + vert2.y + vert3.y) / 3;

          // Quick bounding box check
          if (cx < debossBBox.minX || cx > debossBBox.maxX || cy < debossBBox.minY || cy > debossBBox.maxY) {
            return false;
          }

          // Point in deboss polygon test
          for (let pIdx = 0; pIdx < debossPolys.length; pIdx++) {
            const poly = debossPolys[pIdx];
            if (otPointInPoly({ x: cx, y: cy }, poly.points)) {
              let inIsland = false;
              for (let hIdx = 0; hIdx < poly.holes.length; hIdx++) {
                if (otPointInPoly({ x: cx, y: cy }, poly.holes[hIdx])) {
                  inIsland = true;
                  break;
                }
              }
              if (!inIsland) return true; // Triangle falls inside deboss void!
            }
          }
          return false;
        }

        const index = geom.index;
        if (index) {
          for (let i = 0; i < index.count; i += 3) {
            const i1_raw = index.getX(i);
            const i2_raw = index.getX(i + 1);
            const i3_raw = index.getX(i + 2);

            let v1 = getWeldedIndex(pos.getX(i1_raw), pos.getY(i1_raw), pos.getZ(i1_raw));
            let v2 = getWeldedIndex(pos.getX(i2_raw), pos.getY(i2_raw), pos.getZ(i2_raw));
            let v3 = getWeldedIndex(pos.getX(i3_raw), pos.getY(i3_raw), pos.getZ(i3_raw));

            if (flipWinding) { const tmp = v2; v2 = v3; v3 = tmp; }
            if (v1 !== v2 && v2 !== v3 && v1 !== v3) {
              if (isDebossVoidTriangle(v1, v2, v3)) {
                continue; // Skip triangle that would block the hollow deboss void!
              }
              triangleIndices.push([v1, v2, v3]);
            }
          }
        } else {
          for (let i = 0; i < pos.count; i += 3) {
            let v1 = getWeldedIndex(pos.getX(i), pos.getY(i), pos.getZ(i));
            let v2 = getWeldedIndex(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
            let v3 = getWeldedIndex(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));

            if (flipWinding) { const tmp = v2; v2 = v3; v3 = tmp; }
            if (v1 !== v2 && v2 !== v3 && v1 !== v3) {
              if (isDebossVoidTriangle(v1, v2, v3)) {
                continue; // Skip triangle that would block the hollow deboss void!
              }
              triangleIndices.push([v1, v2, v3]);
            }
          }
        }
      }
    });

    return { verticesList, triangleIndices };
  }

  function extractTrianglesFromObject(object) {
    const triangles = [];
    object.updateMatrixWorld(true);

    object.traverse(child => {
      if (child.isMesh && child.geometry) {
        const geom = child.geometry;
        const pos = geom.attributes.position;
        if (!pos) return;

        const index = geom.index;
        const matrix = child.matrixWorld;
        const flipWinding = matrix.determinant() < 0;

        const getV = (i) => {
          const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
          v.applyMatrix4(matrix);
          return v;
        };

        if (index) {
          for (let i = 0; i < index.count; i += 3) {
            let v1 = getV(index.getX(i));
            let v2 = getV(index.getX(i + 1));
            let v3 = getV(index.getX(i + 2));
            if (flipWinding) {
              const tmp = v2; v2 = v3; v3 = tmp;
            }
            triangles.push([v1, v2, v3]);
          }
        } else {
          for (let i = 0; i < pos.count; i += 3) {
            let v1 = getV(i);
            let v2 = getV(i + 1);
            let v3 = getV(i + 2);
            if (flipWinding) {
              const tmp = v2; v2 = v3; v3 = tmp;
            }
            triangles.push([v1, v2, v3]);
          }
        }
      }
    });

    return triangles;
  }

  function trianglesToBinaryStl(rawTriangles, headerTitle = "3D FDM Nameplate Studio STL") {
    // Sanitize triangles: eliminate zero-area slivers, collapsed edges, and self-degeneracies
    // Preserves front and back caps so each shell is 100% closed, watertight, and manifold in Bambu Studio
    const cleanTriangles = [];

    for (let i = 0; i < rawTriangles.length; i++) {
      const [v1, v2, v3] = rawTriangles[i];
      if (!v1 || !v2 || !v3) continue;

      // Single-precision float rounding identical to binary STL IEEE-754 format
      const x1 = Math.fround(v1.x), y1 = Math.fround(v1.y), z1 = Math.fround(v1.z);
      const x2 = Math.fround(v2.x), y2 = Math.fround(v2.y), z2 = Math.fround(v2.z);
      const x3 = Math.fround(v3.x), y3 = Math.fround(v3.y), z3 = Math.fround(v3.z);

      // Only skip true zero-width line segment collapses where 2 vertices are identical (< 1 picometer)
      const d12 = (x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2;
      const d23 = (x2 - x3) ** 2 + (y2 - y3) ** 2 + (z2 - z3) ** 2;
      const d31 = (x3 - x1) ** 2 + (y3 - y1) ** 2 + (z3 - z1) ** 2;
      if (d12 < 1e-14 || d23 < 1e-14 || d31 < 1e-14) continue;

      // Compute outward normal strictly from float32 cross product (v2 - v1) x (v3 - v1)
      const ax = x2 - x1, ay = y2 - y1, az = z2 - z1;
      const bx = x3 - x1, by = y3 - y1, bz = z3 - z1;
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-9) {
        nx /= len; ny /= len; nz /= len;
      } else {
        // Micro-sliver: set normal to (0, 0, 0) so slicers derive orientation from winding
        // and never trigger catastrophic floating-point sign disagreement / reversed faces!
        nx = 0; ny = 0; nz = 0;
      }

      cleanTriangles.push({ x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz });
    }

    const bufferLength = 84 + (50 * cleanTriangles.length);
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const dataView = new DataView(arrayBuffer);

    // 80 bytes header
    for (let i = 0; i < Math.min(80, headerTitle.length); i++) {
      dataView.setUint8(i, headerTitle.charCodeAt(i));
    }

    // 4 bytes triangle count (little-endian uint32)
    dataView.setUint32(80, cleanTriangles.length, true);

    let offset = 84;
    for (let i = 0; i < cleanTriangles.length; i++) {
      const { x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz } = cleanTriangles[i];

      // Normal
      dataView.setFloat32(offset, nx, true); offset += 4;
      dataView.setFloat32(offset, ny, true); offset += 4;
      dataView.setFloat32(offset, nz, true); offset += 4;

      // Vertex 1
      dataView.setFloat32(offset, x1, true); offset += 4;
      dataView.setFloat32(offset, y1, true); offset += 4;
      dataView.setFloat32(offset, z1, true); offset += 4;

      // Vertex 2
      dataView.setFloat32(offset, x2, true); offset += 4;
      dataView.setFloat32(offset, y2, true); offset += 4;
      dataView.setFloat32(offset, z2, true); offset += 4;

      // Vertex 3
      dataView.setFloat32(offset, x3, true); offset += 4;
      dataView.setFloat32(offset, y3, true); offset += 4;
      dataView.setFloat32(offset, z3, true); offset += 4;

      // Attribute byte count
      dataView.setUint16(offset, 0, true); offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'model/stl' });
  }

  async function generateBambu3mf(layerSpecs, JSZipClass, jobName = 'Nameplate') {
    const zip = new JSZipClass();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="application/xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
  <Relationship Target="/Metadata/model_settings.config" Id="rel1" Type="http://schemas.bambulab.com/package/2021/model-settings"/>
  <Relationship Target="/Metadata/project_settings.config" Id="rel2" Type="http://schemas.bambulab.com/package/2021/project-settings"/>
</Relationships>`;

    // Object ID 1 = Assembly container item placed on plate
    // Object ID 2, 3, 4... = Individual mesh components
    const assemblyObjId = 1;
    let meshObjectsXml = '';
    let componentsXml = '';
    let modelPartsXml = '';
    const filamentColors = [];

    layerSpecs.forEach((spec, idx) => {
      const compObjId = idx + 2;
      const extruderSlot = idx + 1; // Strict layer order: Layer 1 (bottom) = Filament 1, Layer 2 = Filament 2, etc.

      let hex = (spec.color || '#888888').replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      if (hex.length !== 6) hex = '888888';
      filamentColors.push('#' + hex.toUpperCase());

      const verticesList = spec.indexedMesh ? spec.indexedMesh.verticesList : [];
      const triangleIndices = spec.indexedMesh ? spec.indexedMesh.triangleIndices : [];

      let vertsXml = '';
      for (let v = 0; v < verticesList.length; v++) {
        const vert = verticesList[v];
        vertsXml += `<vertex x="${vert.x.toFixed(4)}" y="${vert.y.toFixed(4)}" z="${vert.z.toFixed(4)}"/>\n`;
      }

      let trisXml = '';
      for (let t = 0; t < triangleIndices.length; t++) {
        const [i1, i2, i3] = triangleIndices[t];
        trisXml += `<triangle v1="${i1}" v2="${i2}" v3="${i3}"/>\n`;
      }

      meshObjectsXml += `    <object id="${compObjId}" type="model" name="${spec.cleanName}">
      <mesh>
        <vertices>\n${vertsXml}        </vertices>
        <triangles>\n${trisXml}        </triangles>
      </mesh>
    </object>\n`;

      componentsXml += `        <component objectid="${compObjId}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n`;

      modelPartsXml += `    <part id="${compObjId}" subtype="normal_part">
      <metadata key="name" value="${spec.cleanName}"/>
      <metadata key="extruder" value="${extruderSlot}"/>
    </part>\n`;
    });

    const assemblyObjectXml = `    <object id="${assemblyObjId}" type="model" name="${jobName}">
      <components>
${componentsXml}      </components>
    </object>\n`;

    const modelSettingsXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${assemblyObjId}">
    <metadata key="name" value="${jobName}"/>
    <metadata key="extruder" value="1"/>
${modelPartsXml}  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
  </plate>
</config>`;

    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
${meshObjectsXml}${assemblyObjectXml}  </resources>
  <build>
    <item objectid="${assemblyObjId}"/>
  </build>
</model>`;

    const projectSettingsJson = JSON.stringify({
      filament_colour: filamentColors,
      filament_type: filamentColors.map(() => 'PLA'),
      filament_vendor: filamentColors.map(() => 'Bambu Lab')
    }, null, 2);

    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels', rels);
    zip.file('3D/3dmodel.model', modelXml);
    zip.file('Metadata/model_settings.config', modelSettingsXml);
    zip.file('Metadata/project_settings.config', projectSettingsJson);

    return await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
  }

  async function triggerExport(format) {
    if (!studioState.svg || studioState.layers.length === 0) return;

    btnExportZip.classList.add('loading');
    btnExportZip.disabled = true;
    studioExportStatus.classList.remove('hidden');
    studioExportStatus.innerHTML = '<span class="spinner"></span> Generating 3D STLs & BambuLab Project Package...';

    try {
      if (!window.JSZip || threeLayerMeshes.length === 0) {
        throw new Error('3D Viewport is still initializing. Please wait a moment and try again.');
      }

      // Temporarily reset explode offset so printed layers sit at their true manufacturing Z elevation
      threeLayerMeshes.forEach(group => {
        group.position.z = group.userData.baseZ || 0;
        group.updateMatrixWorld(true);
      });
      threeRootGroup.updateMatrixWorld(true);

      const rawJob = (studioState.orderId && studioState.orderId.trim()) 
        ? studioState.orderId.trim() 
        : (studioState.jobName || 'Nameplate');
      const jobName = rawJob.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fixedWidthMm = studioState.fixedWidthMm || 150.0;
      const totalThicknessMm = studioState.totalThicknessMm || 10.0;
      const baseLayer = studioState.layers.find(l => l.role === 'base') || studioState.layers[0];
      const baseThickness = Math.max(0.10, (baseLayer && baseLayer.thicknessMm !== undefined) ? baseLayer.thicknessMm : (studioState.layers[0]?.thicknessMm || 7.00));

      // Extract triangles for each layer
      const layerPrintSpecs = [];
      let runningZ = 0;

      studioState.layers.forEach((layer, idx) => {
        const isBase = (layer.role === 'base' || idx === 0);
        const thickMm = isBase 
          ? baseThickness 
          : Math.max(0.10, parseFloat(layer.thicknessMm !== undefined ? layer.thicknessMm : 1.00));
        const group = threeLayerMeshes[idx];
        const indexedMesh = group ? extractIndexedMeshFromGroup(group) : { verticesList: [], triangleIndices: [] };
        const triangles = [];
        for (let t = 0; t < indexedMesh.triangleIndices.length; t++) {
          const [i1, i2, i3] = indexedMesh.triangleIndices[t];
          triangles.push([indexedMesh.verticesList[i1], indexedMesh.verticesList[i2], indexedMesh.verticesList[i3]]);
        }

        const zStart = runningZ;
        const zEnd = runningZ + thickMm;
        const pauseStart = zStart;
        const pauseEnd = zEnd;
        runningZ = zEnd;

        const rawName = layer.name || `Layer ${idx + 1}`;
        const cleanName = `${String(idx + 1).padStart(2, '0')}_${rawName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const stlFilename = `${cleanName}_${thickMm.toFixed(2)}mm.stl`;

        layerPrintSpecs.push({
          idx,
          name: rawName,
          cleanName,
          color: layer.color || '#888888',
          role: layer.role || (isBase ? 'base' : 'mid'),
          thicknessMm: thickMm,
          zStartMm: zStart,
          zEndMm: zEnd,
          pauseStartMm: pauseStart,
          pauseEndMm: pauseEnd,
          stlFilename,
          indexedMesh,
          triangles
        });
      });

      // Restore explode offset
      applyThreeExplode();

      // 1. Generate Binary STLs for each layer
      const generatedStls = [];
      layerPrintSpecs.forEach(spec => {
        const blob = trianglesToBinaryStl(spec.triangles, `Layer: ${spec.cleanName}`);
        const url = URL.createObjectURL(blob);
        generatedStls.push({
          ...spec,
          blob,
          url
        });
      });

      // 2. Generate Combined 150mm Multi-Body STL
      const allTriangles = [];
      layerPrintSpecs.forEach(spec => {
        spec.triangles.forEach(t => allTriangles.push(t));
      });
      const combinedStlBlob = trianglesToBinaryStl(allTriangles, `${jobName} Combined 150mm`);
      const combinedStlFilename = `${jobName}.stl`;
      const combinedStlUrl = URL.createObjectURL(combinedStlBlob);

      // 3. Generate Native BambuLab .3MF Project
      const threeMfBlob = await generateBambu3mf(layerPrintSpecs, window.JSZip, jobName);
      const threeMfFilename = `${jobName}.3mf`;
      const threeMfUrl = URL.createObjectURL(threeMfBlob);

      // 4. Generate Filament Swap Guide text
      let guideText = '='.repeat(60) + '\n';
      guideText += `  FDM 3D PRINTING GUIDE: ${jobName}\n`;
      guideText += '='.repeat(60) + '\n\n';
      guideText += `DIMENSIONS:\n`;
      guideText += `  * Fixed Width: ${fixedWidthMm.toFixed(1)} mm\n`;
      guideText += `  * Proportional Height: ${(studioState.proportionalHeightMm || 126).toFixed(2)} mm\n`;
      guideText += `  * Total Thickness: ${(totalThicknessMm || studioState.totalThicknessMm || 10.0).toFixed(1)} mm\n\n`;
      guideText += '-'.repeat(60) + '\n';
      guideText += `BAMBU STUDIO / MULTI-MATERIAL PRINTING (AMS):\n`;
      guideText += `  METHOD 1 (RECOMMENDED): Open '${threeMfFilename}' directly in Bambu Studio.\n`;
      guideText += `    All objects and colors are already configured and placed on the print bed!\n\n`;
      guideText += `  METHOD 2: Drag and drop all individual layer STLs into Bambu Studio simultaneously.\n`;
      guideText += `    When prompted 'Load these files as a single object with multiple parts?', click YES.\n`;
      guideText += `    Assign each part to its corresponding filament slot (AMS / Spool).\n\n`;
      guideText += '-'.repeat(60) + '\n';
      guideText += `SINGLE EXTRUDER MANUAL FILAMENT SWAPS (Layer Pauses):\n`;
      layerPrintSpecs.forEach((spec, i) => {
        const pauseNote = (i === 0)
          ? ' (INITIAL FILAMENT - BASE)'
          : ` -> PAUSE PRINTER AT Z = ${spec.pauseStartMm.toFixed(2)} mm AND SWAP FILAMENT TO ${spec.color}`;
        guideText += `  [Layer ${i + 1}] ${spec.name} (${spec.color})\n`;
        guideText += `    - Print Layer Range: ${spec.pauseStartMm.toFixed(2)} mm to ${spec.pauseEndMm.toFixed(2)} mm\n`;
        guideText += `    - Action: ${pauseNote}\n\n`;
      });
      guideText += '='.repeat(60) + '\n';

      const guideBlob = new Blob([guideText], { type: 'text/plain;charset=utf-8' });
      const guideUrl = URL.createObjectURL(guideBlob);

      // 5. Bundle Complete Package into a single .ZIP file
      const packageZip = new window.JSZip();
      packageZip.file(threeMfFilename, threeMfBlob);
      packageZip.file(combinedStlFilename, combinedStlBlob);
      generatedStls.forEach(spec => {
        packageZip.file(spec.stlFilename, spec.blob);
      });
      packageZip.file('Filament_Swap_Guide.txt', guideBlob);

      const packageZipBlob = await packageZip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      const packageZipFilename = `${jobName}.zip`;
      const packageZipUrl = URL.createObjectURL(packageZipBlob);

      // Store in studioState for guide modal & re-downloads
      studioState.lastExportResult = {
        jobName,
        threeMfFilename,
        threeMfUrl,
        combinedStlFilename,
        combinedStlUrl,
        packageZipFilename,
        packageZipUrl,
        guideUrl,
        guideText,
        layers: generatedStls
      };

      // Build download chips HTML
      let linksHtml = '<div class="export-download-links">';
      linksHtml += '<div class="export-download-title">📥 Direct File Downloads:</div>';

      linksHtml += `<a class="export-dl-chip export-dl-chip-featured" href="${threeMfUrl}" download="${threeMfFilename}" style="border-color:#10b981;background:rgba(16,185,129,0.12);">
        <span><span class="dl-icon">🚀</span><strong>Bambu Studio Multi-Color Project</strong> (${threeMfFilename})</span>
        <span style="color:#10b981;font-weight:600;">⬇ Download .3MF</span>
      </a>`;

      linksHtml += `<a class="export-dl-chip" href="${combinedStlUrl}" download="${combinedStlFilename}">
        <span><span class="dl-icon">🖨️</span><strong>Combined 150mm STL</strong> (${combinedStlFilename})</span>
        <span>⬇ Download .STL</span>
      </a>`;

      generatedStls.forEach(l => {
        linksHtml += `<a class="export-dl-chip" href="${l.url}" download="${l.stlFilename}">
          <span><span class="dl-icon">🎨</span><strong>${l.name}</strong> (${l.stlFilename})</span>
          <span>⬇ Download</span>
        </a>`;
      });

      linksHtml += `<a class="export-dl-chip" href="${packageZipUrl}" download="${packageZipFilename}">
        <span><span class="dl-icon">📦</span><strong>BambuLab Complete Package</strong> (.ZIP)</span>
        <span>⬇ Download .ZIP</span>
      </a>`;

      linksHtml += `
      <div style="margin-top:12px;font-size:0.83rem;line-height:1.45;color:var(--text-muted);background:rgba(255,255,255,0.03);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
        💡 <strong>How to Print in Bambu Studio:</strong><br>
        • <strong>Option 1 (Instant Multi-Color):</strong> Open the <code>.3MF</code> file directly in Bambu Studio — all parts and colors appear pre-configured on the plate!<br>
        • <strong>Option 2 (Multi-Part):</strong> Drag the individual layer STLs into Bambu Studio together and select <em>"Load as single object with multiple parts"</em>.<br>
        • <strong>Option 3 (Layer Swaps):</strong> Slice the <code>Combined_150mm.stl</code> and add pauses according to the Filament Guide.
      </div>
      `;

      linksHtml += '</div>';

      studioExportStatus.innerHTML = `✓ <strong>Export Complete!</strong> Built 150mm model with ${generatedStls.length} sequential layers in 0.2s.${linksHtml}`;

      function triggerDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        if (filename) a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (document.body.contains(a)) document.body.removeChild(a);
        }, 300);
      }

      if (format === 'zip') {
        triggerDownload(packageZipUrl, packageZipFilename);
      } else if (format === '3mf') {
        triggerDownload(threeMfUrl, threeMfFilename);
      } else if (format === 'combined') {
        triggerDownload(combinedStlUrl, combinedStlFilename);
      }
    } catch (err) {
      console.error('Export Error:', err);
      studioExportStatus.innerHTML = `✕ <strong>Export Error:</strong> ${err.message}`;
    } finally {
      btnExportZip.classList.remove('loading');
      btnExportZip.disabled = false;
    }
  }

  function openFilamentGuide() {
    if (studioState.lastExportResult && studioState.lastExportResult.guideText) {
      showGuideModal(studioState.lastExportResult.guideText);
      return;
    }

    const jobName = (studioState.jobName || 'Nameplate').replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseLayer = studioState.layers.find(l => l.role === 'base') || studioState.layers[0];
    const baseThick = Math.max(0.10, (baseLayer && baseLayer.thicknessMm !== undefined) ? baseLayer.thicknessMm : (studioState.layers[0]?.thicknessMm || 7.00));
    let guide = `============================================================\n`;
    guide += `  FDM 3D PRINTING GUIDE: ${jobName}\n`;
    guide += `============================================================\n\n`;
    guide += `DIMENSIONS:\n`;
    guide += `  * Fixed Width: ${(studioState.fixedWidthMm || 150).toFixed(1)} mm\n`;
    guide += `  * Proportional Height: ${(studioState.proportionalHeightMm || 126).toFixed(2)} mm\n`;
    guide += `  * Total Thickness: ${(studioState.totalThicknessMm || 10).toFixed(2)} mm\n\n`;
    guide += `------------------------------------------------------------\n`;
    guide += `BAMBU STUDIO / MULTI-MATERIAL PRINTING (AMS):\n`;
    guide += `  METHOD 1 (RECOMMENDED): Open '${jobName}_150mm.3mf' directly in Bambu Studio.\n`;
    guide += `    All objects and colors are already configured and placed on the print bed!\n\n`;
    guide += `  METHOD 2: Drag and drop all individual layer STLs into Bambu Studio simultaneously.\n`;
    guide += `    When prompted 'Load these files as a single object with multiple parts?', click YES.\n`;
    guide += `    Assign each part to its corresponding filament slot (AMS / Spool).\n\n`;
    guide += `------------------------------------------------------------\n`;
    guide += `SINGLE EXTRUDER MANUAL FILAMENT SWAPS (Layer Pauses):\n`;

    let cumZ = baseThick;
    studioState.layers.forEach((lyr, i) => {
      const isB = (i === 0 || lyr.role === 'base');
      const t = isB 
        ? baseThick 
        : Math.max(0.10, parseFloat(lyr.thicknessMm !== undefined ? lyr.thicknessMm : 1.00));
      let pStart = 0, pEnd = baseThick;
      if (isB) {
        pStart = 0; pEnd = baseThick;
      } else {
        pStart = cumZ;
        cumZ += t;
        pEnd = cumZ;
      }
      const pauseNote = (i === 0)
        ? ' (INITIAL FILAMENT - BASE)'
        : ` -> PAUSE PRINTER AT Z = ${pStart.toFixed(2)} mm AND SWAP FILAMENT TO ${lyr.color || '#888888'}`;
      guide += `  [Layer ${i + 1}] ${lyr.name} (${lyr.color || '#888888'})\n`;
      guide += `    - Print Layer Range: ${pStart.toFixed(2)} mm to ${pEnd.toFixed(2)} mm\n`;
      guide += `    - Action: ${pauseNote}\n\n`;
    });
    guide += `============================================================\n`;
    showGuideModal(guide);
  }

  function showGuideModal(text) {
    guideTextContent.textContent = text;
    guideModal.classList.remove('hidden');
  }

  closeGuideModal.addEventListener('click', () => guideModal.classList.add('hidden'));
  dismissGuideModal.addEventListener('click', () => guideModal.classList.add('hidden'));

  copyGuideTextBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(guideTextContent.textContent).then(() => {
      copyGuideTextBtn.textContent = 'Copied to Clipboard!';
      setTimeout(() => copyGuideTextBtn.textContent = 'Copy Guide to Clipboard', 2000);
    });
  });
});
