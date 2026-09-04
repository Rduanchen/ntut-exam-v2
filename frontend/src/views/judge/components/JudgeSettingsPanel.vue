<script setup lang="ts">
import { useJudgeSettingsStore } from '../../../stores/judge-settings.store';
import HealthPanel from './HealthPanel.vue';
import SettingRow from './SettingRow.vue';
import ContainerPanel from './ContainerPanel.vue';

const store = useJudgeSettingsStore();
const labels: Record<string, { label: string; hint?: string }> = {
  timeLimit: { label: 'Run time limit (ms)' }, memoryLimit: { label: 'Run memory limit (MB)' },
  compareMode: { label: 'Output comparison mode' }, compileMemoryLimit: { label: 'Compile memory limit (bytes, -1 for unlimited)' },
  compileTimeout: { label: 'Compile time limit (ms)', hint: 'A compile timeout is attributed to the system.' },
  maxSystemRetries: { label: 'Retries for system failures', hint: 'Student failures are never retried.' },
  maxConcurrentJobs: { label: 'Concurrent executions', hint: 'Measure this machine before an exam.' },
};
const describe = (key: string) => labels[key] ?? { label: key };
</script>

<template>
  <div data-test="judge-settings-panel">
    <HealthPanel />
    <v-alert v-if="store.settingsError" type="error" variant="tonal" class="mb-6" data-test="settings-error">
      Could not load judging settings: {{ store.settingsError }}
      <div class="text-caption mt-1">No values are shown, rather than values that may no longer be true.</div>
    </v-alert>
    <template v-if="store.settings">
      <v-card class="mb-6" data-test="exam-panel"><v-card-title>Judging rules</v-card-title>
        <v-card-subtitle>These travel with the exam paper.</v-card-subtitle><v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4" data-test="replacement-warning-exam">
            Uploading a <code>config.json</code> <strong>replaces</strong> these settings. An absent field returns to its default.
          </v-alert>
          <SettingRow v-for="[key, setting] in store.group('exam')" :key="key" :setting-key="key" :setting="setting" v-bind="describe(key)" />
        </v-card-text></v-card>
      <v-card class="mb-6" data-test="machine-panel"><v-card-title>Machine capacity</v-card-title>
        <v-card-subtitle>This describes THIS machine, not the exam.</v-card-subtitle><v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4" data-test="replacement-warning-machine">
            Also <strong>replaced</strong> by a <code>config.json</code> upload. Measure this machine and <strong>re-measure it whenever a paper moves to a different machine.</strong>
          </v-alert>
          <SettingRow v-for="[key, setting] in store.group('machine')" :key="key" :setting-key="key" :setting="setting" v-bind="describe(key)" />
          <div v-if="store.activeCeiling !== null" class="text-caption">Currently enforcing a ceiling of {{ store.activeCeiling }} concurrent executions.</div>
        </v-card-text></v-card>
      <v-card v-if="store.unknownSettings.length" class="mb-6" data-test="unknown-panel"><v-card-title>Other settings</v-card-title><v-card-text>
        <SettingRow v-for="[key, setting] in store.unknownSettings" :key="key" :setting-key="key" :setting="setting" v-bind="describe(key)" />
      </v-card-text></v-card>
      <v-alert v-if="store.saveError" type="error" variant="tonal" class="mb-4" data-test="save-error">Could not save: {{ store.saveError }}</v-alert>
      <div class="d-flex align-center mb-8">
        <v-btn color="primary" :disabled="!store.isDirty" :loading="store.saving" data-test="save" @click="store.save()">Save changes</v-btn>
        <v-btn variant="text" class="ml-2" :disabled="!store.isDirty" data-test="discard" @click="store.discardDrafts()">Discard</v-btn>
        <span v-if="store.isDirty" class="ml-4 text-caption text-warning" data-test="dirty-hint">Unsaved changes are not in force yet.</span>
      </div>
    </template>
    <ContainerPanel />
  </div>
</template>
