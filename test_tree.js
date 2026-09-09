const fs = require('fs');
const { extractVectorImage } = require('./extractor');

async function testHierarchy() {
  const res = await extractVectorImage('https://vectorizer.ai/images/1788848214397-9ab9555d7ad0bc29-1c7a7413fd66e392f4b7d8c9b60fcefa61223420e1077107eb9519ea6749809f/edit');
  console.log('Shapes:', res.shapeCount, 'Loops:', res.loopCount);
}

testHierarchy();
