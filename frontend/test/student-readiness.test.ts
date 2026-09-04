import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

import StudentReadinessPanel from '../src/views/manage/components/StudentReadiness.vue';
import { useReadinessStore } from '../src/stores/readiness.store';
import * as api from '../src/api/readiness';
import type { ReadinessReport, StudentReadiness } from '../src/types/readiness';

const vuetify = createVuetify({ components, directives });

const seat = (overrides: Partial<StudentReadiness>): StudentReadiness => ({
  testId: 's1',
  name: 'Student',
  ipAddress: '192.168.1.5',
  deviceUuid: 'dev-1',
  isRegistered: true,
  isOnline: true,
  isLoggedIn: true,
  envCheckStatus: 'PASSED',
  envCheckFailedLanguages: [],
  envCheckReportedAt: new Date().toISOString(),
  lastDisconnectedAt: null,
  ready: true,
  ...overrides
});

const report = (students: StudentReadiness[]): ReadinessReport => ({
  phase: 'SETUP_FINISHED',
  isSettlingPhase: true,
  summary: {
    total: students.length,
    ready: students.filter((s) => s.ready).length,
    loggedIn: students.filter((s) => s.isLoggedIn).length,
    registered: students.filter((s) => s.isRegistered).length,
    environmentFailed: students.filter((s) => s.envCheckStatus === 'FAILED').length
  },
  students
});

const mountWith = async (students: StudentReadiness[]) => {
  vi.spyOn(api, 'fetchReadiness').mockResolvedValue(report(students));
  const wrapper = mount(StudentReadinessPanel, { global: { plugins: [vuetify] } });
  await new Promise((r) => setTimeout(r, 0));
  await wrapper.vm.$nextTick();
  return wrapper;
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe('readiness store ordering', () => {
  it('puts the seats that cannot start at the top', async () => {
    /* An invigilator's attention is the scarce resource during an exam. A flat
     * roster makes them scan; a failed toolchain needs a different response
     * from "has not logged in yet" and should not be buried under it. */
    vi.spyOn(api, 'fetchReadiness').mockResolvedValue(
      report([
        seat({ testId: 'ready' }),
        seat({ testId: 'offline', isOnline: false, ready: false }),
        seat({ testId: 'badenv', envCheckStatus: 'FAILED', ready: false }),
        seat({ testId: 'nologin', isLoggedIn: false, ready: false }),
        seat({ testId: 'unregistered', isRegistered: false, isLoggedIn: false, ready: false })
      ])
    );

    const store = useReadinessStore();
    await store.refresh();

    expect(store.needsAttention.map((s) => s.testId)).toEqual([
      'badenv',
      'unregistered',
      'nologin',
      'offline',
      'ready'
    ]);
  });

  it('records the error rather than throwing when the backend is unreachable', async () => {
    vi.spyOn(api, 'fetchReadiness').mockRejectedValue(new Error('network down'));

    const store = useReadinessStore();
    await store.refresh();

    expect(store.error).toBe('network down');
    expect(store.report).toBeNull();
  });
});

describe('StudentReadiness panel', () => {
  it('shows how many seats are ready out of the total', async () => {
    const wrapper = await mountWith([seat({ testId: 'a' }), seat({ testId: 'b', ready: false })]);

    expect(wrapper.find('[data-test="readiness-summary"]').text()).toContain('1 / 2');
  });

  it('names the failing languages rather than just saying failed', async () => {
    const wrapper = await mountWith([
      seat({ testId: 'x', envCheckStatus: 'FAILED', envCheckFailedLanguages: ['Cpp', 'Java'], ready: false })
    ]);

    expect(wrapper.text()).toContain('Cpp、Java');
  });

  it.each([
    [{ isRegistered: false, isLoggedIn: false }, '機器尚未註冊'],
    [{ isLoggedIn: false }, '尚未登入'],
    [{ isOnline: false }, '已掉線'],
    [{ envCheckStatus: 'RUNNING' as const }, '環境檢查進行中'],
    [{ envCheckStatus: 'UNKNOWN' as const }, '尚未回報環境檢查']
  ])('explains why a seat is not ready: %o', async (overrides, expected) => {
    const wrapper = await mountWith([seat({ ...overrides, ready: false })]);

    expect(wrapper.text()).toContain(expected);
  });

  it('says so when the phase is no longer about getting ready', async () => {
    vi.spyOn(api, 'fetchReadiness').mockResolvedValue({
      ...report([seat({})]),
      phase: 'IN_PROGRESS',
      isSettlingPhase: false
    });

    const wrapper = mount(StudentReadinessPanel, { global: { plugins: [vuetify] } });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('目前不在「設定完成」階段');
  });

  it('shows an empty roster without breaking', async () => {
    const wrapper = await mountWith([]);

    expect(wrapper.text()).toContain('尚無學生資料');
  });
});
