import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import axios from 'axios';
import App from '../src/App.vue';

const vuetify = createVuetify({ components, directives });
const routes = [
  ['/manage', '考試管理'], ['/config', '考試設定'], ['/judge', '評測'],
  ['/score', '成績'], ['/student', '學生'], ['/anticheat', '防作弊'],
  ['/log', '紀錄'], ['/connection', '連線管理'], ['/device', '設備監控']
] as const;

describe('管理端導覽文案', () => {
  it('九個導覽名稱及系統標題為繁體中文，路由保持原值', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { warnings: [] } });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes.map(([path]) => ({ path, component: { template: '<div />' } }))
    });
    await router.push('/manage');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router, vuetify] } });
    for (const [path, label] of routes) {
      const link = wrapper.find(`a[href="${path}"]`);
      expect(link.exists(), path).toBe(true);
      expect(link.text()).toContain(label);
    }
    expect(wrapper.text()).toContain('北科大考試管理系統');
    wrapper.unmount();
  });
});
