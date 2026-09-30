<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import type { ImportTaskView } from '@/api';

const props = defineProps<{ task: ImportTaskView | null; taskId: string; missing: boolean; finished: boolean }>();
type State = 'done' | 'current' | 'todo' | 'warn';
const styles: Record<State, { dot: string; text: string }> = {
  done: { dot: 'bg-accent text-primary-fg', text: 'text-text' },
  current: { dot: 'bg-ink text-surface', text: 'font-medium text-ink' },
  todo: { dot: 'border border-line-strong text-faint', text: 'text-faint' },
  warn: { dot: 'bg-amber-soft text-amber', text: 'text-text' },
};
const steps = computed(() => {
  const task = props.task;
  const active = task && ([task.status, task.aiStatus].some((s) => s === 'PENDING' || s === 'RUNNING'));
  const states: State[] = [
    task || (props.taskId && !props.missing) ? 'done' : 'current',
    !task ? 'todo' : active ? 'current' : task.status === 'FAILED' ? 'warn' : 'done',
    props.finished || task?.confirmed ? 'done' : task && !active ? 'current' : 'todo',
  ];
  const focus = states.includes('current') ? states.indexOf('current') : states.length - 1;
  return ['上传原件', '识别单据', '核对入账'].map((label, i) => ({ label, state: states[i], focus: i === focus, ...styles[states[i]] }));
});
</script>

<template>
  <ol class="flex max-w-3xl items-center gap-2 sm:gap-3" aria-label="导入进度">
    <li v-for="(step, n) in steps" :key="step.label" class="flex min-w-0 items-center gap-2 sm:gap-3" :class="n > 0 ? 'flex-1' : ''" :aria-current="step.state === 'current' ? 'step' : undefined">
      <span v-if="n > 0" class="h-px min-w-3 flex-1 transition-colors duration-150" :class="step.state === 'todo' ? 'bg-line-strong' : 'bg-accent/40'" aria-hidden="true" />
      <span class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums" :class="step.dot">
        <Icon v-if="step.state === 'done'" name="check" :size="14" />
        <Icon v-else-if="step.state === 'warn'" name="alert" :size="13" />
        <template v-else>{{ n + 1 }}</template>
      </span>
      <span class="whitespace-nowrap text-[13px]" :class="[step.text, step.focus ? '' : 'max-sm:sr-only']">{{ step.label }}</span>
    </li>
  </ol>
</template>
