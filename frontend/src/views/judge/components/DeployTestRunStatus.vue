<script setup lang="ts">
import type { DeploymentTestRun } from '../../../types/deploy-test';
import { deployOutcomeLabel, deployPhaseLabel, deployStateLabel, interruptionReasonLabel } from '../../../utils/presentation-labels';
defineProps<{ run: DeploymentTestRun; stale: boolean; draining: boolean }>();
</script>
<template>
  <v-card class="mb-4" data-test="deploy-test-status"><v-card-title>執行紀錄 {{ run.id }}</v-card-title><v-card-text>
    <div><strong>狀態：</strong>{{ deployStateLabel(run.state) }}</div>
    <div v-if="run.overallOutcome" data-test="deploy-test-outcome"><strong>結果：</strong>{{ deployOutcomeLabel(run.overallOutcome) }}</div>
    <div><strong>開始時間：</strong>{{ new Date(run.startedAt).toLocaleString('zh-TW') }}</div>
    <div v-if="run.finishedAt"><strong>結束時間：</strong>{{ new Date(run.finishedAt).toLocaleString('zh-TW') }}</div>
    <div v-if="run.interruptionReason"><strong>中斷原因：</strong>{{ interruptionReasonLabel(run.interruptionReason) }}（{{ run.interruptionReason }}）</div>
    <v-progress-linear :model-value="run.progress.total ? run.progress.completed / run.progress.total * 100 : 0" class="my-3" />
    <div data-test="deploy-test-progress" role="status">{{ deployPhaseLabel(run.progress.phase) }}：{{ run.progress.completed }} / {{ run.progress.total }}</div>
    <v-alert v-if="stale" type="warning" variant="tonal" class="mt-3" data-test="deploy-test-stale">目前進度可能已過期，正在重新取得。</v-alert>
    <v-alert v-if="draining" type="info" variant="tonal" class="mt-3">已停止更新報告，正在等待已開始的評測工作完成。</v-alert>
  </v-card-text></v-card>
</template>
