<script setup lang="ts">
import { INVERTED_CHECKS, STAGE_TITLES, type RehearsalCheck, type RehearsalStage } from '../../../types/rehearsal';

defineProps<{ stages: RehearsalStage[]; currentStage?: string }>();

const STAGE_COLOR: Record<string, string> = {
  pending: 'grey', running: 'info', passed: 'success', failed: 'error', skipped: 'grey',
};
const STAGE_LABEL: Record<string, string> = {
  pending: '未開始', running: '進行中', passed: '通過', failed: '失敗', skipped: '未執行',
};

const duration = (stage: RehearsalStage): string =>
  stage.durationMs === undefined ? '—' : `${(stage.durationMs / 1000).toFixed(1)}s`;

/**
 * How a check should read.
 *
 * A failed check attributed to the system is not the same finding as a failed
 * check attributed to a submission, and the report must not let the two blur:
 * one means the exam logic is wrong, the other means the machine is. Telling
 * them apart is the whole reason the judging pipeline carries attribution.
 */
const checkNote = (check: RehearsalCheck): string | undefined => {
  if (check.attribution === 'system' && check.status === 'failed') {
    return '系統的錯 —— 這個結果不能用來證明任何學生端的判定';
  }
  return INVERTED_CHECKS[check.id];
};
</script>

<template>
  <v-list density="compact" data-test="rehearsal-stage-list">
    <v-list-item
      v-for="stage in stages"
      :key="stage.id"
      :data-test="`rehearsal-stage-${stage.id}`"
      :active="stage.id === currentStage"
    >
      <template #prepend>
        <v-chip :color="STAGE_COLOR[stage.status]" size="small" variant="flat" class="mr-3" :data-test="`rehearsal-stage-status-${stage.id}`">
          {{ STAGE_LABEL[stage.status] }}
        </v-chip>
      </template>

      <v-list-item-title>{{ STAGE_TITLES[stage.id] ?? stage.id }}</v-list-item-title>

      <v-list-item-subtitle>
        耗時 {{ duration(stage) }}（上限 {{ (stage.timeoutMs / 1000).toFixed(0) }}s）
        <span v-if="stage.failureReason" class="text-error" :data-test="`rehearsal-stage-reason-${stage.id}`">
          — {{ stage.failureReason }}
        </span>
      </v-list-item-subtitle>

      <div v-if="stage.checks.length" class="ml-2 mt-2">
        <div
          v-for="check in stage.checks"
          :key="check.id"
          class="text-caption d-flex align-start mb-1"
          :data-test="`rehearsal-check-${check.id}`"
        >
          <v-icon
            :icon="check.status === 'passed' ? 'mdi-check' : check.status === 'failed' ? 'mdi-close' : 'mdi-minus'"
            :color="check.status === 'passed' ? 'success' : check.status === 'failed' ? 'error' : 'grey'"
            size="x-small"
            class="mr-2 mt-1"
          />
          <div>
            <div>
              <code>{{ check.id }}</code>
              <span class="text-medium-emphasis"> — 預期 {{ check.expected }}</span>
            </div>
            <div v-if="checkNote(check)" class="text-medium-emphasis" :data-test="`rehearsal-check-note-${check.id}`">
              {{ checkNote(check) }}
            </div>
            <div v-if="check.observed" class="text-medium-emphasis text-truncate" style="max-width: 60ch">
              實際：{{ check.observed }}
            </div>
          </div>
        </div>
      </div>
    </v-list-item>
  </v-list>
</template>
