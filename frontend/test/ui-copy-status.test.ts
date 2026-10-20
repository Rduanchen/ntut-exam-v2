import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import DeviceGrid from '../src/views/device/components/DeviceGrid.vue';
import OriginChip from '../src/views/judge/components/OriginChip.vue';
import DeployTestProbeResults from '../src/views/judge/components/DeployTestProbeResults.vue';
import type { ProbeResult } from '../src/types/deploy-test';

const vuetify = createVuetify({ components, directives });

describe('狀態與技術代碼的顯示', () => {
  it('設備狀態顯示中文但保留 UUID', () => {
    const wrapper = mount(DeviceGrid, {
      props: { itemsPerRow: 4, devices: [{
        id: 's-1', name: '王小明', ipAddress: '10.0.0.1', deviceUuid: 'abc-uuid',
        isOnline: true, status: 'AWAITING_LOGIN'
      }] },
      global: { plugins: [vuetify] }
    });
    expect(wrapper.text()).toContain('等待登入');
    expect(wrapper.text()).toContain('abc-uuid'.slice(0, 8));
    wrapper.unmount();
  });

  it('被拒絕的設定明示未採用', () => {
    const wrapper = mount(OriginChip, { props: { origin: 'clamped' }, global: { plugins: [vuetify] } });
    expect(wrapper.text()).toContain('未採用');
    wrapper.unmount();
  });

  it('評測代碼與歸因分開呈現，診斷原文保留', () => {
    const probe: ProbeResult = {
      probeId: 'probe-1', phase: 'verdict', semanticLanguage: 'cpp', scenario: 'compile',
      expectedStatus: 'AC', expectedAttribution: 'submission',
      observedStatus: 'SE', observedAttribution: 'system', status: 'failed',
      attempts: [], diagnostic: 'backend timed out'
    };
    const wrapper = mount(DeployTestProbeResults, { props: { probes: [probe] }, global: { plugins: [vuetify] } });
    expect(wrapper.text()).toContain('SE');
    expect(wrapper.text()).toContain('系統錯誤');
    expect(wrapper.text()).toContain('backend timed out');
    wrapper.unmount();
  });
});
