/** Tabs.vue（按值切换）与 RouteTabs.vue（按路由切换）共用的类型与外观 */

export interface TabItem<T extends string | number = string> {
  value: T;
  label: string;
  /** 跟在标签后的小号计数（faint） */
  count?: number | string;
  icon?: string;
  disabled?: boolean;
}

export interface RouteTabItem {
  to: string;
  label: string;
  icon?: string;
  count?: number | string;
  /** 只在完全匹配时算当前项（如 /settings 不应在 /settings/audit 时高亮） */
  exact?: boolean;
}

/** 整行底部发丝线用内阴影画：overflow-x-auto 会裁掉压在 border 上的指示条 */
export const UNDERLINE_LIST =
  'flex items-stretch gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export function underlineItemClass(active: boolean): string {
  return (
    'relative inline-flex shrink-0 items-center gap-1.5 h-10 text-sm whitespace-nowrap cursor-pointer transition-colors duration-150 ' +
    'disabled:cursor-not-allowed disabled:opacity-50 ' +
    (active ? 'text-ink font-medium' : 'text-muted hover:text-ink')
  );
}

export const UNDERLINE_INDICATOR = 'absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-ink';

export const SEGMENTED_LIST = 'items-center gap-0.5 p-0.5 rounded-[9px] bg-primary-soft';

/* 深色下 surface 比轨道（primary-soft）还暗，当前项改用更亮的 line-strong 才像「浮起来」 */
export function segmentedItemClass(active: boolean): string {
  return (
    'inline-flex items-center justify-center gap-1.5 h-8 px-3 text-[13px] rounded-[7px] whitespace-nowrap cursor-pointer transition-[color,background-color,box-shadow] duration-150 ' +
    'disabled:cursor-not-allowed disabled:opacity-50 ' +
    (active ? 'bg-surface text-ink font-medium shadow-(--shadow-xs) dark:bg-line-strong' : 'text-muted hover:text-ink')
  );
}
