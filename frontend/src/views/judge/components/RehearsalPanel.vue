<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRehearsalStore } from '../../../stores/rehearsal.store';
import { BLOCK_REASON_TEXT } from '../../../types/rehearsal';
import RehearsalStageList from './RehearsalStageList.vue';

const store = useRehearsalStore();
const confirming = ref(false);

const blockedText = computed(() =>
  store.descriptor?.blockedReason ? BLOCK_REASON_TEXT[store.descriptor.blockedReason] : null);

const outcomeColor = computed(() => {
  if (!store.run?.overallOutcome) return 'info';
  return store.run.overallOutcome === 'passed' ? 'success' : 'error';
});

const outcomeText = computed(() => {
  if (!store.run) return '';
  if (!store.terminal) return '演練進行中';
  switch (store.run.overallOutcome) {
    case 'passed': return '通過 —— 這台機器可以辦考試';
    case 'interrupted': return `中斷（${store.run.interruptionReason === 'process_restart' ? '後端重啟' : '整場逾時'}）`;
    default: return '失敗 —— 開考前必須先處理';
  }
});

const timestamp = (value?: number): string =>
  value === undefined ? '—' : new Date(value).toLocaleString();

const totalSeconds = computed(() => {
  if (!store.run?.finishedAt) return null;
  return ((store.run.finishedAt - store.run.startedAt) / 1000).toFixed(1);
});

async function confirmAndStart(): Promise<void> {
  confirming.value = false;
  await store.start();
}
</script>

<template>
  <section data-test="rehearsal-panel">
    <v-alert type="info" variant="tonal" class="mb-4">
      以真實 API 走完一場最小的考試：載入演練考卷、模擬學生取卷與提交、助教評測，最後清空系統。
      用來在正式考卷上傳之前確認這台機器整條流程走得通。
    </v-alert>

    <v-alert
      v-if="store.residueWarning"
      type="error"
      variant="flat"
      prominent
      class="mb-4"
      data-test="rehearsal-residue-warning"
    >
      <div class="font-weight-bold">系統仍有演練殘留，尚未清除乾淨。</div>
      <div>請先手動確認並清空系統，再上傳正式考卷。</div>
      <div v-if="store.run?.cleanupError" class="text-caption mt-1">{{ store.run.cleanupError }}</div>
    </v-alert>

    <v-alert v-if="store.profileError" type="error" variant="tonal" class="mb-4" data-test="rehearsal-error">
      無法取得演練狀態：{{ store.profileError }}
    </v-alert>
    <v-alert v-if="store.runError" type="error" variant="tonal" class="mb-4" data-test="rehearsal-error">
      {{ store.runError }}
    </v-alert>
    <v-alert v-if="store.stale" type="warning" variant="tonal" class="mb-4" data-test="rehearsal-stale">
      與後端的連線中斷，以下是最後一次取得的狀態。
    </v-alert>

    <v-alert
      v-if="blockedText && !store.active"
      type="warning"
      variant="tonal"
      class="mb-4"
      data-test="rehearsal-blocked"
    >
      {{ blockedText }}
    </v-alert>

    <v-btn
      color="primary"
      class="mb-4"
      :disabled="!store.descriptor?.canStart || store.starting || store.active"
      :loading="store.starting"
      data-test="rehearsal-start"
      @click="confirming = true"
    >
      執行部署後測試
    </v-btn>

    <!-- The confirmation says what will happen, not merely "are you sure".
         This action ends by erasing the machine; a dialog that does not name
         that is not consent. -->
    <v-dialog v-model="confirming" max-width="560" data-test="rehearsal-confirm-dialog">
      <v-card>
        <v-card-title>執行部署後測試？</v-card-title>
        <v-card-text>
          <p class="mb-2 font-weight-bold">這個動作會在結束時清空系統。</p>
          <p class="mb-2">
            演練會載入一份演練用考卷、建立一位模擬學生、送出兩份提交並評測，
            然後執行全域 reset —— 考卷、學生、裝置、提交與分數全部清除。
          </p>
          <p>只有演練報告會留下。請確認這台機器上目前沒有你在乎的考試資料。</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" data-test="rehearsal-confirm-cancel" @click="confirming = false">取消</v-btn>
          <v-btn color="error" variant="flat" data-test="rehearsal-confirm-accept" @click="confirmAndStart">
            我了解，清空並開始
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <template v-if="store.run">
      <v-alert :type="store.terminal ? (store.run.overallOutcome === 'passed' ? 'success' : 'error') : 'info'"
               :color="outcomeColor" variant="tonal" class="mb-4" data-test="rehearsal-outcome">
        <div class="font-weight-bold">{{ outcomeText }}</div>
        <div class="text-caption mt-1">
          開始 {{ timestamp(store.run.startedAt) }}
          <template v-if="store.run.finishedAt"> · 結束 {{ timestamp(store.run.finishedAt) }} · 總計 {{ totalSeconds }}s</template>
        </div>
      </v-alert>

      <v-alert v-if="store.run.errors.length" type="error" variant="tonal" class="mb-4" data-test="rehearsal-run-errors">
        <div v-for="error in store.run.errors" :key="error">{{ error }}</div>
      </v-alert>

      <RehearsalStageList :stages="store.run.stages" :current-stage="store.run.currentStage" />
    </template>
  </section>
</template>
