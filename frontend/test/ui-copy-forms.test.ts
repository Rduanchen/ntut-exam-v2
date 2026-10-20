import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import GeneralSettingsEditor from '../src/views/config/components/GeneralSettingsEditor.vue';
import SectionListEditor from '../src/views/config/components/SectionListEditor.vue';
import type { ExamConfig } from '../src/types/config';

const vuetify = createVuetify({ components, directives });

describe('考試設定表單文案', () => {
  it('一般設定、時間單位及資料格式可直接辨認', () => {
    const wrapper = mount(GeneralSettingsEditor, {
      props: { modelValue: {
        testTitle: '', description: '', judgerSettings: { timeLimit: 1000, memoryLimit: 256, compareMode: 'strict' },
        environmentVariables: { startPassword: '' }, accessibleUsers: [], sections: []
      } as ExamConfig },
      global: { plugins: [vuetify] }
    });
    expect(wrapper.text()).toContain('基本資訊');
    expect(wrapper.text()).toContain('時間限制（ms）');
    expect(wrapper.text()).toContain('匯入 CSV');
    wrapper.unmount();
  });

  it('區段操作有中文名稱', () => {
    const wrapper = mount(SectionListEditor, { props: { modelValue: [] }, global: { plugins: [vuetify] } });
    expect(wrapper.text()).toContain('考試區段');
    expect(wrapper.text()).toContain('新增區段');
    wrapper.unmount();
  });
});
