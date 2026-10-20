import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import UnbindWarningDialog from '../src/views/device/components/UnbindWarningDialog.vue';

const vuetify = createVuetify({ components, directives });

beforeEach(() => {
  document.body.innerHTML = '';
  if (!('visualViewport' in window)) {
    vi.stubGlobal('visualViewport', {
      width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1,
      addEventListener: () => {}, removeEventListener: () => {},
    });
  }
});

describe('高風險操作：設備解除綁定與註銷對話框文案與門檻 (US3)', () => {
  const onlineDevice = {
    id: 's001',
    name: '王小明',
    deviceUuid: 'uuid-1234',
    status: 'ONLINE'
  };

  const offlineDevice = {
    id: 's002',
    name: '李小華',
    deviceUuid: 'uuid-5678',
    status: 'OFFLINE'
  };

  it('線上設備解除綁定：顯示中文警示、要求輸入 CONFIRM 且驗證精確門檻', async () => {
    const wrapper = mount(UnbindWarningDialog, {
      props: {
        modelValue: true,
        device: onlineDevice,
        action: 'unbind'
      },
      global: { plugins: [vuetify] },
      attachTo: document.body
    });

    const bodyText = document.body.textContent ?? '';
    // 檢查繁體中文標題與警示
    expect(bodyText).toContain('解除設備學生綁定');
    expect(bodyText).toContain('王小明');
    expect(bodyText).toContain('強制登出');
    expect(bodyText).toContain('CONFIRM');
    expect(bodyText).toContain('取消');

    // 檢查確認按鈕在未輸入 CONFIRM 前為停用
    const confirmBtn = wrapper.findAllComponents({ name: 'VBtn' }).find((b) => b.text().includes('解除綁定'));
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn!.attributes('disabled')).toBeDefined();

    // 輸入錯誤字串：仍停用
    await wrapper.findComponent({ name: 'VTextField' }).setValue('confirm');
    expect(confirmBtn!.attributes('disabled')).toBeDefined();

    // 輸入正確字串 CONFIRM：啟用並觸發事件
    await wrapper.findComponent({ name: 'VTextField' }).setValue('CONFIRM');
    expect(confirmBtn!.attributes('disabled')).toBeUndefined();

    await confirmBtn!.trigger('click');
    expect(wrapper.emitted('confirm')).toBeTruthy();
    wrapper.unmount();
  });

  it('線上設備完全註銷：顯示完整中文警示並能取消', async () => {
    const wrapper = mount(UnbindWarningDialog, {
      props: {
        modelValue: true,
        device: onlineDevice,
        action: 'unregister'
      },
      global: { plugins: [vuetify] },
      attachTo: document.body
    });

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain('完全註銷設備');
    expect(bodyText).toContain('uuid-1234');
    expect(bodyText).toContain('解除綁定');

    const cancelBtn = wrapper.findAllComponents({ name: 'VBtn' }).find((b) => b.text().includes('取消'));
    expect(cancelBtn).toBeDefined();
    await cancelBtn!.trigger('click');

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    expect(wrapper.emitted('confirm')).toBeUndefined();
    wrapper.unmount();
  });

  it('離線設備解除綁定：顯示離線說明且不強制要求輸入 CONFIRM', async () => {
    const wrapper = mount(UnbindWarningDialog, {
      props: {
        modelValue: true,
        device: offlineDevice,
        action: 'unbind'
      },
      global: { plugins: [vuetify] },
      attachTo: document.body
    });

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain('此設備目前未登入');
    const confirmBtn = wrapper.findAllComponents({ name: 'VBtn' }).find((b) => b.text().includes('解除綁定'));
    expect(confirmBtn!.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
});
