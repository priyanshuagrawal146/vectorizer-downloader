const http = require('http');
const fs = require('fs');
const path = require('path');
const { extractVectorImage } = require('./extractor');

const PORT = process.env.PORT || 3847;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.stl': 'model/stl',
  '.3mf': 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
  '.zip': 'application/zip',
  '.blend': 'application/x-blender',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS headers for development flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API: Extract with Server-Sent Events (SSE) for real-time progress
  if (pathname === '/api/extract-stream' && req.method === 'GET') {
    const inputUrl = parsedUrl.searchParams.get('url');
    const groupBy = parsedUrl.searchParams.get('groupBy') || 'none';
    if (!inputUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing "url" parameter' }));
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    const sendSSE = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendSSE('progress', { stage: 'init', percent: 2, message: 'Initializing extractor...' });
      const result = await extractVectorImage(inputUrl, { groupBy }, (progress) => {
        sendSSE('progress', progress);
      });
      sendSSE('complete', result);
    } catch (err) {
      sendSSE('error', { message: err.message || 'Extraction failed' });
    } finally {
      res.end();
    }
    return;
  }

  // API: Direct JSON extract (POST)
  if (pathname === '/api/extract' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url, groupBy = 'none' } = JSON.parse(body || '{}');
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing "url" in request body' }));
        }

        const result = await extractVectorImage(url, { groupBy });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Extraction failed' }));
      }
    });
    return;
  }

  // API: Analyze SVG Layers for 3D FDM Nameplate
  if (pathname === '/api/3d/analyze' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { svg, removeBackground = true } = JSON.parse(body || '{}');
        if (!svg) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing "svg" parameter' }));
        }
        const { analyzeSvgLayers } = require('./layer_analyzer');
        const analysis = analyzeSvgLayers(svg, { removeBackground });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(analysis));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Analysis failed' }));
      }
    });
    return;
  }

  // API: Generate 3D STLs, .blend, and BambuLab package via Blender
  if (pathname === '/api/3d/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const {
          svg,
          job_name = 'Nameplate',
          fixed_width_mm = 150.0,
          total_height_mm = 10.0,
          layers = [],
          solid_base = true
        } = JSON.parse(body || '{}');

        if (!layers || layers.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'No layers provided' }));
        }

        const { analyzeSvgLayers, generateLayerSvg } = require('./layer_analyzer');
        const { execSync } = require('child_process');

        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const jobsDir = path.join(__dirname, 'jobs', jobId);
        fs.mkdirSync(jobsDir, { recursive: true });

        // Generate individual layer SVGs
        const layerConfigs = [];
        let analysis = null;
        if (svg) {
          try { analysis = analyzeSvgLayers(svg); } catch (e) {}
        }

        const viewBox = analysis ? analysis.viewBox : '0 0 1536 1024';
        const width = analysis ? analysis.width : 1536;
        const height = analysis ? analysis.height : 1024;

        for (let i = 0; i < layers.length; i++) {
          const layer = layers[i];
          const isBase = (layer.role === 'base' || i === 0);

          let layerForSvg = layer;
          if (isBase && solid_base) {
            // When solid_base is enabled, union paths from all layers so the base foundation
            // spans the full outer silhouette (matching the browser 3D preview) without gaps or missing perimeter walls.
            const structuralPaths = [];
            (layers || [layer]).forEach(l => {
              (l.paths || []).forEach(p => structuralPaths.push(p));
            });
            layerForSvg = {
              ...layer,
              paths: structuralPaths.length > 0 ? structuralPaths : layer.paths
            };
          }

          const layerSvg = generateLayerSvg(layerForSvg, viewBox, width, height, isBase);
          const svgFilename = `${layer.id || `layer_${i+1}`}.svg`;
          const layerSvgPath = path.join(jobsDir, svgFilename);
          fs.writeFileSync(layerSvgPath, layerSvg, 'utf8');

          layerConfigs.push({
            id: layer.id || `layer_${i+1}`,
            name: layer.name || `Layer ${i+1}`,
            role: layer.role || (i === 0 ? 'base' : 'mid'),
            color_hex: layer.color || '#888888',
            thickness_mm: parseFloat(layer.thicknessMm !== undefined ? layer.thicknessMm : (((layer.heightPct || 15) / 100.0) * total_height_mm)),
            height_pct: parseFloat(layer.heightPct || 15),
            svg_path: layerSvgPath
          });
        }

        const jobConfig = {
          fixed_width_mm: parseFloat(fixed_width_mm || 150.0),
          total_height_mm: parseFloat(total_height_mm || 10.0),
          job_name: job_name.replace(/[^a-zA-Z0-9_-]/g, '_'),
          output_dir: jobsDir,
          layers: layerConfigs
        };

        const configPath = path.join(jobsDir, 'job_config.json');
        fs.writeFileSync(configPath, JSON.stringify(jobConfig, null, 2), 'utf8');

        // Run Blender Headless Engine directly
        const blenderBin = process.env.BLENDER_BIN || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
        const scriptPath = path.join(__dirname, 'blender_processor.py');
        const { execFileSync } = require('child_process');

        try {
          execFileSync(blenderBin, ['--background', '--python', scriptPath, '--', '--config', configPath], {
            cwd: __dirname,
            encoding: 'utf8',
            timeout: 180000
          });
        } catch (blenderErr) {
          console.error('Blender execution error:', blenderErr.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            error: `3D Generation requires Blender. Could not execute '${blenderBin}': ${blenderErr.message}`
          }));
        }

        const resultJsonPath = path.join(jobsDir, 'result.json');
        if (!fs.existsSync(resultJsonPath)) {
          throw new Error('Blender did not output result.json');
        }

        const result = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
        result.jobId = jobId;
        result.downloadUrls = {
          bambu3mf: result.bambu_3mf ? `/api/3d/download?jobId=${jobId}&file=${encodeURIComponent(result.bambu_3mf)}` : null,
          zip: `/api/3d/download?jobId=${jobId}&file=${encodeURIComponent(result.zip_file)}`,
          blend: `/api/3d/download?jobId=${jobId}&file=${encodeURIComponent(result.blend_file)}`,
          combinedStl: `/api/3d/download?jobId=${jobId}&file=${encodeURIComponent(result.combined_stl)}`,
          guide: `/api/3d/download?jobId=${jobId}&file=Filament_Swap_Guide.txt`
        };

        if (result.layers && Array.isArray(result.layers)) {
          result.layers.forEach(l => {
            if (l.stl_file) {
              l.downloadUrl = `/api/3d/download?jobId=${jobId}&file=${encodeURIComponent(l.stl_file)}`;
            }
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('Generation error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Generation failed' }));
      }
    });
    return;
  }

  // API: Download generated file
  if (pathname === '/api/3d/download' && req.method === 'GET') {
    const jobId = parsedUrl.searchParams.get('jobId');
    const filename = parsedUrl.searchParams.get('file');
    if (!jobId || !filename || filename.includes('..') || jobId.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Invalid download parameters');
    }

    const filePath = path.join(__dirname, 'jobs', jobId, filename);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9_.-]/g, '_');

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // API: Preload sample nameplate
  if (pathname === '/api/3d/sample' && req.method === 'GET') {
    const samplePath = path.join(__dirname, '../ChatGPT_Image_vectorized.svg');
    if (fs.existsSync(samplePath)) {
      const svg = fs.readFileSync(samplePath, 'utf8');
      const { analyzeSvgLayers } = require('./layer_analyzer');
      const analysis = analyzeSvgLayers(svg, { removeBackground: true });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ svg, analysis, name: 'Sunil_Malviya_Nameplate' }));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Sample not found' }));
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
\x1b[1;32m✓ Vectorizer SVG UI Server Running!\x1b[0m
----------------------------------------
🌐 Local URL : \x1b[1;36mhttp://localhost:${PORT}\x1b[0m
📁 UI Root   : ${PUBLIC_DIR}
----------------------------------------
Press Ctrl+C to stop.
`);
});
