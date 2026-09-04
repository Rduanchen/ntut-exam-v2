<script setup lang="ts">
import type { ConcurrencyResult } from '../../../types/deploy-test';
defineProps<{ results: ConcurrencyResult[] }>();
</script>
<template>
  <v-card v-if="results.length" class="mb-4"><v-card-title>Concurrency measurements</v-card-title><v-card-text><div class="table-scroll"><table>
    <thead><tr><th>Submitted / observed</th><th>Accounting</th><th>Throughput</th><th>Total latency</th><th>Infrastructure</th></tr></thead><tbody>
      <tr v-for="result in results" :key="result.submittedConcurrency" data-test="deploy-test-concurrency-row">
        <td>{{ result.submittedConcurrency }} / {{ result.observedPeakExecutionConcurrency }} (ceiling {{ result.activeCeiling }})</td>
        <td>{{ result.completed }} completed + {{ result.missing }} missing + {{ result.interrupted }} interrupted = {{ result.requested }}</td>
        <td>{{ result.throughputPerSecond.toFixed(2) }}/s</td>
        <td>p50 {{ result.totalLatencyMs.p50 }} · p95 {{ result.totalLatencyMs.p95 }} · p99 {{ result.totalLatencyMs.p99 }} · max {{ result.totalLatencyMs.max }} ms</td>
        <td>{{ (result.infrastructureFailureRate * 100).toFixed(1) }}%<div v-for="warning in result.warnings" :key="warning" class="text-warning">⚠ {{ warning }}</div></td>
      </tr>
    </tbody></table></div></v-card-text></v-card>
</template>
<style scoped>.table-scroll{overflow-x:auto}table{min-width:900px;width:100%;border-collapse:collapse}th,td{text-align:left;padding:.55rem;border-bottom:1px solid #ddd}</style>
