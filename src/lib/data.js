/* 数据层：把 bundle 里的紧凑数组展开为带预计算向量/索引的对象 */
import raw from './skydata.js'

export const SkyData = (function () {
  var D2R = Math.PI / 180;

  function eqVec(raDeg, decDeg) {
    var ra = raDeg * D2R, dec = decDeg * D2R, cd = Math.cos(dec);
    return [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec)];
  }

  // ---------------- 恒星 ----------------
  var stars = [];
  var starByHip = Object.create(null);
  (raw.stars && raw.stars.stars || []).forEach(function (s) {
    var st = {
      kind: 'star',
      hip: s[0], ra: s[1], dec: s[2], mag: s[3], bv: s[4],
      zh: s[5] || '', en: s[6] || '', con: s[7] || '',
      eq: eqVec(s[1], s[2])
    };
    st.label = st.zh || st.en;
    stars.push(st);
    if (st.hip && !starByHip[st.hip]) starByHip[st.hip] = st;
  });

  var starByName = Object.create(null);
  stars.forEach(function (s) {
    if (s.zh && !starByName[s.zh]) starByName[s.zh] = s;
    if (s.en && !starByName[s.en]) starByName[s.en] = s;
  });

  // ---------------- 星座 ----------------
  var constellations = [];
  var constByAbbr = Object.create(null);
  (raw.constellations && raw.constellations.list || []).forEach(function (c) {
    var lines = (c.lines || []).map(function (seg) {
      return seg.map(function (pt) { return eqVec(pt[0], pt[1]); });
    }).filter(function (seg) { return seg.length >= 2; });
    var item = {
      kind: 'constellation',
      a: c.a, zh: c.zh, en: c.en, la: c.la, rank: c.rank || 3,
      lbl: c.lbl, lblVec: eqVec(c.lbl[0], c.lbl[1]),
      lines: lines, note: c.note || '',
      stars: []
    };
    constellations.push(item);
    constByAbbr[c.a] = item;
  });
  stars.forEach(function (s) {
    var c = constByAbbr[s.con];
    if (c) c.stars.push(s);
  });
  constellations.forEach(function (c) {
    c.stars.sort(function (a, b) { return a.mag - b.mag; });
  });

  // ---------------- 深空天体 ----------------
  var deepsky = (raw.deepsky && raw.deepsky.list || []).map(function (d) {
    return {
      kind: 'deepsky',
      id: d.id, ra: d.ra, dec: d.dec, mag: d.mag,
      type: d.type, typeZh: d.typeZh, en: d.en, zh: d.zh,
      desig: d.desig, dim: d.dim,
      eq: eqVec(d.ra, d.dec),
      label: d.zh || d.id
    };
  });

  // ---------------- 银河：五层轮廓预计算赤道单位向量 ----------------
  var milkyway = (raw.milkyway && raw.milkyway.list || []).map(function (f) {
    return {
      id: f.id,
      rings: (f.rings || []).map(function (ring) {
        return ring.map(function (pt) { return eqVec(pt[0], pt[1]); });
      })
    };
  });

  // ---------------- 星官 ----------------
  var xg = raw.xingguan || { mansions: [], enclosures: [] };
  var mansions = (xg.mansions || []).filter(function (m) { return m.ra != null; }).map(function (m) {
    return {
      kind: 'mansion',
      n: m.n, full: m.full, group: m.group, ra: m.ra, dec: m.dec,
      hip: m.hip, note: m.note, action: m.action,
      eq: eqVec(m.ra, m.dec)
    };
  });
  var enclosures = (xg.enclosures || []).map(function (e) {
    return {
      kind: 'enclosure',
      n: e.n, short: e.short, ra: e.ra, dec: e.dec, r: e.r, kindOf: e.kind, note: e.note,
      eq: e.ra != null ? eqVec(e.ra, e.dec) : null
    };
  });

  // 二十八宿按赤经排序（跨 0° 已由构建脚本保证连续）
  mansions.sort(function (a, b) { return a.ra - b.ra; });

  return {
    stars: stars,
    starByHip: starByHip,
    starByName: starByName,
    constellations: constellations,
    constByAbbr: constByAbbr,
    deepsky: deepsky,
    deepskyById: deepsky.reduce(function (m, d) { m[d.id] = d; return m; }, Object.create(null)),
    milkyway: milkyway,
    mansions: mansions,
    mansionsNote: xg.note || '',
    enclosures: enclosures,
    eqVec: eqVec
  };
})();
export default SkyData;
