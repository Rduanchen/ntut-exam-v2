<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  submissions: any[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'delete', questionId: string): void;
}>();

const activeTab = ref(0);

const sortedSubmissions = computed(() => {
  return [...props.submissions].sort((a, b) => {
    return new Date(b.submitTime).getTime() - new Date(a.submitTime).getTime();
  });
});

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleString();
};
</script>

<template>
  <v-card class="mt-4" border elevation="1">
    <v-card-title class="bg-grey-lighten-4 py-3 border-b d-flex align-center">
      <v-icon class="mr-2">mdi-code-braces</v-icon>
      學生提交程式碼
      <v-spacer></v-spacer>
      <v-chip size="small" color="primary" variant="flat" class="font-weight-bold">
        {{ submissions.length }} 份提交
      </v-chip>
    </v-card-title>

    <v-card-text class="pa-0">
      <div v-if="loading" class="pa-6 text-center">
        <v-progress-circular indeterminate color="primary"></v-progress-circular>
        <div class="mt-2 text-medium-emphasis">載入程式碼中...</div>
      </div>
      
      <div v-else-if="submissions.length === 0" class="pa-6 text-center text-medium-emphasis">
        <v-icon size="large" class="mb-2 opacity-50">mdi-file-hidden</v-icon>
        <div>該學生尚未提交任何程式碼</div>
      </div>

      <v-container v-else fluid class="pa-0">
        <v-tabs
          v-model="activeTab"
          color="primary"
          show-arrows
          class="border-b bg-grey-lighten-5"
          density="compact"
        >
          <v-tab
            v-for="(sub, idx) in sortedSubmissions"
            :key="idx"
            :value="idx"
            class="text-none"
          >
            {{ sub.questionId }}
            <v-chip size="x-small" class="ml-2" color="info" variant="flat">
              {{ sub.language }}
            </v-chip>
          </v-tab>
        </v-tabs>

        <v-window v-model="activeTab">
          <v-window-item
            v-for="(sub, idx) in sortedSubmissions"
            :key="idx"
            :value="idx"
          >
            <div class="pa-2 bg-grey-lighten-4 text-caption text-medium-emphasis d-flex justify-space-between align-center border-b">
              <span>提交時間：{{ formatDate(sub.submitTime) }}</span>
              <v-btn
                color="error"
                size="small"
                variant="outlined"
                prepend-icon="mdi-delete"
                @click="$emit('delete', sub.questionId)"
              >
                刪除程式碼
              </v-btn>
            </div>
            <div class="code-container">
              <pre><code>{{ sub.codeContent }}</code></pre>
            </div>
          </v-window-item>
        </v-window>
      </v-container>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.code-container {
  background-color: #1e1e1e;
  color: #d4d4d4;
  padding: 16px;
  overflow-x: auto;
  max-height: 500px;
  overflow-y: auto;
  font-family: 'Fira Code', 'Courier New', Courier, monospace;
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}
.code-container pre {
  margin: 0;
}
</style>
