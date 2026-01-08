<template>
  <svg
    class="animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    :class="sizeClass"
    aria-hidden="true"
  >
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path
      class="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  size?: "xs" | "sm" | "md";
}>();

const sizeClass = computed(() => {
  const s = props.size || "sm";
  if (s === "xs") return "w-3 h-3";
  if (s === "md") return "w-5 h-5";
  return "w-4 h-4";
});
</script>
