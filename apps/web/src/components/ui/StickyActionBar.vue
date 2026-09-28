<script setup lang="ts">
/**
 * 页面底部的粘性操作条（导入页「保存草稿 / 确认全部内容并导入」这类）：放在页面根元素的最后，
 * 滚动时钉在 <main> 底边——桌面贴视口底边，手机贴在底部标签栏之上；内容不够一屏时就跟在内容后面。
 * 左右用 --main-px 吃满 <main> 的内边距做成通栏，内容仍与页面内容对齐。
 *
 * 默认插槽放按钮（靠右）；#start 放左侧的提示 / 错误（role="alert" 由调用方给）。
 * #start 里没有渲染出任何东西（v-if 为假）时整块隐藏，不会多出一行空隙。
 *
 * sticky 的底边从 <main> 的内容框算起（已扣掉外壳的底部留白 --main-pb），所以用负值抵回：
 * 桌面 bottom = -main-pb，贴住视口底边；
 * 手机 main 底部留白 96px + 安全区、底部标签栏 60px + 安全区（安全区两边相消）→ bottom = 60px - main-pb，
 * 正好贴在标签栏上方（与标签栏的发丝线重合，只剩一条线）。
 */
</script>

<template>
  <div
    class="sticky z-20 bottom-[calc(3.75rem_-_var(--main-pb))] lg:-bottom-(--main-pb) -mx-(--main-px) px-(--main-px) border-t border-line bg-surface/95 backdrop-blur"
  >
    <div class="flex flex-wrap items-center justify-end gap-2 py-3">
      <div v-if="$slots.start" class="flex min-w-0 flex-1 basis-full flex-col gap-2 empty:hidden sm:basis-0">
        <slot name="start" />
      </div>
      <slot />
    </div>
  </div>
</template>
