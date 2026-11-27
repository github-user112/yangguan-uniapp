<script>
export default {
  onLaunch() {
    console.log('仰观 launch')
  }
}
</script>

<style>
/* 全局样式保持简洁，页面样式见 pages/index/index.vue */

/*
 * 布局语义对齐：uni-app x 中 view 默认是 flex column 容器且为 border-box，
 * 而 uni-app(vue3) 的 view 编译为块级元素。这份工程的样式按 uvue 语义书写，
 * 因此在全局还原默认值，避免各页面重复声明 display:flex。
 */
view,
uni-view {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* 文本节点参与 flex 布局时不应被拉伸 */
text,
uni-text {
  box-sizing: border-box;
}

page {
  background-color: #04060d;
}
</style>
