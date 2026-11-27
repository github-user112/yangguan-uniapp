/* 渲染层：Canvas 2D 球面透视投影 + 星点精灵 + 图层绘制 */
import { SkyData } from './data.js'
import { Astro } from './astro.js'

var D2R = Math.PI / 180;

  function norm(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function bvToKelvin(bv) {
    var t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
    if (!isFinite(t) || t <= 0) t = 6500;
    return Math.max(1800, Math.min(30000, t));
  }
  function kelvinToRgb(k) {
    var t = k / 100, r, g, b;
    if (t <= 66) { r = 255; } else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); }
    if (t <= 66) { g = 99.4708025861 * Math.log(t) - 161.1195681661; }
    else { g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
    if (t >= 66) { b = 255; } else if (t <= 19) { b = 0; }
    else { b = 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
    return [Math.round(Math.max(0, Math.min(255, r))),
      Math.round(Math.max(0, Math.min(255, g))),
      Math.round(Math.max(0, Math.min(255, b)))];
  }
  function starRadius(mag) {
    return Math.max(0.9, 3.4 * Math.pow(10, -0.12 * (mag + 0.6)));
  }

  // Sutherland–Hodgman 半空间裁剪，点格式为 [右, 上, 前, 世界高度]
  function clipPlane(poly, axis, limit) {
    var out = [];
    if (!poly.length) return out;
    var prev = poly[poly.length - 1];
    var prevIn = prev[axis] >= limit;
    for (var i = 0; i < poly.length; i++) {
      var cur = poly[i], curIn = cur[axis] >= limit;
      if (curIn !== prevIn) {
        var t = (limit - prev[axis]) / (cur[axis] - prev[axis]);
        out.push([
          prev[0] + (cur[0] - prev[0]) * t,
          prev[1] + (cur[1] - prev[1]) * t,
          prev[2] + (cur[2] - prev[2]) * t,
          prev[3] + (cur[3] - prev[3]) * t
        ]);
      }
      if (curIn) out.push(cur);
      prev = cur; prevIn = curIn;
    }
    return out;
  }

  var N = 0; // 供调试

  function SkyRenderer(canvas, ctx, width, height, dpr) {
    this.canvas = canvas || null;
    this.ctx = ctx;
    this.dpr = dpr || 1; this.w = width || 1; this.h = height || 1;
    this.fov = 68;
    this.cx = 0; this.cy = 0; this.focal = 1;
    this.basis = { f: [0, 0, 1], u: [0, 1, 0], r: [1, 0, 0] };
    this.layers = {
      milkyway: true, constellation: true, names: true, planets: true,
      deepsky: false, xingguan: false, horizon: true
    };
    this.cullBelowHorizon = true;
    this.time = new Date();
    this.lst = 0;
    this.M = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    this.bodies = [];
    this.pickables = [];
    this.selected = null;
    this.highlightConst = null;
    this.sprites = null;
    this.spriteColors = [];
    this.spriteGlow = [];
    this.labels = [];
    this.bgGrad = null;
    this.quality = 1;
    this.trailMode = false;
    this.trailPlaying = false;
    this.trailCanvas = null;
    this.trailCtx = null;
    this.trailColors = [];
    this.resize();
    this.makeSprites();
  }

  SkyRenderer.prototype.resize = function (width, height, dpr) {
    if (width) this.w = Math.max(1, width);
    if (height) this.h = Math.max(1, height);
    if (dpr) this.dpr = dpr;
    if (this.canvas) {
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
    }
    this.cx = this.w / 2; this.cy = this.h / 2;
    this.updateFocal();
    var g = this.ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#071021');
    g.addColorStop(0.55, '#04070f');
    g.addColorStop(1, '#010206');
    this.bgGrad = g;
    if (this.trailMode) this.resetTrails();
  };

  SkyRenderer.prototype.updateFocal = function () {
    this.focal = (this.h / 2) / Math.tan(this.fov * D2R / 2);
  };

  SkyRenderer.prototype.setFov = function (v) {
    this.fov = Math.max(24, Math.min(102, v));
    this.updateFocal();
  };

  /* 直接给定朝向与"屏幕向上"，内部补全正交基 */
  SkyRenderer.prototype.setBasis = function (f, u) {
    this.basis.f = norm(f);
    var r = norm(cross(u, this.basis.f));
    this.basis.r = r;
    this.basis.u = norm(cross(this.basis.f, r));
  };

  /* az/alt/roll（度）→ 相机基向量 */
  SkyRenderer.prototype.basisFromAngles = function (az, alt, roll) {
    var a = az * D2R, al = alt * D2R, ro = (roll || 0) * D2R;
    var f = [Math.cos(al) * Math.sin(a), Math.sin(al), Math.cos(al) * Math.cos(a)];
    var r0 = [Math.cos(a), 0, -Math.sin(a)];
    var u0 = cross(f, r0);
    var cr = Math.cos(ro), sr = Math.sin(ro);
    var r = [r0[0] * cr + u0[0] * sr, r0[1] * cr + u0[1] * sr, r0[2] * cr + u0[2] * sr];
    var u = [u0[0] * cr - r0[0] * sr, u0[1] * cr - r0[1] * sr, u0[2] * cr - r0[2] * sr];
    this.basis.f = f; this.basis.r = norm(r); this.basis.u = norm(cross(f, r));
  };

  SkyRenderer.prototype.cameraAngles = function () {
    var f = this.basis.f;
    return {
      alt: Math.asin(Math.max(-1, Math.min(1, f[1]))) / D2R,
      az: ((Math.atan2(f[0], f[2]) / D2R) % 360 + 360) % 360
    };
  };

  /* ---- 星点精灵：7 档色温，核心半径 8px / 画布 64px ---- */
  SkyRenderer.prototype.makeSprites = function () {
    // 小程序端没有 document.createElement('canvas')，星点直接用 arc + 发光叠加绘制。
    // 保留 7 档色温颜色与 trailColors，渲染效果与浏览器版接近。
    this.spriteColors = [];
    this.trailColors = [];
    for (var i = 0; i < 7; i++) {
      var c = kelvinToRgb(bvToKelvin(-0.3 + i * 0.35));
      var rgb = c[0] + ',' + c[1] + ',' + c[2];
      this.spriteColors.push('rgba(' + rgb + ',1)');
      this.spriteGlow.push('rgba(' + rgb + ',0.18)');
      this.trailColors.push('rgba(' + rgb + ',0.48)');
    }
    this.sprites = null;
  };

  SkyRenderer.prototype.updateAstro = function (date) {
    this.time = date;
    this.lst = Astro.lstDeg(date);
    this.M = Astro.horizontalMatrix(this.lst, Astro.getLocation().lat);
  };

  SkyRenderer.prototype.updateBodies = function () {
    this.bodies = Astro.bodyInfo(this.time);
  };

  /* 世界向量 → 屏幕坐标，背面返回 null */
  SkyRenderer.prototype.project = function (x, y, z) {
    var b = this.basis, f = b.f, r = b.r, u = b.u;
    var cz = x * f[0] + y * f[1] + z * f[2];
    if (cz <= 0.06) return null;
    var px = this.cx + (x * r[0] + y * r[1] + z * r[2]) / cz * this.focal;
    var py = this.cy - (x * u[0] + y * u[1] + z * u[2]) / cz * this.focal;
    return { x: px, y: py, z: cz };
  };

  SkyRenderer.prototype.toWorld = function (eq) {
    var M = this.M;
    return [
      M[0][0] * eq[0] + M[0][1] * eq[1] + M[0][2] * eq[2],
      M[1][0] * eq[0] + M[1][1] * eq[1] + M[1][2] * eq[2],
      M[2][0] * eq[0] + M[2][1] * eq[1] + M[2][2] * eq[2]
    ];
  };

  /* ============================== 主渲染 ============================== */
  SkyRenderer.prototype.render = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.pickables.length = 0;
    this.labels.length = 0;

    ctx.fillStyle = this.bgGrad;
    ctx.fillRect(0, 0, this.w, this.h);

    if (this.layers.milkyway) this.drawMilkyWay();
    if (this.layers.horizon) this.drawGround();
    if (this.trailMode) this.drawTrails();
    this.drawStars();
    if (!this.trailMode) {
      if (this.layers.constellation) this.drawConstellations();
      if (this.layers.deepsky) this.drawDeepSky();
      if (this.layers.planets) this.drawBodies();
      if (this.layers.xingguan) this.drawXingguan();
    }
    if (this.layers.horizon) this.drawHorizon();
    if (!this.trailMode) {
      this.drawLabels();
      this.drawSelection();
    }

    // 视线朝地面时的提示
    var ca = this.cameraAngles();
    if (ca.alt < -52) {
      ctx.font = '400 14px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(150,180,220,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('抬头，看看天空', this.cx, this.cy + 10);
    }
  };

  /* ---- 地面：地平线在大地测量投影下是屏幕空间的一条直线 ---- */
  SkyRenderer.prototype.horizonLineY = function (x) {
    var b = this.basis, u = b.u, r = b.r, f = b.f;
    if (Math.abs(u[1]) < 1e-4) return null;
    var k = (x - this.cx) / this.focal;
    var v = -(k * r[1] + f[1]) / u[1];      // 相机系纵坐标
    return this.cy - v * this.focal;
  };

  SkyRenderer.prototype.drawGround = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    var y0 = this.horizonLineY(0), y1 = this.horizonLineY(w);
    if (y0 == null || y1 == null) {
      // 屏幕向上方向与地平平行：只可能是正对天顶或天底
      if (this.basis.f[1] < 0) {
        var gd = ctx.createLinearGradient(0, 0, 0, h);
        gd.addColorStop(0, 'rgba(6,9,17,1)');
        gd.addColorStop(1, 'rgba(2,3,8,1)');
        ctx.fillStyle = gd;
        ctx.fillRect(0, 0, w, h);
      }
      return;
    }
    var upY = this.basis.u[1];
    var groundBelow = upY > 0;

    // 若地平线完全在屏幕外且地面方向背对视线，跳过
    ctx.save();
    ctx.beginPath();
    var ext = w * 0.02;
    if (groundBelow) {
      ctx.moveTo(-ext, y0 + (y1 - y0) * (-ext - 0) / w);
      ctx.lineTo(w + ext, y0 + (y1 - y0) * (w + ext) / w);
      ctx.lineTo(w + ext, h + 40);
      ctx.lineTo(-ext, h + 40);
    } else {
      ctx.moveTo(-ext, y0 + (y1 - y0) * (-ext) / w);
      ctx.lineTo(w + ext, y0 + (y1 - y0) * (w + ext) / w);
      ctx.lineTo(w + ext, -40);
      ctx.lineTo(-ext, -40);
    }
    ctx.closePath();

    var midX = w / 2;
    var midY = (y0 + y1) / 2;
    var dir = groundBelow ? 1 : -1;
    var span = Math.max(60, h * 0.9);
    var g = ctx.createLinearGradient(midX, midY, midX, midY + dir * span);
    g.addColorStop(0, 'rgba(10,16,28,0.86)');
    g.addColorStop(0.35, 'rgba(6,9,17,0.95)');
    g.addColorStop(1, 'rgba(2,3,8,1)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  };

  /* ---- 银河：五层真实轮廓，三维裁剪后再透视填充 ---- */
  SkyRenderer.prototype.appendMilkyRing = function (ring) {
    var M = this.M, b = this.basis, f = b.f, r = b.r, u = b.u;
    var poly = [];
    for (var i = 0; i < ring.length; i++) {
      var e = ring[i];
      var wx = M[0][0] * e[0] + M[0][1] * e[1] + M[0][2] * e[2];
      var wy = M[1][0] * e[0] + M[1][1] * e[1] + M[1][2] * e[2];
      var wz = M[2][0] * e[0] + M[2][1] * e[1] + M[2][2] * e[2];
      poly.push([
        wx * r[0] + wy * r[1] + wz * r[2],
        wx * u[0] + wy * u[1] + wz * u[2],
        wx * f[0] + wy * f[1] + wz * f[2], wy
      ]);
    }
    poly = clipPlane(poly, 2, 0.12);
    if (this.cullBelowHorizon) poly = clipPlane(poly, 3, -0.004);
    if (poly.length < 3) return;
    var ctx = this.ctx;
    var p0 = poly[0];
    ctx.moveTo(this.cx + p0[0] / p0[2] * this.focal, this.cy - p0[1] / p0[2] * this.focal);
    for (var j = 1; j < poly.length; j++) {
      var p = poly[j];
      ctx.lineTo(this.cx + p[0] / p[2] * this.focal, this.cy - p[1] / p[2] * this.focal);
    }
    ctx.closePath();
  };

  SkyRenderer.prototype.drawMilkyWay = function () {
    var ctx = this.ctx;
    var colors = [
      'rgba(80,105,160,0.065)', 'rgba(100,112,165,0.055)',
      'rgba(125,122,170,0.06)', 'rgba(150,137,177,0.07)',
      'rgba(180,163,192,0.085)'
    ];
    ctx.save();
    for (var i = 0; i < SkyData.milkyway.length; i++) {
      var feature = SkyData.milkyway[i];
      ctx.fillStyle = colors[i] || colors[0];
      ctx.beginPath();
      for (var j = 0; j < feature.rings.length; j++) this.appendMilkyRing(feature.rings[j]);
      try { ctx.fill('evenodd'); } catch (e) { ctx.fill(); }
    }
    ctx.restore();
  };

  /* ---- 星轨：固定镜头下累积真实恒星位置，离屏画布避免逐帧重算全部弧线 ---- */
  SkyRenderer.prototype.resetTrails = function () {
    this.trailSegments = [];
    this.trailPrev = new Float32Array(SkyData.stars.length * 2);
    this.trailValid = new Uint8Array(SkyData.stars.length);
    this.trailLastSample = 0;
  };

  SkyRenderer.prototype.drawTrails = function () {
    if (!this.trailSegments) this.resetTrails();
    var now = Date.now();
    if (this.trailPlaying && now - this.trailLastSample >= 45) {
      this.trailLastSample = now;
      var M = this.M, b = this.basis, f = b.f, r = b.r, u = b.u;
      var w = this.w, h = this.h, focal = this.focal, cx = this.cx, cy = this.cy;
      var stars = SkyData.stars;
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i], eq = st.eq;
        var wy = M[1][0]*eq[0] + M[1][1]*eq[1] + M[1][2]*eq[2];
        if (wy < -0.004) { this.trailValid[i] = 0; continue; }
        var wx = M[0][0]*eq[0] + M[0][1]*eq[1] + M[0][2]*eq[2];
        var wz = M[2][0]*eq[0] + M[2][1]*eq[1] + M[2][2]*eq[2];
        var cz = wx*f[0] + wy*f[1] + wz*f[2];
        if (cz <= 0.06) { this.trailValid[i] = 0; continue; }
        var sx = cx + (wx*r[0] + wy*r[1] + wz*r[2]) / cz * focal;
        var sy = cy - (wx*u[0] + wy*u[1] + wz*u[2]) / cz * focal;
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) { this.trailValid[i] = 0; continue; }
        if (this.trailValid[i]) {
          var px = this.trailPrev[i*2], py = this.trailPrev[i*2+1];
          var dx = sx-px, dy = sy-py;
          if (dx*dx + dy*dy < 25600) {
            var ci = (st.bv + 0.3) * 2.85;
            ci = ci < 0 ? 0 : (ci > 6 ? 6 : ci | 0);
            if (this.trailSegments.length > 7000) this.trailSegments.splice(0, 1000);
            this.trailSegments.push([px, py, sx, sy, this.trailColors[ci], Math.max(0.45, starRadius(st.mag)*0.52)]);
          }
        }
        this.trailPrev[i*2] = sx; this.trailPrev[i*2+1] = sy; this.trailValid[i] = 1;
      }
    }
    var ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (var k = 0; k < this.trailSegments.length; k++) {
      var seg = this.trailSegments[k];
      ctx.strokeStyle = seg[4]; ctx.lineWidth = seg[5];
      ctx.beginPath(); ctx.moveTo(seg[0], seg[1]); ctx.lineTo(seg[2], seg[3]); ctx.stroke();
    }
    ctx.restore();
  };

  /* ---- 星点 ---- */
  SkyRenderer.prototype.drawStars = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    var M = this.M, b = this.basis, f = b.f, r = b.r, u = b.u;
    var focal = this.focal, cx = this.cx, cy = this.cy;
    var stars = SkyData.stars;
    var m00 = M[0][0], m01 = M[0][1], m02 = M[0][2];
    var m10 = M[1][0], m11 = M[1][1], m12 = M[1][2];
    var m20 = M[2][0], m21 = M[2][1], m22 = M[2][2];
    var cull = this.cullBelowHorizon;

    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0, n = stars.length; i < n; i++) {
      var s = stars[i], e = s.eq;
      var wx = m00 * e[0] + m01 * e[1] + m02 * e[2];
      var wy = m10 * e[0] + m11 * e[1] + m12 * e[2];
      if (cull && wy < -0.004) continue;
      var wz = m20 * e[0] + m21 * e[1] + m22 * e[2];

      var cz = wx * f[0] + wy * f[1] + wz * f[2];
      if (cz <= 0.06) continue;
      var sx = cx + (wx * r[0] + wy * r[1] + wz * r[2]) / cz * focal;
      if (sx < -40 || sx > w + 40) continue;
      var sy = cy - (wx * u[0] + wy * u[1] + wz * u[2]) / cz * focal;
      if (sy < -40 || sy > h + 40) continue;

      var rad = starRadius(s.mag);
      var half = rad * 3.5;
      var ci = (s.bv + 0.3) * 2.85;
      ci = ci < 0 ? 0 : (ci > 6 ? 6 : ci | 0);
      ctx.fillStyle = this.spriteGlow[ci];
      ctx.beginPath(); ctx.arc(sx, sy, half, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.spriteColors[ci];
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.7, rad * 0.62), 0, Math.PI * 2); ctx.fill();

      if (s.mag < 4.6 && this.pickables.length < 2600) {
        this.pickables.push({ x: sx, y: sy, r: Math.max(12, half), obj: s });
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  /* ---- 星座连线 ---- */
  SkyRenderer.prototype.drawConstellations = function () {
    var ctx = this.ctx;
    var dim = this.layers.xingguan ? 0.10 : 0.26;
    var i, j, k;

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(122,178,236,' + dim + ')';
    ctx.beginPath();
    for (i = 0; i < SkyData.constellations.length; i++) {
      var c = SkyData.constellations[i];
      if (c === this.highlightConst || c === this.selected) continue;
      this.pathConstellation(c);
    }
    ctx.stroke();

    // 选中/高亮星座
    var hi = this.highlightConst || (this.selected && this.selected.kind === 'constellation' ? this.selected : null);
    if (hi) {
      ctx.save();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(255,212,121,0.85)';
      ctx.shadowColor = 'rgba(255,196,90,0.7)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      this.pathConstellation(hi);
      ctx.stroke();
      ctx.restore();
    }
  };

  /* 近平面裁剪：把世界系折线安全地追加到当前路径 */
  SkyRenderer.prototype.appendPath = function (wpts) {
    var ctx = this.ctx, b = this.basis, f = b.f, r = b.r, u = b.u;
    var NEAR = 0.12, focal = this.focal, cx0 = this.cx, cy0 = this.cy;
    var prev = null;
    for (var i = 0; i < wpts.length; i++) {
      var wp = wpts[i];
      if (this.cullBelowHorizon && wp[1] < -0.004) { prev = null; continue; }
      var cz = wp[0] * f[0] + wp[1] * f[1] + wp[2] * f[2];
      var cxx = wp[0] * r[0] + wp[1] * r[1] + wp[2] * r[2];
      var cyy = wp[0] * u[0] + wp[1] * u[1] + wp[2] * u[2];
      var cur = { cz: cz, cx: cxx, cy: cyy };
      if (prev) {
        if (prev.cz < NEAR && cur.cz < NEAR) { prev = cur; continue; }
        var A = prev, B = cur, t;
        if (A.cz < NEAR) {
          t = (NEAR - A.cz) / (B.cz - A.cz);
          A = { cz: NEAR, cx: A.cx + (B.cx - A.cx) * t, cy: A.cy + (B.cy - A.cy) * t };
        } else if (B.cz < NEAR) {
          t = (NEAR - B.cz) / (A.cz - B.cz);
          B = { cz: NEAR, cx: B.cx + (A.cx - B.cx) * t, cy: B.cy + (A.cy - B.cy) * t };
        }
        ctx.moveTo(cx0 + A.cx / A.cz * focal, cy0 - A.cy / A.cz * focal);
        ctx.lineTo(cx0 + B.cx / B.cz * focal, cy0 - B.cy / B.cz * focal);
      }
      prev = cur;
    }
  };

  SkyRenderer.prototype.pathConstellation = function (c) {
    for (var k = 0; k < c.lines.length; k++) {
      var seg = c.lines[k];
      for (var i = 0; i < seg.length - 1; i++) {
        var A = this.toWorld(seg[i]), B = this.toWorld(seg[i + 1]);
        var pts = [];
        var steps = 4;
        for (var t = 0; t <= steps; t++) {
          var tt = t / steps;
          var x = A[0] + (B[0] - A[0]) * tt;
          var y = A[1] + (B[1] - A[1]) * tt;
          var z = A[2] + (B[2] - A[2]) * tt;
          var l = Math.sqrt(x * x + y * y + z * z) || 1;
          pts.push([x / l, y / l, z / l]);
        }
        this.appendPath(pts);
      }
    }
  };

  /* ---- 深空天体 ---- */
  SkyRenderer.prototype.drawDeepSky = function () {
    var ctx = this.ctx;
    ctx.save();
    for (var i = 0; i < SkyData.deepsky.length; i++) {
      var d = SkyData.deepsky[i];
      var wv = this.toWorld(d.eq);
      if (this.cullBelowHorizon && wv[1] < 0.01) continue;
      var p = this.project(wv[0], wv[1], wv[2]);
      if (!p) continue;
      var rad = d.mag && d.mag < 6 ? 4.5 : 3.4;
      ctx.strokeStyle = 'rgba(160,220,200,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      this.pickables.push({ x: p.x, y: p.y, r: 16, obj: d });
    }
    ctx.restore();
  };

  /* ---- 日月行星 ---- */
  SkyRenderer.prototype.drawBodies = function () {
    var ctx = this.ctx;
    var sunP = null;
    for (var i = 0; i < this.bodies.length; i++) {
      var bd = this.bodies[i];
      var wv = this.toWorld(bd.eq);
      var p = this.project(wv[0], wv[1], wv[2]);
      if (bd.key === 'Sun') sunP = p;
      if (!p) continue;
      var below = wv[1] < -0.02;
      if (below && bd.key !== 'Sun') continue;

      if (bd.key === 'Sun') {
        if (wv[1] < -0.03) continue;
        var gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, bd.r * 5);
        gr.addColorStop(0, 'rgba(255,247,214,1)');
        gr.addColorStop(0.18, 'rgba(255,226,150,0.85)');
        gr.addColorStop(0.5, 'rgba(255,190,90,0.24)');
        gr.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, bd.r * 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (bd.key === 'Moon') {
        this.drawMoon(p.x, p.y, bd.r, bd.phaseAngle || 0, sunP);
      } else {
        var g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, bd.r * 3);
        g2.addColorStop(0, '#ffffff');
        g2.addColorStop(0.28, bd.color);
        g2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, bd.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      this.pickables.push({ x: p.x, y: p.y, r: Math.max(16, bd.r * 3), obj: bd });
    }
  };

  SkyRenderer.prototype.drawMoon = function (x, y, r, phaseDeg, sunP) {
    var ctx = this.ctx;
    var ph = phaseDeg * D2R;
    var cosPh = Math.cos(ph);
    var angle = 0;
    if (sunP) angle = Math.atan2(sunP.y - y, sunP.x - x);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // 暗面
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#2a3140';
    ctx.fill();
    // 亮面
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    var rx = Math.max(0.01, Math.abs(cosPh) * r);
    ctx.save();
    ctx.scale(rx / r, 1);
    if (cosPh > 0) ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, true);
    else ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, false);
    ctx.restore();
    ctx.closePath();
    ctx.fillStyle = '#e9eef7';
    ctx.fill();
    ctx.restore();
  };

  /* ---- 地平线、方位刻度 ---- */
  SkyRenderer.prototype.drawHorizon = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    var y0 = this.horizonLineY(0), y1 = this.horizonLineY(w);
    if (y0 == null) return;

    var g = ctx.createLinearGradient(0, y0, w, y1);
    g.addColorStop(0, 'rgba(110,190,240,0.05)');
    g.addColorStop(0.5, 'rgba(140,210,255,0.42)');
    g.addColorStop(1, 'rgba(110,190,240,0.05)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-4, y0);
    ctx.lineTo(w + 4, y1);
    ctx.stroke();

    // 方位刻度
    var dirs = { 0: '北', 90: '东', 180: '南', 270: '西' };
    for (var az = 0; az < 360; az += 10) {
      var a = az * D2R;
      var p = this.project(Math.sin(a), 0, Math.cos(a));
      if (!p || p.x < -60 || p.x > w + 60) continue;
      var major = az % 30 === 0;
      var len = major ? 9 : 4;
      ctx.strokeStyle = major ? 'rgba(150,210,255,0.5)' : 'rgba(130,180,230,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + (this.basis.u[1] > 0 ? len : -len));
      ctx.stroke();
      if (dirs[az]) {
        ctx.font = '600 12px -apple-system, "PingFang SC", sans-serif';
        ctx.fillStyle = 'rgba(170,220,255,0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(dirs[az], p.x, p.y + (this.basis.u[1] > 0 ? 13 : -26));
      }
    }
  };

  /* ---- 星官：二十八宿 + 三垣 ---- */
  SkyRenderer.prototype.drawXingguan = function () {
    var ctx = this.ctx;
    var gold = 'rgba(255,206,120,0.62)';
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = gold;

    // 二十八宿分界（赤经子午线）
    var ms = SkyData.mansions;
    var i, j;
    for (i = 0; i < ms.length; i++) {
      var ra = ms[i].ra * D2R;
      var linePts = [];
      for (var dec = -70; dec <= 70; dec += 4) {
        var d = dec * D2R;
        var cd = Math.cos(d);
        linePts.push(this.toWorld([cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(d)]));
      }
      ctx.beginPath();
      this.appendPath(linePts);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 宿名标签 + 距星小环
    for (i = 0; i < ms.length; i++) {
      var m = ms[i];
      var wvm = this.toWorld(m.eq);
      var pm = this.project(wvm[0], wvm[1], wvm[2]);
      if (!pm) continue;
      ctx.strokeStyle = 'rgba(255,214,140,0.9)';
      ctx.beginPath();
      ctx.arc(pm.x, pm.y, 5, 0, Math.PI * 2);
      ctx.stroke();
      var ly = pm.y - 12;
      ctx.font = '600 12px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      var tw = ctx.measureText(m.n).width;
      ctx.fillStyle = 'rgba(8,10,18,0.55)';
      ctx.fillRect(pm.x - tw / 2 - 3, ly - 13, tw + 6, 15);
      ctx.fillStyle = 'rgba(255,220,150,0.95)';
      ctx.fillText(m.n, pm.x, ly);
      this.pickables.push({ x: pm.x, y: pm.y, r: 16, obj: m });
    }

    // 三垣
    for (i = 0; i < SkyData.enclosures.length; i++) {
      var en = SkyData.enclosures[i];
      var pts = [];
      if (en.kindOf === 'polar') {
        for (var a2 = 0; a2 <= 360; a2 += 4) {
          var dd = (90 - en.r) * D2R, aa = a2 * D2R;
          pts.push([Math.cos(dd) * Math.cos(aa), Math.cos(dd) * Math.sin(aa), Math.sin(dd)]);
        }
      } else if (en.eq) {
        var cdec = en.dec * D2R, cra = en.ra * D2R, rr = en.r * D2R;
        for (var a3 = 0; a3 <= 360; a3 += 5) {
          var th = a3 * D2R;
          var sd = Math.sin(cdec) * Math.cos(rr) + Math.cos(cdec) * Math.sin(rr) * Math.cos(th);
          var dec2 = Math.asin(Math.max(-1, Math.min(1, sd)));
          var ra2 = cra + Math.atan2(Math.sin(th) * Math.sin(rr) * Math.cos(cdec),
            Math.cos(rr) - Math.sin(cdec) * Math.sin(dec2));
          var cd2 = Math.cos(dec2);
          pts.push([cd2 * Math.cos(ra2), cd2 * Math.sin(ra2), Math.sin(dec2)]);
        }
      }
      ctx.strokeStyle = 'rgba(255,186,110,0.5)';
      ctx.lineWidth = 1.2;
      var wp3 = [];
      for (j = 0; j < pts.length; j++) wp3.push(this.toWorld(pts[j]));
      ctx.beginPath();
      this.appendPath(wp3);
      ctx.stroke();

      // 标签取区域顶部
      var center = en.kindOf === 'polar'
        ? null
        : this.project.apply(this, this.toWorld(en.eq));
      var topWorld = null;
      if (en.kindOf === 'polar') {
        var dd3 = (90 - en.r) * D2R;
        topWorld = this.toWorld([Math.cos(dd3), 0, Math.sin(dd3)]);
      } else {
        var cw = this.toWorld(en.eq);
        topWorld = [cw[0], cw[1] * Math.cos(en.r * D2R) + 0.42 * Math.sin(en.r * D2R), cw[2]];
      }
      var lp = this.project(topWorld[0], topWorld[1], topWorld[2]);
      if (lp) {
        ctx.font = '600 13px -apple-system, "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        var w2 = ctx.measureText(en.short).width;
        ctx.fillStyle = 'rgba(8,10,18,0.6)';
        ctx.fillRect(lp.x - w2 / 2 - 4, lp.y - 16, w2 + 8, 17);
        ctx.fillStyle = 'rgba(255,190,120,0.95)';
        ctx.fillText(en.short, lp.x, lp.y);
      }
      if (center) this.pickables.push({ x: center.x, y: center.y, r: 26, obj: en });
    }
    ctx.restore();
  };

  /* ---- 标签与碰撞 ---- */
  SkyRenderer.prototype._tryLabel = function (text, x, y, opt) {
    var ctx = this.ctx;
    var font = opt.font || '11px -apple-system, "PingFang SC", sans-serif';
    ctx.font = font;
    var tw = ctx.measureText(text).width;
    var pad = opt.pad == null ? 4 : opt.pad;
    var bw = tw + pad * 2, bh = (opt.size || 12) + pad;
    var bx = x - bw / 2, by = y - bh;
    for (var i = 0; i < this.labels.length; i++) {
      var o = this.labels[i];
      if (bx < o.x + o.w && bx + bw > o.x && by < o.y + o.h && by + bh > o.y) return false;
    }
    this.labels.push({ x: bx, y: by, w: bw, h: bh });
    if (opt.bg !== false) {
      ctx.fillStyle = opt.bgColor || 'rgba(4,7,14,0.42)';
      ctx.fillRect(bx, by, bw, bh);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = opt.color || 'rgba(200,220,245,0.85)';
    ctx.fillText(text, x, y - pad * 0.4);
    return true;
  };

  SkyRenderer.prototype.drawLabels = function () {
    var ctx = this.ctx;
    var i;

    // 行星
    if (this.layers.planets) {
      for (i = 0; i < this.bodies.length; i++) {
        var bd = this.bodies[i];
        var wv = this.toWorld(bd.eq);
        if (wv[1] < -0.03) continue;
        var p = this.project(wv[0], wv[1], wv[2]);
        if (!p) continue;
        this._tryLabel(bd.zh, p.x, p.y - bd.r * 2.2, {
          font: '600 12px -apple-system, "PingFang SC", sans-serif',
          color: 'rgba(255,235,190,0.95)', size: 13
        });
      }
    }

    // 亮星名
    if (this.layers.names) {
      for (i = 0; i < SkyData.stars.length; i++) {
        var s = SkyData.stars[i];
        if (s.mag > 2.4 || !s.label) continue;
        var wv2 = this.toWorld(s.eq);
        if (this.cullBelowHorizon && wv2[1] < 0) continue;
        var p2 = this.project(wv2[0], wv2[1], wv2[2]);
        if (!p2) continue;
        this._tryLabel(s.label, p2.x, p2.y - starRadius(s.mag) * 4 - 2, {
          color: 'rgba(214,232,255,0.9)', size: 11, pad: 3
        });
      }
    }

    // 星座名
    if (this.layers.constellation) {
      var list = SkyData.constellations.slice().sort(function (a, b) { return a.rank - b.rank; });
      for (i = 0; i < list.length; i++) {
        var c = list[i];
        var wv3 = this.toWorld(c.lblVec);
        if (this.cullBelowHorizon && wv3[1] < -0.05) continue;
        var p3 = this.project(wv3[0], wv3[1], wv3[2]);
        if (!p3) continue;
        var hi = (c === this.highlightConst || c === this.selected);
        var a = hi ? 1 : Math.max(0.22, 0.62 - c.rank * 0.09);
        this._tryLabel(c.zh, p3.x, p3.y, {
          font: (hi ? '600 ' : '') + '12px -apple-system, "PingFang SC", sans-serif',
          color: hi ? 'rgba(255,220,140,0.98)' : 'rgba(150,195,240,' + a + ')',
          size: 12, pad: 4, bg: hi
        });
      }
    }

    // 深空
    if (this.layers.deepsky) {
      for (i = 0; i < SkyData.deepsky.length; i++) {
        var d = SkyData.deepsky[i];
        var wv4 = this.toWorld(d.eq);
        if (this.cullBelowHorizon && wv4[1] < 0) continue;
        var p4 = this.project(wv4[0], wv4[1], wv4[2]);
        if (!p4) continue;
        this._tryLabel(d.zh || d.id, p4.x, p4.y - 6, {
          color: 'rgba(150,220,200,0.8)', size: 10, pad: 2
        });
      }
    }
  };

  SkyRenderer.prototype.drawSelection = function () {
    var sel = this.selected;
    if (!sel) {
      // 高亮星座的标注环
      return;
    }
    var obj = sel;
    var wv = null;
    if (obj.eq) wv = this.toWorld(obj.eq);
    else if (obj.kind === 'constellation') wv = this.toWorld(obj.lblVec);
    if (!wv) return;
    var p = this.project(wv[0], wv[1], wv[2]);
    if (!p) return;
    var ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,214,130,0.95)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 19, 0.2, 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 19, 0.2 + Math.PI, 1.2 + Math.PI);
    ctx.stroke();
  };

  /* ---- 拾取：返回半径内最近的可见对象 ---- */
  SkyRenderer.prototype.pick = function (x, y) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < this.pickables.length; i++) {
      var p = this.pickables[i];
      var dx = p.x - x, dy = p.y - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= p.r && d < bestD) { bestD = d; best = p.obj; }
    }
    return best;
  };

  /* 视场内最亮的恒星/行星名，用于"当前视野"提示 */
  SkyRenderer.prototype.dominantObject = function () {
    var best = null, bestScore = -1;
    for (var i = 0; i < this.bodies.length; i++) {
      var bd = this.bodies[i];
      if (bd.key === 'Sun') continue;
      var wv = this.toWorld(bd.eq);
      if (wv[1] < 0.05) continue;
      var p = this.project(wv[0], wv[1], wv[2]);
      if (!p) continue;
      var sc = 10;
      if (sc > bestScore) { bestScore = sc; best = bd; }
    }
    return best;
  };

export { SkyRenderer };
export default SkyRenderer;
