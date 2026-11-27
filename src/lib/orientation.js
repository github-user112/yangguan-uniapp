/*
 * 设备姿态 → 相机朝向（uni-app x 版）
 * 原项目使用浏览器 W3C deviceorientation； uni-app x 的支付宝小程序端
 * 跨平台 API 为：uni.onCompassChange（罗盘/方位）+ uni.onAccelerometerChange（加速度/重力）。
 * 两者组合近似还原 alpha/beta/gamma 的效果。真机上的正负号/灵敏度可按 SENSOR_TUNE 微调。
 */

const D2R = Math.PI / 180

// 真机校准用：若举起手机时星图上下颠倒或左右反向，调整下面三个符号即可
const SENSOR_TUNE = {
  compassInvert: false, // 方位反向时改为 true
  accelInvert: false,   // 上下颠倒时改为 true
  pitchGain: 0.85       // 俯仰灵敏度 0~1
}

function norm (v) {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
function cross (a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function clamp (v, a, b) { return Math.max(a, Math.min(b, v)) }

export class Orientation {
  constructor () {
    this.active = false
    this.hasReading = false
    this.hasCompass = false
    this.hasAccel = false
    this.screenAngle = 0
    this.f = [0, 0, 1]
    this.u = [0, 1, 0]
    this.heading = 0
    this.acc = [0, 0, 0]
    this.onUpdate = null
    this._compassListener = null
    this._accelListener = null
    this._timer = null
  }

  setScreenAngle (a) {
    this.screenAngle = a || 0
  }

  _compute () {
    let az = this.heading * D2R
    if (SENSOR_TUNE.compassInvert) az = -az
    const acc = SENSOR_TUNE.accelInvert
      ? [-this.acc[0], -this.acc[1], -this.acc[2]]
      : this.acc

    // 罗盘给水平朝向：世界系 (东, 上, 北)
    const f0 = [Math.sin(az), 0, Math.cos(az)]

    // 重力方向近似世界"下"，反号得到"上"；把设备坐标按方位角旋到世界坐标
    const c = Math.cos(az), s = Math.sin(az)
    const ax = acc[0] * c + acc[1] * s
    const ay = acc[0] * s - acc[1] * c
    const azg = acc[2] || 0
    const worldUp = norm([-ax, -azg, -ay])

    // 俯仰：屏幕顶部相对地平线的抬起量
    const pitch = clamp(Math.asin(clamp(ay || acc[1] || 0, -1, 1)) * SENSOR_TUNE.pitchGain, -1.2, 1.2)
    const f = norm([
      f0[0] * Math.cos(pitch) + worldUp[0] * Math.sin(pitch),
      f0[1] * Math.cos(pitch) + worldUp[1] * Math.sin(pitch),
      f0[2] * Math.cos(pitch) + worldUp[2] * Math.sin(pitch)
    ])

    // 屏幕"上"方向：用地平分量正交化，并做屏幕旋转修正
    let u = norm([worldUp[0] - f[0] * (worldUp[0] * f[0] + worldUp[1] * f[1] + worldUp[2] * f[2]),
      worldUp[1] - f[1] * (worldUp[0] * f[0] + worldUp[1] * f[1] + worldUp[2] * f[2]),
      worldUp[2] - f[2] * (worldUp[0] * f[0] + worldUp[1] * f[1] + worldUp[2] * f[2])])
    const ang = -this.screenAngle * D2R
    if (Math.abs(ang) > 1e-4) {
      const ca = Math.cos(ang), sa = Math.sin(ang)
      const cr = cross(f, u)
      u = norm([u[0] * ca + cr[0] * sa, u[1] * ca + cr[1] * sa, u[2] * ca + cr[2] * sa])
    }
    // 低通平滑
    this.f = norm([this.f[0] * 0.68 + f[0] * 0.32, this.f[1] * 0.68 + f[1] * 0.32, this.f[2] * 0.68 + f[2] * 0.32])
    this.u = norm([this.u[0] * 0.68 + u[0] * 0.32, this.u[1] * 0.68 + u[1] * 0.32, this.u[2] * 0.68 + u[2] * 0.32])
  }

  _emit () {
    if (!this.hasCompass) return
    this._compute()
    this.hasReading = true
    if (this.onUpdate) {
      this.onUpdate(this.f, this.u, { direction: this.heading, accel: this.acc })
    }
  }

  start (cb) {
    this.onUpdate = cb
    // 罗盘：uni.onCompassChange 会自动开始监听（HBuilderX 5.31+ 支付宝小程序支持）
    this._compassListener = (res) => {
      if (res && typeof res.direction === 'number') {
        this.heading = res.direction
        this.hasCompass = true
        this._emit()
      }
    }
    uni.onCompassChange(this._compassListener)
    try { uni.startCompass({}) } catch (e) { /* 部分平台会自动启动 */ }

    // 加速度计：提供俯仰与屏幕"上"向量
    this._accelListener = (res) => {
      if (res && typeof res.x === 'number') {
        this.acc = [res.x, res.y, res.z]
        this.hasAccel = true
      }
    }
    try {
      uni.onAccelerometerChange(this._accelListener)
      uni.startAccelerometer({ interval: 'normal' })
    } catch (e) { /* 无加速度计时退化为纯罗盘水平朝向 */ }

    this.active = true
    this._timer = setInterval(() => {
      if (this.hasCompass) this._emit()
    }, 120)
    return this
  }

  stop () {
    if (this._compassListener) { try { uni.offCompassChange(this._compassListener) } catch (e) {} }
    if (this._accelListener) { try { uni.offAccelerometerChange(this._accelListener) } catch (e) {} }
    try { uni.stopCompass({}) } catch (e) {}
    try { uni.stopAccelerometer({}) } catch (e) {}
    if (this._timer) clearInterval(this._timer)
    this._timer = null
    this.active = false
  }

  reset () {
    this.f = [0, 0, 1]
    this.u = [0, 1, 0]
  }
}

export default Orientation
