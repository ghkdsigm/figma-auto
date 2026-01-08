<template>
  <button
    :type="type || 'button'"
    :class="[baseClass, disabledOrLoading ? disabledClass : '', className].filter(Boolean).join(' ')"
    :disabled="disabledOrLoading"
    @click="onClick"
  >
    <span class="inline-flex items-center gap-2">
      <Spinner v-if="loading" :size="spinnerSize" />
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Spinner from "./Spinner.vue";

const props = defineProps<{
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  spinnerSize?: "xs" | "sm" | "md";
}>();

const emit = defineEmits<{
  (e: "click", ev: MouseEvent): void;
}>();

const disabledOrLoading = computed(() => !!props.disabled || !!props.loading);

const baseClass =
  "inline-flex items-center justify-center rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2";

const disabledClass = "opacity-60 cursor-not-allowed";

function onClick(ev: MouseEvent) {
  emit("click", ev);
}
</script>
