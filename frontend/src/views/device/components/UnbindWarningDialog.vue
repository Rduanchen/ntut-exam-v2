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
          {{ action === 'unbind' ? 'Unbind User from Device' : 'Unregister Device Completely' }}
        </v-card-title>
      </v-card-item>

      <v-card-text class="pt-6">
        <p v-if="action === 'unbind'" class="mb-4 text-body-1">
          Are you sure you want to unbind <strong>{{ device?.name || 'Unknown' }}</strong> ({{ device?.id || 'N/A' }}) from this device?
        </p>
        <p v-else class="mb-4 text-body-1">
          Are you sure you want to completely unregister this device (UUID: <strong>{{ device?.deviceUuid || 'Unknown' }}</strong>)? 
          Any bound user will be detached.
        </p>

        <v-alert
          v-if="isCritical"
          type="error"
          variant="tonal"
          class="mb-4 border-error font-weight-medium"
          border="start"
        >
          <div class="text-subtitle-1 font-weight-bold mb-1">⚠️ Critical Warning: Student is taking the exam!</div>
          This device is currently ONLINE and logged in. Performing this action will <strong>immediately force logout the student</strong>. This may disrupt their exam progress.
        </v-alert>

        <v-alert
          v-else
          type="warning"
          variant="tonal"
          class="mb-4 border-warning"
          border="start"
        >
          This device is not currently logged in. The student will be prompted to register and bind again upon next launch.
        </v-alert>

        <div v-if="isCritical" class="mt-4">
          <p class="text-body-2 mb-2 font-weight-medium">To proceed, please type <strong>CONFIRM</strong> below:</p>
          <v-text-field
            v-model="confirmationText"
            label="Type CONFIRM to continue"
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
          Cancel
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn
          :color="isCritical ? 'error' : 'warning'"
          variant="flat"
          @click="confirm"
          :disabled="!isConfirmValid"
          class="text-none font-weight-bold px-4"
        >
          {{ action === 'unbind' ? 'Unbind User' : 'Unregister Device' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
