# Vectorizer.AI SVG Extractor & Downloader

Extract full-resolution vector SVGs directly from Vectorizer.ai preview sessions by decoding the raw WebSocket geometry stream (all Bézier curves, arcs, lines, loops, and color palettes).

---

## 🌟 Quick Start

### 1. Web UI (Interactive Browser App)

Start the local web server:
```bash
cd /Users/priyanshuagrawal/.gemini/antigravity-ide/scratch/vectorizer-downloader
node server.js
```
Open **[http://localhost:3847](http://localhost:3847)** in your browser.

**Features:**
* **Instant URL / Token Paste**: Paste any `vectorizer.ai/images/.../edit` link or token.
* **Live SSE Progress**: Real-time progress bar streaming vector chunks.
* **Interactive Vector Canvas**: Zoom, pan, dark/light grid, checkerboard, and wireframe mode.
* **Export Options**: 
  * Download Scalable **`.svg`**
  * Export High-Res **`.png`** (4x crystal rasterization)
  * Copy raw SVG XML code to clipboard
* **Color Palette Inspector**: Click any color swatch to copy its Hex code.
* **Local History**: Revisit and re-download past conversions.

---

### 2. CLI Tool (Terminal / Scripts)

You can extract an SVG directly from the command line:

```bash
# Basic usage (saves to current folder & ~/Downloads)
node /Users/priyanshuagrawal/.gemini/antigravity-ide/scratch/vectorizer-downloader/cli.js "https://vectorizer.ai/images/1788848214397-9ab9555d7ad0bc29-1c7a7413fd66e392f4b7d8c9b60fcefa61223420e1077107eb9519ea6749809f/edit"

# Custom output file
node /Users/priyanshuagrawal/.gemini/antigravity-ide/scratch/vectorizer-downloader/cli.js "https://vectorizer.ai/images/..." my_logo.svg
```

---

## 📁 Project Structure

* `extractor.js` — Core streaming engine, binary buffer reader, and SVG geometry compiler.
* `cli.js` — Command-line interface with animated progress bar and auto-download.
* `server.js` — Lightweight HTTP & SSE server.
* `public/` — Web application frontend (`index.html`, `style.css`, `app.js`).
