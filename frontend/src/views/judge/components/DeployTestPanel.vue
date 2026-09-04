<script setup lang="ts">
import { useDeployTestStore } from '../../../stores/deploy-test.store';
import DeployTestProfileForm from './DeployTestProfileForm.vue';
import DeployTestRunStatus from './DeployTestRunStatus.vue';
import DeployTestProbeResults from './DeployTestProbeResults.vue';
import DeployTestConcurrencyResults from './DeployTestConcurrencyResults.vue';

const store = useDeployTestStore();
</script>
<template>
  <section data-test="deploy-test-panel">
    <v-alert type="info" variant="tonal" class="mb-4">Runs synthetic server-owned programs through the production Piston path. It never reads or changes student submissions or scores.</v-alert>
    <v-alert v-if="store.profileError" type="error" variant="tonal" class="mb-4" data-test="deploy-test-error">Profile unavailable: {{ store.profileError }}</v-alert>
    <v-alert v-if="store.runError" type="error" variant="tonal" class="mb-4" data-test="deploy-test-error">{{ store.runError }}</v-alert>
    <DeployTestProfileForm v-if="store.descriptor && store.draft" v-model="store.draft" :descriptor="store.descriptor" :loading="store.starting" :blocked="store.active || store.draining" @save="store.saveDraft()" @start="store.start()" />
    <DeployTestRunStatus v-if="store.run" :run="store.run" :stale="store.stale" :draining="store.draining" />
    <v-alert v-if="store.run?.errors.length" type="error" variant="tonal" class="mb-4"><div v-for="error in store.run.errors" :key="error">{{ error }}</div></v-alert>
    <DeployTestProbeResults v-if="store.run" :probes="store.run.probes" />
    <DeployTestConcurrencyResults v-if="store.run" :results="store.run.concurrencyResults" />
    <v-btn v-if="store.terminal" variant="outlined" data-test="deploy-test-export" @click="store.exportReport()">Export JSON report</v-btn>
  </section>
</template>
