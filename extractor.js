const https = require('https');
const http = require('http');
const WebSocket = require('ws');

/**
 * Extract image dimensions from raw buffer (PNG, JPEG, GIF, WEBP)
 */
function getImageDimensions(buf) {
  if (!buf || buf.length < 24) return { width: 1024, height: 1024 };

  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    return { width, height };
  }

  // JPEG
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let offset = 2;
    while (offset < buf.length) {
      if (buf[offset] !== 0xFF) break;
      const marker = buf[offset + 1];
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { width, height };
      }
      const len = buf.readUInt16BE(offset + 2);
      offset += 2 + len;
    }
  }

  return { width: 1536, height: 1024 };
}

/**
 * Perform HTTPS GET request with Promise
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : new URL(res.headers.location, url).href;
        return resolve(fetchUrl(redirectUrl));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        buffer: Buffer.concat(chunks)
      }));
    }).on('error', reject);
  });
}

// Math and Geometry Helpers
const D = {
  solve(t, s, o) {
    const e = 1e-6, i = [];
    if (Math.abs(t) < e) return Math.abs(s) < e ? i : [-o / s];
    let r = s * s - 4 * t * o;
    return r > e ? [(-s + Math.sqrt(r)) / (2 * t), (-s - Math.sqrt(r)) / (2 * t)] : r < -1e-6 ? i : [-s / (2 * t)];
  }
};

const L = {
  TwoPi: 2 * Math.PI,
  Rad90: Math.PI / 2,
  Rad180: Math.PI,
  Rad270: 3 * Math.PI / 2,
  posMod(t, e) { return (t % e + e) % e; },
  negMod(t, e) { return (t % e - e) % e; },
  posRelMod(t, i, s) { return L.posMod(t - i, s) + i; },
  negRelMod(t, e, s) { return L.negMod(t - e, s) + e; }
};

class nt {
  constructor(t, e) { this.x = t; this.y = e; }
}

class ht {
  constructor(t, e, i, s) {
    this.left = t; this.top = e; this.right = i; this.bottom = s;
  }
  static empty() { return new ht(Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE); }
  addXy(t, e) {
    this.left = Math.min(this.left, t);
    this.top = Math.min(this.top, e);
    this.right = Math.max(this.right, t);
    this.bottom = Math.max(this.bottom, e);
  }
  addX(t) { this.left = Math.min(this.left, t); this.right = Math.max(this.right, t); }
  addY(t) { this.top = Math.min(this.top, t); this.bottom = Math.max(this.bottom, t); }
  addRect(t) {
    this.left = Math.min(this.left, t.left);
    this.top = Math.min(this.top, t.top);
    this.right = Math.max(this.right, t.right);
    this.bottom = Math.max(this.bottom, t.bottom);
  }
}

class ft {
  constructor(t = 0, e = 0, i = 0, s = 0) {
    this.r = t; this.g = e; this.b = i; this.a = s;
  }
  setArgbInt(t) {
    this.a = (t >> 24 & 255) / 255;
    this.r = (t >> 16 & 255) / 255;
    this.g = (t >> 8 & 255) / 255;
    this.b = (255 & t) / 255;
    return this;
  }
  ri() { return Math.round(255 * this.r); }
  gi() { return Math.round(255 * this.g); }
  bi() { return Math.round(255 * this.b); }
  toCssRgba() {
    return `rgba(${this.ri()},${this.gi()},${this.bi()},${this.a.toFixed(4)})`;
  }
  toCssHex() {
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(this.ri())}${toHex(this.gi())}${toHex(this.bi())}`;
  }
}

class pt {
  constructor(t, e) {
    this.arraybuffer = t;
    this.littleEndian = e;
    this.dataview = new DataView(t);
    this.offset = 0;
  }
  readInt8() { const t = this.dataview.getInt8(this.offset); this.offset += 1; return t; }
  readBoolean() { return 0 !== this.readInt8(); }
  readInt32() { const t = this.dataview.getInt32(this.offset, this.littleEndian); this.offset += 4; return t; }
  readFloat32() { const t = this.dataview.getFloat32(this.offset, this.littleEndian); this.offset += 4; return t; }
}

class Curve {
  constructor(t, e, i, s) {
    this.startX = t; this.startY = e; this.endX = i; this.endY = s;
    this.bounds = ht.empty();
  }
  static readWithoutCursor(t) {
    let e = t.readInt8();
    switch (e) {
      case 0: return Line.readWithoutCursor(t);
      case 1: return QuadBezier.readWithoutCursor(t);
      case 2: return CubicBezier.readWithoutCursor(t);
      case 3:
      case 4: return CircularArc.readWithoutCursor(t);
      case 5:
      case 6: return EllipticalArc.readWithoutCursor(t);
    }
    throw `Unknown CurveType: ${e}`;
  }
  static readArray(t) {
    let e = t.readInt32(), i = new Array(e);
    for (let o = 0; o < e; o++) i[o] = Curve.readWithoutCursor(t);
    return i;
  }
}

class Line extends Curve {
  constructor(t, e, i, s) {
    super(t, e, i, s);
    this.bounds.addXy(this.startX, this.startY);
    this.bounds.addXy(this.endX, this.endY);
  }
  static readWithoutCursor(t) {
    let e = t.readFloat32(), i = t.readFloat32(), s = t.readFloat32(), r = t.readFloat32();
    return new Line(e, i, s, r);
  }
  toSvgCmd() {
    return `L ${this.endX.toFixed(3)} ${this.endY.toFixed(3)}`;
  }
}

class QuadBezier extends Curve {
  constructor(t, e, i, s, o, r) {
    super(t, e, o, r);
    this.controlX = i; this.controlY = s;
    this.bounds.addXy(this.startX, this.startY);
    this.bounds.addXy(this.endX, this.endY);
  }
  static readWithoutCursor(t) {
    let e = t.readFloat32(), i = t.readFloat32(), s = t.readFloat32(), o = t.readFloat32(), n = t.readFloat32(), a = t.readFloat32();
    return new QuadBezier(e, i, s, o, n, a);
  }
  toSvgCmd() {
    return `Q ${this.controlX.toFixed(3)} ${this.controlY.toFixed(3)} ${this.endX.toFixed(3)} ${this.endY.toFixed(3)}`;
  }
}

class CubicBezier extends Curve {
  constructor(t, e, i, s, o, r, n, a) {
    super(t, e, n, a);
    this.controlStartX = i; this.controlStartY = s;
    this.controlEndX = o; this.controlEndY = r;
    this.bounds.addXy(this.startX, this.startY);
    this.bounds.addXy(this.endX, this.endY);
  }
  static readWithoutCursor(t) {
    let e = t.readFloat32(), i = t.readFloat32(), s = t.readFloat32(), o = t.readFloat32(), r = t.readFloat32(), a = t.readFloat32(), h = t.readFloat32(), l = t.readFloat32();
    return new CubicBezier(e, i, s, o, r, a, h, l);
  }
  toSvgCmd() {
    return `C ${this.controlStartX.toFixed(3)} ${this.controlStartY.toFixed(3)} ${this.controlEndX.toFixed(3)} ${this.controlEndY.toFixed(3)} ${this.endX.toFixed(3)} ${this.endY.toFixed(3)}`;
  }
}

class CircularArc extends Curve {
  constructor(t, e, i, s, o, r, n, a, h, l, u) {
    super(i, s, l, u);
    this.isLargeArc = t; this.isClockwise = e;
    this.centerX = o; this.centerY = r;
    this.radius = n; this.thetaStartRad = a; this.deltaThetaRad = h;
    this.bounds.addXy(this.startX, this.startY);
    this.bounds.addXy(this.endX, this.endY);
  }
  static readWithoutCursor(t) {
    let e = 0 != t.readInt8(), i = 0 != t.readInt8(), s = t.readFloat32(), o = t.readFloat32(), r = t.readFloat32(), n = t.readFloat32(), h = t.readFloat32(), l = t.readFloat32(), u = t.readFloat32(), c = t.readFloat32(), d = t.readFloat32();
    return new CircularArc(e, i, s, o, r, n, h, l, u, c, d);
  }
  toSvgCmd() {
    const laf = this.isLargeArc ? 1 : 0;
    const swf = this.isClockwise ? 1 : 0;
    return `A ${this.radius.toFixed(3)} ${this.radius.toFixed(3)} 0 ${laf} ${swf} ${this.endX.toFixed(3)} ${this.endY.toFixed(3)}`;
  }
}

class EllipticalArc extends Curve {
  constructor(t, e, i, s, o, r, n, a, h, l, u, c, d) {
    super(i, s, c, d);
    this.isLargeArc = t; this.isClockwise = e;
    this.centerX = o; this.centerY = r;
    this.radiusX = n; this.radiusY = a;
    this.rotationRad = h; this.thetaStartRad = l; this.deltaThetaRad = u;
    this.bounds.addXy(this.startX, this.startY);
    this.bounds.addXy(this.endX, this.endY);
  }
  static readWithoutCursor(t) {
    let e = 0 != t.readInt8(), i = 0 != t.readInt8(), s = t.readFloat32(), o = t.readFloat32(), r = t.readFloat32(), n = t.readFloat32(), a = t.readFloat32(), h = t.readFloat32(), u = t.readFloat32(), c = t.readFloat32(), d = t.readFloat32(), p = t.readFloat32(), m = t.readFloat32();
    return new EllipticalArc(e, i, s, o, r, n, a, h, u, c, d, p, m);
  }
  rotationDeg() { return 180 * this.rotationRad / Math.PI; }
  toSvgCmd() {
    const laf = this.isLargeArc ? 1 : 0;
    const swf = this.isClockwise ? 1 : 0;
    return `A ${this.radiusX.toFixed(3)} ${this.radiusY.toFixed(3)} ${this.rotationDeg().toFixed(3)} ${laf} ${swf} ${this.endX.toFixed(3)} ${this.endY.toFixed(3)}`;
  }
}

class CurveLoop {
  constructor(t, e) {
    this.curves = t; this.resultLoop = e;
    this.bounds = ht.empty();
    for (let t of this.curves) this.bounds.addRect(t.bounds);
  }
  static read(t, e) {
    return new CurveLoop(Curve.readArray(t), e);
  }
  toSvgPath() {
    if (this.curves.length === 0) return "";
    let d = `M ${this.curves[0].startX.toFixed(3)} ${this.curves[0].startY.toFixed(3)}`;
    for (let c of this.curves) {
      d += " " + c.toSvgCmd();
    }
    d += " Z";
    return d;
  }
}

class VectorLoop {
  constructor(t, e, i) {
    this.index = t; this.vectorShapeIndex = e; this.isPositive = i;
    this.childShapes = []; this.vectorInterfaces = [];
    this.hasNonOpaqueDescendents = false; this.vectorInterfacesToDraw = [];
  }
  static from(t) {
    let e = t.readInt8(), i = t.readInt32(), s = t.readInt32(), o = t.readBoolean();
    switch (e) {
      case 0: return new StandardVectorLoop(t, i, s, o);
      case 1: return new CircleVectorLoop(t, i, s, o);
      case 2: return new EllipseVectorLoop(t, i, s, o);
      case 3: return new RectVectorLoop(t, i, s, o);
    }
  }
  commit(t) {
    t.vectorShapes[this.vectorShapeIndex].vectorLoops.push(this);
    this.vectorShape = t.vectorShapes[this.vectorShapeIndex];
  }
  setHasNonOpaqueDescendents() {
    this.hasNonOpaqueDescendents || (this.hasNonOpaqueDescendents = true, null != this.vectorShape && this.vectorShape.setHasNonOpaqueDescendents());
  }
  filterVectorInterfaces() {
    this.vectorInterfacesToDraw = this.vectorInterfaces.filter(t => t.shouldDraw());
  }
  shouldDraw() {
    return this.isPositive || this.hasNonOpaqueDescendents;
  }
  readSharedData(t) {
    this.curveLoop = CurveLoop.read(t, this);
  }
  bounds() {
    return this.curveLoop.bounds;
  }
}

class StandardVectorLoop extends VectorLoop {
  constructor(t, e, i, s) { super(e, i, s); this.readSharedData(t); }
}
class CircleVectorLoop extends VectorLoop {
  constructor(t, e, i, s) {
    super(e, i, s);
    this.centerX = t.readFloat32(); this.centerY = t.readFloat32();
    this.radius = t.readFloat32();
    this.readSharedData(t);
  }
}
class EllipseVectorLoop extends VectorLoop {
  constructor(t, e, i, s) {
    super(e, i, s);
    this.centerX = t.readFloat32(); this.centerY = t.readFloat32();
    this.radiusX = t.readFloat32(); this.radiusY = t.readFloat32();
    this.rotationRad = t.readFloat32();
    this.readSharedData(t);
  }
}
class RectVectorLoop extends VectorLoop {
  constructor(t, e, i, s) {
    super(e, i, s);
    this.centerX = t.readFloat32(); this.centerY = t.readFloat32();
    this.halfWidth = t.readFloat32(); this.halfHeight = t.readFloat32();
    this.cornerRadius = t.readFloat32(); this.rotationRad = t.readFloat32();
    this.readSharedData(t);
  }
}

class VectorShape {
  static from(t) {
    let e = t.readInt32(), i = t.readInt32(), s = t.readInt32();
    return new VectorShape(e, i, s);
  }
  constructor(t, e, i) {
    this.index = t; this.parentLoopIndex = e; this.paletteIndex = i;
    this.vectorLoops = []; this.hasNonOpaqueDescendents = false;
  }
  commit(t) {
    this.vectorImage = t;
    if (this.parentLoopIndex >= 0) {
      this.parentLoop = t.vectorLoops[this.parentLoopIndex];
      this.parentLoop.childShapes.push(this);
    }
  }
  setHasNonOpaqueDescendents() {
    this.hasNonOpaqueDescendents || (this.hasNonOpaqueDescendents = true, null != this.parentLoop && this.parentLoop.setHasNonOpaqueDescendents());
  }
  filterVectorLoops() {
    this.vectorLoopsToDraw = this.vectorLoops;
  }
  paletteEntry() {
    return this.vectorImage.userPalette.getMutRgba(this.paletteIndex);
  }
}

class VectorInterface {
  constructor(t, e, i, s, o) {
    this.parentVectorLoopIndex = t; this.vectorLoopIndex0 = e; this.vectorLoopIndex1 = i;
    this.argbInt = s; this.curves = o;
    this.bounds = ht.empty(); this.isSiblingInterface = false; this.hasNonOpaqueDescendents = false;
    let r = (this.argbInt >> 24 & 255) / 255, n = this.argbInt >> 16 & 255, a = this.argbInt >> 8 & 255, h = 255 & this.argbInt;
    this.css = `rgba(${n},${a},${h},${r})`;
    for (let t of this.curves) this.bounds.addRect(t.bounds);
  }
  static from(t) {
    let e = t.readInt32(), i = t.readInt32(), o = t.readInt32(), r = t.readInt32(), n = Curve.readArray(t);
    return new VectorInterface(e, i, o, r, n);
  }
  commit(t) {
    t.vectorLoops[this.parentVectorLoopIndex].vectorInterfaces.push(this);
    this.parentVectorLoop = t.vectorLoops[this.parentVectorLoopIndex];
    this.vectorLoop0 = t.vectorLoops[this.vectorLoopIndex0];
    this.vectorLoop1 = t.vectorLoops[this.vectorLoopIndex1];
    this.color0 = this.vectorLoop0.vectorShape.paletteEntry();
    this.color1 = this.vectorLoop1.vectorShape.paletteEntry();
    this.isSiblingInterface = this.vectorLoop0.isPositive && this.vectorLoop1.isPositive;
    this.hasNonOpaqueDescendents = this.vectorLoop0.hasNonOpaqueDescendents || this.vectorLoop1.hasNonOpaqueDescendents;
  }
  shouldDraw() {
    let t = this.color0.a, e = this.color1.a;
    return (this.isSiblingInterface || this.hasNonOpaqueDescendents) && (t > .99 || e > .99) && t > .01 && e > .01;
  }
}

class ResultChunk {
  constructor(t, e, i) {
    this.vectorShapes = t; this.vectorLoops = e; this.vectorInterfaces = i;
  }
  static from(t) {
    let e = new pt(t.arraybuffer, false), i = e.readInt32(), s = new Array(i);
    for (let t = 0; t < i; t++) s[t] = VectorShape.from(e);
    let o = e.readInt32(), r = new Array(o);
    for (let t = 0; t < o; t++) r[t] = VectorLoop.from(e);
    let n = e.readInt32(), a = new Array(n);
    for (let t = 0; t < n; t++) a[t] = VectorInterface.from(e);
    return new ResultChunk(s, r, a);
  }
}

class UserPalette {
  constructor(t) {
    this.userPalette = t;
    this.length = this.userPalette.colors.length;
    this.colors = [];
    for (let t = 0; t < this.length; t++) {
      this.colors[t] = new ft();
      this.colors[t].setArgbInt(this.userPalette.colors[t].argb);
    }
  }
  getMutRgba(t) { return this.colors[t]; }
}

class Palette {
  constructor(t) {
    this.palette = t;
    this.length = this.palette.colors.length;
    this.colors = [];
    for (let t = 0; t < this.length; t++) {
      this.colors[t] = new ft();
      this.colors[t].setArgbInt(this.palette.colors[t].argb);
    }
  }
  getMutRgba(t) { return this.colors[t]; }
}

class VectorImage {
  constructor(e, i, s, o) {
    this.name = e; this.imageWidth = i; this.imageHeight = s; this.resultStart = o;
    this.vectorShapes = []; this.topVectorShapes = []; this.vectorLoops = []; this.vectorInterfaces = [];
    this.isReady = false;
    this.palette = new Palette(o.palette);
    this.userPalette = new UserPalette(o.userPalette);
    this.processingOptions = o.processingOptions;
  }
  appendChunk(t) {
    for (let e of t.vectorShapes) {
      this.vectorShapes[e.index] = e;
      e.parentLoopIndex < 0 && this.topVectorShapes.push(e);
    }
    for (let e of t.vectorLoops) this.vectorLoops[e.index] = e;
    for (let e of t.vectorInterfaces) this.vectorInterfaces.push(e);
  }
  commit() {
    for (let t of this.vectorShapes) if (t) t.commit(this);
    for (let t of this.vectorLoops) if (t) t.commit(this);
    for (let t of this.vectorShapes) if (t && t.paletteEntry().a < 1) t.setHasNonOpaqueDescendents();
    for (let t of this.vectorInterfaces) if (t) t.commit(this);
    for (let t of this.vectorShapes) if (t) t.filterVectorLoops();
    for (let t of this.vectorLoops) if (t) t.filterVectorInterfaces();
    this.isReady = true;
  }
  toSvg(options = {}) {
    const groupBy = options.groupBy || 'none';

    if (groupBy === 'color') {
      const colorGroups = new Map();

      for (let shape of this.vectorShapes) {
        if (!shape) continue;
        const color = this.userPalette.getMutRgba(shape.paletteIndex);
        if (color.a === 0) continue;

        let dList = [];
        for (let loop of shape.vectorLoopsToDraw) {
          if (!loop || !loop.curveLoop) continue;
          const p = loop.curveLoop.toSvgPath();
          if (p) dList.push(p);
        }
        if (dList.length > 0) {
          const fill = color.a >= 0.999 ? color.toCssHex() : color.toCssRgba();
          if (!colorGroups.has(fill)) {
            colorGroups.set(fill, {
              color: fill,
              paletteIndex: shape.paletteIndex,
              paths: []
            });
          }
          colorGroups.get(fill).paths.push(dList.join(' '));
        }
      }

      let groupElements = [];
      for (const [color, group] of colorGroups.entries()) {
        const safeId = `color_${color.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const pathElements = group.paths.map((d, idx) => 
          `      <path id="${safeId}_${idx + 1}" fill="${color}" fill-rule="evenodd" stroke="none" d="${d}" />`
        ).join('\n');

        groupElements.push(`    <!-- Color Group: ${color} (${group.paths.length} paths) -->\n    <g id="${safeId}" fill="${color}" fill-rule="evenodd" stroke="none">\n${pathElements}\n    </g>`);
      }

      return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 ${this.imageWidth} ${this.imageHeight}" width="${this.imageWidth}" height="${this.imageHeight}">
  <g id="vectorizer_grouped_by_color">
${groupElements.join('\n')}
  </g>
</svg>`;
    }

    let paths = [];
    for (let shape of this.vectorShapes) {
      if (!shape) continue;
      const color = this.userPalette.getMutRgba(shape.paletteIndex);
      if (color.a === 0) continue;

      let dList = [];
      for (let loop of shape.vectorLoopsToDraw) {
        if (!loop || !loop.curveLoop) continue;
        const p = loop.curveLoop.toSvgPath();
        if (p) dList.push(p);
      }
      if (dList.length > 0) {
        const fill = color.a >= 0.999 ? color.toCssHex() : color.toCssRgba();
        paths.push(`<path fill="${fill}" fill-rule="evenodd" stroke="none" d="${dList.join(' ')}" />`);
      }
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 ${this.imageWidth} ${this.imageHeight}" width="${this.imageWidth}" height="${this.imageHeight}">
  <g id="vectorizer_shapes">
    ${paths.join('\n    ')}
  </g>
</svg>`;
  }
}

/**
 * Clean & extract token from any input string (URL or direct token)
 */
