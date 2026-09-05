import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

import ConnectionView from '../src/views/connection/ConnectionView.vue';
import { useConnectionStore } from '../src/stores/connection.store';

const vuetify = createVuetify({ components, directives });

/**
 * The entry gate is only as good as the decision behind it.
 *
 * A TA who cannot see why a machine is asking approves everything under time
 * pressure, and then the gate means nothing. These assert the console shows
 * enough to decide without opening another screen.
 */
const request = (over: Record<string, unknown> = {}) => ({
  id: 1,
  deviceUuid: 'dev-a',
  ipAddress: '10.0.0.5',
  createdAt: new Date().toISOString(),
  type: 'REBIND',
  testId: 's-1',
  previousTestId: 's-1',
  previousStudentName: '王小明',
  previousStudentOnlineElsewhere: false,
  lastDisconnectedAt: new Date(Date.now() - 30_000).toISOString(),
  ipMatchesRoster: true,
  ...over
});

const mountWith = async (requests: unknown[]) => {
  const store = useConnectionStore();
  /* The view refreshes everything on mount. All three are stubbed, or the
   * component reaches for a backend that is not there. */
  vi.spyOn(store, 'fetchSettings').mockResolvedValue();
  vi.spyOn(store, 'fetchDevices').mockResolvedValue();
  vi.spyOn(store, 'fetchLoginRequests').mockResolvedValue();
  store.loginRequests = requests as never[];
  store.devices = [
    { id: 's-1', name: '王小明' },
    { id: 's-2', name: '陳大文' }
  ] as never[];

  const wrapper = mount(ConnectionView, { global: { plugins: [vuetify] } });
  await new Promise((r) => setTimeout(r, 0));
  await wrapper.vm.$nextTick();
  return wrapper;
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();

  /* Teleported dialogs are appended to document.body and are not removed
   * between tests. Left behind, the negative assertion below would read the
   * previous test's dialog and pass for the wrong reason. */
  document.body.innerHTML = '';

  /* Vuetify's overlay positioning reads window.visualViewport, which happy-dom
   * does not provide. An environment gap, not a component one. */
  if (!(window as any).visualViewport) {
    (window as any).visualViewport = {
      width: 1024,
      height: 768,
      offsetLeft: 0,
      offsetTop: 0,
      scale: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
  }
});

describe('pending entry requests', () => {
  it.each([
    ['NEW_DEVICE', '全新機器'],
    ['REBIND', '已綁學生的機器'],
    ['UNBOUND_DEVICE', '註冊過未綁人']
  ])('names the %s situation', async (type, label) => {
    const wrapper = await mountWith([request({ type })]);

    expect(wrapper.text()).toContain(label);
  });

  it('shows who the machine belonged to', async () => {
    const wrapper = await mountWith([request()]);

    const evidence = wrapper.find('[data-test="request-evidence"]').text();
    expect(evidence).toContain('s-1');
    expect(evidence).toContain('王小明');
  });

  it('warns when that student is already answering elsewhere', async () => {
    /* The difference between "their machine restarted" and "someone is
     * claiming a seat that is in use", which need opposite decisions. */
    const wrapper = await mountWith([request({ previousStudentOnlineElsewhere: true })]);

    expect(wrapper.text()).toContain('正在另一台機器上作答');
  });

  it('says how long ago the machine dropped', async () => {
    const wrapper = await mountWith([request()]);

    expect(wrapper.find('[data-test="request-evidence"]').text()).toMatch(/上次斷線：\d+ 秒前/);
  });

  it('flags a request coming from a seat the roster does not expect', async () => {
    const wrapper = await mountWith([request({ ipMatchesRoster: false })]);

    expect(wrapper.text()).toContain('與名單不符');
  });

  it('does not invent detail for a machine nobody has seen', async () => {
    const wrapper = await mountWith([
      request({
        type: 'NEW_DEVICE',
        previousTestId: null,
        previousStudentName: null,
        lastDisconnectedAt: null
      })
    ]);

    expect(wrapper.find('[data-test="request-evidence"]').text()).toContain('上次斷線：—');
  });
});

describe('approving an entry request', () => {
  it('defaults to the student the machine already belonged to', async () => {
    // The common case is a restart, not a swap.
    const wrapper = await mountWith([request()]);

    await wrapper.find('[data-test="open-approve"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).targetTestId).toBe('s-1');
  });

  it('approves with the chosen student', async () => {
    const store = useConnectionStore();
    const approve = vi.spyOn(store, 'approveRequest').mockResolvedValue();
    const wrapper = await mountWith([request()]);

    await wrapper.find('[data-test="open-approve"]').trigger('click');
    (wrapper.vm as any).targetTestId = 's-2';
    await (wrapper.vm as any).confirmApprove();

    expect(approve).toHaveBeenCalledWith(1, 'KEEP_USER', 's-2');
  });

  it('spells out what a reassignment releases', async () => {
    /* Both bindings go in one call. Undoing only this machine's leaves the
     * incoming student held by their own seat, so they fail to log in and the
     * TA runs the whole approval again. */
    const wrapper = await mountWith([request()]);

    await wrapper.find('[data-test="open-approve"]').trigger('click');
    (wrapper.vm as any).targetTestId = 's-2';
    await wrapper.vm.$nextTick();

    /* The dialog is teleported, so it lives on document.body rather than
     * inside the wrapper — the negative case below would pass for the wrong
     * reason if it read the wrapper. */
    const text = document.body.textContent ?? '';
    expect(text).toContain('兩邊一次解完');
    expect(text).toContain('作答都不受影響');
  });

  it('says nothing about unbinding when the same student returns', async () => {
    const wrapper = await mountWith([request()]);

    await wrapper.find('[data-test="open-approve"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.body.textContent ?? '').not.toContain('兩邊一次解完');
  });
});
