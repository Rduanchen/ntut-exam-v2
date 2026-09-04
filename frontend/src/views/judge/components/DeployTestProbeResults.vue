<script setup lang="ts">
import type { ProbeResult } from '../../../types/deploy-test';
defineProps<{ probes: ProbeResult[] }>();
</script>
<template>
  <v-card v-if="probes.length" class="mb-4"><v-card-title>Language and verdict probes</v-card-title><v-card-text>
    <div class="table-scroll"><table><thead><tr><th>Probe</th><th>Runtime</th><th>Expected</th><th>Observed</th><th>Result</th><th>Evidence</th></tr></thead><tbody>
      <tr v-for="probe in probes" :key="probe.probeId" data-test="deploy-test-probe-row">
        <td>{{ probe.semanticLanguage }} / {{ probe.scenario }}</td><td>{{ probe.runtime ? `${probe.runtime.language} ${probe.runtime.version}` : 'unavailable' }}</td>
        <td>{{ probe.expectedStatus }} / {{ probe.expectedAttribution }}</td><td>{{ probe.observedStatus ?? '—' }} / {{ probe.observedAttribution ?? '—' }}</td>
        <td><strong>{{ probe.status }}</strong></td><td><details><summary>{{ probe.attempts.length }} attempt(s)</summary><pre>{{ probe.diagnostic }}\n{{ probe.attempts.map(a => `#${a.attempt} ${a.status}/${a.attribution} ${a.totalMs}ms ${a.diagnostic}`).join('\n') }}</pre></details></td>
      </tr>
    </tbody></table></div>
  </v-card-text></v-card>
</template>
<style scoped>.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.55rem;border-bottom:1px solid #ddd;vertical-align:top}pre{white-space:pre-wrap;max-width:36rem}</style>
