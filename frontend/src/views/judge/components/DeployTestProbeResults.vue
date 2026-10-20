<script setup lang="ts">
import type { ProbeResult } from '../../../types/deploy-test';
import { attributionLabel, verdictLabel, probeStatusLabel } from '../../../utils/presentation-labels';
defineProps<{ probes: ProbeResult[] }>();
</script>
<template>
  <v-card v-if="probes.length" class="mb-4"><v-card-title>語言與評測結果檢查</v-card-title><v-card-text>
    <div class="table-scroll"><table><thead><tr><th>測試項目</th><th>執行環境</th><th>預期</th><th>實際</th><th>結果</th><th>佐證</th></tr></thead><tbody>
      <tr v-for="probe in probes" :key="probe.probeId" data-test="deploy-test-probe-row">
        <td>{{ probe.semanticLanguage }} / {{ probe.scenario }}</td><td>{{ probe.runtime ? `${probe.runtime.language} ${probe.runtime.version}` : '無法使用' }}</td>
        <td>{{ probe.expectedStatus }}（{{ verdictLabel(probe.expectedStatus) }}） / {{ attributionLabel(probe.expectedAttribution) }}</td><td>{{ probe.observedStatus ?? '—' }}<template v-if="probe.observedStatus">（{{ verdictLabel(probe.observedStatus) }}）</template> / {{ probe.observedAttribution ? attributionLabel(probe.observedAttribution) : '—' }}</td>
        <td><strong>{{ probeStatusLabel(probe.status) }}</strong></td><td><details><summary>{{ probe.attempts.length }} 次嘗試</summary><pre>{{ probe.diagnostic }}\n{{ probe.attempts.map(a => `#${a.attempt} ${a.status}/${a.attribution} ${a.totalMs}ms ${a.diagnostic}`).join('\n') }}</pre></details></td>
      </tr>
    </tbody></table></div>
  </v-card-text></v-card>
</template>
<style scoped>.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.55rem;border-bottom:1px solid #ddd;vertical-align:top}pre{white-space:pre-wrap;max-width:36rem}</style>
