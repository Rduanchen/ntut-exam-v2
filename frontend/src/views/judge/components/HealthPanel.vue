<script setup lang="ts">
import { computed } from 'vue';
import { useJudgeSettingsStore } from '../../../stores/judge-settings.store';

const store = useJudgeSettingsStore();

const checkedAtLabel = computed(() =>
  store.health ? new Date(store.health.checkedAt).toLocaleString() : '—',
);
</script>

<template>
  <v-card class="mb-6" data-test="health-panel">
    <v-card-title class="d-flex align-center">
      <span>Execution Backend</span>
      <v-spacer />
      <v-btn
        size="small"
        variant="tonal"
        prepend-icon="mdi-refresh"
        :loading="store.healthLoading"
        data-test="recheck"
        @click="store.loadHealth()"
      >
        Re-check
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-alert v-if="store.healthError" type="error" variant="tonal" class="mb-4">
        Could not check the execution backend: {{ store.healthError }}
      </v-alert>

      <template v-if="store.health">
        <v-alert
          :type="store.health.reachable ? 'success' : 'error'"
          variant="tonal"
          class="mb-4"
          data-test="reachability"
        >
          <div class="font-weight-medium">
            {{ store.health.reachable ? 'Reachable' : 'Not reachable' }} — {{ store.health.url }}
          </div>
          <!-- A timestamp matters: "reachable" without one is a claim about an
               unknown moment, and the point is checking shortly before an exam. -->
          <div class="text-caption">Checked {{ checkedAtLabel }}</div>
          <div v-if="store.health.error" class="text-caption">{{ store.health.error }}</div>
        </v-alert>

        <!-- The check this page exists for. A machine with only the C family
             installed once met an exam expecting Python, and nothing said so
             until students were sitting down. -->
        <v-alert
          v-if="store.missingLanguages.length"
          type="warning"
          variant="flat"
          class="mb-4"
          data-test="missing-languages"
        >
          <div class="font-weight-bold">
            This exam needs {{ store.missingLanguages.length }} language(s) this machine cannot run.
          </div>
          <div>
            <v-chip
              v-for="req in store.missingLanguages"
              :key="req.examLanguage"
              color="warning"
              variant="flat"
              size="small"
              class="mr-2 mt-2"
              data-test="missing-language"
            >
              {{ req.examLanguage }}
            </v-chip>
          </div>
          <div class="text-caption mt-2">
            Install them on the execution backend before the exam begins.
          </div>
        </v-alert>

        <v-alert
          v-else-if="store.languageRequirements.length"
          type="success"
          variant="tonal"
          class="mb-4"
          data-test="languages-ok"
        >
          Every language this exam uses is available.
        </v-alert>

        <div class="text-subtitle-2 mb-2">Installed runtimes</div>
        <v-chip
          v-for="rt in store.health.runtimes"
          :key="`${rt.language}-${rt.version}`"
          size="small"
          variant="outlined"
          class="mr-2 mb-2"
          data-test="runtime"
        >
          {{ rt.language }} {{ rt.version }}
        </v-chip>
        <div v-if="!store.health.runtimes.length" class="text-medium-emphasis">
          No runtimes reported.
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>
