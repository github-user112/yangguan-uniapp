<template>
  <view class="page">
    <!-- 全屏星图：支付宝小程序需在 canvas 的 ready 回调里取上下文 -->
    <canvas id="sky" class="sky" type="2d" disable-scroll
      @ready="onCanvasReady"
      @touchstart="onTouchStart" @touchmove="onTouchMove"
      @touchend="onTouchEnd" @touchcancel="onTouchEnd"></canvas>

    <view class="topbar">
      <button class="loc-pill" @click="onLocate">
        <text class="loc-dot" :class="ui.locWarn ? 'warn' : ''">◎</text>
        <text class="loc-name">{{ ui.locText }}</text>
        <text class="loc-time">{{ ui.timeText }}</text>
        <text class="loc-caret">▾</text>
      </button>
      <view class="top-right">
        <button class="icon-btn" @click="onSearch"><text class="icon-txt">搜</text></button>
        <button class="lock-pill" :class="ui.locked ? '' : 'on'" @click="onLock">
          <text class="lock-txt">{{ ui.locked ? '锁定' : '跟随' }}</text>
        </button>
      </view>
    </view>

    <view v-if="ui.hintShow" class="hint"><text class="hint-txt">{{ ui.hint }}</text></view>

    <view class="chips">
      <button class="chip" @click="onLayers"><text class="chip-txt">图层</text></button>
      <button class="chip" :class="ui.trailShow ? 'on' : ''" @click="onTrails"><text class="chip-txt">星轨</text></button>
      <button class="chip" :class="ui.birthMode ? 'on' : ''" @click="onBirth"><text class="chip-txt">出生星空</text></button>
    </view>

    <!-- 星轨控制条 -->
    <view v-if="ui.trailShow" class="trail-bar">
      <text class="trail-elapsed">{{ ui.trailElapsed }}</text>
      <view class="trail-actions">
        <button class="mini" @click="onTrailToggle"><text class="mini-txt">{{ ui.trailToggle }}</text></button>
        <button class="mini" @click="onTrailSpeed"><text class="mini-txt">{{ ui.trailSpeed }}</text></button>
        <button class="mini" @click="onTrailReset"><text class="mini-txt">重拍</text></button>
        <button class="mini" @click="onShare"><text class="mini-txt">分享</text></button>
        <button class="mini" @click="onTrailExit"><text class="mini-txt">退出</text></button>
      </view>
    </view>

    <!-- 详情卡 -->
    <view v-if="ui.detailShow" class="sheet detail" @click.stop>
      <view class="grabber"></view>
      <view class="sheet-head">
        <text class="sheet-title">{{ ui.detail.title }}</text>
        <button class="close" @click="onCloseDetail"><text class="close-x">×</text></button>
      </view>
      <text class="sub">{{ ui.detail.sub }}</text>
      <view class="tags">
        <text v-for="(tag, i) in ui.detail.tags" :key="i" class="tag">{{ tag }}</text>
      </view>
      <text class="note">{{ ui.detail.note }}</text>
      <button class="primary block" @click="onShare"><text class="primary-txt">生成分享卡片</text></button>
    </view>

    <!-- 面板：图层 / 时间地点 / 搜索 / 出生星空 -->
    <view v-if="ui.panelShow" class="mask" @click="onClosePanel"></view>
    <view v-if="ui.panelShow" class="sheet panel" :class="'panel-' + ui.panelMode" @click.stop>
      <view class="grabber"></view>
      <view class="sheet-head">
        <view class="head-txt">
          <text class="sheet-title">{{ panelTitle() }}</text>
          <text class="sheet-sub">{{ panelSub() }}</text>
        </view>
        <button class="close" @click="onClosePanel"><text class="close-x">×</text></button>
      </view>

      <scroll-view class="sheet-body" scroll-y="true">

      <view v-if="ui.panelMode === 'layers'" class="pane">
        <view v-for="item in ui.layers" :key="item.key" class="row" :class="item.on ? 'row-on' : ''"
          @click="onLayer(item.key)">
          <text class="row-name">{{ item.name }}</text>
          <view class="sw" :class="item.on ? 'on' : ''"><view class="knob"></view></view>
        </view>
      </view>

      <view v-if="ui.panelMode === 'time'" class="pane">
        <text class="field-label">观测地点</text>
        <view class="grid">
          <button v-for="name in ui.cities" :key="name" class="opt" :class="ui.currentCity === name ? 'on' : ''"
            @click="onCity(name)"><text class="opt-txt">{{ name }}</text></button>
        </view>
        <button class="link-row" @click="onRelocate"><text class="link-txt">使用当前位置</text></button>
        <text class="field-label">观测时间 {{ ui.timeText }}</text>
        <slider class="slider" :value="ui.timeMinutes" min="0" :max="1439" step="10" @change="onTimeSlider" />
        <view class="grid">
          <button class="opt" @click="onQuick('现在')"><text class="opt-txt">现在</text></button>
          <button class="opt" @click="onQuick('20:00')"><text class="opt-txt">20:00</text></button>
          <button class="opt" @click="onQuick('22:00')"><text class="opt-txt">22:00</text></button>
          <button class="opt" @click="onQuick('00:00')"><text class="opt-txt">00:00</text></button>
          <button class="opt" @click="onQuick('02:00')"><text class="opt-txt">02:00</text></button>
        </view>
        <text class="field-label">视野 {{ ui.fov }}°</text>
        <slider class="slider" :value="ui.fov" min="24" :max="102" step="1" @change="onFovSlider" />
      </view>

      <view v-if="ui.panelMode === 'search'" class="pane">
        <input class="input" :value="ui.searchQuery" placeholder="恒星 / 星座 / 深空，如 天狼、M42"
          @input="onSearchInput" />
        <scroll-view class="results" scroll-y="true">
          <view v-for="item in ui.searchResults" :key="item.i" class="result" @click="onResult(item.i)">
            <text class="rkind">{{ item.kind }}</text>
            <text class="rname">{{ item.name }}</text>
            <text class="rmeta">{{ item.meta }}</text>
          </view>
          <view v-if="!ui.searchResults.length" class="empty">
            <text class="empty-txt">没有找到匹配的天体</text>
          </view>
        </scroll-view>
      </view>

      <view v-if="ui.panelMode === 'birth'" class="pane">
        <text class="intro">选择你来到世界的日期与时间，看看那一刻真实的月亮与星光。</text>

        <view class="form-row">
          <text class="form-label">出生日期</text>
          <picker class="form-picker" mode="date" start="1900-01-01" :end="ui.today" :value="ui.birthDate" @change="onBirthDate">
            <view class="form-value"><text class="form-value-txt">{{ ui.birthDateLabel }}</text></view>
          </picker>
        </view>

        <view class="form-row">
          <text class="form-label">当地时间</text>
          <picker class="form-picker" mode="time" :value="ui.birthTime" @change="onBirthTime">
            <view class="form-value"><text class="form-value-txt">{{ ui.birthTimeLabel }}</text></view>
          </picker>
        </view>

        <view class="form-row">
          <text class="form-label">出生地点</text>
          <picker class="form-picker" :range="ui.citiesWithCurrent" :value="ui.birthCityIndex" @change="onBirthCity">
            <view class="form-value"><text class="form-value-txt">{{ ui.birthCityLabel }}</text></view>
          </picker>
        </view>

        <button class="primary block" @click="onBirthGenerate"><text class="primary-txt">看那天的星空</text></button>
        <text class="footnote">日期只在本机计算，不会上传</text>
      </view>

      <view v-if="ui.panelMode === 'birthResult'" class="pane">
        <view class="birth-card">
          <text class="birth-card-date">{{ ui.birthResult.dateLabel }} {{ ui.birthResult.time }}</text>
          <text class="birth-card-phase">{{ ui.birthResult.phase }}</text>
          <text class="birth-card-illum">月面照亮 {{ ui.birthResult.illum }}%</text>
        </view>
        <text class="note">{{ ui.birthResult.summary }}</text>
        <button class="primary block" @click="onShare"><text class="primary-txt">生成那天的分享卡</text></button>
        <view class="btn-row">
          <button class="ghost grow" @click="onBirthAgain"><text class="ghost-txt">换个日期</text></button>
          <button class="ghost grow" @click="onBirthExit"><text class="ghost-txt">回到此刻</text></button>
        </view>
      </view>

      </scroll-view>
    </view>

    <!-- 定位授权引导层：失败不再是一句 toast，给三条出路 -->
    <view v-if="ui.locGuide.show" class="mask strong" @click="onLocLater"></view>
    <view v-if="ui.locGuide.show" class="guide-wrap">
      <view class="guide" @click.stop>
        <view class="guide-ico" :class="ui.locGuide.kind === 'denied' ? 'warn' : ''">
          <text class="guide-ico-txt">◎</text>
        </view>
        <text class="guide-title">{{ ui.locGuide.title }}</text>
        <text class="guide-desc">{{ ui.locGuide.desc }}</text>
        <button class="primary block" @click="onLocRetry"><text class="primary-txt">重新获取定位</text></button>
        <button class="ghost block" @click="onLocManual"><text class="ghost-txt">手动选城市</text></button>
        <view class="guide-foot">
          <text class="link-txt" @click="onLocSetting">去系统设置</text>
          <text class="link-dot">·</text>
          <text class="link-txt" @click="onLocLater">以后再说</text>
        </view>
      </view>
    </view>

    <!-- 新手引导 -->
    <view v-if="ui.onboardShow" class="onboard">
      <view class="onboard-inner">
        <text class="brand">仰 观</text>
        <view class="brand-rule"></view>
        <text class="onboard-sub">举起手机，看见头顶真实的星空</text>
        <view class="onboard-list">
          <view class="onboard-item">
            <text class="onboard-num">01</text>
            <text class="onboard-txt">点击开始，允许定位，星图与天空对齐</text>
          </view>
          <view class="onboard-item">
            <text class="onboard-num">02</text>
            <text class="onboard-txt">举起手机，方向传感器自动接管视角</text>
          </view>
          <view class="onboard-item">
            <text class="onboard-num">03</text>
            <text class="onboard-txt">点亮星官，对照两千年前的星空</text>
          </view>
        </view>
        <button class="primary block" @click="onStart"><text class="primary-txt">开始观星</text></button>
        <text class="footnote center">需要方向传感器与定位授权</text>
      </view>
    </view>

    <view v-if="ui.toastShow" class="toast"><text class="toast-txt">{{ ui.toast }}</text></view>

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
    onboardShow: true,
    locGuide: { show: false, kind: '', title: '', desc: '' }
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
  // 点顶部胶囊只负责打开「时间与地点」，是否用当前位置由用户在面板里决定
  function onLocate() { c.openTimePanel() }
  function onRelocate() { c.requestGeo(false) }
  function onLocRetry() { c.requestGeo(false) }
  function onLocManual() { c.hideLocGuide(); c.openTimePanel() }
  function onLocLater() { c.hideLocGuide() }
  function onLocSetting() { c.openLocSetting() }

  function panelTitle() {
    const m = ui.panelMode
    if (m === 'layers') return '图层'
    if (m === 'time') return '时间与地点'
    if (m === 'search') return '搜索天体'
    if (m === 'birth') return '出生那天的星空'
    if (m === 'birthResult') return '那一天，星空也在场'
    return ''
  }
  function panelSub() {
    const m = ui.panelMode
    if (m === 'layers') return '1627 颗恒星 · 88 星座 · 110 深空'
    if (m === 'time') return ui.locText + ' · ' + ui.timeText
    if (m === 'search') return '恒星 / 星座 / 深空'
    if (m === 'birth') return '日期只在本机计算，不会上传'
    if (m === 'birthResult') return ui.birthResult.dateLabel || ''
    return ''
  }
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
  /* ---- 基础 ---- */
  .page {
    position: relative;
    width: 100%;
    height: 100vh;
    background-color: #05070f;
    overflow: hidden;
  }
  .sky {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: #05070f;
  }

  /* ---- 顶部工具条：地点+时间合并胶囊，右侧图标与锁定 ---- */
  .topbar {
    position: fixed;
    left: 12px;
    right: 12px;
    top: 10px;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    z-index: 10;
  }
  .loc-pill {
    display: flex;
    height: 30px;
    line-height: 1;
    margin: 0;
    padding: 0 11px;
    border-radius: 15px;
    background-color: rgba(13, 20, 36, 0.86);
    border: 1px solid rgba(120, 170, 220, 0.22);
    flex-direction: row;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .loc-dot { color: #6cc9ff; font-size: 12px; line-height: 1; margin-right: 5px; }
  .loc-dot.warn { color: #ffca7a; }
  .loc-name { color: #dfeaff; font-size: 12px; line-height: 1; }
  .loc-time { color: #8fa6c0; font-size: 12px; line-height: 1; margin-left: 7px; }
  .loc-caret { color: #7f97b5; font-size: 10px; line-height: 1; margin-left: 6px; }
  .top-right { flex-direction: row; align-items: center; flex-shrink: 0; }
  .icon-btn {
    display: flex;
    width: 30px;
    line-height: 1;
    height: 30px;
    margin: 0 6px 0 0;
    padding: 0;
    border-radius: 50%;
    background-color: rgba(13, 20, 36, 0.86);
    border: 1px solid rgba(120, 170, 220, 0.22);
    align-items: center;
    justify-content: center;
  }
  .icon-txt { color: #dfeaff; font-size: 12px; line-height: 1; }
  .lock-pill {
    display: flex;
    height: 30px;
    line-height: 1;
    margin: 0;
    padding: 0 12px;
    border-radius: 15px;
    background-color: rgba(13, 20, 36, 0.86);
    border: 1px solid rgba(120, 170, 220, 0.22);
    align-items: center;
    justify-content: center;
  }
  .lock-pill.on { background-color: rgba(31, 127, 184, 0.9); border-color: rgba(140, 215, 255, 0.5); }
  .lock-txt { color: #9fb8d2; font-size: 12px; line-height: 1; }
  .lock-pill.on .lock-txt { color: #ffffff; }

  .hint {
    position: fixed;
    left: 0;
    right: 0;
    top: 54px;
    align-items: center;
    z-index: 10;
  }
  .hint-txt {
    color: #a8cbe8;
    font-size: 12px;
    background-color: rgba(5, 7, 15, 0.66);
    padding: 5px 12px;
    border-radius: 12px;
  }

  /* ---- 底部胶囊 ---- */
  .chips {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(12px + var(--uni-safe-area-inset-bottom, 0px));
    flex-direction: row;
    justify-content: center;
    align-items: center;
    z-index: 10;
  }
  .chip {
    display: flex;
    height: 32px;
    line-height: 1;
    margin: 0 4px;
    padding: 0 14px;
    border-radius: 16px;
    background-color: rgba(13, 20, 36, 0.86);
    border: 1px solid rgba(120, 170, 220, 0.18);
    align-items: center;
    justify-content: center;
    flex-grow: 0;
    flex-shrink: 0;
  }
  .chip-txt { color: #9db4d0; font-size: 12px; line-height: 1; }
  .chip.on { background-color: rgba(31, 127, 184, 0.92); border-color: rgba(140, 215, 255, 0.5); }
  .chip.on .chip-txt { color: #ffffff; }

  /* ---- 星轨控制条 ---- */
  .trail-bar {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(58px + var(--uni-safe-area-inset-bottom, 0px));
    background-color: rgba(8, 14, 26, 0.94);
    border: 1px solid rgba(120, 170, 220, 0.2);
    border-radius: 14px;
    padding: 10px 12px;
    z-index: 11;
  }
  .trail-elapsed { color: #ffca7a; font-size: 12px; }
  .trail-actions { flex-direction: row; flex-wrap: wrap; margin-top: 8px; }
  .mini {
    display: flex;
    height: 28px;
    line-height: 1;
    margin: 0 6px 0 0;
    padding: 0 11px;
    border-radius: 14px;
    background-color: #17263c;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .mini-txt { color: #d6e8ff; font-size: 12px; line-height: 1; }

  /* ---- 遮罩与面板 ---- */
  .mask {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(3, 5, 12, 0.55);
    z-index: 19;
  }
  .mask.strong { background-color: rgba(3, 5, 12, 0.78); z-index: 31; }
  .sheet {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(12px + var(--uni-safe-area-inset-bottom, 0px));
    background-color: #0a1120;
    border: 1px solid rgba(120, 170, 220, 0.24);
    border-radius: 18px;
    z-index: 20;
    overflow: hidden;
  }
  .detail { padding: 0 16px 16px; }
  .panel {
    top: auto;
    bottom: calc(58px + var(--uni-safe-area-inset-bottom, 0px));
    flex-direction: column;
  }
  .panel-layers { height: 54vh; }
  .panel-time { height: 52vh; }
  .panel-search { height: 62vh; }
  .panel-birth { height: 54vh; }
  .panel-birthResult { height: 56vh; }
  .grabber {
    width: 34px;
    height: 3px;
    border-radius: 2px;
    background-color: rgba(160, 190, 220, 0.28);
    margin: 8px auto 0;
    flex-shrink: 0;
  }
  .sheet-head {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 11px 16px 9px;
    flex-shrink: 0;
  }
  .head-txt { flex: 1; }
  .sheet-title { color: #f2f7ff; font-size: 16px; font-weight: bold; }
  .sheet-sub { color: #7189a5; font-size: 11px; margin-top: 3px; }
  .close {
    display: flex;
    width: 28px;
    height: 28px;
    margin: 0;
    padding: 0;
    border-radius: 50%;
    line-height: 1;
    background-color: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.12);
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .close-x { color: #a9c0d8; font-size: 15px; line-height: 1; }
  .sheet-body {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0 16px 14px;
    box-sizing: border-box;
  }
  .pane { padding-bottom: 2px; }

  /* ---- 列表行与开关 ---- */
  .row {
    height: 42px;
    margin-bottom: 6px;
    padding: 0 12px;
    border-radius: 10px;
    background-color: #101a2c;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .row-on { background-color: #122540; }
  .row-name { color: #a9c0d8; font-size: 13px; }
  .row-on .row-name { color: #eaf4ff; }
  .sw {
    width: 34px;
    height: 20px;
    padding: 2px;
    border-radius: 10px;
    background-color: rgba(255, 255, 255, 0.12);
    flex-direction: row;
    justify-content: flex-start;
  }
  .sw.on { background-color: #1f7fb8; justify-content: flex-end; }
  .knob { width: 16px; height: 16px; border-radius: 50%; background-color: #7e94ad; }
  .sw.on .knob { background-color: #ffffff; }

  /* ---- 表单与选项 ---- */
  .field-label { color: #6cc9ff; font-size: 11px; margin-top: 14px; margin-bottom: 8px; }
  .grid { flex-direction: row; flex-wrap: wrap; }
  .opt {
    display: flex;
    height: 30px;
    line-height: 1;
    margin: 0 6px 6px 0;
    padding: 0 12px;
    border-radius: 8px;
    background-color: #142238;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .opt-txt { color: #a8c4e4; font-size: 12px; line-height: 1; }
  .opt.on { background-color: #1f7fb8; }
  .opt.on .opt-txt { color: #ffffff; }
  .slider { width: 100%; margin: 0; }
  .link-row {
    display: flex;
    height: 30px;
    margin: 0;
    padding: 0;
    line-height: 1;
    background-color: transparent;
    align-items: center;
    justify-content: flex-start;
  }
  .link-txt { color: #6cc9ff; font-size: 12px; line-height: 1; }
  .link-dot { color: #4a5f78; font-size: 12px; line-height: 1; margin: 0 8px; }

  .input {
    height: 38px;
    width: 100%;
    padding: 0 12px;
    background-color: #0d1728;
    border: 1px solid rgba(120, 170, 220, 0.16);
    border-radius: 10px;
    color: #e7f1ff;
    font-size: 13px;
  }
  .results { max-height: 300px; margin-top: 10px; }
  .result {
    padding: 9px 11px;
    margin-bottom: 5px;
    background-color: #101a2c;
    border-radius: 9px;
    flex-direction: row;
    align-items: center;
  }
  .rkind { color: #6cc9ff; font-size: 11px; width: 40px; }
  .rname { color: #eaf4ff; font-size: 13px; flex: 1; }
  .rmeta { color: #7f97b5; font-size: 11px; }
  .empty { padding: 22px 0; align-items: center; }
  .empty-txt { color: #647d99; font-size: 12px; }

  .form-row { flex-direction: row; align-items: center; margin-top: 10px; }
  .form-label { color: #8fa6c0; font-size: 12px; width: 70px; flex-shrink: 0; }
  .form-picker { flex: 1; }
  .form-value {
    height: 38px;
    padding: 0 12px;
    background-color: #0d1728;
    border: 1px solid rgba(120, 170, 220, 0.16);
    border-radius: 10px;
    justify-content: center;
  }
  .form-value-txt { color: #e7f1ff; font-size: 13px; }

  /* ---- 出生星空结果卡 ---- */
  .birth-card {
    margin-top: 4px;
    padding: 18px 16px;
    background-color: #12203a;
    border: 1px solid rgba(120, 170, 220, 0.2);
    border-radius: 12px;
    align-items: center;
  }
  .birth-card-date { color: #8fa6c0; font-size: 11px; }
  .birth-card-phase { color: #ffca7a; font-size: 24px; font-weight: bold; margin-top: 6px; }
  .birth-card-illum { color: #9fd8ff; font-size: 12px; margin-top: 4px; }

  /* ---- 按钮 ---- */
  .primary {
    display: flex;
    height: 42px;
    line-height: 1;
    margin: 14px 0 0;
    padding: 0 18px;
    border-radius: 11px;
    background-color: #1f7fb8;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }
  .primary-txt { color: #ffffff; font-size: 14px; line-height: 1; }
  .block { width: 100%; }
  .ghost {
    display: flex;
    height: 42px;
    line-height: 1;
    margin: 8px 0 0;
    padding: 0 16px;
    border-radius: 11px;
    background-color: transparent;
    border: 1px solid rgba(120, 170, 220, 0.3);
    align-items: center;
    justify-content: center;
  }
  .ghost-txt { color: #b3c6dc; font-size: 13px; line-height: 1; }
  .btn-row { flex-direction: row; margin-top: 8px; }
  .btn-row .ghost { flex: 1; margin: 0 4px; }
  .grow { flex: 1; }

  /* ---- 文本 ---- */
  .sub { color: #8fa3c2; font-size: 12px; margin-top: 2px; }
  .note { color: #c8d8ee; font-size: 13px; line-height: 1.7; margin-top: 12px; }
  .intro { color: #8fa6c0; font-size: 12px; line-height: 1.7; }
  .footnote { color: #647d99; font-size: 11px; margin-top: 10px; }
  .footnote.center { text-align: center; }
  .tags { flex-direction: row; flex-wrap: wrap; margin-top: 10px; }
  .tag {
    color: #bcd4f0;
    font-size: 11px;
    background-color: rgba(40, 70, 110, 0.5);
    padding: 4px 8px;
    border-radius: 7px;
    margin: 0 6px 6px 0;
  }

  /* ---- 定位引导层 ---- */
  .guide-wrap {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    justify-content: center;
    align-items: center;
    padding: 0 24px;
    z-index: 32;
  }
  .guide {
    width: 100%;
    max-width: 340px;
    padding: 18px 18px 14px;
    background-color: #0b1424;
    border: 1px solid rgba(120, 170, 220, 0.26);
    border-radius: 18px;
  }
  .guide-ico {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background-color: rgba(108, 201, 255, 0.12);
    border: 1px solid rgba(108, 201, 255, 0.36);
    align-items: center;
    justify-content: center;
  }
  .guide-ico.warn {
    background-color: rgba(255, 202, 122, 0.12);
    border-color: rgba(255, 202, 122, 0.4);
  }
  .guide-ico-txt { color: #6cc9ff; font-size: 14px; line-height: 1; }
  .guide-ico.warn .guide-ico-txt { color: #ffca7a; }
  .guide-title { color: #f2f7ff; font-size: 15px; font-weight: bold; margin-top: 12px; }
  .guide-desc { color: #8fa6c0; font-size: 12px; line-height: 1.7; margin-top: 8px; }
  .guide-foot {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    margin-top: 14px;
  }

  /* ---- 新手引导 ---- */
  .onboard {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    background-color: #05070f;
    z-index: 30;
    justify-content: center;
    padding: 28px 26px;
  }
  .onboard-inner { width: 100%; max-width: 420px; }
  .brand { color: #eef5ff; font-size: 34px; font-weight: bold; letter-spacing: 7px; }
  .brand-rule { width: 34px; height: 2px; background-color: #6cc9ff; margin: 14px 0; }
  .onboard-sub { color: #8ea8c6; font-size: 13px; }
  .onboard-list { margin-top: 26px; }
  .onboard-item { flex-direction: row; margin-bottom: 16px; }
  .onboard-num { color: #6cc9ff; font-size: 11px; width: 26px; line-height: 1.7; }
  .onboard-txt { color: #b3c6dc; font-size: 12px; line-height: 1.7; flex: 1; }

  /* ---- 提示 ---- */
  .toast {
    position: fixed;
    left: 36px;
    right: 36px;
    bottom: calc(120px + var(--uni-safe-area-inset-bottom, 0px));
    height: 38px;
    padding: 0 14px;
    background-color: rgba(10, 18, 32, 0.94);
    border: 1px solid rgba(120, 170, 220, 0.22);
    border-radius: 12px;
    z-index: 40;
    align-items: center;
    justify-content: center;
  }
  .toast-txt { color: #d9e9ff; font-size: 12px; }

  .share-canvas {
    position: fixed;
    left: -9999px;
    top: 0;
    width: 270px;
    height: 360px;
  }
</style>
