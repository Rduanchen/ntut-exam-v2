import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

import ExamStateControls from '../src/views/manage/components/ExamStateControls.vue';
import { useManageStore, type ExamPhase } from '../src/stores/manage.store';
import { useConfigStore } from '../src/stores/config.store';

const vuetify = createVuetify({ components, directives });

const PHASES: ExamPhase[] = [
  'UNINITIALIZED',
  'INITIALIZED',
  'SETUP_FINISHED',
  'IN_PROGRESS',
  'FINISHED'
];

/** The one step available from each phase, mirroring the backend's table. */
const NEXT: Record<ExamPhase, ExamPhase[]> = {
  UNINITIALIZED: ['INITIALIZED'],
  INITIALIZED: ['SETUP_FINISHED'],
  SETUP_FINISHED: ['IN_PROGRESS'],
  IN_PROGRESS: ['FINISHED'],
  FINISHED: []
};

const mountAt = (phase: ExamPhase) => {
  const store = useManageStore();
  store.examState = phase;
  store.allowedNext = NEXT[phase];
  return mount(ExamStateControls, { global: { plugins: [vuetify] } });
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('ExamStateControls', () => {
  it.each(PHASES)('names the current phase in %s', (phase) => {
    const wrapper = mountAt(phase);

    const labels: Record<ExamPhase, string> = {
      UNINITIALIZED: '未初始化',
      INITIALIZED: '已初始化',
      SETUP_FINISHED: '設定完成',
      IN_PROGRESS: '考試中',
      FINISHED: '考試結束'
    };
    expect(wrapper.text()).toContain(labels[phase]);
  });

  describe('offers one step, not a choice', () => {
    /* The console used to present all phases as free choices, so a finished
     * exam could be sent back to "not started" with one click. Phases are
     * one-way; the interface should say so. */
    it.each(PHASES.filter((p) => p !== 'FINISHED'))('shows a single advance button in %s', (phase) => {
      const wrapper = mountAt(phase);

      expect(wrapper.findAll('[data-test="advance-phase"]')).toHaveLength(1);
      expect(wrapper.findAll('[data-test="reset-exam"]')).toHaveLength(1);
    });

    it('offers no advance button once the exam is over', () => {
      const wrapper = mountAt('FINISHED');

      expect(wrapper.find('[data-test="advance-phase"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="reset-exam"]').exists()).toBe(true);
    });

    it('never offers a phase other than the one the backend allows', () => {
      const wrapper = mountAt('SETUP_FINISHED');

      const text = wrapper.find('[data-test="advance-phase"]').text();
      expect(text).toContain('考試中');
      expect(text).not.toContain('已初始化');
      expect(text).not.toContain('考試結束');
    });
  });

  it('advances through the store rather than naming a phase itself', async () => {
    const store = useManageStore();
    const advance = vi.spyOn(store, 'advanceExamState').mockResolvedValue();
    const wrapper = mountAt('INITIALIZED');

    await wrapper.find('[data-test="advance-phase"]').trigger('click');

    expect(advance).toHaveBeenCalledOnce();
  });

  it('asks before advancing, and does nothing when refused', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const store = useManageStore();
    const advance = vi.spyOn(store, 'advanceExamState').mockResolvedValue();
    const wrapper = mountAt('IN_PROGRESS');

    await wrapper.find('[data-test="advance-phase"]').trigger('click');

    expect(advance).not.toHaveBeenCalled();
  });

  it('asks before resetting, and does nothing when refused', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const config = useConfigStore();
    const reset = vi.spyOn(config, 'resetDatabase').mockResolvedValue();
    const wrapper = mountAt('IN_PROGRESS');

    await wrapper.find('[data-test="reset-exam"]').trigger('click');

    expect(reset).not.toHaveBeenCalled();
  });

  it('resets through the config store', async () => {
    const config = useConfigStore();
    const reset = vi.spyOn(config, 'resetDatabase').mockResolvedValue();
    const manage = useManageStore();
    vi.spyOn(manage, 'fetchExamState').mockResolvedValue();
    const wrapper = mountAt('FINISHED');

    await wrapper.find('[data-test="reset-exam"]').trigger('click');

    expect(reset).toHaveBeenCalledOnce();
  });

  it('says what is still missing when the backend refuses to advance', () => {
    const store = useManageStore();
    store.examState = 'UNINITIALIZED';
    store.allowedNext = ['INITIALIZED'];
    store.missingPreconditions = ['exam_config', 'students'];

    const wrapper = mount(ExamStateControls, { global: { plugins: [vuetify] } });

    expect(wrapper.text()).toContain('尚未上傳考卷設定');
    expect(wrapper.text()).toContain('尚未初始化學生名單');
  });
});
