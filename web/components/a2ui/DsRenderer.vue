<template>
  <component
    :is="tag"
    v-if="node"
    :class="cls"
  >
    <template v-if="isText">
      {{ textContent }}
    </template>
    <template v-else>
      <DsRenderer
        v-for="c in children"
        :key="c.id"
        :node="c"
      />
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";

type DsNode = {
  id: string;
  kind: "element" | "component";
  name: string;
  classes?: string[];
  props?: Record<string, any>;
  children?: DsNode[];
};

const props = defineProps<{ node: DsNode | null }>();

const node = computed(() => props.node);

const tag = computed(() => {
  if (!node.value) return "div";
  if (node.value.kind === "component") {
    if (node.value.name === "Typography") return "span";
    return "div";
  }
  return node.value.name || "div";
});

const cls = computed(() => (node.value?.classes || []).join(" "));

const isText = computed(() => {
  if (!node.value) return false;
  if (node.value.kind === "component" && node.value.name === "Typography") return true;
  return !!(node.value.props && typeof node.value.props.text === "string") && (node.value.children?.length || 0) === 0;
});

const textContent = computed(() => {
  if (!node.value) return "";
  if (node.value.kind === "component" && node.value.name === "Typography") {
    return String(node.value.props?.text ?? "");
  }
  return String(node.value.props?.text ?? "");
});

const children = computed(() => node.value?.children || []);
</script>