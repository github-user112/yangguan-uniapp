/*
 * 仰观 · 小程序控制器
 * 由原 web 版 js/main.js 移植：状态机、交互、图层、面板、星轨、分享。
 * UI 通过一个响应式 ui 对象与 uvue 页面通信，不依赖任何 DOM API。
 */
import { SkyData } from './data.js'
import { Astro } from './astro.js'
import { SkyRenderer } from './sky.js'
import { Orientation } from './orientation.js'

const D2R = Math.PI / 180

const CITIES = [
  { name: '北京', lat: 39.9042, lon: 116.4074 },
  { name: '上海', lat: 31.2304, lon: 121.4737 },
  { name: '广州', lat: 23.1291, lon: 113.2644 },
  { name: '深圳', lat: 22.5431, lon: 114.0579 },
  { name: '成都', lat: 30.5728, lon: 104.0668 },
  { name: '西安', lat: 34.3416, lon: 108.9398 },
  { name: '武汉', lat: 30.5928, lon: 114.3055 },
  { name: '杭州', lat: 30.2741, lon: 120.1551 },
  { name: '哈尔滨', lat: 45.8038, lon: 126.5349 },
  { name: '乌鲁木齐', lat: 43.8256, lon: 87.6168 },
  { name: '拉萨', lat: 29.6520, lon: 91.1721 },
  { name: '昆明', lat: 25.0389, lon: 102.7183 }
]

const BODY_NOTE = {
  Sun: '太阳是离我们最近的恒星，直径约 139 万公里，光需要 8 分 20 秒才能到达地球。',
  Moon: '月球是地球唯一的天然卫星，平均距离约 38.4 万公里，它的圆缺周期约 29.5 天。',
  Mercury: '水星是最靠近太阳的行星，也是八大行星中最小的一颗，表面布满环形山。',
  Venus: '金星是夜空中除月亮外最亮的天体，浓密的二氧化碳大气造就了强烈的温室效应。',
  Mars: '火星因表面氧化铁而呈红色，拥有太阳系最高的火山奥林帕斯山。',
  Jupiter: '木星是太阳系最大的行星，质量是其余七颗行星总和的 2.5 倍，大红斑是持续数百年的风暴。',
  Saturn: '土星以壮观的环系闻名，环主要由冰块与岩石碎屑组成。'
}

function pad2 (n) { return n < 10 ? '0' + n : '' + n }
function fmtNum (v, n) { return (v == null || isNaN(v)) ? '—' : Number(v).toFixed(n == null ? 1 : n) }
function altAzOf (renderer, obj) {
  if (!obj || !obj.eq) return null
  const w = renderer.toWorld(obj.eq)
  return {
    alt: Math.asin(Math.max(-1, Math.min(1, w[1]))) / D2R,
    az: ((Math.atan2(w[0], w[2]) / D2R) % 360 + 360) % 360
  }
}
function fmtAltAz (alt, az) {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return '高度 ' + alt.toFixed(0) + '° · ' + dirs[Math.round(((az % 360) / 45)) % 8] + '方 ' + az.toFixed(0) + '°'
}

export class SkyController {
  constructor (ui) {
    this.ui = ui
    this.renderer = null
    this.orientation = null
    this.canvasCtx = null
    this.canvasId = 'sky'
    this.rectTop = 0
    this.started = false
    this.sensorOn = false
    this.hasSensorReading = false
    this.locked = true
    this.az = 180
    this.alt = 26
    this.roll = 0
    this.timeOverride = null
    this.locationSet = false
    this.trailMode = false
    this.trailPlaying = false
    this.trailSpeed = 15
    this.trailElapsed = 0
    this.trailStart = null
    this.trailLastTick = 0
    this.trailReturn = null
    this.birthMode = false
    this.birthReturn = null
    this.birthShare = null
    this.lastAstro = 0
    this.lastBodies = 0
    this.lastTrailUi = 0
    this.pointers = new Map()
    this.dragStart = null
    this.pinchStart = 0
    this.moved = false
    this.searchIndex = null
    this.currentObj = null
    this.shareCtx = null
    this._raf = null
    this._toastTimer = null
  }

  /* ---------------- 初始化 ---------------- */
  attachCanvas (canvas, ctx, width, height, dpr) {
    this.canvasCtx = ctx
    this.renderer = new SkyRenderer(canvas, ctx, width, height, dpr)
    Astro.setLocation(CITIES[0].lat, CITIES[0].lon, CITIES[0].name)
    this.renderer.updateAstro(this.currentDate())
    this.renderer.updateBodies()
    this.renderer.basisFromAngles(this.az, this.alt, this.roll)
    this.orientation = new Orientation()
    this.ui.timeText = this.timeText()
    this.ui.locText = CITIES[0].name
    this.ui.fov = Math.round(this.renderer.fov)
    this.ui.cities = CITIES.map(c => c.name)
    this.syncLayers()
    this.loop()
  }

