const fs = require('fs');
const path = require('path');

/**
 * Parses path data 'd' into subpaths (each starting with M/m)
 */
function splitSubpaths(d) {
  if (!d) return [];
  const subpaths = [];
  const regex = /([Mm][^Mm]+)/g;
  let match;
  while ((match = regex.exec(d)) !== null) {
    subpaths.push(match[1].trim());
  }
  return subpaths;
}

/**
 * Approximate bounding box of an SVG path 'd' string
 */
function getApproxBBox(d) {
  if (!d) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, area: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  function addPoint(x, y) {
    if (isNaN(x) || isNaN(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const tokens = d.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!tokens) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, area: 0 };

  let curCmd = 'M';
  let curX = 0, curY = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (/^[a-zA-Z]$/.test(tok)) {
      curCmd = tok;
    } else {
      const val = parseFloat(tok);
      const isRel = curCmd === curCmd.toLowerCase();
      const cmd = curCmd.toUpperCase();

      if (cmd === 'M' || cmd === 'L') {
        const x = isRel ? curX + val : val;
        i++;
        if (i < tokens.length) {
          const y = parseFloat(tokens[i]);
          const realY = isRel ? curY + y : y;
          curX = x; curY = realY;
          addPoint(curX, curY);
        }
      } else if (cmd === 'H') {
        curX = isRel ? curX + val : val;
        addPoint(curX, curY);
      } else if (cmd === 'V') {
        curY = isRel ? curY + val : val;
        addPoint(curX, curY);
      } else if (cmd === 'C') {
        if (i + 5 < tokens.length) {
          const endX = parseFloat(tokens[i+4]);
          const endY = parseFloat(tokens[i+5]);
          curX = isRel ? curX + endX : endX;
          curY = isRel ? curY + endY : endY;
          addPoint(curX, curY);
          i += 5;
        }
      } else if (cmd === 'Q') {
        if (i + 3 < tokens.length) {
          const endX = parseFloat(tokens[i+2]);
          const endY = parseFloat(tokens[i+3]);
          curX = isRel ? curX + endX : endX;
          curY = isRel ? curY + endY : endY;
          addPoint(curX, curY);
          i += 3;
        }
      } else if (cmd === 'A') {
        if (i + 6 < tokens.length) {
          const endX = parseFloat(tokens[i+5]);
          const endY = parseFloat(tokens[i+6]);
          curX = isRel ? curX + endX : endX;
          curY = isRel ? curY + endY : endY;
          addPoint(curX, curY);
          i += 6;
        }
      }
    }
  }

  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, area: 0 };
  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  return { minX, minY, maxX, maxY, width, height, area: width * height };
}

/**
 * Test if a path is a flat full-canvas background or framing card rectangle
 */
function isBackgroundPath(d, bbox, canvasWidth, canvasHeight) {
  if (!bbox || bbox.width === 0 || bbox.height === 0) return false;
  const canvasArea = canvasWidth * canvasHeight;
  const areaRatio = bbox.area / canvasArea;
  const coversEdges = (bbox.minX <= canvasWidth * 0.05) &&
                      (bbox.minY <= canvasHeight * 0.05) &&
                      (bbox.maxX >= canvasWidth * 0.95) &&
                      (bbox.maxY >= canvasHeight * 0.95);
  return coversEdges && areaRatio >= 0.80;
}

/**
 * Calculate Euclidean RGB distance between two hex colors
 */
