import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

import RehearsalPanel from '../src/views/judge/components/RehearsalPanel.vue';
import RehearsalStageList from '../src/views/judge/components/RehearsalStageList.vue';
import { useRehearsalStore } from '../src/stores/rehearsal.store';
import { descriptor, run, stage } from './fixtures/rehearsal';

const vuetify = createVuetify({ components, directives });
const mountPanel = () => mount(RehearsalPanel, { global: { plugins: [vuetify] }, attachTo: document.body });

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  /* Vuetify's overlay reads window.visualViewport, which happy-dom does not
   * implement. Without it every dialog test dies on a ReferenceError before it
   * can assert anything. */
  if (!('visualViewport' in window)) {
    vi.stubGlobal('visualViewport', {
      width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1,
      addEventListener: () => {}, removeEventListener: () => {},
    });
  }
});

describe('RehearsalPanel', () => {
  it('offers the button when the machine is clean', async () => {
    const store = useRehearsalStore();
    store.descriptor = descriptor();
    const wrapper = mountPanel();

    expect(wrapper.find('[data-test="rehearsal-start"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-test="rehearsal-blocked"]').exists()).toBe(false);
  });

  it('explains in words why it cannot start', async () => {
    const store = useRehearsalStore();
    store.descriptor = descriptor({ canStart: false, blockedReason: 'exam_data_present' });
    const wrapper = mountPanel();

    const blocked = wrapper.find('[data-test="rehearsal-blocked"]');
    expect(blocked.exists()).toBe(true);
    expect(blocked.text()).toContain('清空');
    expect(wrapper.find('[data-test="rehearsal-start"]').attributes('disabled')).toBeDefined();
  });

  it('will not start until the operator is told the machine gets wiped', async () => {
    /* The confirmation is not a courtesy: this action ends by erasing the
     * machine, and a dialog that does not name that is not consent. */
    const store = useRehearsalStore();
    store.descriptor = descriptor();
    const start = vi.spyOn(store, 'start').mockResolvedValue(true);
    const wrapper = mountPanel();

    await wrapper.find('[data-test="rehearsal-start"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(start).not.toHaveBeenCalled();
    const dialog = document.body.textContent ?? '';
    expect(dialog).toContain('會在結束時清空系統');

    const accept = document.querySelector('[data-test="rehearsal-confirm-accept"]') as HTMLElement;
    expect(accept).toBeTruthy();
    accept.click();
    await wrapper.vm.$nextTick();
    expect(start).toHaveBeenCalled();
  });

  it('does not start when the operator backs out', async () => {
    const store = useRehearsalStore();
    store.descriptor = descriptor();
    const start = vi.spyOn(store, 'start').mockResolvedValue(true);
    const wrapper = mountPanel();

    await wrapper.find('[data-test="rehearsal-start"]').trigger('click');
    await wrapper.vm.$nextTick();
    (document.querySelector('[data-test="rehearsal-confirm-cancel"]') as HTMLElement).click();
    await wrapper.vm.$nextTick();

    expect(start).not.toHaveBeenCalled();
  });

  it('states the verdict and the timings of a finished rehearsal', async () => {
    const store = useRehearsalStore();
    store.descriptor = descriptor();
    store.run = run();
    const wrapper = mountPanel();

    const outcome = wrapper.find('[data-test="rehearsal-outcome"]');
    expect(outcome.text()).toContain('可以辦考試');
    expect(outcome.text()).toContain('60.0s');
  });

  it('says plainly that a failed rehearsal must be dealt with first', async () => {
    const store = useRehearsalStore();
    store.descriptor = descriptor();
    store.run = run({ overallOutcome: 'failed', stages: [stage('paper'), stage('enrol', { status: 'failed' }), stage('admit', { status: 'skipped' }), stage('submit', { status: 'skipped' }), stage('grade', { status: 'skipped' }), stage('cleanup')] });
    const wrapper = mountPanel();

    expect(wrapper.find('[data-test="rehearsal-outcome"]').text()).toContain('開考前必須先處理');
  });

  it('shouts about residue the cleanup could not remove', async () => {
    const store = useRehearsalStore();
    store.descriptor = descriptor({ canStart: false, blockedReason: 'cleanup_pending', pendingCleanup: true });
    store.run = run({ overallOutcome: 'failed', cleanupCompleted: false, cleanupError: '全域 reset 失敗' });
    const wrapper = mountPanel();

    const warning = wrapper.find('[data-test="rehearsal-residue-warning"]');
    expect(warning.exists()).toBe(true);
    expect(warning.text()).toContain('再上傳正式考卷');
    expect(warning.text()).toContain('全域 reset 失敗');
  });

  it('marks the report stale rather than blanking it when the connection drops', async () => {
    const store = useRehearsalStore();
    store.descriptor = descriptor();
    store.run = run();
    store.stale = true;
    const wrapper = mountPanel();

    expect(wrapper.find('[data-test="rehearsal-stale"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="rehearsal-outcome"]').exists()).toBe(true);
  });
});

describe('RehearsalStageList', () => {
  const mountList = (stages = run().stages, currentStage?: string) =>
    mount(RehearsalStageList, { props: { stages, currentStage }, global: { plugins: [vuetify] } });

  it('shows every stage with its status', () => {
    const wrapper = mountList();
    for (const id of ['paper', 'enrol', 'admit', 'submit', 'grade', 'cleanup']) {
      expect(wrapper.find(`[data-test="rehearsal-stage-${id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-test="rehearsal-stage-status-${id}"]`).text()).toBe('通過');
    }
  });

  it('spells out what a passing inverted check means', () => {
    /* "passed: the server said no" reads as a contradiction without this, and
     * it is the most important line in the whole report. */
    const wrapper = mountList([stage('enrol', {
      checks: [{ id: 'exam_key_refused_before_start', status: 'passed', expected: '409 phase_not_allowed' }],
    })]);

    const note = wrapper.find('[data-test="rehearsal-check-note-exam_key_refused_before_start"]');
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain('測資保護生效');
  });

  it('separates the system\'s fault from the student\'s', () => {
    const wrapper = mountList([stage('grade', {
      status: 'failed',
      checks: [
        { id: 'no_system_attribution', status: 'failed', expected: 'systemFailures = 0', attribution: 'system' },
        { id: 'verdict_ac_matches', status: 'failed', expected: 'all AC', attribution: 'submission' },
      ],
    })]);

    expect(wrapper.find('[data-test="rehearsal-check-note-no_system_attribution"]').text()).toContain('系統的錯');
    expect(wrapper.find('[data-test="rehearsal-check-note-verdict_ac_matches"]').exists()).toBe(false);
  });

  it('reports why a stage failed', () => {
    const wrapper = mountList([stage('submit', { status: 'failed', failureReason: '提交被拒絕' })]);
    expect(wrapper.find('[data-test="rehearsal-stage-reason-submit"]').text()).toContain('提交被拒絕');
  });
});
