import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import JudgeSettingsView from '../src/views/judge/JudgeSettingsView.vue';
import * as settingsApi from '../src/api/judge-settings';
import * as deployApi from '../src/api/deploy-test';
import { FULL_RUNTIMES, examRequiring, reachable } from './fixtures/judge.fixture';
import { deployRun, descriptor, envelope } from './fixtures/deploy-test.fixture';

const vuetify = createVuetify({ components, directives });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  setActivePinia(createPinia()); vi.restoreAllMocks();
  vi.spyOn(settingsApi, 'fetchJudgeSettings').mockResolvedValue({ settings: {}, activeCeiling: 4 });
  vi.spyOn(settingsApi, 'fetchBackendHealth').mockResolvedValue(reachable(FULL_RUNTIMES));
  vi.spyOn(settingsApi, 'fetchExamConfig').mockResolvedValue(examRequiring('C'));
  vi.spyOn(deployApi, 'fetchDeployTestProfile').mockResolvedValue(descriptor);
  vi.spyOn(deployApi, 'fetchLatestDeployTest').mockResolvedValue(envelope());
});

describe('deploy test inside the Judge page', () => {
  it('keeps Settings and Deploy Test on one route and renders persisted evidence', async () => {
    const save = vi.spyOn(Storage.prototype, 'setItem');
    const wrapper = mount(JudgeSettingsView, { global: { plugins: [vuetify] } }); await settle(); await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="judge-tab-settings"]').exists()).toBe(true);
    await wrapper.find('[data-test="judge-tab-deploy-test"]').trigger('click'); await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="deploy-test-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="deploy-test-probe-row"]').text()).toContain('AC');
    expect(wrapper.find('[data-test="deploy-test-probe-row"]').text()).toContain('學生作答錯誤');
    expect(wrapper.find('[data-test="deploy-test-export"]').exists()).toBe(true);
    await wrapper.find('[data-test="deploy-test-profile"]').trigger('focusout');
    expect(save).toHaveBeenCalledWith('judger-deploy-test-profile-draft', expect.any(String));
  });
  it('distinguishes completed lifecycle from a failed outcome and interruption', async () => {
    vi.spyOn(deployApi, 'fetchLatestDeployTest').mockResolvedValue(envelope(deployRun({ overallOutcome: 'failed', interruptionReason: 'process_restart' })));
    const wrapper = mount(JudgeSettingsView, { global: { plugins: [vuetify] } }); await settle(); await wrapper.vm.$nextTick();
    await wrapper.find('[data-test="judge-tab-deploy-test"]').trigger('click'); await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="deploy-test-outcome"]').text()).toContain('失敗');
    expect(wrapper.text()).toContain('process_restart');
  });
});
