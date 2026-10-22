<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useConnectionStore } from '../../stores/connection.store';

const connectionStore = useConnectionStore();

const headers = [
  { title: '設備 UUID', key: 'deviceUuid', align: 'start' },
  { title: 'IP 位址', key: 'ipAddress' },
  { title: '學號', key: 'user.testId' },
  { title: '學生姓名', key: 'user.name' },
  { title: '狀態', key: 'isOnline' },
  { title: '操作', key: 'actions', align: 'end', sortable: false }
] as const;

const requestHeaders = [
  { title: '情境', key: 'type', align: 'start' },
  { title: '判斷依據', key: 'evidence', sortable: false },
  { title: '機器', key: 'deviceUuid' },
  { title: '時間', key: 'createdAt' },
  { title: '處置', key: 'actions', align: 'end', sortable: false }
] as const;

/**
 * The three situations a TA has to tell apart.
 *
 * Named after what the machine is, not what happened to it — the backend
 * cannot distinguish a restart from a swapped seat, since both send the same
 * request, but it can say whether this machine is new, was bound to someone,
 * or was registered and never claimed. Those need different decisions.
 */
const REQUEST_KINDS: Record<string, { label: string; color: string; hint: string }> = {
  NEW_DEVICE: {
    label: '全新機器',
    color: 'info',
    hint: '這台機器沒有註冊過。通常是臨時增加的座位。'
  },
  REBIND: {
    label: '已綁學生的機器',
    color: 'warning',
    hint: '這台機器原本屬於某位學生。可能是他重開機，也可能是換了座位。'
  },
  UNBOUND_DEVICE: {
    label: '註冊過未綁人',
    color: 'grey',
    hint: '註冊過但沒有人登入過，沒有作答會受影響。'
  }
};

const kindOf = (type: string) => REQUEST_KINDS[type] ?? { label: type, color: 'grey', hint: '' };

