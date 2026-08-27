<script setup lang="ts">
import { onMounted } from 'vue';
import { useJudgeSettingsStore } from '../../stores/judge-settings.store';
import HealthPanel from './components/HealthPanel.vue';
import SettingRow from './components/SettingRow.vue';
import ContainerPanel from './components/ContainerPanel.vue';

const store = useJudgeSettingsStore();

const LABELS: Record<string, { label: string; hint?: string }> = {
  timeLimit: { label: 'Run time limit (ms)' },
  memoryLimit: { label: 'Run memory limit (MB)' },
  compareMode: { label: 'Output comparison mode' },
  compileTimeout: {
    label: 'Compile time limit (ms)',
    hint: 'A compile stage killed on this allowance is attributed to the system, not to the student.',
  },
  compileMemoryLimit: { label: 'Compile memory limit (bytes, -1 for unlimited)' },
  maxSystemRetries: {
    label: 'Retries for system failures',
    hint: 'Applies only to failures attributed to the system. Student failures are never retried.',
  },
  maxConcurrentJobs: {
    label: 'Concurrent executions',
    hint: 'Measure this machine — see the concurrency sweep in the project README. Failure under load is a cliff, not a slope.',
  },
};

const describe = (key: string) => LABELS[key] ?? { label: key };

onMounted(() => store.loadAll());
</script>

<template>
  <v-container fluid data-test="judge-settings-view">
    <h1 class="text-h5 mb-4">Judge Settings</h1>

    <!-- The pre-exam check comes first: it is the only part of this page that
         addresses a failure which has already happened with no warning. -->
    <HealthPanel />

    <v-alert v-if="store.settingsError" type="error" variant="tonal" class="mb-6" data-test="settings-error">
      Could not load judging settings: {{ store.settingsError }}
      <div class="text-caption mt-1">
        No values are shown, rather than values that may no longer be true.
      </div>
    </v-alert>

    <template v-if="store.settings">
      <v-card class="mb-6" data-test="exam-panel">
        <v-card-title>Judging rules</v-card-title>
        <v-card-subtitle>These travel with the exam paper.</v-card-subtitle>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4" data-test="replacement-warning-exam">
            Uploading a <code>config.json</code> <strong>replaces</strong> these settings. A field
            absent from the uploaded file returns to its default — it does not keep the value set
            here. That is the deployment model: one file fully defines one machine.
          </v-alert>
          <SettingRow
            v-for="[key, setting] in store.group('exam')"
            :key="key"
            :setting-key="key"
            :setting="setting"
            v-bind="describe(key)"
          />
        </v-card-text>
      </v-card>

      <v-card class="mb-6" data-test="machine-panel">
        <v-card-title>Machine capacity</v-card-title>
        <v-card-subtitle>This describes THIS machine, not the exam.</v-card-subtitle>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4" data-test="replacement-warning-machine">
            Also replaced by a <code>config.json</code> upload. Because this value travels with the
            exam paper while describing the hardware under it,
            <strong>re-measure it whenever a paper moves to a different machine.</strong>
          </v-alert>
          <SettingRow
            v-for="[key, setting] in store.group('machine')"
            :key="key"
            :setting-key="key"
            :setting="setting"
            v-bind="describe(key)"
          />
          <div v-if="store.activeCeiling !== null" class="text-caption text-medium-emphasis">
            Currently enforcing a ceiling of {{ store.activeCeiling }} concurrent executions.
          </div>
        </v-card-text>
      </v-card>

      <v-card v-if="store.unknownSettings.length" class="mb-6" data-test="unknown-panel">
        <v-card-title>Other settings</v-card-title>
        <v-card-subtitle>Reported by the backend but not grouped by this page.</v-card-subtitle>
        <v-card-text>
          <SettingRow
            v-for="[key, setting] in store.unknownSettings"
            :key="key"
            :setting-key="key"
            :setting="setting"
            v-bind="describe(key)"
          />
        </v-card-text>
      </v-card>

      <v-alert v-if="store.saveError" type="error" variant="tonal" class="mb-4" data-test="save-error">
        Could not save: {{ store.saveError }}
        <div class="text-caption mt-1">Your edits are kept and have not been applied.</div>
      </v-alert>

      <div class="d-flex align-center mb-8">
        <v-btn
          color="primary"
          :disabled="!store.isDirty"
          :loading="store.saving"
          data-test="save"
          @click="store.save()"
        >
          Save changes
        </v-btn>
        <v-btn
          variant="text"
          class="ml-2"
          :disabled="!store.isDirty"
          data-test="discard"
          @click="store.discardDrafts()"
        >
          Discard
        </v-btn>
        <span v-if="store.isDirty" class="ml-4 text-caption text-warning" data-test="dirty-hint">
          Unsaved changes are not in force yet.
        </span>
      </div>
    </template>

    <ContainerPanel />
  </v-container>
</template>
