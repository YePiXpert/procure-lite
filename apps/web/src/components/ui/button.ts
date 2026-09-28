/**
 * 按钮外观的唯一来源：Button.vue 用它，需要「长得像按钮的链接」（router-link / <a>）时也直接用它，
 * 例如 <router-link :class="buttonClass({ variant: 'primary', size: 'sm' })">。
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 只有图标：变成正方形（sm 32 / md 36 / lg 40） */
  iconOnly?: boolean;
}

const BASE =
  'inline-flex items-center justify-center shrink-0 whitespace-nowrap font-medium rounded-(--radius-control) border ' +
  'cursor-pointer select-none transition duration-150 ease-out active:scale-[0.98] ' +
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50';

/*
 * 实心按钮的文字用 primary-fg（浅色下白、深色下墨）：深色主题里 accent / red 都是提亮过的颜色，
 * 白字对比度不够（accent 仅 2.2:1），跟主按钮一样反转成深色字。
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-fg border-transparent shadow-(--shadow-xs) hover:bg-primary-hover',
  secondary:
    'bg-surface text-text border-line-strong hover:bg-surface-2 hover:border-faint',
  ghost: 'bg-transparent text-muted border-transparent hover:text-ink hover:bg-primary-soft',
  danger: 'bg-red text-primary-fg border-transparent shadow-(--shadow-xs) hover:brightness-95',
  accent: 'bg-accent text-primary-fg border-transparent shadow-(--shadow-xs) hover:bg-accent-hover',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'size-8 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-10 text-sm',
};

export function buttonClass({ variant = 'secondary', size = 'md', iconOnly = false }: ButtonClassOptions = {}): string {
  return `${BASE} ${VARIANTS[variant]} ${iconOnly ? ICON_SIZES[size] : SIZES[size]}`;
}