function extractToken(input) {
  if (!input) return null;
  const str = input.trim();
  const tokenMatch = str.match(/([0-9]{13,}-[a-f0-9]{16,}-[a-f0-9]{64})/i) ||
                     str.match(/images\/([^\/?#]+)/i);
  if (tokenMatch) return tokenMatch[1];
  if (/^[0-9a-f\-]+$/i.test(str) && str.length > 30) return str;
  return null;
}

/**
 * Main function: Given a URL or token, connect to Vectorizer.ai and return SVG
 */
async function extractVectorImage(inputUrlOrToken, optionsOrProgress = {}, maybeProgress = null) {
  let options = {};
  let onProgress = () => {};

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (typeof optionsOrProgress === 'object') {
    options = optionsOrProgress || {};
    if (typeof maybeProgress === 'function') onProgress = maybeProgress;
  }
  const startTime = Date.now();
  const token = extractToken(inputUrlOrToken);
  if (!token) {
    throw new Error('Invalid Vectorizer.ai URL or token provided. Please provide a valid URL like: https://vectorizer.ai/images/.../edit');
  }

  onProgress({ stage: 'metadata', percent: 5, message: 'Fetching image metadata...' });

  // 1. Fetch metadata from edit page or original image
  let filename = 'vectorized_image.png';
  let width = 1536;
  let height = 1024;

  try {
    const editPageRes = await fetchUrl(`https://vectorizer.ai/images/${token}/edit`);
    if (editPageRes.status === 200) {
      const html = editPageRes.buffer.toString('utf8');
      const resumeMatch = html.match(/window\.ResumeImage\s*=\s*({[^}]+})/);
      if (resumeMatch) {
        const resumeObj = JSON.parse(resumeMatch[1]);
        if (resumeObj.originalFilename) filename = resumeObj.originalFilename;
      }
    }
  } catch (e) {
    console.warn('Could not fetch edit page:', e.message);
  }

  // Fetch dimensions from original image
  try {
    const origRes = await fetchUrl(`https://vectorizer.ai/images/${token}/original`);
    if (origRes.status === 200) {
      const dims = getImageDimensions(origRes.buffer);
      width = dims.width;
      height = dims.height;
    }
  } catch (e) {
    console.warn('Could not fetch original image dimensions:', e.message);
  }

  onProgress({ stage: 'connecting', percent: 15, message: `Connecting to stream (${width}x${height})...` });

  // 2. Connect to Vectorizer.ai WebSocket
  const params = new URLSearchParams({
    lc: 'en-US',
    len: '0',
    w: width.toString(),
    h: height.toString(),
    filename: filename,
    v: '0',
    token: token
  });

  const wsUrl = `wss://vectorizer.ai/internal/websocket?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://vectorizer.ai'
      }
    });

    let binaryBuffer = null;
    let specData = null;
    let vecImg = null;
    let chunkCount = 0;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timed out waiting for vectorization stream from Vectorizer.ai'));
    }, 45000);

    ws.on('open', () => {
      onProgress({ stage: 'streaming', percent: 25, message: 'Connected! Requesting vector chunks...' });
      ws.send(JSON.stringify({ index: 0, command: 2, body: { jobId: 1, h: 'vectorizer.ai' } }));
      ws.send(JSON.stringify({ index: 0, command: 11, body: {} }));
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        binaryBuffer = data;
      } else {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.command === 7) {
            specData = msg.body;
            vecImg = new VectorImage(filename, width, height, specData);
            onProgress({ stage: 'streaming', percent: 35, message: 'Processing color palette and curves...' });
          } else if (msg.command === 8) {
            chunkCount++;
            const progressPct = Math.min(95, 35 + Math.round((msg.body.progress || 0) * 0.55));
            onProgress({ stage: 'streaming', percent: progressPct, message: `Receiving vector chunk ${chunkCount}...` });
            if (binaryBuffer && vecImg) {
              const ab = binaryBuffer.buffer.slice(binaryBuffer.byteOffset, binaryBuffer.byteOffset + binaryBuffer.byteLength);
              const chunk = ResultChunk.from({ arraybuffer: ab });
              vecImg.appendChunk(chunk);
              binaryBuffer = null;
            }
          } else if (msg.command === 9) {
            clearTimeout(timeout);
            onProgress({ stage: 'compiling', percent: 95, message: 'Assembling SVG geometry...' });
            vecImg.commit();
            const svg = vecImg.toSvg(options);
            ws.close();

            const baseName = filename.replace(/\.[^/.]+$/, "");
            const svgFilename = `${baseName}_vector.svg`;

            resolve({
              svg,
              token,
              filename: svgFilename,
              originalFilename: filename,
              width,
              height,
              shapeCount: vecImg.vectorShapes.filter(s => s && s.vectorLoopsToDraw && s.vectorLoopsToDraw.length > 0).length,
              loopCount: vecImg.vectorLoops.length,
              colorCount: specData && specData.palette && specData.palette.colors ? specData.palette.colors.length : 0,
              durationMs: Date.now() - startTime
            });
          } else if (msg.command === 10) {
            clearTimeout(timeout);
            ws.close();
            const errReason = msg.body && msg.body.errorMessageTr ? msg.body.errorMessageTr : 'Unknown error from server';
            reject(new Error(`Vectorizer server error: ${errReason}`));
          }
        } catch (e) {
          console.error('Error handling message:', e);
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
    });
  });
}

module.exports = {
  extractVectorImage,
  extractToken
};

module.exports.VectorImage = VectorImage;
module.exports.ResultChunk = ResultChunk;
