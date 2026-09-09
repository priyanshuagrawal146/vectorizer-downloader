#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { extractVectorImage } = require('./extractor');

const args = process.argv.slice(2);
let input = null;
let customOutput = null;
let groupBy = 'none';

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--group-by=color' || arg === '--group-by-color' || arg === '--color') {
    groupBy = 'color';
  } else if ((arg === '--group-by' || arg === '-g') && args[i + 1]) {
    groupBy = args[i + 1];
    i++;
  } else if (!input) {
    input = arg;
  } else if (!customOutput) {
    customOutput = arg;
  }
}

if (!input) {
  console.log(`
\x1b[1;36mVectorizer.AI Vector SVG Extractor\x1b[0m
====================================
Usage:
  node cli.js <URL_OR_TOKEN> [output_file.svg] [options]

Options:
  --group-by=color, -g color    Group SVG paths by color (<g fill="#...">)

Examples:
  node cli.js https://vectorizer.ai/images/1788848214397-9ab9555d7ad0bc29-.../edit
  node cli.js "https://vectorizer.ai/images/..." my_logo.svg --group-by=color
`);
  process.exit(1);
}

console.log(`\n\x1b[1;35m🚀 Starting Vectorizer.AI Extraction...\x1b[0m`);
console.log(`\x1b[90mTarget   : ${input}\x1b[0m`);
console.log(`\x1b[90mGrouping : ${groupBy}\x1b[0m\n`);

let lastPercent = 0;
function renderProgressBar(percent, message) {
  const barLength = 30;
  const filled = Math.round((percent / 100) * barLength);
  const empty = barLength - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  process.stdout.write(`\r\x1b[1;34m[${bar}]\x1b[0m \x1b[1;33m${percent}%\x1b[0m \x1b[90m${message.padEnd(45)}\x1b[0m`);
}

extractVectorImage(input, { groupBy }, (progress) => {
  renderProgressBar(progress.percent, progress.message);
})
  .then(result => {
    renderProgressBar(100, 'Complete!');
    console.log('\n');

    let outPath = customOutput;
    if (!outPath) {
      outPath = path.join(process.cwd(), result.filename);
    } else if (!outPath.endsWith('.svg')) {
      outPath += '.svg';
    }

    fs.writeFileSync(outPath, result.svg, 'utf8');

    // Also copy to ~/Downloads if exists
    const downloadsDir = path.join(os.homedir(), 'Downloads');
    let downloadsPath = null;
    if (fs.existsSync(downloadsDir)) {
      downloadsPath = path.join(downloadsDir, path.basename(outPath));
      try {
        fs.writeFileSync(downloadsPath, result.svg, 'utf8');
      } catch (e) {}
    }

    console.log(`\x1b[1;32m✓ SVG Extraction Successful!\x1b[0m`);
    console.log(`----------------------------------------`);
    console.log(`📐 Dimensions : ${result.width} x ${result.height} px`);
    console.log(`🔷 Shapes     : ${result.shapeCount}`);
    console.log(`🔄 Loops      : ${result.loopCount}`);
    console.log(`🎨 Colors     : ${result.colorCount}`);
    console.log(`⚡ Duration   : ${(result.durationMs / 1000).toFixed(2)}s`);
    console.log(`📦 Size       : ${(result.svg.length / 1024).toFixed(1)} KB`);
    console.log(`----------------------------------------`);
    console.log(`📁 Saved to   : \x1b[1;36m${outPath}\x1b[0m`);
    if (downloadsPath) {
      console.log(`📥 Downloads  : \x1b[1;36m${downloadsPath}\x1b[0m`);
    }
    console.log('');
  })
  .catch(err => {
    console.log('\n');
    console.error(`\x1b[1;31m✗ Extraction Failed:\x1b[0m`, err.message);
    process.exit(1);
  });