  attachShareCanvas (ctx) { this.shareCtx = ctx }

  setCanvasRect (rect) { if (rect && typeof rect.top === 'number') this.rectTop = rect.top }

  resize (width, height, dpr) {
    if (this.renderer) this.renderer.resize(width, height, dpr)
  }

  currentDate () { return this.timeOverride || new Date() }
  timeText () {
    const d = this.currentDate()
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  }
  refreshUi () {
    this.ui.timeText = this.timeText()
    this.ui.locText = Astro.getLocation().name
    this.ui.locWarn = !this.locationSet
    // 画布可能尚未就绪（定位回调早于 canvas ready），此时只同步文本状态
    if (this.renderer) this.ui.fov = Math.round(this.renderer.fov)
    this.lastAstro = 0
    this.lastBodies = 0
  }

  toast (msg) {
    this.ui.toast = msg
    this.ui.toastShow = true
    if (this._toastTimer) clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => { this.ui.toastShow = false }, 2200)
  }

  syncLayers () {
    const L = this.renderer.layers
    this.ui.layers = [
      { key: 'milkyway', name: '银河', on: L.milkyway },
      { key: 'constellation', name: '星座', on: L.constellation },
      { key: 'names', name: '星名', on: L.names },
      { key: 'planets', name: '日月行星', on: L.planets },
      { key: 'deepsky', name: '深空', on: L.deepsky },
      { key: 'xingguan', name: '星官', on: L.xingguan },
      { key: 'horizon', name: '地平', on: L.horizon }
    ]
  }

  toggleLayer (key) {
    this.renderer.layers[key] = !this.renderer.layers[key]
    if (key === 'constellation' && !this.renderer.layers[key]) this.renderer.highlightConst = null
    this.syncLayers()
  }

  /* ---------------- 定位与地点 ---------------- */
  useCity (name) {
    const c = CITIES.find(x => x.name === name)
    if (!c) return
    Astro.setLocation(c.lat, c.lon, c.name)
    this.locationSet = true
    this.refreshUi()
  }

  /*
   * 定位：支付宝/微信的 getLocation 在「后台未开通权限」或「曾拒绝过」时
   * 直接返回 fail 且不弹任何系统授权框。因此必须先查授权态再分类处理，
   * 失败时弹自建引导层，并把「手动选城市」作为一等公民，而不是一句 toast 切北京。
   */
  requestGeo (silent = false) {
    const proceed = () => this.doGetLocation(silent)
    try {
      uni.getSetting({
        success: (res) => {
          const auth = (res && res.authSetting) || {}
          const state = auth['scope.userLocation']
          if (state === false) {
            // 已明确拒绝：再次调用不会弹窗，只能引导用户去设置
            if (silent) { if (!this.locationSet) this.useCity(CITIES[0].name) }
            else this.showLocGuide('denied')
            return
          }
          proceed()
        },
        fail: proceed
      })
    } catch (e) { proceed() }
  }

  doGetLocation (silent = false) {
    const onOk = (res) => {
      if (res && typeof res.latitude === 'number' && typeof res.longitude === 'number') {
        Astro.setLocation(res.latitude, res.longitude, '当前位置')
        this.locationSet = true
        this.hideLocGuide()
        this.refreshUi()
        if (!silent) this.toast('已定位：' + res.latitude.toFixed(2) + '°N ' + res.longitude.toFixed(2) + '°E')
      } else {
        this.showLocGuide('unsupported')
      }
    }
    const onFail = (err) => {
      // 各端字段不同：微信/uni 用 errMsg，支付宝 my.getLocation 用 errorMessage + error(码)
      const msg = String(
        (err && (err.errMsg || err.errorMessage || err.message || err.msg || err.error)) || ''
      )
      const code = err && (err.errCode !== undefined ? err.errCode : err.error)
      this.lastGeoError = msg || ('code:' + code)
      if (silent) { if (!this.locationSet) this.useCity(CITIES[0].name); return }
      // 支付宝 12 = 用户已拒绝授权，此时再点重试不会弹窗，必须给「去设置」
      if (String(code) === '12') { this.showLocGuide('denied'); return }
      this.showLocGuide(this.classifyGeoError(msg))
    }
    try {
      uni.getLocation({
        type: 'gcj02',
        // #ifndef MP-ALIPAY
        isHighAccuracy: true,
        highAccuracyExpireTime: 4000,
        // #endif
        success: onOk,
        fail: onFail
      })
    } catch (e) {
      this.showLocGuide('unsupported')
    }
  }

  // 把平台各不相同的报错文案归成三类，便于给出准确的引导。
  // 注意：不能用「含 fail」这种宽泛规则兜到 service —— 各平台几乎所有失败都带 fail，
  // 会把「用户拒绝」误判成「系统定位没开」，从而给出无效的「重新获取定位」按钮。
  classifyGeoError (msg) {
    const m = String(msg || '').toLowerCase()
    if (
      m.indexOf('deny') >= 0 || m.indexOf('denied') >= 0 || m.indexOf('auth') >= 0 ||
      m.indexOf('permission') >= 0 || m.indexOf('拒绝') >= 0 || m.indexOf('禁用') >= 0
    ) return 'denied'
    if (
      m.indexOf('未开启') >= 0 || m.indexOf('关闭') >= 0 || m.indexOf('unavailable') >= 0 ||
      m.indexOf('disabled') >= 0 || m.indexOf('location service') >= 0 || m.indexOf('系统定位') >= 0
    ) return 'service'
    return 'unsupported'
  }

  showLocGuide (kind) {
    const MAP = {
      // 已拒绝：系统不会再弹授权框，点「重试」只会静默失败 —— 只能引导去设置
      denied: {
        title: '没有定位权限',
        desc: '支付宝不会再弹授权窗。可以到设置里打开位置权限，或先手动选个城市 —— 星图一样准。',
        canRetry: false
      },
      service: {
        title: '手机的定位服务没开',
        desc: '打开系统的定位总开关后可以再试一次，也可以先手动选个城市继续看星。',
        canRetry: true
      },
      unsupported: {
        title: '暂时没拿到位置',
        desc: '可能是室内信号太弱或定位超时。可以再试一次，或先手动选个城市。',
        canRetry: true
      }
    }
    const m = MAP[kind] || MAP.unsupported
    this.ui.locGuide = { show: true, kind: kind, title: m.title, desc: m.desc, canRetry: m.canRetry }
    this.ui.locWarn = true
    // 失败时画布其实照常按默认城市（北京）渲染，这里同步一次，避免顶栏停在「定位中」
    if (this.renderer) this.refreshUi()
  }

  hideLocGuide () { this.ui.locGuide.show = false }

  openLocSetting () {
    // #ifdef MP-ALIPAY
    // 支付宝没有统一 openSetting，官方引导入口是 showAuthGuide
    if (typeof my !== 'undefined' && my.showAuthGuide) {
      my.showAuthGuide({ bizType: 'getLocation' })
      this.toast('打开「位置信息」后回来重试')
    } else {
      this.toast('请到「支付宝 - 我的 - 设置 - 隐私」里开启位置信息')
    }
    // #endif
    // #ifndef MP-ALIPAY
    try {
      uni.openSetting({})
    } catch (e) {
      this.toast('请到系统设置里为小程序开启定位权限')
    }
    // #endif
  }

  /* ---------------- 主循环 ---------------- */
  loop () {
    const now = Date.now()
    if (this.trailMode) {
      if (this.trailPlaying) {
        const dt = Math.max(0, Math.min(0.25, (now - this.trailLastTick) / 1000))
        this.trailElapsed = Math.min(360, this.trailElapsed + dt * this.trailSpeed)
        this.timeOverride = new Date(this.trailStart.getTime() + this.trailElapsed * 60000)
        if (this.trailElapsed >= 360) {
          this.trailPlaying = false
          this.renderer.trailPlaying = false
          this.toast('已完成 6 小时星轨，可分享或重新拍摄')
        }
      }
      this.trailLastTick = now
      if (now - this.lastTrailUi > 150) {
        this.ui.trailElapsed = this.fmtDuration(this.trailElapsed)
        this.ui.trailToggle = this.trailPlaying ? '暂停' : '继续'
        this.ui.timeText = this.timeText()
        this.lastTrailUi = now
      }
    }
    if (!this.sensorOn || this.locked) this.renderer.basisFromAngles(this.az, this.alt, this.roll)
    if (now - this.lastAstro > (this.trailMode ? 80 : 250)) {
      this.renderer.updateAstro(this.currentDate())
      this.lastAstro = now
    }
    if (!this.trailMode && now - this.lastBodies > 1800) {
      this.renderer.updateBodies()
      this.lastBodies = now
    }
    try { this.renderer.render() } catch (e) { /* 真机差异兜底，避免整页卡死 */ }
    if (this.canvasCtx && typeof this.canvasCtx.requestAnimationFrame === 'function') {
      this._raf = this.canvasCtx.requestAnimationFrame(() => this.loop())
    } else {
      this._raf = setTimeout(() => this.loop(), 16)
    }
  }

  stopLoop () {
    if (this._raf == null) return
    if (this.canvasCtx && typeof this.canvasCtx.cancelAnimationFrame === 'function') this.canvasCtx.cancelAnimationFrame(this._raf)
    else clearTimeout(this._raf)
    this._raf = null
  }

  /* ---------------- 触摸交互 ---------------- */
  _point (t) {
    return {
      id: t.identifier == null ? 0 : t.identifier,
      x: (typeof t.clientX === 'number' ? t.clientX : (t.x || 0)),
      y: (typeof t.clientY === 'number' ? t.clientY : (t.y || 0)) - this.rectTop
    }
  }

  onTouchStart (e) {
    if (this.trailMode) { this.toast('星轨拍摄中，视角已锁定'); return }
    const ts = e.touches || []
    for (const raw of ts) {
      const p = this._point(raw)
      this.pointers.set(p.id, p)
    }
    if (this.pointers.size === 1) {
      const p = this._point(ts[0])
      this.dragStart = { x: p.x, y: p.y, t: Date.now() }
      this.moved = false
      if (!this.locked) {
        const a = this.renderer.cameraAngles()
        this.az = a.az; this.alt = a.alt; this.roll = 0
        this.locked = true
      }
    } else if (this.pointers.size >= 2) {
      const pts = Array.from(this.pointers.values())
      this.pinchStart = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      this.moved = true
    }
  }

  onTouchMove (e) {
    const ts = e.touches || []
    if (!ts.length || !this.pointers.size) return
    const p = this._point(ts[0])
    const prev = this.pointers.get(p.id) || p
    const dx = p.x - prev.x, dy = p.y - prev.y
    this.pointers.set(p.id, p)
    if (this.pointers.size >= 2) {
      const pts = Array.from(this.pointers.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (this.pinchStart > 0) {
        this.renderer.setFov(this.renderer.fov * (this.pinchStart / Math.max(1, dist)))
        this.pinchStart = dist
      }
      return
    }
    if (this.dragStart && (Math.abs(p.x - this.dragStart.x) > 6 || Math.abs(p.y - this.dragStart.y) > 6)) this.moved = true
    const scale = this.renderer.fov / this.renderer.h
    this.az = ((this.az - dx * scale) % 360 + 360) % 360
    this.alt = Math.max(-88, Math.min(88, this.alt + dy * scale))
  }

  onTouchEnd (e) {
    const ts = e.changedTouches || e.touches || []
    for (const raw of ts) this.pointers.delete(this._point(raw).id)
    if (this.pointers.size < 2) this.pinchStart = 0
    if (this.pointers.size === 0 && this.dragStart) {
      const dt = Date.now() - this.dragStart.t
      if (!this.moved && dt < 320) {
        const p = this._point(ts[0] || { clientX: this.dragStart.x, clientY: this.dragStart.y })
        const obj = this.renderer.pick(p.x, p.y)
        if (obj) this.showDetail(obj)
        else this.hideDetail()
      }
      this.dragStart = null
    }
  }

  /* ---------------- 详情 ---------------- */
  showDetail (obj) {
    if (!obj) return
    this.currentObj = obj
    const tags = []
    const aa = altAzOf(this.renderer, obj)
    let title = '', sub = '', note = ''
    if (obj.kind === 'star') {
      const cn = SkyData.constByAbbr[obj.con]
      title = obj.zh || obj.en || '恒星'
      sub = (obj.en || '') + (cn ? ' · ' + cn.zh : '')
      tags.push('视星等 ' + fmtNum(obj.mag, 2))
      if (obj.bv != null) tags.push(obj.bv < 0.3 ? '偏蓝' : (obj.bv > 1.2 ? '偏红' : '黄白'))
      if (aa) tags.push(fmtAltAz(aa.alt, aa.az))
      note = obj.zh
        ? (cn ? cn.zh + '的 ' + obj.zh + '，' : '') + '视星等 ' + fmtNum(obj.mag, 2) + '。' +
          (obj.mag < 1.5 ? '是全天最明亮的恒星之一，即使在城市灯光下也很容易找到。'
            : obj.mag < 3 ? '在市区仍可用肉眼看到。' : '需要在光污染较小的环境下观测。')
        : '一颗视星等 ' + fmtNum(obj.mag, 2) + ' 的恒星。'
    } else if (obj.kind === 'constellation') {
      title = obj.zh; sub = (obj.en || '') + (obj.la ? ' · ' + obj.la : '')
      tags.push('星座'); tags.push(obj.stars.length + ' 颗亮星')
      if (aa) tags.push(fmtAltAz(aa.alt, aa.az))
      note = obj.note || '国际天文学联合会划分的 88 星座之一。'
      if (obj.stars.length) note += '\n主要亮星：' + obj.stars.slice(0, 4).map(s => s.zh || s.en || ('HIP ' + s.hip)).join('、')
    } else if (obj.kind === 'body') {
      title = obj.zh; sub = obj.en
      if (aa) tags.push(fmtAltAz(aa.alt, aa.az))
      if (obj.mag != null) tags.push('视星等 ' + fmtNum(obj.mag, 1))
      if (obj.key === 'Moon' && obj.illum != null) tags.push('月面照亮 ' + Math.round(obj.illum * 100) + '%')
      if (obj.dist) tags.push('距离 ' + (obj.dist < 1 ? (obj.dist * 149597870).toFixed(0) + ' 公里' : obj.dist.toFixed(2) + ' AU'))
      note = BODY_NOTE[obj.key] || ''
    } else if (obj.kind === 'deepsky') {
      title = obj.zh || obj.id; sub = obj.desig || obj.en || ''
      tags.push(obj.typeZh || '深空天体')
      if (obj.mag != null) tags.push('视星等 ' + fmtNum(obj.mag, 1))
      if (aa) tags.push(fmtAltAz(aa.alt, aa.az))
      note = '梅西耶天体 ' + obj.id + '，' + obj.typeZh + '。' +
        (obj.mag != null && obj.mag <= 6 ? '在优良的暗夜环境下肉眼可见，用双筒望远镜效果更佳。' : '建议使用双筒望远镜或小口径天文望远镜观测。')
    } else if (obj.kind === 'mansion') {
      title = obj.full; sub = obj.group + ' · 二十八宿'
      tags.push('距星 HIP ' + obj.hip); tags.push('赤经 ' + obj.ra.toFixed(1) + '°')
      note = (obj.note || '') + '\n宿度为示意，分界由距星赤经推算。'
    } else if (obj.kind === 'enclosure') {
      title = obj.n; sub = '三垣'; tags.push('星官区域'); note = obj.note || ''
    }
    this.ui.detail = { title, sub, tags, note }
    this.ui.detailShow = true
    this.renderer.selected = obj
    this.renderer.highlightConst = obj.kind === 'constellation' ? obj : null
    this.shareInfo = { title, sub, tags, note, place: Astro.getLocation().name, time: this.timeText() }
  }

  hideDetail () {
    this.ui.detailShow = false
    if (this.renderer) { this.renderer.selected = null; this.renderer.highlightConst = null }
  }

  /* ---------------- 时间/地点面板 ---------------- */
  openTimePanel () {
    if (this.trailMode) this.stopTrails()
    if (this.birthMode) this.exitBirthSky(false)
    this.ui.panelMode = 'time'
    this.ui.panelShow = true
    this.ui.timeMinutes = Math.round(this.currentDate().getHours() * 60 + this.currentDate().getMinutes())
    this.ui.fov = Math.round(this.renderer.fov)
    this.ui.currentCity = Astro.getLocation().name
  }

  setCity (name) {
    this.useCity(name)
    this.ui.currentCity = name
    this.toast('已切换到 ' + name)
  }

  setTimeMinutes (v) {
    const m = Number(v)
    const base = new Date()
    base.setHours(Math.floor(m / 60), m % 60, 0, 0)
    this.timeOverride = base
    this.refreshUi()
  }

  applyQuick (t) {
    if (t === '现在') this.timeOverride = null
    else {
      const parts = t.split(':')
      const base = new Date()
      let hh = parseInt(parts[0], 10), mm = parseInt(parts[1], 10)
      if (hh < 12) base.setDate(base.getDate() + 1)
      base.setHours(hh, mm, 0, 0)
      this.timeOverride = base
    }
    const d = this.currentDate()
    this.ui.timeMinutes = d.getHours() * 60 + d.getMinutes()
    this.refreshUi()
  }

  setFov (v) { this.renderer.setFov(Number(v)); this.ui.fov = Math.round(this.renderer.fov) }

  /* ---------------- 搜索 ---------------- */
  buildSearchIndex () {
    if (this.searchIndex) return this.searchIndex
    const idx = []
    SkyData.constellations.forEach(c => idx.push({ obj: c, kind: '星座', name: c.zh, extra: (c.en || '') + ' ' + (c.la || '') }))
    SkyData.stars.forEach(s => {
      if (s.mag <= 4.2 && (s.zh || s.en)) idx.push({ obj: s, kind: '恒星', name: s.zh || s.en, extra: (s.en || '') + ' ' + (s.zh || '') + ' HIP' + s.hip })
    })
    SkyData.deepsky.forEach(d => idx.push({ obj: d, kind: '深空', name: d.zh || d.id, extra: d.id + ' ' + (d.zh || '') + ' ' + (d.en || '') }))
    SkyData.mansions.forEach(m => idx.push({ obj: m, kind: '星官', name: m.full, extra: (m.group || '') + ' ' + (m.note || '') }))
    SkyData.enclosures.forEach(e => idx.push({ obj: e, kind: '星官', name: e.n, extra: '三垣 ' + (e.note || '') }))
    const polaris = idx.filter(it => it.kind === '恒星' && it.name === '勾陈一')[0]
    if (polaris) idx.push({ obj: polaris.obj, kind: '恒星', name: '北极星', extra: 'Polaris 勾陈一 小熊座' })
    this.searchIndex = idx
    return idx
  }

  openSearch () {
    if (this.trailMode) this.stopTrails()
    if (this.birthMode) this.exitBirthSky(false)
    this.ui.panelMode = 'search'
    this.ui.panelShow = true
    this.ui.searchQuery = ''
    this.renderResults('')
  }

  renderResults (q) {
    const ql = (q || '').trim().toLowerCase()
    let list = []
    if (!ql) {
      for (const n of ['天狼', '猎户座', '北斗', '昴星团', 'M42', 'M31', '心宿二', '织女']) {
        const hit = this.buildSearchIndex().find(it => it.name === n || it.extra.indexOf(n) >= 0)
        if (hit) list.push(hit)
      }
    } else {
      for (const it of this.buildSearchIndex()) {
        if (list.length >= 30) break
        if (it.name.toLowerCase().indexOf(ql) >= 0 || it.extra.toLowerCase().indexOf(ql) >= 0) list.push(it)
      }
      for (const bd of this.renderer.bodies) {
        if (bd.zh.indexOf(q) >= 0 || bd.en.toLowerCase().indexOf(ql) >= 0) {
          list.unshift({ obj: bd, kind: '行星', name: bd.zh, extra: bd.en })
        }
      }
    }
    this._searchResults = list
    this.ui.searchResults = list.map((it, i) => ({
      i, kind: it.kind, name: it.name,
      meta: (it.extra || '').split(' ').filter(Boolean).slice(0, 2).join(' · ')
    }))
  }

  pickResult (i) {
    const hit = this._searchResults[Number(i)]
    if (!hit) return
    const aa = altAzOf(this.renderer, hit.obj)
    if (aa) {
      this.locked = true
      this.az = aa.az
      this.alt = Math.max(-86, Math.min(86, aa.alt))
      this.renderer.setFov(Math.min(this.renderer.fov, 52))
    }
    this.showDetail(hit.obj)
    this.ui.panelShow = false
  }

  /* ---------------- 星轨（轻量实现） ---------------- */
  fmtDuration (minutes) {
    const total = Math.max(0, Math.round(minutes))
    if (total < 60) return total + '分钟'
    const hh = Math.floor(total / 60), mm = total % 60
    return hh + '小时' + (mm ? pad2(mm) + '分' : '')
  }

  startTrails () {
    if (this.trailMode) return
    this.hideDetail()
    this.ui.panelShow = false
    this.trailReturn = { time: this.timeOverride ? new Date(this.timeOverride.getTime()) : null, locked: this.locked }
    if (!this.locked) {
      const a = this.renderer.cameraAngles()
      this.az = a.az; this.alt = a.alt; this.roll = 0
    }
    this.locked = true
    this.trailMode = true
    this.trailElapsed = 0
    this.trailStart = new Date(this.currentDate().getTime())
    this.timeOverride = new Date(this.trailStart.getTime())
    this.renderer.trailMode = true
    this.renderer.resetTrails()
    this.ui.trailShow = true
    this.ui.trailElapsed = '已曝光 0分钟'
    this.ui.trailToggle = '暂停'
    this.setTrailPlaying(true)
    this.refreshUi()
    this.toast('视角已锁定，开始累积星轨')
  }

  setTrailPlaying (on) {
    if (!this.trailMode) return
    this.trailPlaying = on
    this.renderer.trailPlaying = on
    this.trailLastTick = Date.now()
    this.ui.trailToggle = on ? '暂停' : '继续'
  }

  cycleTrailSpeed () {
    const speeds = [5, 15, 30, 60]
    this.trailSpeed = speeds[(speeds.indexOf(this.trailSpeed) + 1) % speeds.length]
    this.ui.trailSpeed = this.trailSpeed + '分/秒'
    this.toast('1 秒 = ' + this.trailSpeed + ' 分钟')
  }

  resetTrails () {
    if (!this.trailMode) return
    this.trailElapsed = 0
    this.timeOverride = new Date(this.trailStart.getTime())
    this.renderer.resetTrails()
    this.setTrailPlaying(true)
    this.refreshUi()
    this.toast('已清空轨迹，重新拍摄')
  }

  stopTrails () {
    if (!this.trailMode) return
    const ret = this.trailReturn
    this.trailMode = false
    this.trailPlaying = false
    this.renderer.trailMode = false
    this.renderer.trailPlaying = false
    this.timeOverride = ret && ret.time ? ret.time : null
    this.locked = ret ? ret.locked : true
    this.trailReturn = null
    this.ui.trailShow = false
    this.refreshUi()
  }

  /* ---------------- 出生星空（简化版） ---------------- */
  openBirthPanel () {
    if (this.trailMode) this.stopTrails()
    this.hideDetail()
    this.ui.panelMode = 'birth'
    this.ui.panelShow = true
    this.ui.birthDate = this.ui.birthDate || ''
    this.ui.birthDateLabel = this.ui.birthDate || '请选择日期'
    this.ui.birthTime = this.ui.birthTime || '22:00'
    this.ui.birthTimeLabel = this.ui.birthTime
    this.ui.birthCity = this.ui.birthCity || 'current'
  }

  applyBirthSky () {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.ui.birthDate || '')
    const tm = /^(\d{2}):(\d{2})$/.exec(this.ui.birthTime || '')
    if (!dm || !tm) { this.toast('请填写完整日期，如 1995-08-15'); return }
    const y = +dm[1], mo = +dm[2], da = +dm[3], hh = +tm[1], mi = +tm[2]
    const dt = new Date(y, mo - 1, da, hh, mi, 0, 0)
    if (y < 1900 || dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== da || dt > new Date()) {
      this.toast('请输入 1900 年至今的有效日期'); return
    }
    if (!this.birthMode) {
      this.birthReturn = {
        time: this.timeOverride ? new Date(this.timeOverride.getTime()) : null,
        loc: Astro.getLocation(), locationSet: this.locationSet,
        locked: this.locked, az: this.az, alt: this.alt, roll: this.roll, fov: this.renderer.fov
      }
    }
    this.birthMode = true
    this.ui.birthMode = true
    if (this.ui.birthCity !== 'current') this.useCity(CITIES[Number(this.ui.birthCity)].name)
    this.timeOverride = dt
    this.renderer.updateAstro(dt)
    this.renderer.updateBodies()

    let moon = null, sun = null
    const planets = []
    for (const bd of this.renderer.bodies) {
      if (bd.key === 'Moon') moon = bd
      else if (bd.key === 'Sun') sun = bd
      else if (bd.alt > 0) planets.push(bd)
    }
    planets.sort((a, b) => (a.mag == null ? 99 : a.mag) - (b.mag == null ? 99 : b.mag))
    const target = moon && moon.alt > 0 ? moon : planets[0]
    if (target) {
      const aa = altAzOf(this.renderer, target)
      this.locked = true; this.az = aa.az; this.alt = Math.max(-86, Math.min(86, aa.alt))
      this.renderer.setFov(Math.min(this.renderer.fov, 56))
    }
    const phaseNames = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月']
    const phase = phaseNames[Math.round((moon.phaseAngle || 0) / 45) % 8]
    const illum = Math.round((moon.illum || 0) * 100)
    const dateLabel = y + '年' + mo + '月' + da + '日'
    let summary = dateLabel + '，' + Astro.getLocation().name + '的月相为' + phase + '，月面照亮约 ' + illum + '%。'
    if (planets.length) summary += planets.map(b => b.zh).join('、') + '位于地平线上方。'
    if (sun && sun.alt > 0) summary += '那时仍是白天，星图展示天体位置，肉眼观星需等日落后。'
    this.birthShare = { title: '我出生那天的星空', sub: dateLabel + ' · ' + Astro.getLocation().name, tags: [phase + ' ' + illum + '%'], note: summary }
    this.ui.panelMode = 'birthResult'
    this.ui.birthResult = { dateLabel, time: this.ui.birthTime, phase, illum, summary }
    this.refreshUi()
  }

  exitBirthSky (notify = true) {
    if (!this.birthMode) return
    const ret = this.birthReturn
    this.birthMode = false
    this.ui.birthMode = false
    this.birthShare = null
    this.birthReturn = null
    if (ret) {
      this.timeOverride = ret.time
      this.locationSet = ret.locationSet
      this.locked = ret.locked
      this.az = ret.az; this.alt = ret.alt; this.roll = ret.roll
      Astro.setLocation(ret.loc.lat, ret.loc.lon, ret.loc.name)
      this.renderer.setFov(ret.fov)
    } else this.timeOverride = null
    this.ui.panelShow = false
    this.hideDetail()
    this.refreshUi()
    if (notify) this.toast('已回到此刻')
  }

  /* ---------------- 引导 / 传感器 ---------------- */
  startExperience () {
    if (this.started) return
    this.started = true
    this.ui.onboardShow = false
    // 支付宝小程序的定位授权由 getLocation 自身弹出；这里用非静默调用并把结果提示给用户。
    // 方向传感器（罗盘/加速度计）没有独立的授权 scope，由下面的 startCompass/startAccelerometer
    // 在用户手势后启动，平台按需激活。
    this.toast('正在请求定位授权…')
    this.requestGeo(false)
    if (this.orientation) {
      this.orientation.start((f, u) => {
        this.hasSensorReading = true
        if (!this.locked) this.renderer.setBasis(f, u)
      })
      setTimeout(() => {
        if (!this.hasSensorReading) {
          this.sensorOn = false
          this.locked = true
          this.toast('未检测到方向传感器，已使用拖动模式')
          this.ui.hint = '拖动屏幕环顾四周 · 双指缩放'
          this.ui.hintShow = true
        } else {
          this.sensorOn = true
          this.locked = false
          this.ui.hint = '举起手机，慢慢转动身体'
          this.ui.hintShow = true
          setTimeout(() => { this.ui.hintShow = false }, 4500)
        }
      }, 1600)
    }
    setTimeout(() => { this.ui.hintShow = false }, 6000)
  }

  toggleLock () {
    if (this.trailMode) { this.toast('请先退出星轨模式'); return }
    if (this.sensorOn && this.hasSensorReading) {
      this.locked = !this.locked
      if (!this.locked) this.orientation.reset()
      else {
        const a = this.renderer.cameraAngles()
        this.az = a.az; this.alt = a.alt; this.roll = 0
      }
      this.toast(this.locked ? '已锁定视角，可拖动浏览' : '已恢复跟随手机姿态')
    } else this.toast('当前为拖动模式')
  }

  /* ---------------- 分享卡（简化：离屏 canvas → 预览图片） ---------------- */
  share () {
    if (!this.shareCtx) { this.toast('分享画布尚未就绪'); return }
    const info = this.birthShare || this.shareInfo
    if (!info) { this.toast('先点开一个天体或生成出生星空'); return }
    try {
      const ctx = this.shareCtx
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#04060d'
      ctx.fillRect(0, 0, 540, 720)
      ctx.fillStyle = '#7fd1ff'
      ctx.font = '28px sans-serif'
      ctx.fillText('仰 观', 40, 70)
      ctx.fillStyle = '#f4f8ff'
      ctx.font = '36px sans-serif'
      ctx.fillText(String(info.title || '').slice(0, 12), 40, 200)
      ctx.fillStyle = '#96b9e1'
      ctx.font = '18px sans-serif'
      ctx.fillText(String(info.sub || ''), 40, 240)
      ctx.fillText(String(info.place || '') + ' · ' + String(info.time || ''), 40, 275)
      ctx.fillStyle = '#c8d8ee'
      ctx.font = '18px sans-serif'
      const note = String(info.note || '')
      for (let i = 0; i < Math.min(6, Math.ceil(note.length / 22)); i++) {
        ctx.fillText(note.slice(i * 22, (i + 1) * 22), 40, 340 + i * 28)
      }
      ctx.fillStyle = '#ffd682'
      ctx.fillText('星图 · 真实恒星时', 40, 660)
      uni.canvasToTempFilePath({
        canvasId: 'shareCanvas',
        success: (res) => {
          uni.previewImage({ urls: [res.tempFilePath], fail: () => this.toast('预览失败') })
        },
        fail: () => this.toast('分享图生成失败')
      })
    } catch (e) {
      this.toast('分享图生成失败')
    }
  }
}

export { CITIES }
export default SkyController
