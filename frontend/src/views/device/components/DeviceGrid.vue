<script setup lang="ts">
import { computed } from 'vue';

interface DeviceItem {
  id: string;          // Student ID
  name: string;        // Student Name
  ipAddress: string | null;
  deviceUuid: string | null;
  isOnline: boolean;
  status: 'UNBOUND' | 'AWAITING_LOGIN' | 'ONLINE';
}

const emit = defineEmits<{
  (e: 'unbind', device: DeviceItem): void;
  (e: 'unregister', device: DeviceItem): void;
}>();

const props = defineProps<{
  devices: DeviceItem[];
  itemsPerRow: number;
}>();

// Helper to compare IP addresses naturally
function ipCompare(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal !== bVal) {
      return aVal - bVal;
    }
  }
  return 0;
}

// Sort devices naturally by IP address. Null/empty IPs go to the end.
const sortedDevices = computed(() => {
  return [...props.devices].sort((a, b) => {
    const ipA = a.ipAddress || '';
    const ipB = b.ipAddress || '';
    
    if (!ipA && !ipB) return a.id.localeCompare(b.id);
    if (!ipA) return 1;
    if (!ipB) return -1;
    
    return ipCompare(ipA, ipB);
  });
});

const getDeviceCardClass = (device: DeviceItem) => {
  if (device.status === 'ONLINE') return device.isOnline ? 'device-card-online' : 'device-card-offline';
  if (device.status === 'AWAITING_LOGIN') return device.isOnline ? 'device-card-awaiting' : 'device-card-offline';
  return 'device-card-unbound';
};

const getDeviceIconColor = (device: DeviceItem) => {
  if (!device.isOnline) return 'grey-lighten-1';
  if (device.status === 'ONLINE') return 'success';
  if (device.status === 'AWAITING_LOGIN') return 'info';
  return 'warning';
};

const getDeviceDotClass = (device: DeviceItem) => {
  if (!device.isOnline) return 'status-offline';
  if (device.status === 'ONLINE') return 'pulsing-green';
  if (device.status === 'AWAITING_LOGIN') return 'pulsing-blue';
  return 'pulsing-orange';
};

const getDeviceStatusText = (device: DeviceItem) => {
  if (!device.isOnline) return 'Offline';
  if (device.status === 'ONLINE') return 'Logged In';
  if (device.status === 'AWAITING_LOGIN') return 'Waiting for Login';
  return 'Unbound Device';
};
</script>

<template>
  <div 
    class="device-grid-container" 
    :style="{ 
      display: 'grid', 
      gridTemplateColumns: `repeat(${itemsPerRow}, minmax(0, 1fr))`, 
      gap: '20px' 
    }"
  >
    <v-card
      v-for="device in sortedDevices"
      :key="device.id"
      class="device-card d-flex flex-column rounded-xl"
      :class="getDeviceCardClass(device)"
      elevation="1"
    >
      <v-card-item class="pb-2">
        <template v-slot:prepend>
          <v-icon 
            size="36" 
            :color="getDeviceIconColor(device)"
            class="mr-2"
          >
            mdi-monitor
          </v-icon>
        </template>
        <v-card-title class="font-weight-bold text-subtitle-1 d-flex align-center justify-space-between">
          <span>{{ device.name || 'Unknown Student' }}</span>
          <span class="d-flex align-center">
            <span :class="['status-dot', getDeviceDotClass(device)]"></span>
            <span class="text-caption ml-1 font-weight-medium text-grey-darken-1">
              {{ getDeviceStatusText(device) }}
            </span>
          </span>
        </v-card-title>
        <v-card-subtitle class="text-caption">
          ID: {{ device.id || 'N/A' }}
        </v-card-subtitle>
      </v-card-item>

      <v-divider></v-divider>

      <v-card-text class="py-3 flex-grow-1">
        <div class="d-flex align-center justify-space-between mb-2">
          <span class="text-caption text-grey-darken-1 font-weight-medium">IP Address</span>
          <span class="text-body-2 font-weight-bold text-mono">
            {{ device.ipAddress || 'Not Assigned' }}
          </span>
        </div>
        
        <div class="d-flex align-center justify-space-between">
          <span class="text-caption text-grey-darken-1 font-weight-medium">Device UUID</span>
          <span 
            class="text-caption text-mono text-grey-darken-2 text-truncate ml-4 max-width-uuid" 
            :title="device.deviceUuid || 'No Device Registered'"
          >
            {{ device.deviceUuid ? device.deviceUuid.substring(0, 8) + '...' : 'None' }}
          </span>
        </div>
      </v-card-text>
      
      <v-divider></v-divider>
      <v-card-actions class="px-3 py-2 bg-grey-lighten-4">
        <v-btn 
          size="small" 
          color="warning" 
          variant="outlined" 
          :disabled="device.status === 'UNBOUND'"
          @click="emit('unbind', device)"
        >
          Unbind User
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn 
          size="small" 
          color="error" 
          variant="flat" 
          @click="emit('unregister', device)"
        >
          Unregister
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<style scoped>
.device-grid-container {
  width: 100%;
}

.device-card {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.device-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.08) !important;
}

.device-card-online {
  border: 1.5px solid rgba(76, 175, 80, 0.7) !important;
  background: linear-gradient(to bottom, #ffffff, #f1fcf2);
}

.device-card-offline {
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
  background-color: #fafafa;
  opacity: 0.85;
}

.device-card-awaiting {
  border: 1.5px solid rgba(33, 150, 243, 0.7) !important;
  background: linear-gradient(to bottom, #ffffff, #e3f2fd);
}

.device-card-unbound {
  border: 1.5px solid rgba(255, 152, 0, 0.7) !important;
  background: linear-gradient(to bottom, #ffffff, #fff3e0);
}

.text-mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.max-width-uuid {
  max-width: 110px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.pulsing-green {
  background-color: #4CAF50;
  box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
  animation: pulse-green 1.8s infinite;
}

.pulsing-blue {
  background-color: #2196F3;
  box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7);
  animation: pulse-blue 1.8s infinite;
}

.pulsing-orange {
  background-color: #FF9800;
  box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.7);
  animation: pulse-orange 1.8s infinite;
}

.status-offline {
  background-color: #9E9E9E;
}

@keyframes pulse-green {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(76, 175, 80, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
  }
}

@keyframes pulse-blue {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(33, 150, 243, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(33, 150, 243, 0);
  }
}

@keyframes pulse-orange {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(255, 152, 0, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(255, 152, 0, 0);
  }
}
</style>
