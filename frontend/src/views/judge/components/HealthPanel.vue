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
      <span>執行後端</span>
      <v-spacer />
      <v-btn
        size="small"
        variant="tonal"
        prepend-icon="mdi-refresh"
        :loading="store.healthLoading"
        data-test="recheck"
        @click="store.loadHealth()"
      >
        重新檢查
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-alert v-if="store.healthError" type="error" variant="tonal" class="mb-4">
        無法檢查執行後端： {{ store.healthError }}
      </v-alert>

      <template v-if="store.health">
        <v-alert
          :type="store.health.reachable ? 'success' : 'error'"
          variant="tonal"
          class="mb-4"
          data-test="reachability"
        >
          <div class="font-weight-medium">
            {{ store.health.reachable ? '可連線' : '無法連線' }} — {{ store.health.url }}
          </div>
          <!-- A timestamp matters: "reachable" without one is a claim about an
               unknown moment, and the point is checking shortly before an exam. -->
          <div class="text-caption">檢查時間：{{ checkedAtLabel }}</div>
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
            本次考試需要 {{ store.missingLanguages.length }} 種這台機器無法執行的語言。
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
            請在開考前於執行後端安裝所需語言。
          </div>
        </v-alert>

        <v-alert
          v-else-if="store.languageRequirements.length"
          type="success"
          variant="tonal"
          class="mb-4"
          data-test="languages-ok"
        >
          本次考試所需語言均可使用。
        </v-alert>

        <div class="text-subtitle-2 mb-2">已安裝的執行環境</div>
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
          未回報任何執行環境。
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>
