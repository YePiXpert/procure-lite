import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Select from './Select.vue';

afterEach(() => vi.restoreAllMocks());

describe('Select', () => {
  it('空值选项转为占位文字，不渲染成选项（reka 的 SelectItem 遇空串会抛错）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = mount(Select, {
      props: {
        modelValue: '',
        options: [
          { label: '未指定', value: '' },
          { label: '得力办公', value: '1' },
        ],
      },
      attachTo: document.body,
    });
    expect(wrapper.text()).toContain('未指定');
    const logged = [...warn.mock.calls, ...error.mock.calls].flat().map(String).join('\n');
    expect(logged).not.toContain('must have a value prop that is not an empty string');
    wrapper.unmount();
  });

  it('回填的值直接显示对应选项文字（不必先打开下拉）', () => {
    const wrapper = mount(Select, {
      props: {
        modelValue: '2',
        options: [
          { label: '甲', value: '1' },
          { label: '乙', value: '2' },
        ],
      },
    });
    expect(wrapper.text()).toContain('乙');
    expect(wrapper.text()).not.toContain('请选择');
  });

  it('没有空值选项时沿用 placeholder', () => {
    const wrapper = mount(Select, {
      props: { modelValue: '', placeholder: '全部状态', options: [{ label: '待采购', value: 'PENDING_PURCHASE' }] },
    });
    expect(wrapper.text()).toContain('全部状态');
  });
});
