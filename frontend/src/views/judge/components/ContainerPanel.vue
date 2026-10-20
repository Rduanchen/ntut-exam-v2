<script setup lang="ts">
import { CONTAINER_SETTINGS } from '../../../types/judge-settings';
</script>

<template>
  <v-card class="mb-6" data-test="container-panel">
    <v-card-title>執行後端容器</v-card-title>
    <v-card-text>
      <v-alert type="info" variant="tonal" class="mb-4">
        這些值在容器啟動時讀取，無法在此頁修改。
      </v-alert>

      <!--
        Deliberately no values.

        Nothing exposes these — they are container environment variables read at
        startup. This page could show the compose file's defaults, but that
        would be a guess about a RUNNING container: anyone who edited the file
        without redeploying, or deployed with an override, would be shown a
        confident wrong number. An honest gap beats a plausible lie.
      -->
      <v-table density="compact" data-test="container-table">
        <thead>
          <tr>
            <th>設定</th>
            <th>目前數值</th>
            <th>修改位置</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in CONTAINER_SETTINGS" :key="item.key" data-test="container-row">
            <td><code>{{ item.key }}</code></td>
            <td class="text-medium-emphasis" data-test="container-value">
              無法取得
            </td>
            <td><code>{{ item.governedBy }}</code></td>
          </tr>
        </tbody>
      </v-table>

      <div class="text-caption text-medium-emphasis mt-3">
        後端未回報這些數值，畫面不顯示可能
        錯誤的數值。請編輯 <code>docker-compose.yml</code> 並重新部署以變更設定。
      </div>
    </v-card-text>
  </v-card>
</template>
