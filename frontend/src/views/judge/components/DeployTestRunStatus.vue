<script setup lang="ts">
import type { DeploymentTestRun } from '../../../types/deploy-test';
defineProps<{ run: DeploymentTestRun; stale: boolean; draining: boolean }>();
</script>
<template>
  <v-card class="mb-4" data-test="deploy-test-status"><v-card-title>Run {{ run.id }}</v-card-title><v-card-text>
    <div><strong>Lifecycle:</strong> {{ run.state }}</div>
    <div v-if="run.overallOutcome" data-test="deploy-test-outcome"><strong>Outcome:</strong> {{ run.overallOutcome }}</div>
    <div><strong>Started:</strong> {{ new Date(run.startedAt).toLocaleString() }}</div>
    <div v-if="run.finishedAt"><strong>Finished:</strong> {{ new Date(run.finishedAt).toLocaleString() }}</div>
    <div v-if="run.interruptionReason"><strong>Interrupted:</strong> {{ run.interruptionReason }}</div>
    <v-progress-linear :model-value="run.progress.total ? run.progress.completed / run.progress.total * 100 : 0" class="my-3" />
    <div data-test="deploy-test-progress" role="status">{{ run.progress.phase }}: {{ run.progress.completed }} / {{ run.progress.total }}</div>
    <v-alert v-if="stale" type="warning" variant="tonal" class="mt-3" data-test="deploy-test-stale">Displayed progress is stale; retrying.</v-alert>
    <v-alert v-if="draining" type="info" variant="tonal" class="mt-3">The report is frozen while admitted sandbox calls drain.</v-alert>
  </v-card-text></v-card>
</template>
