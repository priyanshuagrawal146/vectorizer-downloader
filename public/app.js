document.addEventListener('DOMContentLoaded', () => {
  // ==================== NAVIGATION TABS ====================
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
      swatch.style.backgroundColor = color;
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
    loadSvgIntoStudio(currentResult.svg, currentResult.filename || 'Nameplate');
  });

  // Export handlers
  downloadSvgBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const blob = new Blob([currentResult.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentResult.filename;
    a.click();
    URL.revokeObjectURL(url);
  });

  downloadPngBtn.addEventListener('click', () => {
    if (!currentResult) return;
    rasterizeSvgToPng(currentResult.svg, currentResult.width * 4, currentResult.height * 4, (dataUrl) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = currentResult.filename.replace('.svg', '@4x.png');
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

  // Local storage history
  function saveToHistory(res) {
    try {
      const list = JSON.parse(localStorage.getItem('vec_history') || '[]');
      list.unshift({
        id: Date.now(),
        filename: res.filename,
        width: res.width,
        height: res.height,
        shapes: res.shapeCount,
        svg: res.svg
      });
      localStorage.setItem('vec_history', JSON.stringify(list.slice(0, 8)));
      renderHistory();
    } catch (e) {}
  }

  function renderHistory() {
    try {
      const list = JSON.parse(localStorage.getItem('vec_history') || '[]');
      if (list.length === 0) {
        historySection.classList.add('hidden');
        return;
      }
      historySection.classList.remove('hidden');
      historyList.innerHTML = '';
      list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
          <div class="history-thumb">${item.svg}</div>
          <div class="history-info">
            <span class="history-name">${item.filename}</span>
            <span class="history-meta">${item.width}×${item.height} • ${item.shapes || 0} shapes</span>
          </div>
        `;
        card.addEventListener('click', () => {
          currentResult = item;
          displayResult(item);
        });
        historyList.appendChild(card);
      });
    } catch (e) {}
  }

  clearHistoryBtn?.addEventListener('click', () => {
    localStorage.removeItem('vec_history');
    renderHistory();
  });

  renderHistory();

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

  const btnAutoMergeSimilar = document.getElementById('btnAutoMergeSimilar');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const bgRemovedAlert = document.getElementById('bgRemovedAlert');
  const btnToggleBgRestore = document.getElementById('btnToggleBgRestore');

  const btnExportZip = document.getElementById('btnExportZip');
  const btnExportBlend = document.getElementById('btnExportBlend');
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

  // Multi-merge toolbar elements
  const multiMergeBar = document.getElementById('multiMergeBar');
  const selectedLayersBadge = document.getElementById('selectedLayersBadge');
  const multiMergeTargetSelect = document.getElementById('multiMergeTargetSelect');
  const btnConfirmMultiMerge = document.getElementById('btnConfirmMultiMerge');
  const btnCancelMultiSelect = document.getElementById('btnCancelMultiSelect');

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
    explodeMm: 0,
    wireframe3d: false,
    lastExportResult: null,
    activeMergeIdx: null,
    selectedLayerIndices: new Set(),
    raisedTextDetected: false  // true when hole-paths were successfully raised as 3D text
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

  // Load SVG into 3D Studio
  async function loadSvgIntoStudio(svgStr, name = 'Nameplate') {
    studioState.svg = svgStr;
    studioState.jobName = name;
    studioState.activeMergeIdx = null;
    studioState.selectedLayerIndices.clear();
    viewportModelName.textContent = name;

    studioDropzone.classList.add('hidden');
    studioWorkspace.classList.remove('hidden');

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
      studioState.layers = (analysis.layers || []).map(l => ({
        ...l,
        thicknessMm: l.thicknessMm !== undefined 
          ? l.thicknessMm 
          : parseFloat(((l.heightPct / 100.0) * studioState.totalThicknessMm).toFixed(2))
      }));
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

    // Ensure target has healthy height
    if (target.role !== 'base') {
      target.thicknessMm = Math.max(target.thicknessMm || 1.50, source.thicknessMm || 1.50);
      target.heightPct = Math.max(target.heightPct || 15, source.heightPct || 15);
    }

    // Splice out source layer
    studioState.layers.splice(sourceIdx, 1);
    studioState.activeMergeIdx = null;

    reassignRoles();
    updateTotalThicknessFromLayers();
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
      const srcMms = selectedIndices.map(i => studioState.layers[i]?.thicknessMm || 0);
      target.thicknessMm = Math.max(target.thicknessMm || 1.50, ...srcMms);
      const srcPcts = selectedIndices.map(i => studioState.layers[i]?.heightPct || 0);
      target.heightPct = Math.max(target.heightPct || 15, ...srcPcts);
    }

    // Remove source layers in descending index order so remaining indices don't shift
    const toRemove = selectedIndices.filter(i => i !== targetIdx).sort((a, b) => b - a);
    toRemove.forEach(idx => {
      studioState.layers.splice(idx, 1);
    });

    studioState.selectedLayerIndices.clear();
    studioState.activeMergeIdx = null;

    reassignRoles();
    updateTotalThicknessFromLayers();
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

  // Dimension settings event listeners
  inputFixedWidth.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (val > 10) {
      studioState.fixedWidthMm = val;
      const aspect = studioState.analysis ? (studioState.analysis.width / studioState.analysis.height) : 1.5;
      studioState.proportionalHeightMm = parseFloat((val / aspect).toFixed(2));
      updateDimensionBadges();
      updateThreeGeometry();
    }
  });

  inputTotalThickness.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (val > 0) {
      const oldTotal = studioState.totalThicknessMm || 10.0;
      const ratio = val / oldTotal;
      studioState.totalThicknessMm = val;
      studioState.layers.forEach(l => {
        if (l.thicknessMm !== undefined) {
          l.thicknessMm = parseFloat((l.thicknessMm * ratio).toFixed(2));
        }
      });
      updateDimensionBadges();
      renderLayersList();
      updateThreeGeometry();
    }
  });

  function updateTotalThicknessFromLayers() {
    if (!studioState.layers || studioState.layers.length === 0) return;
    const newTotal = parseFloat(
      studioState.layers.reduce((sum, l) => sum + (parseFloat(l.thicknessMm) || 0), 0).toFixed(2)
    );
    if (newTotal > 0) {
      studioState.totalThicknessMm = newTotal;
      if (inputTotalThickness) inputTotalThickness.value = newTotal;
    }
    updateDimensionBadges();
  }

  chkSolidBase.addEventListener('change', (e) => {
    studioState.solidBase = e.target.checked;
    updateThreeGeometry();
  });

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

  // Render the Layer Stack list in sidebar
  function renderLayersList() {
    layersContainer.innerHTML = '';
    const totalDisplayed = studioState.layers.length + (studioState.raisedTextDetected ? 1 : 0);
    layerCountBadge.textContent = `${totalDisplayed} Layers`;

    let runningZ = 0;
    studioState.layers.forEach((layer, idx) => {
      const isSelected = studioState.selectedLayerIndices.has(idx);
      const row = document.createElement('div');
      row.className = `layer-row-item ${isSelected ? 'layer-row-selected' : ''}`;

      const roleClass = layer.role === 'base' ? 'role-base' : (layer.role === 'top' ? 'role-top' : 'role-mid');

      // Calculate thickness in mm
      if (layer.thicknessMm === undefined) {
        layer.thicknessMm = (idx === 0) ? 7.00 : 1.00;
      }
      const thicknessMm = parseFloat(layer.thicknessMm).toFixed(2);
      const zStart = runningZ;
      const zEnd = runningZ + parseFloat(thicknessMm);
      runningZ = zEnd;
      layer.zStartMm = zStart;
      layer.zEndMm = zEnd;

      const isMergeOpen = (studioState.activeMergeIdx === idx);

      const colorHexVal = (layer.color && layer.color.startsWith('#') && layer.color.length === 7) ? layer.color : '#ffffff';

      row.innerHTML = `
        <label class="layer-checkbox-container" title="Select to merge">
          <input type="checkbox" class="layer-select-checkbox" data-idx="${idx}" ${isSelected ? 'checked' : ''} />
        </label>
        <div class="layer-order-num">${idx + 1}</div>
        <label class="layer-color-preview" style="background-color: ${layer.color}" title="Click to customize color">
          <input type="color" class="layer-color-picker" value="${colorHexVal}" style="opacity:0;position:absolute;pointer-events:none;" />
        </label>
        <div class="layer-main-info">
          <div class="layer-name-row">
            <input type="text" class="layer-name-input" value="${layer.name}" data-idx="${idx}" />
            <select class="layer-role-select ${roleClass}" data-idx="${idx}" title="Set Extrusion Role">
              <option value="base" ${layer.role === 'base' ? 'selected' : ''}>Base (Foundation)</option>
              <option value="mid" ${layer.role === 'mid' ? 'selected' : ''}>Mid (Artwork / Details)</option>
              <option value="top" ${layer.role === 'top' ? 'selected' : ''}>Top (Raised Text)</option>
            </select>
          </div>
          <div class="layer-height-inputs">
            <div class="layer-mm-box" title="Layer thickness in mm">
              <input type="number" class="layer-height-mm-input" value="${thicknessMm}" min="0.05" max="50" step="0.05" data-idx="${idx}" />
              <span class="layer-unit-label">mm</span>
            </div>
            <span class="layer-z-range-badge" title="Print height range along Z axis">Z: ${zStart.toFixed(2)} – ${zEnd.toFixed(2)} mm</span>
            <span style="font-size:0.75rem; color:var(--text-dim); margin-left:auto;">${layer.paths.length} paths</span>
          </div>
        </div>
        <div class="layer-tools-group">
          <button class="btn-layer-tool btn-merge ${isMergeOpen ? 'btn-merge-active' : ''}" data-idx="${idx}" title="Merge into another layer" type="button">⇄</button>
          <button class="btn-layer-tool btn-delete" data-idx="${idx}" title="Delete layer" type="button">🗑️</button>
        </div>
        <div class="layer-reorder-btns">
          <button class="btn-move btn-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move Up">▲</button>
          <button class="btn-move btn-move-down" data-idx="${idx}" ${idx === studioState.layers.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
        </div>
      `;

      // If merge popover is active for this row
      if (isMergeOpen) {
        const popover = document.createElement('div');
        popover.className = 'merge-popover';
        let optionsHtml = '';
        studioState.layers.forEach((otherL, oIdx) => {
          if (oIdx !== idx) {
            optionsHtml += `<option value="${oIdx}">Layer ${oIdx + 1}: ${otherL.name} (${otherL.color})</option>`;
          }
        });

        popover.innerHTML = `
          <span>Merge with:</span>
          <select class="merge-select">${optionsHtml}</select>
          <button class="merge-confirm-btn" type="button">Merge</button>
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

        popover.querySelector('.merge-cancel-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          studioState.activeMergeIdx = null;
          renderLayersList();
        });

        row.appendChild(popover);
      }

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
        colorLabel.addEventListener('click', () => colorPicker.click());
        colorPicker.addEventListener('input', (e) => {
          const newCol = e.target.value;
          studioState.layers[idx].color = newCol;
          colorLabel.style.backgroundColor = newCol;
          updateThreeGeometry();
        });
        colorPicker.addEventListener('change', (e) => {
          saveUndoState();
          const newCol = e.target.value;
          studioState.layers[idx].color = newCol;
          colorLabel.style.backgroundColor = newCol;
          updateThreeGeometry();
        });
      }

      // Merge button toggle
      const mergeBtn = row.querySelector('.btn-merge');
      mergeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        studioState.activeMergeIdx = (studioState.activeMergeIdx === idx) ? null : idx;
        renderLayersList();
      });

      // Delete button
      const deleteBtn = row.querySelector('.btn-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLayer(idx);
      });

      // Name editing
      const nameInput = row.querySelector('.layer-name-input');
      nameInput.addEventListener('change', (e) => {
        saveUndoState();
        studioState.layers[idx].name = e.target.value.trim();
      });

      // Height mm editing
      const mmInput = row.querySelector('.layer-height-mm-input');
      if (mmInput) {
        mmInput.addEventListener('change', (e) => {
          const val = parseFloat(e.target.value);
          if (val > 0) {
            saveUndoState();
            studioState.layers[idx].thicknessMm = val;
            updateTotalThicknessFromLayers();
            studioState.layers.forEach(l => {
              l.heightPct = parseFloat(((l.thicknessMm / studioState.totalThicknessMm) * 100).toFixed(1));
            });
            renderLayersList();
            updateThreeGeometry();
          }
        });
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

    if (validSelected.length >= 2) {
      multiMergeBar.classList.remove('hidden');
      if (selectedLayersBadge) selectedLayersBadge.textContent = `${validSelected.length} Layers Selected`;
      if (multiMergeTargetSelect) {
        let opts = '';
        validSelected.forEach(sIdx => {
          const l = studioState.layers[sIdx];
          opts += `<option value="${sIdx}">Layer ${sIdx + 1}: ${l.name} (${l.color})</option>`;
        });
        multiMergeTargetSelect.innerHTML = opts;
      }
    } else {
      multiMergeBar.classList.add('hidden');
    }
  }

  // Multi-merge buttons
  btnConfirmMultiMerge?.addEventListener('click', () => {
    const selected = Array.from(studioState.selectedLayerIndices);
    const targetIdx = parseInt(multiMergeTargetSelect?.value, 10);
    if (!isNaN(targetIdx) && selected.length >= 2) {
      mergeMultipleLayers(selected, targetIdx);
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
    if (studioState.layers[0].role === 'base') {
      if (studioState.layers[0].thicknessMm === undefined) {
        studioState.layers[0].thicknessMm = (total === 1) ? 10.00 : 7.00;
      }
      if (!studioState.layers[0].heightPct) {
        studioState.layers[0].heightPct = (total === 1) ? 100 : 70;
      }
    }

    // Preserve all other existing roles and names
    studioState.layers.forEach((l, i) => {
      if (i > 0) {
        if (!l.role) {
          l.role = (i === total - 1) ? 'top' : 'mid';
        }
        if (l.thicknessMm === undefined) {
          const upperCount = Math.max(1, total - 1);
          l.thicknessMm = parseFloat((3.00 / upperCount).toFixed(2));
        }
        if (!l.heightPct) {
          l.heightPct = parseFloat(((l.thicknessMm / 10.00) * 100).toFixed(1));
        }
      }
    });
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
      threeCamera.position.set(0, -180, 220);

      threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      threeRenderer.setSize(width, height);
      threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      threeRenderer.shadowMap.enabled = true;
      threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      threeContainer.appendChild(threeRenderer.domElement);

      threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
      threeControls.enableDamping = true;
      threeControls.dampingFactor = 0.05;
      threeControls.maxPolarAngle = Math.PI / 2 + 0.1;

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
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

      // Studio grid floor
      const gridHelper = new THREE.GridHelper(300, 30, 0x334155, 0x1e293b);
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.position.z = -0.5;
      threeScene.add(gridHelper);

      threeRootGroup = new THREE.Group();
      threeScene.add(threeRootGroup);

      window.addEventListener('resize', onThreeResize);
      animateThree();
    }

    updateThreeGeometry();
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
    if (threeControls) threeControls.update();
    if (threeRenderer && threeScene && threeCamera) {
      threeRenderer.render(threeScene, threeCamera);
    }
  }

  // Camera Presets
  viewPerspective.addEventListener('click', () => {
    setActiveViewBtn(viewPerspective);
    const maxDim = Math.max(studioState.fixedWidthMm || 150, studioState.proportionalHeightMm || 100);
    threeCamera.position.set(0, -maxDim * 1.15, maxDim * 1.05);
    threeControls.target.set(0, 0, studioState.totalThicknessMm / 2);
    threeControls.update();
  });

  viewTop.addEventListener('click', () => {
    setActiveViewBtn(viewTop);
    const maxDim = Math.max(studioState.fixedWidthMm || 150, studioState.proportionalHeightMm || 100);
    threeCamera.position.set(0, 0, maxDim * 1.5);
    threeControls.target.set(0, 0, 0);
    threeControls.update();
  });

  viewFront.addEventListener('click', () => {
    setActiveViewBtn(viewFront);
    const maxDim = Math.max(studioState.fixedWidthMm || 150, studioState.proportionalHeightMm || 100);
    threeCamera.position.set(0, -maxDim * 1.7, 10);
    threeControls.target.set(0, 0, studioState.totalThicknessMm / 2);
    threeControls.update();
  });

  btnResetCamera.addEventListener('click', () => {
    viewPerspective.click();
  });

  function setActiveViewBtn(btn) {
    [viewPerspective, viewTop, viewFront].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  // Update extruded 3D meshes in Three.js
  function updateThreeGeometry() {
    if (!studioState.analysis || !threeRootGroup) return;

    showThreeLoading(true);

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
    const baseThickness = Math.max(0.2, (baseLayer && baseLayer.thicknessMm !== undefined) ? baseLayer.thicknessMm : 7.00);

    let currentCumulativeTop = baseThickness;
    studioState.layers.forEach((layer, idx) => {
      const isBase = (layer.role === 'base' || idx === 0);
      const layerStepThick = Math.max(0.1, layer.thicknessMm !== undefined ? layer.thicknessMm : 1.0);

      let ownZStart = 0;
      let ownExtrudeDepth = baseThickness;

      if (isBase) {
        ownZStart = 0;
        ownExtrudeDepth = baseThickness;
      } else {
        currentCumulativeTop += layerStepThick;
        // Extrude from base foundation up to this layer's top height so it is solidly supported without floating
        ownZStart = baseThickness;
        ownExtrudeDepth = Math.max(0.1, currentCumulativeTop - baseThickness);
      }

      const layerGroup = new THREE.Group();
      layerGroup.userData = { baseZ: ownZStart, layerIndex: idx };

      let matColor = layer.color;
      if (matColor === '#000000' || matColor === '#090808' || matColor === '#090908' || matColor === '#101010') {
        matColor = '#1a1a1a';
      }

      if (isBase) {
        // 1. Base Layer: extrude foundation plate from Z = 0 to baseThickness
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
        baseSvgData.paths.forEach(svgPath => {
          const shapes = THREE.SVGLoader.createShapes(svgPath);
          shapes.forEach(shape => {
            if (studioState.solidBase) shape.holes = []; // 100% solid backing plate
            const mat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(matColor),
              roughness: 0.45, metalness: 0.05,
              wireframe: studioState.wireframe3d
            });
            const geom = new THREE.ExtrudeGeometry(shape, {
              depth: ownExtrudeDepth,
              bevelEnabled: true, bevelSegments: 1, steps: 1,
              bevelSize: 0.15, bevelThickness: 0.15
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.z = ownZStart;
            mesh.castShadow = true; mesh.receiveShadow = true;
            layerGroup.add(mesh);
          });
        });
      } else {
        // 2. Upper layers: anchored to base plate and extruded up to cumulative top height (no floating gaps)
        let ownPathsHtml = '';
        (layer.paths || []).forEach(rawD => {
          ownPathsHtml += `<path fill="${layer.color}" d="${rawD}" />`;
        });

        const ownSvgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studioState.analysis.viewBox}" width="${studioState.analysis.width}" height="${studioState.analysis.height}">
          <g fill="${layer.color}">${ownPathsHtml}</g>
        </svg>`;

        const ownSvgData = loader.parse(ownSvgStr);

        ownSvgData.paths.forEach(svgPath => {
          const shapes = THREE.SVGLoader.createShapes(svgPath);
          shapes.forEach(shape => {
            const mat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(matColor),
              roughness: 0.45, metalness: 0.05,
              wireframe: studioState.wireframe3d
            });
            const geom = new THREE.ExtrudeGeometry(shape, {
              depth: ownExtrudeDepth,
              bevelEnabled: true, bevelSegments: 1, steps: 1,
              bevelSize: 0.15, bevelThickness: 0.15
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.z = ownZStart;
            mesh.castShadow = true; mesh.receiveShadow = true;
            layerGroup.add(mesh);
          });
        });
      }

      // Fit and center layer
      const svgW = studioState.analysis.width || 1536;
      const svgH = studioState.analysis.height || 1024;
      const scale = totalW_mm / svgW;

      layerGroup.scale.set(scale, -scale, 1);
      layerGroup.position.set(-totalW_mm / 2, (svgH * scale) / 2, 0);

      layerGroup.userData = {
        baseZ: 0,
        layerIndex: idx,
        name: layer.name
      };

      threeRootGroup.add(layerGroup);
      threeLayerMeshes.push(layerGroup);
    });

    // Detect if any non-base layer has compound paths (inner M-subpaths = text/holes)
    // These will be exported as raised-text STL layers by blender_processor.py
    studioState.raisedTextDetected = studioState.layers.some((lyr, lIdx) => {
      if (lIdx === 0 || lyr.role === 'base') return false;
      return (lyr.paths || []).some(rawD => (rawD.match(/[Mm][^Mm]+/g) || []).length > 1);
    });

    // Auto-center root group in the viewport
    const box = new THREE.Box3().setFromObject(threeRootGroup);
    const center = box.getCenter(new THREE.Vector3());
    threeRootGroup.position.x = -center.x;
    threeRootGroup.position.y = -center.y;

    // Adjust camera to frame model nicely
    const maxDim = Math.max(totalW_mm, totalH_mm);
    threeCamera.position.set(0, -maxDim * 1.15, maxDim * 1.05);
    threeControls.target.set(0, 0, totalThick_mm / 2);
    threeControls.update();

    applyThreeExplode();
    // Re-render layer panel so "White Text (Raised)" row is added/removed dynamically
    renderLayersList();
    showThreeLoading(false);
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
  btnExportZip.addEventListener('click', () => triggerExport('zip'));
  btnExportBlend.addEventListener('click', () => triggerExport('blend'));
  btnExportCombined.addEventListener('click', () => triggerExport('combined'));
  btnViewGuide.addEventListener('click', () => openFilamentGuide());

  async function triggerExport(format) {
    if (!studioState.svg || studioState.layers.length === 0) return;

    btnExportZip.classList.add('loading');
    btnExportZip.disabled = true;
    studioExportStatus.classList.remove('hidden');
    studioExportStatus.innerHTML = '<span class="spinner"></span> Running Blender headless engine to export STLs & scene...';

    try {
      const payload = {
        svg: studioState.svg,
        job_name: studioState.jobName,
        fixed_width_mm: studioState.fixedWidthMm,
        total_height_mm: studioState.totalThicknessMm,
        layers: studioState.layers,
        solid_base: studioState.solidBase
      };

      const res = await fetch('/api/3d/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Blender processing failed');
      }

      const result = await res.json();
      studioState.lastExportResult = result;

      // Build direct download links for all generated files
      let linksHtml = '<div class="export-download-links">';
      linksHtml += '<div class="export-download-title">📥 Direct File Downloads:</div>';
      
      if (result.bambu_3mf && result.downloadUrls && result.downloadUrls.bambu3mf) {
        linksHtml += `<a class="export-dl-chip export-dl-chip-featured" href="${result.downloadUrls.bambu3mf}" download="${result.bambu_3mf}" style="border-color:#10b981;background:rgba(16,185,129,0.12);">
          <span><span class="dl-icon">🚀</span><strong>Bambu Studio Multi-Color Project</strong> (${result.bambu_3mf})</span>
          <span style="color:#10b981;font-weight:600;">⬇ Download .3MF</span>
        </a>`;
      }

      if (result.combined_stl) {
        linksHtml += `<a class="export-dl-chip" href="${result.downloadUrls.combinedStl}" download="${result.combined_stl}">
          <span><span class="dl-icon">🖨️</span><strong>Combined 150mm STL</strong> (${result.combined_stl})</span>
          <span>⬇ Download .STL</span>
        </a>`;
      }

      if (result.layers && Array.isArray(result.layers)) {
        result.layers.forEach(l => {
          if (l.stl_file) {
            const dlUrl = l.downloadUrl || `/api/3d/download?jobId=${result.jobId}&file=${encodeURIComponent(l.stl_file)}`;
            linksHtml += `<a class="export-dl-chip" href="${dlUrl}" download="${l.stl_file}">
              <span><span class="dl-icon">🎨</span><strong>${l.name}</strong> (${l.stl_file})</span>
              <span>⬇ Download</span>
            </a>`;
          }
        });
      }

      if (result.zip_file) {
        linksHtml += `<a class="export-dl-chip" href="${result.downloadUrls.zip}" download="${result.zip_file}">
          <span><span class="dl-icon">📦</span><strong>BambuLab Complete Package</strong> (.ZIP)</span>
          <span>⬇ Download .ZIP</span>
        </a>`;
      }

      linksHtml += `
      <div style="margin-top:12px;font-size:0.83rem;line-height:1.45;color:var(--text-muted);background:rgba(255,255,255,0.03);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
        💡 <strong>How to Print in Bambu Studio:</strong><br>
        • <strong>Option 1 (Instant Multi-Color):</strong> Open the <code>.3MF</code> file directly in Bambu Studio — all parts and colors appear pre-configured on the plate!<br>
        • <strong>Option 2 (Multi-Part):</strong> Drag the individual layer STLs into Bambu Studio together and select <em>"Load as single object with multiple parts"</em>.<br>
        • <strong>Option 3 (Layer Swaps):</strong> Slice the <code>Combined_150mm.stl</code> and add pauses at 2.70mm & 2.85mm (see Guide).
      </div>
      `;

      linksHtml += '</div>';

      studioExportStatus.innerHTML = `✓ <strong>Export Complete!</strong> Built 150mm model in Blender with ${result.layers.length} sequential layers.${linksHtml}`;

      // Trigger requested download with clean anchor tag and download attribute
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
        triggerDownload(result.downloadUrls.zip, result.zip_file);
      } else if (format === 'blend') {
        triggerDownload(result.downloadUrls.blend, result.blend_file);
      } else if (format === 'combined') {
        triggerDownload(result.downloadUrls.combinedStl, result.combined_stl);
      }
    } catch (err) {
      studioExportStatus.innerHTML = `✕ <strong>Export Error:</strong> ${err.message}`;
    } finally {
      btnExportZip.classList.remove('loading');
      btnExportZip.disabled = false;
    }
  }

  async function openFilamentGuide() {
    if (studioState.lastExportResult && studioState.lastExportResult.downloadUrls) {
      try {
        const res = await fetch(studioState.lastExportResult.downloadUrls.guide);
        if (res.ok) {
          const text = await res.text();
          showGuideModal(text);
          return;
        }
      } catch (e) {}
    }

    // Generate in-browser guide preview
    let guide = `============================================================\n`;
    guide += `  FDM 3D PRINTING GUIDE: ${studioState.jobName}\n`;
    guide += `============================================================\n\n`;
    guide += `DIMENSIONS:\n`;
    guide += `  * Fixed Width: ${studioState.fixedWidthMm.toFixed(1)} mm\n`;
    guide += `  * Proportional Height: ${studioState.proportionalHeightMm.toFixed(2)} mm\n`;
    guide += `  * Total Thickness: ${studioState.totalThicknessMm.toFixed(2)} mm\n\n`;
    guide += `------------------------------------------------------------\n`;
    guide += `MULTI-MATERIAL PRINTING (Bambu Studio / OrcaSlicer / PrusaSlicer):\n`;
    guide += `  1. Drag and drop all individual layer STLs into Bambu Studio simultaneously.\n`;
    guide += `  2. When prompted 'Load these files as a single object with multiple parts?', click YES.\n`;
    guide += `  3. Assign each part to its corresponding filament slot (AMS / Spool).\n\n`;
    guide += `------------------------------------------------------------\n`;
    guide += `SINGLE EXTRUDER MANUAL FILAMENT SWAPS (Layer Pauses):\n`;

    let curZ = 0;
    studioState.layers.forEach((l, i) => {
      const thick = l.thicknessMm !== undefined ? l.thicknessMm : ((l.heightPct / 100.0) * studioState.totalThicknessMm);
      const pauseNote = i === 0 ? " (INITIAL FILAMENT)" : ` -> PAUSE PRINTER AT Z = ${curZ.toFixed(2)} mm AND SWAP FILAMENT`;
      guide += `  [Layer ${i+1}] ${l.name} (${l.color})\n`;
      guide += `    - Z-Range: ${curZ.toFixed(2)} mm to ${(curZ + thick).toFixed(2)} mm (Height: ${thick.toFixed(2)} mm)\n`;
      guide += `    - Action: ${pauseNote}\n\n`;
      curZ += thick;
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
