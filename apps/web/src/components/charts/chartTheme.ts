import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';

/**
 * 图表配色与坐标轴基础样式（与设计令牌对齐，见 DESIGN.md §7.6）。
 * ECharts 画在 canvas 上读不到 CSS 变量，必须运行时解析成具体颜色；
 * 主题切换后通过 useChartTheme() 的 computed 重新取色。
 *
 * 系列色顺序：accent（柱）→ blue（折线）→ amber → red → muted → faint。
 * 坐标轴无轴线、无刻度，标签 11px muted；网格线 line；tooltip 是 surface 底 + line 边 + shadow-pop。
 */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface ChartTheme {
  colors: string[];
  axis: {
    axisLine: { show: boolean; lineStyle: { color: string } };
    axisLabel: { color: string; fontSize: number };
    axisTick: { show: boolean };
    /** 轴名（如「金额」「笔数」）与标签同色同号 */
    nameTextStyle: { color: string; fontSize: number };
  };
  /** 网格分割线颜色（yAxis.splitLine 等） */
  splitLine: string;
  /** 卡片表面色：饼图扇区间描边等需要「看起来像卡片底」的场景 */
  surface: string;
  /** 次要文字色（图例等） */
  muted: string;
  /** 全局文字：option.textStyle 直接用，图表字体与页面一致 */
  textStyle: { fontFamily: string; color: string };
  /** 柱状图系列默认：顶部圆角、最大宽度 */
  bar: { barMaxWidth: number; itemStyle: { borderRadius: [number, number, number, number] } };
  tooltip: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    padding: [number, number];
    textStyle: { color: string; fontSize: number };
    extraCssText: string;
  };
}

export function getChartTheme(): ChartTheme {
  const muted = token('--color-muted');
  return {
    colors: [
      token('--color-accent'),
      token('--color-blue'),
      token('--color-amber'),
      token('--color-red'),
      muted,
      token('--color-faint'),
    ],
    axis: {
      axisLine: { show: false, lineStyle: { color: token('--color-line') } },
      axisLabel: { color: muted, fontSize: 11 },
      axisTick: { show: false },
      nameTextStyle: { color: muted, fontSize: 11 },
    },
    splitLine: token('--color-line'),
    surface: token('--color-surface'),
    muted,
    textStyle: { fontFamily: token('--font-sans'), color: token('--color-text') },
    bar: { barMaxWidth: 28, itemStyle: { borderRadius: [4, 4, 0, 0] } },
    tooltip: {
      backgroundColor: token('--color-surface'),
      borderColor: token('--color-line'),
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: token('--color-text'), fontSize: 12 },
      // tooltip 是 HTML 元素，阴影直接用令牌变量，主题切换不用重建
      extraCssText: 'box-shadow: var(--shadow-pop); border-radius: 10px;',
    },
  };
}

/** 响应式图表主题：主题翻转时自动重新取色，option computed 引用它即可联动 */
export function useChartTheme() {
  const theme = useThemeStore();
  return computed<ChartTheme>(() => {
    void theme.resolved;
    return getChartTheme();
  });
}