function colorDistance(hex1, hex2) {
  const parseRgb = (hex) => {
    hex = hex.replace('#', '');
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

/**
 * Analyze SVG content and group by color & layer hierarchy
 */
function analyzeSvgLayers(svgContent, options = {}) {
  const removeBackground = options.removeBackground !== false;

  let viewBox = '0 0 1536 1024';
  let width = 1536;
  let height = 1024;

  const vbMatch = svgContent.match(/viewBox=[\"\']([^\"\']+)[\"\']/i);
  if (vbMatch) {
    viewBox = vbMatch[1];
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      width = parts[2];
      height = parts[3];
    }
  } else {
    const wMatch = svgContent.match(/width=[\"\']([0-9.]+)[\"\']/i);
    const hMatch = svgContent.match(/height=[\"\']([0-9.]+)[\"\']/i);
    if (wMatch && hMatch) {
      width = parseFloat(wMatch[1]);
      height = parseFloat(hMatch[1]);
      viewBox = `0 0 ${width} ${height}`;
    }
  }

  // Find all elements with fills (path, rect, circle, polygon, ellipse)
  const elemRegex = /<(path|rect|circle|polygon|ellipse)\b([^>]*)\/?>/gi;
  let match;
  const rawElements = [];
  let detectedBackground = null;

  function parseFill(attrs) {
    let fillMatch = attrs.match(/\bfill=[\"\']([^\"\']+)[\"\']/i);
    if (!fillMatch) {
      const styleMatch = attrs.match(/\bstyle=[\"\']([^\"\']+)[\"\']/i);
      if (styleMatch) {
        fillMatch = styleMatch[1].match(/\bfill\s*:\s*([^;\"\']+)/i);
      }
    }
    if (!fillMatch) return null;
    let fill = fillMatch[1].trim().toLowerCase();
    if (fill === 'none' || fill === 'transparent') return null;

    const rgbMatch = fill.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      fill = `#${r}${g}${b}`;
    }

    if (/^#[0-9a-f]{3}$/i.test(fill)) {
      fill = '#' + fill[1] + fill[1] + fill[2] + fill[2] + fill[3] + fill[3];
    }
    return fill;
  }

  while ((match = elemRegex.exec(svgContent)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const fill = parseFill(attrs) || '#000000';

    let d = '';
    if (tag === 'path') {
      const dMatch = attrs.match(/\bd=[\"\']([^\"\']+)[\"\']/i);
      if (dMatch) d = dMatch[1];
    } else if (tag === 'rect') {
      const x = parseFloat((attrs.match(/\bx=[\"\']([0-9.-]+)[\"\']/) || [0,0])[1]);
      const y = parseFloat((attrs.match(/\by=[\"\']([0-9.-]+)[\"\']/) || [0,0])[1]);
      const w = parseFloat((attrs.match(/\bwidth=[\"\']([0-9.-]+)[\"\']/) || [0,0])[1]);
      const h = parseFloat((attrs.match(/\bheight=[\"\']([0-9.-]+)[\"\']/) || [0,0])[1]);
      if (w > 0 && h > 0) {
        d = `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      }
    } else if (tag === 'circle') {
      const cx = parseFloat((attrs.match(/\bcx=[\"\']([0-9.-]+)[\"\']/) || [0,0])[1]);
      const cy = parseFloat((attrs.match(/\bcy=[\"\']([0-9.-]+)[\"\']/) || [0,0])[1]);
      const r = parseFloat((attrs.match(/\br=[\"\']([0-9.-]+)[\"\']/) || [0,0])[1]);
      if (r > 0) {
        d = `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
      }
    } else if (tag === 'polygon') {
      const pointsMatch = attrs.match(/\bpoints=[\"\']([^\"\']+)[\"\']/i);
      if (pointsMatch) {
        const pts = pointsMatch[1].trim().split(/[\s,]+/).map(Number);
        if (pts.length >= 4) {
          d = `M ${pts[0]} ${pts[1]}`;
          for (let i = 2; i < pts.length; i += 2) {
            d += ` L ${pts[i]} ${pts[i+1]}`;
          }
          d += ' Z';
        }
      }
    }

    if (!d) continue;

    const bbox = getApproxBBox(d);

    if (isBackgroundPath(d, bbox, width, height)) {
      detectedBackground = { color: fill, bbox, d };
      if (removeBackground) continue;
    }

    rawElements.push({ fill, d, bbox });
  }

  if (rawElements.length === 0) {
    return { viewBox, width, height, aspectRatio: width / height, layerCount: 0, layers: [], detectedBackground, backgroundRemoved: false, similarColorPairs: [] };
  }

  // Find max single shape area
  const maxSingleArea = Math.max(...rawElements.map(e => e.bbox.area));
  const tier0Threshold = maxSingleArea * 0.05;

  // 1. Identify Tier 1 compound glyphs (letters/details with inner hole subpaths)
  const tier1CompoundElements = [];
  rawElements.forEach(el => {
    if (el.bbox.area < tier0Threshold) {
      const subs = splitSubpaths(el.d);
      if (subs.length > 1) {
        // subpaths 1.. are inner hole contours of this glyph (e.g. 'O', 'R', 'P', 'B', 'D', 'A')
        const holeBBoxes = subs.slice(1).map(s => getApproxBBox(s));
        tier1CompoundElements.push({ el, holeBBoxes });
      }
    }
  });

  // 2. Identify counter-space / inner void filler paths:
  // If an element matches an inner hole contour of a Tier 1 glyph of a DIFFERENT color,
  // it is the background showing through the letter hole. It belongs to Tier 0 (base/panel tier),
  // NEVER to Tier 1 (Raised details)! Otherwise, it gets extruded flush with the text and fills the hole.
  const holeElementSet = new Set();
  rawElements.forEach(el => {
    if (el.bbox.area < tier0Threshold) {
      for (const compound of tier1CompoundElements) {
        if (compound.el !== el && compound.el.fill !== el.fill) {
          for (const hbb of compound.holeBBoxes) {
            if (Math.abs(hbb.minX - el.bbox.minX) < 2.5 &&
                Math.abs(hbb.minY - el.bbox.minY) < 2.5 &&
                Math.abs(hbb.maxX - el.bbox.maxX) < 2.5 &&
                Math.abs(hbb.maxY - el.bbox.maxY) < 2.5) {
              holeElementSet.add(el);
              break;
            }
          }
        }
        if (holeElementSet.has(el)) break;
      }
    }
  });

  // Classify details into Text (Tier 2) vs Artwork / Graphic Designs (Tier 1)
  const detailElements = rawElements.filter(el => el.bbox.area < tier0Threshold && !holeElementSet.has(el));
  const textSet = new Set();

  // 1. Horizontal Text Line Detection (e.g. SK LALU, TRAINING CENTRE, KARATE, CHIEF INSTRUCTOR...)
  for (let i = 0; i < detailElements.length; i++) {
    const a = detailElements[i];
    if (textSet.has(a)) continue;
    if (a.bbox.height < 6 || a.bbox.height > 220) continue;
    const aRatio = a.bbox.width / (a.bbox.height || 1);
    if (aRatio > 4.0 || aRatio < 0.08) continue;

    const linePeers = [a];
    for (let j = 0; j < detailElements.length; j++) {
      if (i === j) continue;
      const b = detailElements[j];
      if (b.bbox.height < 6 || b.bbox.height > 220) continue;
      const bRatio = b.bbox.width / (b.bbox.height || 1);
      if (bRatio > 4.0 || bRatio < 0.08) continue;

      const baseTol = Math.max(5, Math.min(a.bbox.height, b.bbox.height) * 0.16);
      const deltaBase = Math.abs(a.bbox.maxY - b.bbox.maxY);
      const deltaTop = Math.abs(a.bbox.minY - b.bbox.minY);
      const hRatio = b.bbox.height / (a.bbox.height || 1);

      if ((deltaBase <= baseTol || deltaTop <= baseTol) && hRatio >= 0.60 && hRatio <= 1.55) {
        linePeers.push(b);
      }
    }

    linePeers.sort((p1, p2) => p1.bbox.minX - p2.bbox.minX);

    let chain = [linePeers[0]];
    for (let k = 1; k < linePeers.length; k++) {
      const prev = chain[chain.length - 1];
      const cur = linePeers[k];
      const xGap = cur.bbox.minX - prev.bbox.maxX;
      const avgH = (prev.bbox.height + cur.bbox.height) / 2;
      const xOverlap = Math.min(prev.bbox.maxX, cur.bbox.maxX) - Math.max(prev.bbox.minX, cur.bbox.minX);
      const isStacked = xOverlap > 0.4 * Math.min(prev.bbox.width, cur.bbox.width);

      if (xGap >= -avgH * 0.25 && xGap <= avgH * 2.5 && !isStacked) {
        chain.push(cur);
      } else {
        checkLineChain(chain);
        chain = [cur];
      }
    }
    checkLineChain(chain);
  }

  function checkLineChain(chain) {
    if (chain.length >= 3) {
      const minX = Math.min(...chain.map(c => c.bbox.minX));
      const maxX = Math.max(...chain.map(c => c.bbox.maxX));
      const avgH = chain.reduce((acc, c) => acc + c.bbox.height, 0) / chain.length;
      if ((maxX - minX) >= avgH * 1.5) {
        chain.forEach(c => textSet.add(c));
      }
    } else if (chain.length >= 2) {
      const avgH = chain.reduce((acc, c) => acc + c.bbox.height, 0) / chain.length;
      if (avgH >= 35) {
        chain.forEach(c => textSet.add(c));
      }
    }
  }

  // 2. Arc text detection (circular badge text like INTERNATIONAL SHOTOKAN KARATE FEDERATION)
  for (let i = 0; i < detailElements.length; i++) {
    const a = detailElements[i];
    if (textSet.has(a)) continue;
    if (a.bbox.height >= 8 && a.bbox.height <= 55 && a.bbox.width >= 5 && a.bbox.width <= 55) {
      const cxa = (a.bbox.minX + a.bbox.maxX) / 2;
      const cya = (a.bbox.minY + a.bbox.maxY) / 2;
      let arcCount = 0;

      for (let j = 0; j < detailElements.length; j++) {
        if (i === j) continue;
        const b = detailElements[j];
        if (b.fill !== a.fill) continue;
        if (b.bbox.height >= 8 && b.bbox.height <= 55 && b.bbox.width >= 5 && b.bbox.width <= 55) {
          const cxb = (b.bbox.minX + b.bbox.maxX) / 2;
          const cyb = (b.bbox.minY + b.bbox.maxY) / 2;
          const dist = Math.hypot(cxa - cxb, cya - cyb);
          if (dist >= 10 && dist <= 45) {
            arcCount++;
          }
        }
      }
      if (arcCount >= 1) {
        textSet.add(a);
      }
    }
  }

  // Group elements into 3 Tiers:
  // Tier 0: Base Foundation (all non-text shapes of baseColor + hole filler counterspaces)
  // Tier 1: Design & Accents (all non-text shapes of each other color -> exactly 1 layer per color)
  // Tier 2: Raised Text Glyphs -> exactly 1 layer per color that has text

  // 1. Identify baseColor: color with highest total area
  const colorAreaMap = new Map();
  rawElements.forEach(el => {
    colorAreaMap.set(el.fill, (colorAreaMap.get(el.fill) || 0) + el.bbox.area);
  });
  let baseColor = null;
  let maxColorArea = -1;
  for (const [c, a] of colorAreaMap.entries()) {
    if (a > maxColorArea) {
      maxColorArea = a;
      baseColor = c;
    }
  }

  const tierBuckets = new Map();
  rawElements.forEach(el => {
    let tier = 1;
    const targetColor = el.fill;

    if (el.fill === baseColor) {
      // Base-colored elements:
      // Text glyphs (e.g. white text inside red banner) -> Tier 2 (Raised Text / Top)
      // Foundation backing plate & contours -> Tier 0 (Base Foundation / Base)
      if (textSet.has(el)) {
        tier = 2;
      } else {
        tier = 0;
      }
    } else {
      // Accent colors (Red, Black, Yellow, etc.):
      // All elements of this color (artwork, text like KARATE, lines, panels)
      // belong together in exactly ONE layer for this color.
      // They sit on the base foundation and are already embossed together!
      tier = 1;
    }

    const key = `T${tier}_${targetColor}`;
    if (!tierBuckets.has(key)) {
      tierBuckets.set(key, { tier, color: targetColor, paths: [], totalArea: 0, pathCount: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    }
    const b = tierBuckets.get(key);
    b.paths.push(el.d);
    b.totalArea += el.bbox.area;
    b.pathCount++;
    if (el.bbox.minX < b.minX) b.minX = el.bbox.minX;
    if (el.bbox.minY < b.minY) b.minY = el.bbox.minY;
    if (el.bbox.maxX > b.maxX) b.maxX = el.bbox.maxX;
    if (el.bbox.maxY > b.maxY) b.maxY = el.bbox.maxY;
  });

  const sortedBuckets = Array.from(tierBuckets.values()).sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.totalArea - a.totalArea;
  });

  const totalBuckets = sortedBuckets.length;
  const upperCount = Math.max(1, totalBuckets - 1);
  const minColorThickMm = 0.80;

  // Default step for upper color layers: minimum 0.80 mm
  const defaultStepMm = (totalBuckets === 1) ? 0 : Math.max(minColorThickMm, Math.min(1.50, parseFloat((3.00 / upperCount).toFixed(2))));
  // Sum of upper color layers
  const totalUpperThickness = (totalBuckets === 1) ? 0 : parseFloat((defaultStepMm * upperCount).toFixed(2));
  // Base layer absorbs remainder so total is fully 10.00 mm
  const baseThicknessMm = (totalBuckets === 1) ? 10.00 : Math.max(minColorThickMm, parseFloat((10.00 - totalUpperThickness).toFixed(2)));

  let cumulativeZ = 0;
  const assigned = sortedBuckets.map((bucket, index) => {
    let role = 'mid';
    let heightPct = 10;
    let thicknessMm = defaultStepMm;
    let name = `Layer ${index + 1}`;

    if (bucket.tier === 0 || index === 0) {
      role = 'base';
      thicknessMm = baseThicknessMm;
      name = 'Base Foundation';
    } else if (index === totalBuckets - 1) {
      role = (bucket.tier === 2) ? 'top' : 'mid';
      name = (bucket.tier === 2) ? `Raised Text (${bucket.color})` : `Artwork / Details (${bucket.color})`;
      const precedingUpperMm = parseFloat((defaultStepMm * (upperCount - 1)).toFixed(2));
      thicknessMm = Math.max(minColorThickMm, parseFloat((totalUpperThickness - precedingUpperMm).toFixed(2)));
    } else {
      role = 'mid';
      name = (bucket.tier === 2) ? `Raised Details (${bucket.color})` : `Artwork / Details (${bucket.color})`;
      thicknessMm = defaultStepMm;
    }

    const zStartMm = parseFloat(cumulativeZ.toFixed(2));
    const zEndMm = parseFloat((cumulativeZ + thicknessMm).toFixed(2));
    cumulativeZ = zEndMm;

    const w = bucket.maxX > bucket.minX ? bucket.maxX - bucket.minX : 0;
    const h = bucket.maxY > bucket.minY ? bucket.maxY - bucket.minY : 0;
    const bboxArea = w * h;

    return {
      index,
      id: `layer_${index + 1}`,
      name,
      role,
      tier: bucket.tier,
      color: bucket.color,
      thicknessMm,
      zStartMm,
      zEndMm,
      heightPct,
      pathCount: bucket.pathCount,
      subpathCount: bucket.paths.length,
      bbox: { minX: bucket.minX, minY: bucket.minY, maxX: bucket.maxX, maxY: bucket.maxY, width: w, height: h, bboxArea },
      paths: bucket.paths
    };
  });

  const totalCalculatedHeight = cumulativeZ || 10.00;
  assigned.forEach(l => {
    l.heightPct = parseFloat(((l.thicknessMm / totalCalculatedHeight) * 100).toFixed(1));
  });

  // Identify similar colors that can be merged (RGB distance < 50)
  const similarColorPairs = [];
  for (let i = 0; i < assigned.length; i++) {
    for (let j = i + 1; j < assigned.length; j++) {
      const dist = colorDistance(assigned[i].color, assigned[j].color);
      if (dist < 50) {
        similarColorPairs.push({
          sourceIndex: j,
          targetIndex: i,
          sourceColor: assigned[j].color,
          targetColor: assigned[i].color,
          distance: parseFloat(dist.toFixed(1))
        });
      }
    }
  }

  return {
    viewBox,
    width,
    height,
    aspectRatio: width / height,
    layerCount: assigned.length,
    layers: assigned,
    detectedBackground,
    backgroundRemoved: !!(detectedBackground && removeBackground),
    similarColorPairs
  };
}

/**
 * Generate standalone SVG for a specific layer
 */
function generateLayerSvg(layer, viewBox, width, height, isBase = false) {
  const paths = layer.paths || [];
  const color = layer.color || '#000000';
  const id = layer.id || 'layer';

  const processedPaths = paths;

  const pathElements = processedPaths.map(d =>
    `<path fill="${color}" fill-rule="evenodd" stroke="none" d="${d}" />`
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="${viewBox}" width="${width}" height="${height}">
  <g id="${id}" fill="${color}">
    ${pathElements.join('\n    ')}
  </g>
</svg>`;
}

module.exports = {
  analyzeSvgLayers,
  generateLayerSvg,
  splitSubpaths,
  getApproxBBox,
  colorDistance,
  isBackgroundPath
};
