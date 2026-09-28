import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FileDropzone from './FileDropzone.vue';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.bmp';

function drop(target: Element, files: File[]): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files, types: ['Files'] } });
  target.dispatchEvent(event);
}

describe('FileDropzone', () => {
  it('只有一个 file input（拍照上传复用它），e2e 的 input[type=file] 定位不受影响', () => {
    const wrapper = mount(FileDropzone, { props: { accept: ACCEPT, capture: true } });
    expect(wrapper.findAll('input[type=file]')).toHaveLength(1);
    expect(wrapper.text()).toContain('拍照上传');
  });

  it('选择文件后抛出 files，并清空 input 以便再次选择同一个文件', async () => {
    const wrapper = mount(FileDropzone, { props: { accept: ACCEPT } });
    const input = wrapper.get('input[type=file]').element as HTMLInputElement;
    const file = new File(['x'], 'oa.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await wrapper.get('input[type=file]').trigger('change');
    expect(wrapper.emitted('files')?.[0]).toEqual([[file]]);
    expect(input.value).toBe('');
  });

  it('拖入时按 accept 过滤：符合的走 files（单选只取第一个），不符合的走 rejected', () => {
    const wrapper = mount(FileDropzone, { props: { accept: ACCEPT } });
    const pdf = new File(['x'], 'a.PDF', { type: 'application/pdf' });
    const png = new File(['x'], 'b.png', { type: 'image/png' });
    const doc = new File(['x'], 'c.docx', { type: 'application/msword' });
    drop(wrapper.get('label').element, [doc, pdf, png]);
    expect(wrapper.emitted('files')?.[0]).toEqual([[pdf]]);
    expect(wrapper.emitted('rejected')?.[0]).toEqual([[doc]]);
  });

  it('禁用时拖入不响应', () => {
    const wrapper = mount(FileDropzone, { props: { accept: ACCEPT, disabled: true } });
    drop(wrapper.get('label').element, [new File(['x'], 'b.png', { type: 'image/png' })]);
    expect(wrapper.emitted('files')).toBeUndefined();
  });
});
