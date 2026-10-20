import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import DeployTestPanel from '../src/views/judge/components/DeployTestPanel.vue';
import { useDeployTestStore } from '../src/stores/deploy-test.store';

const vuetify = createVuetify({ components, directives });
beforeEach(() => setActivePinia(createPinia()));

describe('外部錯誤的中文情境', () => {
  it('執行失敗時保留原始診斷並交代操作結果', () => {
    const store = useDeployTestStore();
    store.runError = 'backend timed out';
    const wrapper = mount(DeployTestPanel, { global: { plugins: [vuetify] } });
    expect(wrapper.find('[data-test="deploy-test-error"]').text()).toContain('部署測試失敗');
    expect(wrapper.find('[data-test="deploy-test-error"]').text()).toContain('backend timed out');
    wrapper.unmount();
  });
});
