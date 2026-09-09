const fs = require('fs');

// Test cutout path generation
function getShapePathWithCutouts(shape) {
  let dList = [];
  
  // 1. Add shape's own loops
  for (let loop of shape.vectorLoopsToDraw) {
    if (!loop || !loop.curveLoop) continue;
    const p = loop.curveLoop.toSvgPath();
    if (p) dList.push(p);

    // 2. If this loop has child shapes, subtract them by adding their outer loops!
    if (loop.childShapes && loop.childShapes.length > 0) {
      for (let child of loop.childShapes) {
        if (!child || !child.vectorLoopsToDraw) continue;
        for (let childLoop of child.vectorLoopsToDraw) {
          if (childLoop && childLoop.isPositive && childLoop.curveLoop) {
            const childP = childLoop.curveLoop.toSvgPath();
            if (childP) dList.push(childP);
          }
        }
      }
    }
  }

  return dList.join(' ');
}

console.log('Cutout function defined');
