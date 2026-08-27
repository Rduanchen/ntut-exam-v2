import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import JudgeSettingsView from '../src/views/judge/JudgeSettingsView.vue';
import ContainerPanel from '../src/views/judge/components/ContainerPanel.vue';
import * as api from '../src/api/judge-settings';
import { C_ONLY_RUNTIMES, FULL_RUNTIMES, examRequiring, reachable } from './fixtures/judge.fixture';
import type { EffectiveSetting } from '../src/types/judge-settings';

const vuetify = createVuetify({ components, directives });

const SETTINGS: Record<string, EffectiveSetting> = {
  compileTimeout: { value: 30000, origin: 'default' },
  maxSystemRetries: { value: 2, origin: 'config' },
  maxConcurrentJobs: { value: 64, origin: 'clamped' },
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
  vi.spyOn(api, 'fetchJudgeSettings').mockResolvedValue({ settings: SETTINGS, activeCeiling: 64 });
  vi.spyOn(api, 'fetchBackendHealth').mockResolvedValue(reachable(C_ONLY_RUNTIMES));
  vi.spyOn(api, 'fetchExamConfig').mockResolvedValue(examRequiring('Python', 'Cpp'));
});

describe('US1 - the page warns before an exam', () => {
  it('names a language this machine cannot run', async () => {
    const wrapper = await mountView();
    const warning = wrapper.find('[data-test="missing-languages"]');

    expect(warning.exists()).toBe(true);
    expect(warning.text()).toContain('Python');
    // Cpp is satisfied by c++ via its alias, so it must NOT be listed.
    expect(wrapper.findAll('[data-test="missing-language"]').map((c) => c.text())).toEqual(['Python']);
  });

  it('confirms when every required language is available', async () => {
    vi.spyOn(api, 'fetchBackendHealth').mockResolvedValue(reachable(FULL_RUNTIMES));
    const wrapper = await mountView();

    expect(wrapper.find('[data-test="languages-ok"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="missing-languages"]').exists()).toBe(false);
  });

  it('offers a re-check without reloading', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-test="recheck"]').exists()).toBe(true);
  });
});

describe('US2 - values carry their origin', () => {
  it('labels every setting with where its value came from', async () => {
    const wrapper = await mountView();
    const origins = wrapper.findAll('[data-test="origin-chip"]').map((c) => c.attributes('data-origin'));

    expect(origins).toContain('default');
    expect(origins).toContain('config');
    expect(origins).toContain('clamped');
  });

  it('states the value in force when one was clamped', async () => {
    const wrapper = await mountView();
    const note = wrapper.find('[data-test="clamped-note"]');

    expect(note.exists()).toBe(true);
    expect(note.text()).toContain('64');
  });
});

describe('US4 - the replacement rule is stated where settings are edited', () => {
  it('appears in BOTH editable groups, since it applies to both', async () => {
    const wrapper = await mountView();

    expect(wrapper.find('[data-test="replacement-warning-exam"]').text()).toContain('replaces');
    expect(wrapper.find('[data-test="replacement-warning-machine"]').text()).toContain('replaced');
  });

  it('separates settings that follow the exam from those describing the machine', async () => {
    const wrapper = await mountView();

    expect(wrapper.find('[data-test="exam-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="machine-panel"]').exists()).toBe(true);
  });
});

describe('US5 - capacity is measured, not guessed', () => {
  it('tells the operator to measure this machine', async () => {
    const wrapper = await mountView();
    const machine = wrapper.find('[data-test="machine-panel"]').text();

    expect(machine).toContain('Measure this machine');
    expect(machine).toContain('re-measure it whenever a paper moves to a different machine');
  });
});

describe('US6 - settings changed elsewhere show no value', () => {
  it('names them and their file but reports no value', async () => {
    const wrapper = mount(ContainerPanel, { global: { plugins: [vuetify] } });
    const rows = wrapper.findAll('[data-test="container-row"]');

    expect(rows.length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain('docker-compose.yml');
    // A guess about a running container is worse than an honest gap.
    wrapper.findAll('[data-test="container-value"]').forEach((cell) => {
      expect(cell.text()).toBe('Not reportable');
    });
  });
});

describe('failure containment in the page', () => {
  it('shows no settings values when the settings request failed, but keeps health', async () => {
    vi.spyOn(api, 'fetchJudgeSettings').mockRejectedValue(new Error('gone'));
    const wrapper = await mountView();

    expect(wrapper.find('[data-test="settings-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="exam-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="health-panel"]').exists()).toBe(true);
  });
});
