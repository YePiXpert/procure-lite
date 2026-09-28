import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Checkbox from './Checkbox.vue';

describe('Checkbox', () => {
  it('布尔 v-model：勾选后抛出 true；change 回调里读 $event.target.checked 拿到的是新状态', async () => {
    let seen: boolean | undefined;
    const wrapper = mount(Checkbox, {
      props: {
        modelValue: false,
        label: '已开票',
        onChange: (e: Event) => {
          seen = (e.target as HTMLInputElement).checked;
        },
      },
    });
    await wrapper.get('input').setValue(true);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    expect(seen).toBe(true);
    // 父组件的 v-model 回写后，勾选框保持勾选
    await wrapper.setProps({ modelValue: true });
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.get('label').text()).toContain('已开票');
  });

  it('受控：父组件没跟着改状态时，勾选框回到 checked 的值', async () => {
    const wrapper = mount(Checkbox, { props: { checked: false, ariaLabel: '全选本页' } });
    await wrapper.get('input').setValue(true);
    expect(wrapper.emitted('change')).toHaveLength(1);
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(false);
  });

  it('绑数组：按 value 增删，返回新数组', async () => {
    const list = ['a'];
    const wrapper = mount(Checkbox, { props: { modelValue: list, value: 'b', ariaLabel: '选择 b' } });
    expect(wrapper.find('label').exists()).toBe(false);
    await wrapper.get('input').setValue(true);
    const next = wrapper.emitted('update:modelValue')![0][0] as string[];
    expect(next).toEqual(['a', 'b']);
    expect(next).not.toBe(list);
  });

  it('绑 Set：与原生 v-model 同语义，返回新 Set', async () => {
    const selected = new Set([1, 2]);
    const wrapper = mount(Checkbox, { props: { modelValue: selected, value: 2, ariaLabel: '选择' } });
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(true);
    await wrapper.get('input').setValue(false);
    const next = wrapper.emitted('update:modelValue')![0][0] as Set<number>;
    expect([...next]).toEqual([1]);
    expect(next).not.toBe(selected);
  });

  it('说明文字走 aria-describedby，不并进 label 的可访问名称', () => {
    const wrapper = mount(Checkbox, { props: { modelValue: true, label: '启用', description: '补充说明' } });
    const input = wrapper.get('input');
    const describedBy = input.attributes('aria-describedby');
    expect(describedBy).toBeTruthy();
    const desc = wrapper.get(`[id="${describedBy}"]`);
    expect(desc.text()).toBe('补充说明');
    expect(desc.attributes('aria-hidden')).toBe('true');
  });
});
