<template>
  <view class="page">
    <!-- 全屏星图：支付宝小程序需在 canvas 的 ready 回调里取上下文 -->
    <canvas id="sky" class="sky" type="2d" disable-scroll
      @ready="onCanvasReady"
      @touchstart="onTouchStart" @touchmove="onTouchMove"
      @touchend="onTouchEnd" @touchcancel="onTouchEnd"></canvas>

    <view class="topbar">
      <button class="pill" @click="onLocate"><text class="pill-txt">◎ {{ ui.locText }}</text></button>
      <button class="pill" @click="onTime"><text class="pill-txt">◷ {{ ui.timeText }}</text></button>
      <button class="pill" @click="onSearch"><text class="pill-txt">⌕ 搜索</text></button>
      <button class="pill" @click="onLock"><text class="pill-txt">⟳ {{ ui.locked ? '锁定' : '跟随' }}</text></button>
    </view>

    <view v-if="ui.hintShow" class="hint"><text>{{ ui.hint }}</text></view>

    <view class="chips">
      <button class="chip" @click="onLayers"><text>图层</text></button>
      <button class="chip" :class="ui.trailShow ? 'on' : ''" @click="onTrails"><text>星轨</text></button>
      <button class="chip" :class="ui.birthMode ? 'on' : ''" @click="onBirth"><text>出生星空</text></button>
    </view>

    <!-- 星轨控制条 -->
    <view v-if="ui.trailShow" class="trail-bar">
      <text class="trail-elapsed">{{ ui.trailElapsed }}</text>
      <button class="mini" @click="onTrailToggle"><text>{{ ui.trailToggle }}</text></button>
      <button class="mini" @click="onTrailSpeed"><text>{{ ui.trailSpeed }}</text></button>
      <button class="mini" @click="onTrailReset"><text>重拍</text></button>
      <button class="mini" @click="onShare"><text>分享</text></button>
      <button class="mini" @click="onTrailExit"><text>退出</text></button>
    </view>

    <!-- 详情卡 -->
    <view v-if="ui.detailShow" class="sheet" @click.stop>
      <button class="close" @click="onCloseDetail"><text>×</text></button>
      <text class="title">{{ ui.detail.title }}</text>
      <text class="sub">{{ ui.detail.sub }}</text>
      <view class="tags">
        <text v-for="(tag, i) in ui.detail.tags" :key="i" class="tag">{{ tag }}</text>
      </view>
      <text class="note">{{ ui.detail.note }}</text>
      <button class="primary" @click="onShare"><text>生成分享卡片</text></button>
    </view>

    <!-- 面板：时间地点 / 搜索 / 出生星空 -->
    <view v-if="ui.panelShow" class="sheet panel" @click.stop>
      <button class="close" @click="onClosePanel"><text>×</text></button>

      <view v-if="ui.panelMode === 'layers'">
        <text class="panel-title">图层</text>
        <button v-for="item in ui.layers" :key="item.key" class="layer-row"
          @click="onLayer(item.key)">
          <text class="layer-name">{{ item.name }}</text>
          <text class="layer-state" :class="item.on ? 'on' : ''">{{ item.on ? '已开启' : '已关闭' }}</text>
        </button>
      </view>

      <view v-if="ui.panelMode === 'time'">
        <text class="panel-title">时间与地点</text>
        <text class="label">观测地点</text>
        <view class="city-grid">
          <button v-for="name in ui.cities" :key="name" class="city" :class="ui.currentCity === name ? 'on' : ''"
            @click="onCity(name)"><text>{{ name }}</text></button>
        </view>
        <text class="label">观测时间 {{ ui.timeText }}</text>
        <slider :value="ui.timeMinutes" min="0" :max="1439" step="10" @change="onTimeSlider" />
        <view class="city-grid">
          <button class="city" @click="onQuick('现在')"><text>现在</text></button>
          <button class="city" @click="onQuick('20:00')"><text>20:00</text></button>
          <button class="city" @click="onQuick('22:00')"><text>22:00</text></button>
          <button class="city" @click="onQuick('00:00')"><text>00:00</text></button>
          <button class="city" @click="onQuick('02:00')"><text>02:00</text></button>
        </view>
        <text class="label">视角 {{ ui.fov }}°</text>
        <slider :value="ui.fov" min="24" :max="102" step="1" @change="onFovSlider" />
      </view>

      <view v-if="ui.panelMode === 'search'">
        <text class="panel-title">搜索天体</text>
        <input class="search-input" :value="ui.searchQuery" placeholder="恒星 / 星座 / 深空，如 天狼、M42"
          @input="onSearchInput" />
        <scroll-view class="results" scroll-y="true">
          <button v-for="item in ui.searchResults" :key="item.i" class="result" @click="onResult(item.i)">
            <text class="rkind">{{ item.kind }}</text>
            <text class="rname">{{ item.name }}</text>
            <text class="rmeta">{{ item.meta }}</text>
          </button>
          <text v-if="!ui.searchResults.length" class="empty">没有找到匹配的天体</text>
        </scroll-view>
      </view>

      <view v-if="ui.panelMode === 'birth'">
        <text class="panel-title">出生那天的星空</text>
        <text class="intro">选择你来到世界的日期与时间，看看那一刻真实的月亮与星光。</text>

        <view class="form-row">
          <text class="form-label">出生日期</text>
          <picker mode="date" start="1900-01-01" :end="ui.today" :value="ui.birthDate" @change="onBirthDate">
            <view class="form-value"><text>{{ ui.birthDateLabel }}</text></view>
          </picker>
        </view>

        <view class="form-row">
          <text class="form-label">当地时间</text>
          <picker mode="time" :value="ui.birthTime" @change="onBirthTime">
            <view class="form-value"><text>{{ ui.birthTimeLabel }}</text></view>
          </picker>
        </view>

        <view class="form-row">
          <text class="form-label">出生地点</text>
          <picker :range="ui.citiesWithCurrent" :value="ui.birthCityIndex" @change="onBirthCity">
            <view class="form-value"><text>{{ ui.birthCityLabel }}</text></view>
          </picker>
        </view>

        <button class="primary" @click="onBirthGenerate"><text>看那天的星空</text></button>
        <text class="privacy">日期只在本机计算，不上传</text>
      </view>

      <view v-if="ui.panelMode === 'birthResult'">
        <text class="panel-title">那一天，星空也在场</text>
        <view class="birth-card">
          <text class="birth-card-date">{{ ui.birthResult.dateLabel }} {{ ui.birthResult.time }}</text>
          <text class="birth-card-phase">{{ ui.birthResult.phase }}</text>
          <text class="birth-card-illum">月面照亮 {{ ui.birthResult.illum }}%</text>
        </view>
        <text class="note">{{ ui.birthResult.summary }}</text>
        <button class="primary" @click="onShare"><text>生成那天的分享卡</text></button>
        <view class="birth-actions">
          <button class="mini" @click="onBirthAgain"><text>换个日期</text></button>
          <button class="mini" @click="onBirthExit"><text>回到此刻</text></button>
        </view>
      </view>
    </view>

    <!-- 新手引导 -->
    <view v-if="ui.onboardShow" class="onboard">
      <view class="onboard-inner">
        <text class="brand">仰 观</text>
        <text class="onboard-sub">举起手机，看见头顶真实的星空</text>
        <text class="onboard-line">01  点击开始后，允许定位授权，星图与天空对齐</text>
        <text class="onboard-line">02  举起手机，平台会启用方向传感器</text>
        <text class="onboard-line">03  在「图层」里点亮星官，对照两千年前的星空</text>
        <button class="primary" @click="onStart"><text>开始观星</text></button>
        <text class="tiny">需要设备方向传感器与定位授权</text>
      </view>
    </view>

    <view v-if="ui.toastShow" class="toast"><text>{{ ui.toast }}</text></view>

    <!-- 分享卡离屏画布（支付宝小程序 createImage 不支持本地图，这里纯绘制文字） -->
    <canvas id="shareCanvas" class="share-canvas" type="2d" @ready="onShareReady"></canvas>
  </view>
