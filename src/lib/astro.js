/* 天文计算层：本地恒星时、赤道→地平旋转矩阵、日月行星位置 */
import Astronomy from './astronomy.js'

export const Astro = (function () {
  var D2R = Math.PI / 180;

  var loc = { lat: 39.9042, lon: 116.4074, name: '北京' };
  var observer = new Astronomy.Observer(loc.lat, loc.lon, 0);

  function setLocation(lat, lon, name) {
    loc.lat = lat; loc.lon = lon;
    if (name) loc.name = name;
    observer = new Astronomy.Observer(lat, lon, 0);
  }
  function getLocation() { return { lat: loc.lat, lon: loc.lon, name: loc.name }; }

  /* 本地恒星时（度）。GAST 单位小时，加经度换算。 */
  function lstDeg(date) {
    var gast = Astronomy.SiderealTime(date); // 小时
    var d = gast * 15 + loc.lon;
    return ((d % 360) + 360) % 360;
  }

  /* 赤道坐标(单位向量) → 地平坐标(east, up, north) 的 3x3 矩阵 */
  function horizontalMatrix(lst, latDeg) {
    var th = lst * D2R, ph = (latDeg == null ? loc.lat : latDeg) * D2R;
    var ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    return [
      [-st, ct, 0],
      [cp * ct, cp * st, sp],
      [-sp * ct, -sp * st, cp]
    ];
  }

  /* 把 eq 基向量变换到地平系 */
  function toHorizontal(eq, M) {
    var x = M[0][0] * eq[0] + M[0][1] * eq[1] + M[0][2] * eq[2];
    var y = M[1][0] * eq[0] + M[1][1] * eq[1] + M[1][2] * eq[2];
    var z = M[2][0] * eq[0] + M[2][1] * eq[1] + M[2][2] * eq[2];
    return { x: x, y: y, z: z, alt: Math.asin(Math.max(-1, Math.min(1, y))) / D2R,
      az: ((Math.atan2(x, z) / D2R) % 360 + 360) % 360 };
  }

  var BODIES = [
    { body: 'Sun', zh: '太阳', en: 'Sun', r: 17, color: '#ffe9a0', kind: 'sun' },
    { body: 'Moon', zh: '月亮', en: 'Moon', r: 15, color: '#e8eef8', kind: 'moon' },
    { body: 'Mercury', zh: '水星', en: 'Mercury', r: 4.5, color: '#d8cfc0', kind: 'planet' },
    { body: 'Venus', zh: '金星', en: 'Venus', r: 6, color: '#fdf3d0', kind: 'planet' },
    { body: 'Mars', zh: '火星', en: 'Mars', r: 5.2, color: '#ff9d6e', kind: 'planet' },
    { body: 'Jupiter', zh: '木星', en: 'Jupiter', r: 7.4, color: '#ffe2b0', kind: 'planet' },
    { body: 'Saturn', zh: '土星', en: 'Saturn', r: 6.4, color: '#f0e0b8', kind: 'planet' }
  ];

  function bodyInfo(date) {
    var out = [];
    for (var i = 0; i < BODIES.length; i++) {
      var b = BODIES[i];
      var astroBody = Astronomy.Body[b.body];
      var eq = Astronomy.Equator(astroBody, date, observer, true, true);
      var hor = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
      var raDeg = eq.ra * 15;
      var item = {
        kind: 'body',
        key: b.body, zh: b.zh, en: b.en, color: b.color, r: b.r, sub: b.kind,
        ra: raDeg, dec: eq.dec,
        dist: eq.dist,
        alt: hor.altitude,
        az: ((hor.azimuth % 360) + 360) % 360,
        eq: [Math.cos(eq.dec * D2R) * Math.cos(raDeg * D2R),
             Math.cos(eq.dec * D2R) * Math.sin(raDeg * D2R),
             Math.sin(eq.dec * D2R)]
      };
      if (b.body === 'Moon') {
        var ph = Astronomy.MoonPhase(date); // 0=新月, 180=满月
        item.phaseAngle = ph;
        item.illum = (1 - Math.cos(ph * D2R)) / 2;
      }
      if (b.body !== 'Sun' && b.body !== 'Moon') {
        try {
          var il = Astronomy.Illumination(astroBody, date);
          item.mag = il.mag;
        } catch (e) { /* 忽略 */ }
      }
      out.push(item);
    }
    return out;
  }

  /* 太阳高度角，用于判断白天/夜晚色调 */
  function sunAltitude(date) {
    var eq = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
    var hor = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
    return hor.altitude;
  }

  return {
    setLocation: setLocation,
    getLocation: getLocation,
    lstDeg: lstDeg,
    horizontalMatrix: horizontalMatrix,
    toHorizontal: toHorizontal,
    bodyInfo: bodyInfo,
    sunAltitude: sunAltitude,
    bodiesMeta: BODIES
  };
})();
export default Astro;
