<script setup lang="ts">
import { computed } from 'vue';
import Button from './Button.vue';
import Icon from './Icon.vue';

const props = withDefaults(
  defineProps<{ page?: number; pageSize?: number; total?: number }>(),
  { page: 1, pageSize: 20, total: 0 },
);
const emit = defineEmits<{ change: [page: number] }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const to = computed(() => Math.min(props.total, props.page * props.pageSize));

const pages = computed<(number | '…')[]>(() => {
  const count = pageCount.value;
  const cur = props.page;
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set<number>([1, count, cur, cur - 1, cur + 1]);
  const sorted = [...set].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const result: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) result.push('…');
    result.push(p);
    prev = p;
  }
  return result;
});
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
    <span class="tabular-nums">共 {{ total }} 条 · 第 {{ from }}-{{ to }} 条</span>
    <div class="flex items-center gap-1">
      <Button size="sm" variant="ghost" icon-only :disabled="page <= 1" aria-label="上一页" @click="emit('change', page - 1)">
        <Icon name="chevron-left" :size="16" />
      </Button>
      <template v-for="(p, i) in pages" :key="i">
        <span v-if="p === '…'" class="inline-flex size-8 items-center justify-center text-faint">…</span>
        <button
          v-else
          type="button"
          class="h-8 min-w-8 px-1.5 rounded-(--radius-control) text-xs font-medium tabular-nums cursor-pointer transition-colors duration-150"
          :class="p === page ? 'bg-ink text-surface' : 'text-muted hover:bg-primary-soft hover:text-ink'"
          :aria-current="p === page ? 'page' : undefined"
          @click="emit('change', p)"
        >
          {{ p }}
        </button>
      </template>
      <Button size="sm" variant="ghost" icon-only :disabled="page >= pageCount" aria-label="下一页" @click="emit('change', page + 1)">
        <Icon name="chevron-right" :size="16" />
      </Button>
    </div>
  </div>
</template>