const elapsed = (iso: string | null): string => {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分鐘前`;
  return `${Math.round(seconds / 3600)} 小時前`;
};

/* Approval applies to this machine only; it never releases another seat. */
const approveDialog = ref(false);
const approving = ref<any>(null);
const approveMode = ref<'SAME_USER' | 'NEW_USER'>('NEW_USER');

const openApprove = (item: any) => {
  approving.value = item;
  approveMode.value = item.previousTestId ? 'SAME_USER' : 'NEW_USER';
  approveDialog.value = true;
};

const confirmApprove = async () => {
  if (!approving.value) return;
  if (await connectionStore.approveRequest(approving.value.id, approveMode.value)) {
    approveDialog.value = false;
    approving.value = null;
  }
};

onMounted(() => {
  refreshData();
});

async function refreshData() {
  await Promise.all([
    connectionStore.fetchSettings(),
    connectionStore.fetchDevices(),
    connectionStore.fetchLoginRequests()
  ]);
}

async function toggleRegistration(val: boolean | null) {
  if (val !== null) {
    await connectionStore.updateSettings(val);
  }
}

async function unbindDevice(uuid: string) {
  if (confirm('Are you sure you want to unbind this device from the student?')) {
    await connectionStore.unbindDevice(uuid);
  }
}
</script>

<template>
  <v-container fluid class="pa-6">
    <v-row class="mb-4 align-center">
      <v-col cols="12" sm="6">
        <h1 class="text-h4 font-weight-bold">連線管理</h1>
        <p class="text-subtitle-1 text-medium-emphasis">管理設備註冊與登入申請</p>
      </v-col>
      <v-col cols="12" sm="6" class="d-flex justify-sm-end align-center">
        <v-btn
          color="primary"
          variant="elevated"
          prepend-icon="mdi-refresh"
          :loading="connectionStore.loading"
          @click="refreshData"
          class="rounded-lg"
        >
          重新整理資料
        </v-btn>
      </v-col>
    </v-row>

    <v-alert
      v-if="connectionStore.error"
      type="error"
      class="mb-6 rounded-lg"
      closable
      @click:close="connectionStore.error = null"
    >
      {{ connectionStore.error }}
    </v-alert>

    <v-row>
      <!-- Left Column: Settings -->
      <v-col cols="12" md="4">
        <v-card class="rounded-xl mb-6 shadow-card" elevation="2">
          <v-card-title class="font-weight-bold pt-4 px-6 d-flex align-center">
            <v-icon color="primary" class="mr-2">mdi-cog</v-icon>
              全域設定
          </v-card-title>
          <v-card-text class="px-6 pb-6">
            <v-switch
              :model-value="connectionStore.allowRegistration"
              @update:model-value="toggleRegistration"
              color="success"
              inset
              hide-details
            >
              <template v-slot:label>
                <span class="font-weight-medium">允許新設備註冊</span>
              </template>
            </v-switch>
            <div class="text-caption text-medium-emphasis mt-2">
              關閉後新設備無法綁定；已綁定設備再次登入仍須由助教核准。
            </div>
          </v-card-text>
        </v-card>

      </v-col>

      <!-- Right Column: Login Requests -->
      <v-col cols="12" md="8">
        <v-card class="rounded-xl shadow-card h-100" elevation="2">
          <v-card-title class="font-weight-bold pt-4 px-6 d-flex align-center justify-space-between">
            <div>
              <v-icon color="warning" class="mr-2">mdi-shield-alert</v-icon>
              待處理登入申請
              <v-chip color="warning" size="small" class="ml-2 font-weight-bold" v-if="connectionStore.loginRequests.length">
                {{ connectionStore.loginRequests.length }}
              </v-chip>
            </div>
          </v-card-title>
          
          <v-data-table
            :headers="requestHeaders"
            :items="connectionStore.loginRequests"
            :items-per-page="5"
            hover
            class="px-2"
          >
            <template v-slot:item.type="{ item }">
              <v-chip :color="kindOf(item.type).color" size="small" variant="flat" class="font-weight-bold">
                {{ kindOf(item.type).label }}
              </v-chip>
              <div class="text-caption text-medium-emphasis mt-1" style="max-width: 200px">
                {{ kindOf(item.type).hint }}
              </div>
            </template>

            <template v-slot:item.evidence="{ item }">
              <div class="text-caption" data-test="request-evidence">
                <div v-if="item.previousTestId">
                  原綁：<strong>{{ item.previousTestId }}</strong>
                  <span v-if="item.previousStudentName">（{{ item.previousStudentName }}）</span>
                </div>
                <div v-if="item.previousStudentOnlineElsewhere" class="text-error font-weight-bold">
                  ⚠ 該學號正在另一台機器上作答
                </div>
                <div>上次斷線：{{ elapsed(item.lastDisconnectedAt) }}</div>
                <div :class="item.ipMatchesRoster ? 'text-success' : 'text-warning'">
                  來源 {{ item.ipAddress }}
                  {{ item.ipMatchesRoster ? '（與名單相符）' : '（與名單不符）' }}
                </div>
              </div>
            </template>
            <template v-slot:item.createdAt="{ item }">
              {{ new Date(item.createdAt).toLocaleTimeString() }}
            </template>
            <template v-slot:item.actions="{ item }">
              <div class="d-flex justify-end gap-2">
                <v-btn
                  icon="mdi-check"
                  color="success"
                  size="small"
                  variant="tonal"
                  data-test="open-approve"
                  @click="openApprove(item)"
                ></v-btn>
                <v-btn icon="mdi-close" color="error" size="small" variant="tonal" @click="connectionStore.rejectRequest(item.id)"></v-btn>
              </div>
            </template>
            <template v-slot:no-data>
              <div class="py-8 text-center text-medium-emphasis">
                <v-icon size="48" color="grey-lighten-2" class="mb-2">mdi-check-all</v-icon>
                <div>目前沒有待處理登入申請</div>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>

    <!-- Bottom Section: All Devices -->
    <v-row class="mt-6">
      <v-col cols="12">
        <v-card class="rounded-xl shadow-card" elevation="2">
          <v-card-title class="font-weight-bold pt-4 px-6 d-flex align-center">
            <v-icon color="primary" class="mr-2">mdi-desktop-mac</v-icon>
            所有已註冊設備
          </v-card-title>

          <v-data-table
            :headers="headers"
            :items="connectionStore.devices"
            :items-per-page="10"
            hover
            class="px-2"
          >
            <template v-slot:item.isOnline="{ item }">
              <v-chip :color="item.isOnline ? 'success' : 'grey'" size="small" variant="flat">
                {{ item.isOnline ? '線上' : '離線' }}
              </v-chip>
            </template>
            <template v-slot:item.user.testId="{ item }">
              <span v-if="item.user" class="font-weight-medium">{{ item.user.testId }}</span>
              <span v-else class="text-medium-emphasis text-caption">未綁定</span>
            </template>
            <template v-slot:item.user.name="{ item }">
              <span v-if="item.user">{{ item.user.name }}</span>
              <span v-else class="text-medium-emphasis text-caption">-</span>
            </template>
            <template v-slot:item.actions="{ item }">
              <div class="d-flex justify-end gap-2">
                <v-tooltip text="解除設備與學生的綁定" location="top">
                  <template v-slot:activator="{ props }">
                    <v-btn 
                      v-bind="props"
                      icon="mdi-link-variant-off" 
                      color="error" 
                      size="small" 
                      variant="tonal" 
                      :disabled="!item.user"
                      @click="unbindDevice(item.deviceUuid)"
                    ></v-btn>
                  </template>
                </v-tooltip>
              </div>
            </template>
            <template v-slot:no-data>
              <div class="py-8 text-center text-medium-emphasis">
                <v-icon size="48" color="grey-lighten-2" class="mb-2">mdi-monitor-off</v-icon>
                <div>尚無已註冊設備</div>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </v-container>

  <v-dialog v-model="approveDialog" max-width="520">
    <v-card class="rounded-lg">
      <v-card-title class="font-weight-bold">核准這台機器入場</v-card-title>
      <v-card-text>
        <div class="text-body-2 text-medium-emphasis mb-4">
          機器 <code>{{ approving?.deviceUuid }}</code>
        </div>

        <v-radio-group v-model="approveMode" data-test="approve-mode">
          <v-radio
            value="SAME_USER"
            :disabled="!approving?.previousTestId"
            :label="`允許原使用者 ${approving?.previousTestId ?? ''} 再次登入`"
          />
          <v-radio value="NEW_USER" label="允許新的未配對使用者登入這台機器" />
        </v-radio-group>
        <v-alert v-if="approveMode === 'NEW_USER'" type="info" variant="tonal" density="comfortable">
          這台機器原有的綁定會解除。若要登入的學號仍綁在其他機器（即使離線），請先到該機器解除綁定。
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="approveDialog = false">取消</v-btn>
        <v-btn color="success" variant="flat" data-test="confirm-approve" @click="confirmApprove">
          核准
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

</template>

<style scoped>
.shadow-card {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05) !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.shadow-card:hover {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08) !important;
  transform: translateY(-2px);
}
.gap-2 {
  gap: 8px;
}
</style>
