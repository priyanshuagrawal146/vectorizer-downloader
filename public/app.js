document.addEventListener('DOMContentLoaded', () => {
  // Elements
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

  // Sample URL button
  sampleBtn.addEventListener('click', () => {
    urlInput.value = SAMPLE_URL;
    urlInput.focus();
  });

  // Paste from clipboard button
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

  // Form Submit / Extraction Handler
  extractForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    startExtraction(url);
  });

  function startExtraction(url) {
    const groupBy = document.querySelector('input[name="groupByOption"]:checked')?.value || 'none';

    // Reset UI
    errorContainer.classList.add('hidden');
    resultSection.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    updateProgress(0, 'Connecting to Vectorizer.ai stream...');
    resetSteps();

    // Connect via Server-Sent Events (SSE)
    const eventSource = new EventSource(`/api/extract-stream?url=${encodeURIComponent(url)}&groupBy=${groupBy}`);

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        updateProgress(data.percent || 0, data.message || 'Processing...');
        updateStepState(data.stage);
      } catch (err) {}
    });

    eventSource.addEventListener('complete', (e) => {
      try {
        const result = JSON.parse(e.data);
        eventSource.close();
        handleSuccess(result);
      } catch (err) {
        handleError('Failed to parse vector result');
      }
    });

    eventSource.addEventListener('error', (e) => {
      eventSource.close();
      try {
        const data = JSON.parse(e.data);
        handleError(data.message || 'Connection to Vectorizer stream failed');
      } catch (err) {
        handleError('Network error connecting to stream');
      }
    });
  }

  function updateProgress(percent, message) {
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressStatus.textContent = message;
  }

  function updateStepState(stage) {
    const steps = {
      'metadata': 'step-meta',
      'connecting': 'step-ws',
      'streaming': 'step-chunks',
      'compiling': 'step-compile'
    };

    const stepId = steps[stage];
    if (stepId) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      const activeStep = document.getElementById(stepId);
      if (activeStep) activeStep.classList.add('active');
    }
  }

  function resetSteps() {
    document.querySelectorAll('.step').forEach(s => {
      s.classList.remove('active', 'done');
    });
  }

  function handleSuccess(result) {
    currentResult = result;
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
    progressContainer.classList.add('hidden');
    document.querySelectorAll('.step').forEach(s => s.classList.add('done'));

    // Populate Results
    resultFilename.textContent = result.filename;
    svgContainer.innerHTML = result.svg;

    // Extract colors from SVG
    const colors = extractSvgColors(result.svg);

    // Stats
    statDims.textContent = `${result.width} × ${result.height}`;
    statShapes.textContent = result.shapeCount;
    statLoops.textContent = result.loopCount;
    statColors.textContent = colors.length || result.colorCount;
    statSize.textContent = `${(result.svg.length / 1024).toFixed(1)} KB`;
    statTime.textContent = `${(result.durationMs / 1000).toFixed(2)}s`;

    // Render palette swatches
    paletteSwatches.innerHTML = '';
    colors.forEach(col => {
      const swatch = document.createElement('div');
      swatch.className = 'swatch-pill';
      swatch.style.backgroundColor = col;
      swatch.title = `Click to copy: ${col}`;
      swatch.addEventListener('click', () => {
        navigator.clipboard.writeText(col);
        showToast(`Copied ${col}`);
      });
      paletteSwatches.appendChild(swatch);
    });

    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth' });

    // Save to local history
    saveToHistory(result);
  }

  function handleError(msg) {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
    progressContainer.classList.add('hidden');
    errorContainer.classList.remove('hidden');
    errorMessage.textContent = msg;
  }

  function extractSvgColors(svgStr) {
    const matches = svgStr.match(/fill="([^"]+)"/g) || [];
    const set = new Set();
    matches.forEach(m => {
      const col = m.replace('fill="', '').replace('"', '');
      if (col && col !== 'none' && col !== 'transparent') {
        set.add(col);
      }
    });
    return Array.from(set);
  }

  // Export & Download Actions
  downloadSvgBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const blob = new Blob([currentResult.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Download High-Res PNG (4x rasterization via Canvas)
  downloadPngBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const scale = 4; // 4x high resolution
    const canvas = document.createElement('canvas');
    canvas.width = currentResult.width * scale;
    canvas.height = currentResult.height * scale;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    const svgBlob = new Blob([currentResult.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const pngName = currentResult.filename.replace(/\.svg$/, '@4x.png');
        a.href = pngUrl;
        a.download = pngName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    };
    img.src = url;
  });

  // Copy SVG Code
  copySvgBtn.addEventListener('click', async () => {
    if (!currentResult) return;
    try {
      await navigator.clipboard.writeText(currentResult.svg);
      copyBtnText.textContent = 'Copied to Clipboard!';
      copySvgBtn.classList.add('active');
      setTimeout(() => {
        copyBtnText.textContent = 'Copy SVG Code';
        copySvgBtn.classList.remove('active');
      }, 2000);
    } catch (e) {
      alert('Failed to copy SVG');
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

  // Wireframe toggle
  toggleWireframe.addEventListener('click', () => {
    toggleWireframe.classList.toggle('active');
    svgContainer.classList.toggle('wireframe');
  });

  // Zoom controls
  resetZoomBtn.addEventListener('click', () => {
    zoomLevel = 1;
    svgContainer.style.transform = `scale(1)`;
  });

  viewportContainer.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      zoomLevel = Math.max(0.2, Math.min(5, zoomLevel + delta));
      svgContainer.style.transform = `scale(${zoomLevel})`;
    }
  });

  // Local History Management
  const STORAGE_KEY = 'vectorizer_extraction_history';

  function saveToHistory(item) {
    try {
      let history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      history = history.filter(h => h.token !== item.token);
      history.unshift({
        token: item.token,
        filename: item.filename,
        width: item.width,
        height: item.height,
        shapeCount: item.shapeCount,
        svg: item.svg,
        timestamp: Date.now()
      });
      // Keep last 8 items
      if (history.length > 8) history = history.slice(0, 8);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      renderHistory();
    } catch (e) {}
  }

  function renderHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (history.length === 0) {
        historySection.classList.add('hidden');
        return;
      }

      historySection.classList.remove('hidden');
      historyList.innerHTML = '';

      history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
          <div class="history-thumb">${item.svg}</div>
          <div class="history-info">
            <span class="history-name" title="${item.filename}">${item.filename}</span>
            <span class="history-meta">${item.width}×${item.height} • ${item.shapeCount} shapes</span>
          </div>
        `;
        card.addEventListener('click', () => {
          handleSuccess({
            svg: item.svg,
            filename: item.filename,
            token: item.token,
            width: item.width,
            height: item.height,
            shapeCount: item.shapeCount,
            loopCount: '—',
            colorCount: '—',
            durationMs: 0
          });
        });
        historyList.appendChild(card);
      });
    } catch (e) {}
  }

  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
  });

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '2rem';
    toast.style.right = '2rem';
    toast.style.background = 'rgba(18, 22, 34, 0.9)';
    toast.style.backdropFilter = 'blur(12px)';
    toast.style.border = '1px solid var(--primary)';
    toast.style.color = '#fff';
    toast.style.padding = '0.75rem 1.25rem';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '0.875rem';
    toast.style.fontWeight = '500';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
    toast.style.zIndex = '9999';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 1800);
  }

  // Initial load
  renderHistory();
});
