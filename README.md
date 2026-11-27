# 仰观 · 实时星图（uni-app / Vue3 版）

**在线体验：https://github-user112.github.io/yangguan-uniapp/**

> 手机浏览器打开即可（需 https，传感器才可用）。电脑端可拖动屏幕环顾四周、双指/滚轮缩放。

由 `yangguan-uniappx`（uni-app x）迁移而来。迁移原因：uni-app x 的 UTS 编译器在当前 Windows 环境下无法产出产物
（`[uts] Failed to convert napi value into rust type bool`），而 uni-app（Vue3）的纯 CLI 链路可完整跑通，
从编译、真机预览到上传全部可脚本化。

## 目录

```
src/
  pages/index/index.vue   页面（模板/脚本/样式均为原 uvue 内容）
  lib/                    算法层，与 uni-app x 版完全一致，未改动逻辑
  App.vue                 全局样式（含 uvue 布局语义还原）
  manifest.json           各端 appid 与权限
  pages.json              路由与导航栏
```

## 迁移时改了什么

| 位置 | 改动 | 原因 |
| --- | --- | --- |
| `index.vue` 头部 | `import { onUnload } from '@dcloudio/uni-app'` | uni-app x 把页面生命周期当全局宏，Vue3 版需显式导入 |
| `App.vue` | `view { display:flex; flex-direction:column }` | uvue 的 `view` 默认是 flex column，Vue3 编译成块级元素，不还原则所有布局塌陷 |
| `index.vue` canvas | 新增 `fallbackCanvasInit()` | 部分平台不派发 canvas `ready`，用 `selectorQuery().fields({node:true})` 兜底取 2d 上下文 |
| `controller.js` | `refreshUi()` 判空 `this.renderer` | 定位回调可能早于 canvas 就绪，原实现直接抛 `reading 'fov'` |
| 样式 | `.chip/.pill/.primary` 改 `margin: 0 6px 0 0` | `uni-button` 默认 `margin:auto`，会把 flex 行里的按钮推开 |

## 构建

```bash
npm install
npm run build:h5          # -> dist/build/h5
npm run build:mp-alipay   # -> dist/build/mp-alipay
npm run build:mp-weixin
```

## 真机预览与上传（支付宝）

前提：`minidev`（`npm i -g minidev`）、小程序 appid、开放平台下载的密钥文件。

```bash
cd dist/build/mp-alipay

# 真机预览：输出预览码链接，用支付宝扫码
minidev preview -a <appid> --identity-key-path <密钥.json> --no-auto-push

# 上传体验版
minidev upload -a <appid> --identity-key-path <密钥.json> -v 1.0.0 --version-description "首个可运行版本"
```

密钥文件形如 `{"alipay":{"authentication":{"toolId":"...","privateKey":"-----BEGIN PRIVATE KEY-----..."}}}`。
**不要把密钥提交进仓库。**

## 已验证

- H5：`npm run build:h5` 通过；无头浏览器实测点击「开始观星」后 canvas 采样到约 3000 个亮像素
  （星点已绘制）、无运行时异常、顶栏正确回落到北京与当前时间
- 支付宝：`npm run build:mp-alipay` 通过，`minidev preview` 构建并生成预览码成功

## 未验证

- 真机传感器（`my.onCompassChange` / 陀螺仪）与定位授权：需在手机上实扫预览码
- 微信端：需另填 appid 并申请定位类目

## 数据与许可

星表与历算沿用原工程：d3-celestial（BSD-3）数据、astronomy-engine（MIT）算法。
