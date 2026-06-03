<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import axios from 'axios';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

// Backend configuration
const BACKEND_URL = 'http://localhost:3000';

// Axios / Zod State
const form = ref({
  username: '',
  email: '',
  age: 18 as number | undefined,
});
const validationResult = ref<any>(null);
const validationErrors = ref<any>(null);
const formLoading = ref(false);

const submitForm = async () => {
  formLoading.value = true;
  validationResult.value = null;
  validationErrors.value = null;
  try {
    const res = await axios.post(`${BACKEND_URL}/api/validate`, {
      ...form.value,
      age: form.value.age ? Number(form.value.age) : undefined
    });
    validationResult.value = res.data;
  } catch (err: any) {
    if (err.response && err.response.data) {
      validationErrors.value = err.response.data.errors || err.response.data;
    } else {
      validationErrors.value = { message: err.message };
    }
  } finally {
    formLoading.value = false;
  }
};

// Socket.io State
const socketInstance = ref<Socket | null>(null);
const isConnected = ref(false);
const messageInput = ref('');
interface ChatMessage {
  sender: string;
  text: string;
  time: string;
}
const chatMessages = ref<ChatMessage[]>([]);

const connectSocket = () => {
  const s = io(BACKEND_URL);
  socketInstance.value = s;

  s.on('connect', () => {
    isConnected.value = true;
  });

  s.on('disconnect', () => {
    isConnected.value = false;
  });

  s.on('server-message', (msg: ChatMessage) => {
    chatMessages.value.unshift(msg);
  });
};

const sendMessage = () => {
  if (!socketInstance.value || !messageInput.value.trim()) return;
  socketInstance.value.emit('client-message', { text: messageInput.value });
  messageInput.value = '';
};

onMounted(() => {
  connectSocket();
});

onUnmounted(() => {
  if (socketInstance.value) {
    socketInstance.value.disconnect();
  }
});
</script>

