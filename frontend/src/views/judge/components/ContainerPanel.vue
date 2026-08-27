<script setup lang="ts">
import { CONTAINER_SETTINGS } from '../../../types/judge-settings';
</script>

<template>
  <v-card class="mb-6" data-test="container-panel">
    <v-card-title>Execution Backend Container</v-card-title>
    <v-card-text>
      <v-alert type="info" variant="tonal" class="mb-4">
        These are read at container startup and cannot be changed from here.
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
            <th>Setting</th>
            <th>Current value</th>
            <th>Changed in</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in CONTAINER_SETTINGS" :key="item.key" data-test="container-row">
            <td><code>{{ item.key }}</code></td>
            <td class="text-medium-emphasis" data-test="container-value">
              Not reportable
            </td>
            <td><code>{{ item.governedBy }}</code></td>
          </tr>
        </tbody>
      </v-table>

      <div class="text-caption text-medium-emphasis mt-3">
        The backend does not report these, so no value is shown rather than a value that
        might be wrong. Edit <code>docker-compose.yml</code> and redeploy to change them.
      </div>
    </v-card-text>
  </v-card>
</template>
