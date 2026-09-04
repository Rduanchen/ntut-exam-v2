import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import JudgeSettingsView from '../src/views/judge/JudgeSettingsView.vue';
import * as api from '../src/api/judge-settings';
import * as deployApi from '../src/api/deploy-test';
import { descriptor, envelope } from './fixtures/deploy-test.fixture';
import { FULL_RUNTIMES, examRequiring, reachable } from './fixtures/judge.fixture';
import type { EffectiveSetting } from '../src/types/judge-settings';

const vuetify = createVuetify({ components, directives });

const SETTINGS: Record<string, EffectiveSetting> = {
  compileTimeout: { value: 30000, origin: 'default' },
  compileMemoryLimit: { value: -1, origin: 'default' },
  maxSystemRetries: { value: 2, origin: 'default' },
  maxConcurrentJobs: { value: 4, origin: 'default' },
};

const mountView = async () => {
  const wrapper = mount(JudgeSettingsView, { global: { plugins: [vuetify] } });
  await new Promise((r) => setTimeout(r, 0));
  await wrapper.vm.$nextTick();
  return wrapper;
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  vi.spyOn(api, 'fetchJudgeSettings').mockResolvedValue({ settings: SETTINGS, activeCeiling: 4 });
  vi.spyOn(api, 'fetchBackendHealth').mockResolvedValue(reachable(FULL_RUNTIMES));
  vi.spyOn(api, 'fetchExamConfig').mockResolvedValue(examRequiring('C'));
  vi.spyOn(deployApi, 'fetchDeployTestProfile').mockResolvedValue(descriptor);
  vi.spyOn(deployApi, 'fetchLatestDeployTest').mockResolvedValue(envelope(null));
});

/**
 * Does the GRAPHICAL INTERFACE actually let an operator change a value?
 *
 * The store's own tests prove setDraft and save work. They say nothing about
 * whether the view is wired to them — exactly the gap that let the concurrency
 * limiter be removed from the judging path with all 300 backend tests green.
 * Logic with no interface is the thing this whole feature exists to fix, so it
 * would be a poor joke to leave the interface itself unverified.
 */
describe('the page is actually editable', () => {
  it('renders an input for every setting the backend reports', async () => {
    const wrapper = await mountView();

    for (const key of Object.keys(SETTINGS)) {
      expect(wrapper.find(`[data-test="input-${key}"]`).exists(), `${key} has no input`).toBe(true);
    }
  });

  it('renders a save control that is disabled until something changes', async () => {
    const wrapper = await mountView();
    const save = wrapper.find('[data-test="save"]');

    expect(save.exists()).toBe(true);
    expect(save.attributes('disabled')).toBeDefined();
  });

  it('typing into a field marks it unsaved and enables saving', async () => {
    const wrapper = await mountView();

    const input = wrapper.find('[data-test="input-maxConcurrentJobs"] input');
    await input.setValue('9');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="dirty-marker"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="save"]').attributes('disabled')).toBeUndefined();
  });

  it('clicking save sends the edit to the backend and shows what came back', async () => {
    const update = vi.spyOn(api, 'updateJudgeSettings').mockResolvedValue({
      settings: { ...SETTINGS, maxConcurrentJobs: { value: 9, origin: 'config' } },
      activeCeiling: 9,
    });
    const wrapper = await mountView();

    await wrapper.find('[data-test="input-maxConcurrentJobs"] input').setValue('9');
    await wrapper.find('[data-test="save"]').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(update).toHaveBeenCalledWith({ maxConcurrentJobs: 9 });
    expect(wrapper.text()).toContain('ceiling of 9');
    expect(wrapper.find('[data-test="dirty-marker"]').exists()).toBe(false);
  });

  it('discarding an edit restores the value in force', async () => {
    const wrapper = await mountView();

    await wrapper.find('[data-test="input-maxConcurrentJobs"] input').setValue('9');
    await wrapper.find('[data-test="discard"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="dirty-marker"]').exists()).toBe(false);
  });
});
