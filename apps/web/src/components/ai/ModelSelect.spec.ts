import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import ModelSelect from './ModelSelect.vue';
import Select from '../ui/Select.vue';

it('preserves a configured model missing from the list and allows manual fallback', async () => {
  const wrapper = mount(ModelSelect, {
    props: { modelValue: 'saved-gpt', label: '主模型', models: ['other-gpt'] },
  });
  expect(wrapper.text()).toContain('saved-gpt（当前配置）');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  wrapper.findComponent(Select).vm.$emit('update:modelValue', 'other-gpt');
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['other-gpt']);
  await wrapper.findAll('button').find((b) => b.text() === '手动填写')!.trigger('click');
  await wrapper.get('input').setValue('custom-gpt');
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['custom-gpt']);
});

it('keeps task inheritance and manual entry available when discovery fails', async () => {
  const wrapper = mount(ModelSelect, {
    props: { modelValue: '', label: '单据识别模型', models: ['gpt'], inherit: true },
  });
  expect(wrapper.text()).toContain('继承主模型');
  await wrapper.setProps({ models: [] });
  expect(wrapper.get('input').attributes('placeholder')).toBe('留空继承主模型');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
});
