<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useStudentStore } from '../../stores/student.store';
import StudentDetails from './components/StudentDetails.vue';

const studentStore = useStudentStore();
const selectedStudent = ref<any | null>(null);

onMounted(async () => {
  await studentStore.fetchStudents();
  
  // Restore last selected student from localStorage
  const lastSelectedId = localStorage.getItem('lastSelectedStudentId');
  if (lastSelectedId) {
    const student = studentStore.students.find(s => s.id === lastSelectedId);
    if (student) {
      selectedStudent.value = student;
    }
  }
});

// Save selected student to localStorage
watch(selectedStudent, (newVal) => {
  if (newVal && newVal.id) {
    localStorage.setItem('lastSelectedStudentId', newVal.id);
  } else {
    localStorage.removeItem('lastSelectedStudentId');
  }
});

// Check if any student is online to show general stats
const onlineCount = computed(() => studentStore.students.filter(s => s.isOnline).length);

// Custom item title for autocomplete
const customFilter = (_value: any, queryText: string, item: any) => {
  const text = item.raw.name + ' ' + item.raw.id;
  return text.toLowerCase().indexOf(queryText.toLowerCase()) > -1;
};
</script>

<template>
  <v-container fluid class="pa-6 h-100 d-flex flex-column">
    <v-row class="mb-2 align-center justify-space-between flex-grow-0">
      <v-col>
        <h1 class="text-h4 font-weight-bold">學生管理</h1>
        <p class="text-subtitle-1 text-medium-emphasis">管理學生上線狀態、裝置綁定與檢視提交程式碼</p>
      </v-col>
      <v-col cols="auto" class="d-flex align-center gap-4">
        <v-chip color="success" variant="tonal" class="font-weight-bold" size="large">
          <v-icon start>mdi-account-multiple</v-icon>
          目前上線：{{ onlineCount }} / {{ studentStore.students.length }}
        </v-chip>
        <v-btn
          color="primary"
          prepend-icon="mdi-refresh"
          @click="studentStore.fetchStudents"
          :loading="studentStore.loading"
        >
          重新整理
        </v-btn>
      </v-col>
    </v-row>

    <v-row class="mb-4 flex-grow-0">
      <v-col cols="12" md="6" lg="4">
        <v-autocomplete
          v-model="selectedStudent"
          :items="studentStore.students"
          :custom-filter="customFilter"
          item-title="name"
          return-object
          label="搜尋學生（學號／姓名）"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="comfortable"
          hide-details
          clearable
        >
          <template v-slot:item="{ props, item }">
            <v-list-item v-bind="props" :title="`${item.raw.name} (${item.raw.id})`" :subtitle="item.raw.isOnline ? '上線中' : '離線'"></v-list-item>
          </template>
          <template v-slot:selection="{ item }">
            {{ item.raw.name }} ({{ item.raw.id }})
          </template>
        </v-autocomplete>
      </v-col>
    </v-row>

    <v-alert v-if="studentStore.error" type="error" closable class="mb-4 flex-grow-0">
      {{ studentStore.error }}
    </v-alert>

    <v-row class="flex-grow-1 min-h-0">
      <!-- Student Details & Code -->
      <v-col cols="12" class="h-100">
        <StudentDetails 
          :student="selectedStudent" 
          @refresh-list="studentStore.fetchStudents"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.h-100 {
  height: 100%;
}
.min-h-0 {
  min-height: 0;
}
.gap-4 {
  gap: 16px;
}
</style>
