<script setup lang="ts">
import { ref } from 'vue';
import { useManageStore } from '../../../stores/manage.store';

const manageStore = useManageStore();
const messageText = ref('');

const sendMessage = async () => {
  if (!messageText.value.trim()) return;
  if (confirm('確定要向所有學生廣播這則訊息嗎？')) {
    await manageStore.broadcastMessage(messageText.value);
    if (!manageStore.error) {
      messageText.value = '';
      alert('訊息已廣播給所有學生。');
    }
  }
};
</script>

<template>
  <v-card elevation="2" border>
    <v-card-title class="text-h6 font-weight-bold px-6 pt-6">
      <v-icon start color="primary">mdi-broadcast</v-icon>
      廣播訊息
    </v-card-title>
    <v-card-text class="px-6 pb-6">
      <p class="text-body-2 text-medium-emphasis mb-6 mt-2">
        向所有已連線的學生終端發送公告或警告。
      </p>
      <v-textarea
        v-model="messageText"
        label="訊息內容"
        placeholder="請輸入要廣播的訊息…"
        rows="5"
        variant="outlined"
        color="primary"
        hide-details
        class="mb-6"
      ></v-textarea>
      <v-btn
        color="primary"
        size="x-large"
        block
        @click="sendMessage"
        :loading="manageStore.loading"
        :disabled="!messageText.trim()"
        class="font-weight-bold text-body-1"
      >
        <v-icon start>mdi-send</v-icon>
        傳送給所有學生
      </v-btn>
    </v-card-text>
  </v-card>
</template>
