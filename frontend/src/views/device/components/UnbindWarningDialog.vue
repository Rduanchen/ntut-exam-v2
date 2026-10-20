<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  device: any;
  action: 'unbind' | 'unregister';
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'confirm'): void;
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const confirmationText = ref('');
const requiredText = 'CONFIRM';

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    confirmationText.value = '';
  }
});

const isCritical = computed(() => props.device?.status === 'ONLINE');
const isConfirmValid = computed(() => !isCritical.value || confirmationText.value === requiredText);

const confirm = () => {
  if (isConfirmValid.value) {
    emit('confirm');
  }
};
</script>

<template>
  <v-dialog v-model="show" max-width="500">
    <v-card class="rounded-xl">
      <v-card-item :class="isCritical ? 'bg-error text-white pa-4' : 'bg-warning text-white pa-4'">
        <template v-slot:prepend>
          <v-icon size="x-large" class="mr-3">
            {{ isCritical ? 'mdi-alert-octagon' : 'mdi-alert' }}
          </v-icon>
        </template>
        <v-card-title class="text-h6 font-weight-bold">
          {{ action === 'unbind' ? '解除設備學生綁定' : '完全註銷設備' }}
        </v-card-title>
      </v-card-item>

      <v-card-text class="pt-6">
        <p v-if="action === 'unbind'" class="mb-4 text-body-1">
          確定要將 <strong>{{ device?.name || '未知學生' }}</strong>（{{ device?.id || '—' }}）從此設備解除綁定嗎？
        </p>
        <p v-else class="mb-4 text-body-1">
          確定要完全註銷此設備（UUID：<strong>{{ device?.deviceUuid || '—' }}</strong>）嗎？
          任何已綁定的學生都將被解除綁定。
        </p>

        <v-alert
          v-if="isCritical"
          type="error"
          variant="tonal"
          class="mb-4 border-error font-weight-medium"
          border="start"
        >
          <div class="text-subtitle-1 font-weight-bold mb-1">⚠️ 嚴重警告：學生正在考試中！</div>
          此設備目前為線上且已登入。執行此操作將<strong>立即強制登出學生</strong>，這可能會影響其考試作答進度。
        </v-alert>

        <v-alert
          v-else
          type="warning"
          variant="tonal"
          class="mb-4 border-warning"
          border="start"
        >
          此設備目前未登入。學生在下次啟動時將需要重新註冊並綁定。
        </v-alert>

        <div v-if="isCritical" class="mt-4">
          <p class="text-body-2 mb-2 font-weight-medium">若要繼續，請在下方輸入 <strong>CONFIRM</strong>：</p>
          <v-text-field
            v-model="confirmationText"
            label="輸入 CONFIRM 以繼續"
            variant="outlined"
            density="compact"
            color="error"
            hide-details
            class="font-weight-bold"
          ></v-text-field>
        </div>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="pa-4 bg-grey-lighten-4">
        <v-btn
          variant="outlined"
          @click="show = false"
          class="text-none font-weight-bold"
        >
          取消
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn
          :color="isCritical ? 'error' : 'warning'"
          variant="flat"
          @click="confirm"
          :disabled="!isConfirmValid"
          class="text-none font-weight-bold px-4"
        >
          {{ action === 'unbind' ? '解除綁定' : '註銷設備' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