</template>

<script setup lang="ts">
  import { reactive, getCurrentInstance, onMounted } from 'vue'
  import { onUnload } from '@dcloudio/uni-app'
  import SkyController, { CITIES } from '@/lib/controller.js'

  function pad2(n : number) : string { return n < 10 ? '0' + n : '' + n }
  const _now = new Date()
  const todayStr = _now.getFullYear() + '-' + pad2(_now.getMonth() + 1) + '-' + pad2(_now.getDate())

  const ui = reactive({
    locText: '定位中',
    locWarn: true,
    timeText: '--:--',
    fov: 68,
    locked: true,
    hint: '拖动屏幕环顾四周 · 双指缩放',
    hintShow: false,
    toast: '',
    toastShow: false,
    layers: [] as any[],
    cities: CITIES.map((c : any) => c.name),
    citiesWithCurrent: ['当前位置'].concat(CITIES.map((c : any) => c.name)),
    cityNames: CITIES.map((c : any) => c.name),
    currentCity: '北京',
    timeMinutes: 1320,
    panelShow: false,
    panelMode: 'time',
    searchQuery: '',
    searchResults: [] as any[],
    today: todayStr,
    birthDate: '',
    birthDateLabel: '请选择日期',
    birthTime: '22:00',
    birthTimeLabel: '22:00',
    birthCity: 'current',
    birthCityIndex: 0,
    birthCityLabel: '当前位置',
    birthResult: { dateLabel: '', time: '', phase: '', illum: 0, summary: '' },
    detailShow: false,
    detail: { title: '', sub: '', tags: [] as string[], note: '' },
    trailShow: false,
    trailElapsed: '已曝光 0分钟',
    trailToggle: '暂停',
    trailSpeed: '15分/秒',
    birthMode: false,
    onboardShow: true
  })

  const c = new SkyController(ui)

  function metrics() {
    let w = 375, h = 667, dpr = 1
    try {
      const info : any = uni.getWindowInfo()
      w = info.windowWidth || w
      h = info.windowHeight || h
      dpr = info.pixelRatio || dpr
    } catch (e) {
      try {
        const info : any = uni.getSystemInfoSync()
        w = info.windowWidth || w
        h = info.windowHeight || h
        dpr = info.pixelRatio || dpr
      } catch (e2) {}
    }
    return { w, h, dpr }
  }

  function setupCanvas(context : any) {
    const ctx = context.getContext('2d')
    if (!ctx) return
    const m = metrics()
    // 支付宝小程序：canvas 的布局尺寸需异步查询，不能读 offsetWidth
    // #ifdef MP-ALIPAY
    uni.createSelectorQuery().select('#sky').boundingClientRect().exec((ret : any[]) => {
      const rect : any = ret && ret.length ? ret[0] : null
      const width = rect && rect.width ? rect.width : m.w
      const height = rect && rect.height ? rect.height : m.h
      if (rect) c.setCanvasRect(rect)
      if (ctx.canvas) {
        ctx.canvas.width = Math.round(width * m.dpr)
        ctx.canvas.height = Math.round(height * m.dpr)
      }
      c.attachCanvas(ctx.canvas || null, ctx, width, height, m.dpr)
    })
    // #endif
    // #ifndef MP-ALIPAY
    if (ctx.canvas) {
      ctx.canvas.width = Math.round(m.w * m.dpr)
      ctx.canvas.height = Math.round(m.h * m.dpr)
    }
    c.attachCanvas(ctx.canvas || null, ctx, m.w, m.h, m.dpr)
    // #endif
  }

  // 记录画布是否已绑定，避免 ready 与兜底路径重复初始化
  let canvasInited = false

  function onCanvasReady() {
    if (canvasInited) return
    canvasInited = true
    // 支付宝小程序必须在 canvas 的 ready 事件里获取上下文
    uni.createCanvasContextAsync({
      id: 'sky',
      // #ifndef MP-ALIPAY
      component: getCurrentInstance()!.proxy as any,
      // #endif
      success: (context : any) => setupCanvas(context),
      fail: () => { ui.toast = '画布初始化失败'; ui.toastShow = true }
    } as any)
  }

  // 兜底：部分平台（如 H5）canvas 组件不派发 ready 事件，
  // 直接按选择器取节点拿 2d 上下文，保证星图一定被绑定
  function fallbackCanvasInit() {
    if (canvasInited) return
    const query = uni.createSelectorQuery()
    // #ifndef MP-ALIPAY
    query.in(getCurrentInstance()?.proxy as any)
    // #endif
    query.select('#sky').fields({ node: true, size: true } as any, (res : any) => {
      if (canvasInited || !res || !res.node) return
      const ctx = res.node.getContext('2d')
      if (!ctx) return
      canvasInited = true
      const m = metrics()
      const width = res.width || m.w
      const height = res.height || m.h
      res.node.width = Math.round(width * m.dpr)
      res.node.height = Math.round(height * m.dpr)
      c.attachCanvas(res.node, ctx, width, height, m.dpr)
    }).exec()
  }

  onMounted(() => {
    setTimeout(fallbackCanvasInit, 700)
  })

  function onShareReady() {
    uni.createCanvasContextAsync({
      id: 'shareCanvas',
      // #ifndef MP-ALIPAY
      component: getCurrentInstance()!.proxy as any,
      // #endif
      success: (context : any) => {
        const ctx = context.getContext('2d')
        if (!ctx || !ctx.canvas) return
        ctx.canvas.width = 540
        ctx.canvas.height = 720
        c.attachShareCanvas(ctx)
      },
      fail: () => {}
    } as any)
  }

  function onTouchStart(e : any) { c.onTouchStart(e) }
  function onTouchMove(e : any) { c.onTouchMove(e) }
  function onTouchEnd(e : any) { c.onTouchEnd(e) }

  function onLayer(key : string) { c.toggleLayer(key) }
  function onLayers() { ui.panelMode = 'layers'; ui.panelShow = true }
  function onLocate() { c.requestGeo(false); c.openTimePanel() }
  function onTime() { c.openTimePanel() }
  function onSearch() { c.openSearch() }
  function onLock() { c.toggleLock(); ui.locked = c.locked }
  function onCloseDetail() { c.hideDetail() }
  function onClosePanel() { ui.panelShow = false }
  function onCity(name : string) { c.setCity(name) }
  function onTimeSlider(e : any) { c.setTimeMinutes(e.detail.value) }
  function onFovSlider(e : any) { c.setFov(e.detail.value) }
  function onQuick(t : string) { c.applyQuick(t) }
  function onSearchInput(e : any) {
    ui.searchQuery = e.detail.value
    c.renderResults(ui.searchQuery)
  }
  function onResult(i : number) { c.pickResult(i) }
  function onTrails() { if (c.trailMode) c.stopTrails(); else c.startTrails() }
  function onTrailToggle() { c.setTrailPlaying(!c.trailPlaying) }
  function onTrailSpeed() { c.cycleTrailSpeed() }
  function onTrailReset() { c.resetTrails() }
  function onTrailExit() { c.stopTrails() }
  function onShare() { c.share() }

  function onBirth() { c.openBirthPanel() }
  function onBirthDate(e : any) {
    const raw = String(e.detail.value || '')
    ui.birthDate = raw.replace(/\//g, '-')
    ui.birthDateLabel = ui.birthDate || '请选择日期'
  }
  function onBirthTime(e : any) {
    ui.birthTime = String(e.detail.value || '22:00')
    ui.birthTimeLabel = ui.birthTime
  }
  function onBirthCity(e : any) {
    const i = Number(e.detail.value)
    ui.birthCityIndex = i
    ui.birthCityLabel = ui.citiesWithCurrent[i]
    ui.birthCity = i === 0 ? 'current' : String(i - 1)
  }
  function onBirthGenerate() { c.applyBirthSky() }
  function onBirthAgain() { c.openBirthPanel() }
  function onBirthExit() { c.exitBirthSky(true) }
  function onStart() { c.startExperience(); ui.locked = c.locked }

  onUnload(() => {
    c.stopLoop()
    if (c.orientation) c.orientation.stop()
  })
</script>

<style>
  .page {
    position: relative;
    flex: 1;
    width: 100%;
    height: 100vh;
    background-color: #04060d;
    overflow: hidden;
  }
  .sky {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: #04060d;
  }
  .topbar {
    position: fixed;
    left: 10px;
    top: 10px;
    right: 10px;
    flex-direction: row;
    z-index: 10;
  }
  .pill, .chip, .mini, .city, .primary {
    width: auto;
    flex-shrink: 0;
  }
  .pill {
    margin: 0 6px 0 0;
    padding: 5px 10px;
    border-radius: 18px;
    background-color: rgba(12,20,34,0.72);
    border: 1px solid rgba(120,170,220,0.22);
  }
  .pill-txt { color: #cfe3ff; font-size: 12px; }
  .hint {
    position: fixed;
    left: 0;
    right: 0;
    top: 54px;
    text-align: center;
    z-index: 10;
  }
  .hint text {
    color: #9fc8f0;
    font-size: 12px;
    background-color: rgba(4,7,14,0.55);
    padding: 4px 10px;
    border-radius: 12px;
  }
  .chips {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(10px + var(--uni-safe-area-inset-bottom, 0px));
    min-height: 38px;
    height: auto;
    white-space: nowrap;
    z-index: 10;
    flex-direction: row;
    justify-content: flex-start;
    padding-left: 10px;
    padding-right: 10px;
  }
  .chips-inner { flex-direction: row; padding-left: 10px; padding-right: 10px; width: max-content; min-width: 100%; }
  .chip {
    margin: 0 6px 0 0;
    padding: 6px 11px;
    border-radius: 16px;
    background-color: rgba(12,20,34,0.72);
    border: 1px solid rgba(120,170,220,0.18);
    white-space: nowrap;
    flex-grow: 0;
    flex-shrink: 0;
  }
  .chip text { color: #9db4d0; font-size: 12px; }
  .chip.on { background-color: rgba(40,90,140,0.85); border-color: rgba(127,209,255,0.5); }
  .chip.on text { color: #dff1ff; }
  .trail-bar {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: calc(56px + var(--uni-safe-area-inset-bottom, 0px));
    flex-direction: row;
    flex-wrap: wrap;
    background-color: rgba(6,10,20,0.88);
    border-radius: 10px;
    padding: 8px;
    z-index: 11;
  }
  .trail-elapsed { color: #ffd682; font-size: 13px; margin-right: 8px; }
  .mini { margin: 2px; padding: 4px 8px; border-radius: 8px; background-color: #1b2c44; }
  .mini text { color: #d6e8ff; font-size: 12px; }
  .sheet {
    position: fixed;
    left: 14px;
    right: 14px;
    bottom: calc(60px + var(--uni-safe-area-inset-bottom, 0px));
    max-height: 62vh;
    background-color: rgba(8,14,26,0.96);
    border: 1px solid rgba(120,170,220,0.25);
    border-radius: 14px;
    padding: 18px;
    z-index: 20;
  }
  .panel { top: 70px; bottom: calc(60px + var(--uni-safe-area-inset-bottom, 0px)); overflow: scroll; }
  .chips { justify-content: center; }
  .layer-row {
    width: 100%;
    margin-bottom: 6px;
    padding: 10px 12px;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    background-color: #0e1a2c;
    border-radius: 10px;
  }
  .layer-name { color: #dce9ff; font-size: 14px; }
  .layer-state { color: #7f97b5; font-size: 12px; }
  .layer-state.on { color: #7fd1ff; }
  .form-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
  }
  .form-label { color: #89a3c2; font-size: 13px; width: 72px; }
  .form-value {
    flex: 1;
    padding: 9px 10px;
    background-color: #0d1728;
    border-radius: 8px;
  }
  .form-value text { color: #e7f1ff; font-size: 13px; }
  .birth-card {
    margin-top: 14px;
    padding: 16px;
    background-color: rgba(18,32,54,0.85);
    border-radius: 12px;
    align-items: center;
  }
  .birth-card-date { color: #9fb4d0; font-size: 12px; }
  .birth-card-phase { color: #ffd682; font-size: 26px; font-weight: bold; margin-top: 6px; }
  .birth-card-illum { color: #9fd8ff; font-size: 13px; margin-top: 4px; }
  .birth-actions { flex-direction: row; margin-top: 12px; }
  .close {
    position: absolute;
    right: 10px;
    top: 8px;
    background-color: transparent;
  }
  .close text { color: #8fa8c8; font-size: 22px; }
  .title { color: #f4f8ff; font-size: 20px; font-weight: bold; }
  .sub { color: #8fa3c2; font-size: 12px; margin-top: 4px; }
  .panel-title { color: #f4f8ff; font-size: 18px; font-weight: bold; margin-bottom: 12px; }
  .label { color: #7fd1ff; font-size: 12px; margin-top: 14px; margin-bottom: 6px; }
  .tags { flex-direction: row; flex-wrap: wrap; margin-top: 10px; }
  .tag {
    color: #bcd4f0;
    font-size: 11px;
    background-color: rgba(40,70,110,0.5);
    padding: 3px 7px;
    border-radius: 6px;
    margin: 0 6px 0 0;
    margin-bottom: 6px;
  }
  .note { color: #c8d8ee; font-size: 13px; line-height: 1.7; margin-top: 12px; }
  .primary {
    margin-top: 16px;
    padding: 9px 18px;
    border-radius: 10px;
    background-color: #2a7ec4;
    /* uni-app 的 button 默认带较大内边距，加 nowrap 防止四字标题折行 */
    white-space: nowrap;
  }
  .primary text { color: #ffffff; font-size: 14px; }
  .city-grid { flex-direction: row; flex-wrap: wrap; }
  .city {
    margin: 3px;
    padding: 6px 10px;
    border-radius: 8px;
    background-color: #142238;
  }
  .city text { color: #a8c4e4; font-size: 12px; }
  .city.on { background-color: #2a7ec4; }
  .city.on text { color: #ffffff; }
  .search-input, .form-input {
    width: 100%;
    padding: 9px;
    background-color: #0d1728;
    border-radius: 8px;
    color: #e7f1ff;
    font-size: 13px;
  }
  .results { max-height: 300px; margin-top: 10px; }
  .result {
    width: 100%;
    padding: 8px;
    margin-bottom: 4px;
    background-color: #0e1a2c;
    border-radius: 8px;
    flex-direction: row;
    align-items: center;
  }
  .rkind { color: #7fd1ff; font-size: 11px; width: 42px; }
  .rname { color: #e7f1ff; font-size: 13px; flex: 1; }
  .rmeta { color: #7f97b5; font-size: 11px; }
  .empty { color: #8095b0; font-size: 12px; }
  .intro, .privacy { color: #89a3c2; font-size: 12px; line-height: 1.6; }
  .birth-date { color: #ffd682; font-size: 14px; }
  .birth-phase { color: #9fd8ff; font-size: 13px; margin-top: 8px; }
  .onboard {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    background-color: #04060d;
    z-index: 30;
    justify-content: center;
    align-items: center;
    padding: 24px;
  }
  .onboard-inner { width: 100%; max-width: 420px; }
  .brand { color: #eaf4ff; font-size: 40px; font-weight: bold; letter-spacing: 8px; }
  .onboard-sub { color: #8fb4d8; font-size: 14px; margin-top: 10px; }
  .onboard-line { color: #b9cde4; font-size: 13px; margin-top: 18px; }
  .tiny { color: #6e86a3; font-size: 11px; margin-top: 14px; }
  .toast {
    position: fixed;
    left: 20px;
    right: 20px;
    bottom: calc(116px + var(--uni-safe-area-inset-bottom, 0px));
    background-color: rgba(10,18,32,0.92);
    border-radius: 8px;
    padding: 10px;
    z-index: 40;
    text-align: center;
  }
  .toast text { color: #d9e9ff; font-size: 13px; }
  .share-canvas {
    position: fixed;
    left: -9999px;
    top: 0;
    width: 270px;
    height: 360px;
  }
</style>