<template>
  <v-app class="app-background">
    <!-- Header App Bar -->
    <v-app-bar flat class="app-bar-glass py-2" border>
      <v-container class="d-flex align-center justify-space-between py-0">
        <div class="d-flex align-center">
          <v-icon icon="mdi-orbit" color="primary" class="mr-2" size="large"></v-icon>
          <v-app-bar-title class="font-weight-bold text-h6">
            NTUT Exam Host
          </v-app-bar-title>
        </div>
        <div class="d-flex align-center">
          <v-chip
            :color="isConnected ? 'success' : 'error'"
            variant="flat"
            size="small"
            class="font-weight-bold text-caption transition-all"
          >
            <v-icon start :icon="isConnected ? 'mdi-wifi' : 'mdi-wifi-off'"></v-icon>
            {{ isConnected ? 'Socket Live' : 'Socket Offline' }}
          </v-chip>
        </div>
      </v-container>
    </v-app-bar>

    <v-main class="mt-6">
      <v-container>
        <!-- Welcome Message -->
        <v-row class="mb-4">
          <v-col cols="12">
            <h1 class="text-h4 font-weight-black mb-2 title-gradient">
              Monorepo Workspace Dashboard
            </h1>
            <p class="text-subtitle-1 text-medium-emphasis">
              A high-performance workspace boilerplate integrating Express, Vite, Vuetify 3, Socket.io, Sequelize, and Zod.
            </p>
          </v-col>
        </v-row>

        <v-row>
          <!-- Left Column: Axios and Zod -->
          <v-col cols="12" md="6">
            <v-card class="dashboard-card h-100" elevation="2" border>
              <div class="card-header-gradient px-6 py-4">
                <div class="d-flex align-center">
                  <v-icon icon="mdi-shield-check" color="white" class="mr-2" size="large"></v-icon>
                  <div>
                    <h3 class="text-h6 font-weight-bold text-white mb-0">Zod API Form Validation</h3>
                    <p class="text-caption text-white-50 mb-0">Submits validation payload via Axios to backend schema</p>
                  </div>
                </div>
              </div>

              <v-card-text class="pt-6">
                <v-form @submit.prevent="submitForm">
                  <v-text-field
                    v-model="form.username"
                    label="Username"
                    placeholder="e.g. JohnDoe"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-account"
                    class="mb-4"
                  ></v-text-field>

                  <v-text-field
                    v-model="form.email"
                    label="Email Address"
                    placeholder="e.g. john@example.com"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-email"
                    class="mb-4"
                  ></v-text-field>

                  <v-text-field
                    v-model="form.age"
                    label="Age"
                    type="number"
                    placeholder="e.g. 21"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-numeric"
                    class="mb-6"
                  ></v-text-field>

                  <v-btn
                    type="submit"
                    color="primary"
                    block
                    size="large"
                    :loading="formLoading"
                    prepend-icon="mdi-send"
                    class="btn-gradient font-weight-bold"
                  >
                    Submit validation request
                  </v-btn>
                </v-form>

                <!-- Results display -->
                <div class="mt-6">
                  <v-expand-transition>
                    <v-alert
                      v-if="validationResult"
                      type="success"
                      variant="tonal"
                      title="Validation Passed & Saved!"
                      border="start"
                    >
                      <pre class="json-display mt-2">{{ JSON.stringify(validationResult, null, 2) }}</pre>
                    </v-alert>
                  </v-expand-transition>

                  <v-expand-transition>
                    <v-alert
                      v-if="validationErrors"
                      type="error"
                      variant="tonal"
                      title="Validation Failed"
                      border="start"
                    >
                      <pre class="json-display mt-2">{{ JSON.stringify(validationErrors, null, 2) }}</pre>
                    </v-alert>
                  </v-expand-transition>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Right Column: Socket.io Live Messenger -->
          <v-col cols="12" md="6">
            <v-card class="dashboard-card h-100 d-flex flex-column" elevation="2" border>
              <div class="card-header-gradient px-6 py-4">
                <div class="d-flex align-center">
                  <v-icon icon="mdi-forum" color="white" class="mr-2" size="large"></v-icon>
                  <div>
                    <h3 class="text-h6 font-weight-bold text-white mb-0">Socket.io Live Messenger</h3>
                    <p class="text-caption text-white-50 mb-0">Real-time bi-directional messaging with the host backend</p>
                  </div>
                </div>
              </div>

              <v-card-text class="flex-grow-1 d-flex flex-column pt-6">
                <!-- Message Input -->
                <div class="d-flex align-center mb-4">
                  <v-text-field
                    v-model="messageInput"
                    label="Send real-time message"
                    placeholder="Type a message..."
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    class="mr-2"
                    @keyup.enter="sendMessage"
                  ></v-text-field>
                  <v-btn
                    color="primary"
                    height="48"
                    icon="mdi-send"
                    :disabled="!isConnected || !messageInput.trim()"
                    @click="sendMessage"
                  ></v-btn>
                </div>

                <!-- Chat history -->
                <div class="flex-grow-1 chat-container border rounded pa-4 bg-grey-lighten-4">
                  <div v-if="chatMessages.length === 0" class="d-flex flex-column align-center justify-center fill-height py-8 text-medium-emphasis">
                    <v-icon icon="mdi-message-text-outline" size="x-large" class="mb-2"></v-icon>
                    <span>No messages yet. Send a message above!</span>
                  </div>
                  
                  <div
                    v-for="(msg, index) in chatMessages"
                    :key="index"
                    class="chat-bubble-container mb-3"
                  >
                    <div class="d-flex justify-space-between align-center mb-1">
                      <span class="font-weight-black text-caption text-primary">{{ msg.sender }}</span>
                      <span class="text-caption text-grey-darken-1">{{ msg.time }}</span>
                    </div>
                    <div class="chat-bubble pa-2 rounded">
                      {{ msg.text }}
                    </div>
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<style>
.app-background {
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%) !important;
  color: #f8fafc !important;
}

.app-bar-glass {
  background: rgba(15, 23, 42, 0.75) !important;
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.title-gradient {
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.dashboard-card {
  background: rgba(30, 41, 59, 0.7) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  backdrop-filter: blur(8px);
  border-radius: 16px !important;
  overflow: hidden;
}

.card-header-gradient {
  background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
}

.text-white-50 {
  color: rgba(255, 255, 255, 0.7);
}

.btn-gradient {
  background: linear-gradient(90deg, #4f46e5, #3b82f6) !important;
  color: white !important;
  border-radius: 8px !important;
  text-transform: none !important;
}

.json-display {
  font-family: 'Fira Code', monospace, monospace;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.chat-container {
  height: 250px;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  display: flex;
  flex-direction: column;
}

.chat-bubble {
  background: rgba(255, 255, 255, 0.06);
  border-left: 3px solid #818cf8;
  color: #e2e8f0;
}

.transition-all {
  transition: all 0.3s ease;
}
</style>
