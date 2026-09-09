const fs = require('fs');
const spec = JSON.parse(fs.readFileSync('/Users/priyanshuagrawal/.gemini/antigravity-ide/brain/3a9fde05-6173-4444-9e56-235d3aeec052/scratch/spec.json'));
const { extractVectorImage } = require('./extractor');

// Let's inspect the shapes and their loops
const chunks = [];
for (let i = 1; i <= 13; i++) {
  const buf = fs.readFileSync(`/Users/priyanshuagrawal/.gemini/antigravity-ide/brain/3a9fde05-6173-4444-9e56-235d3aeec052/scratch/chunk_${i}.bin`);
  chunks.push(buf);
}

console.log('Loaded chunks:', chunks.length);
