<!-- components/a2ui/DsRenderer.vue -->
<template>
  <template v-if="node">
    <!-- DS components preview -->
    <button v-if="isBaseButton" :class="baseButtonClass" type="button">
      {{ String(node.props?.label ?? "") }}
    </button>

    <component v-else-if="isTypography" :is="typographyTag" :class="typographyClass">
      {{ String(node.props?.text ?? "") }}
    </component>

    <input v-else-if="isBaseInput" :class="baseInputClass" :placeholder="String(node.props?.placeholder ?? '')" />

    <div v-else-if="isUnsafeBox" class="border border-dashed border-slate-300 p-2 rounded">
      <DsRenderer v-for="c in children" :key="c.id" :node="c" />
    </div>

    <!-- Raw elements -->
    <component v-else :is="tag" :class="cls" v-bind="boundProps">
      <template v-if="isText">
        {{ textContent }}
      </template>
      <template v-else>
        <DsRenderer v-for="c in children" :key="c.id" :node="c" />
      </template>
    </component>
  </template>
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

const isBaseButton = computed(() => node.value?.kind === "component" && node.value?.name === "BaseButton");
const isTypography = computed(() => node.value?.kind === "component" && node.value?.name === "Typography");
const isBaseInput = computed(() => node.value?.kind === "component" && node.value?.name === "BaseInput");
const isUnsafeBox = computed(() => node.value?.kind === "component" && node.value?.name === "UnsafeBox");

const tag = computed(() => {
  if (!node.value) return "div";
  if (node.value.kind === "component") {
    return "div";
  }
  return node.value.name || "div";
});

const cls = computed(() => (node.value?.classes || []).join(" "));

// Bind element props (e.g. img src/alt) while avoiding leaking "text" as an attribute.
const boundProps = computed(() => {
  const p = node.value?.props || {};
  if (!p || typeof p !== "object") return {};
  const out: Record<string, any> = { ...p };
  if (typeof out.text === "string") delete out.text;
  return out;
});

const isText = computed(() => {
  if (!node.value) return false;
  if (node.value.kind === "component" && node.value.name === "Typography") return true;
  return !!(node.value.props && typeof node.value.props.text === "string") && (node.value.children?.length || 0) === 0;
});

const textContent = computed(() => {
  if (!node.value) return "";
  return String(node.value.props?.text ?? "");
});

const children = computed(() => node.value?.children || []);

function buttonSizeClasses(size: string) {
  if (size === "sm") return "px-3 py-1.5 text-sm";
  if (size === "lg") return "px-5 py-3 text-base";
  return "px-4 py-2 text-sm"; // md
}

function buttonIntentClasses(intent: string) {
  if (intent === "secondary") return "bg-white text-[var(--ds-fg)] border border-[var(--ds-border)]";
  if (intent === "danger") return "bg-[var(--ds-danger)] text-white";
  return "bg-[var(--ds-primary)] text-white"; // primary
}

const baseButtonClass = computed(() => {
  const intent = String(node.value?.props?.intent ?? "primary");
  const size = String(node.value?.props?.size ?? "md");
  return [
    "inline-flex items-center justify-center rounded-lg font-medium",
    buttonSizeClasses(size),
    buttonIntentClasses(intent),
    "shadow-sm",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-offset-2"
  ].join(" ");
});

const typographyTag = computed(() => {
  const v = String(node.value?.props?.variant ?? "body");
  if (v === "h1") return "h1";
  if (v === "h2") return "h2";
  if (v === "h3") return "h3";
  return "span";
});

const typographyClass = computed(() => {
  const v = String(node.value?.props?.variant ?? "body");
  const colorToken = String(node.value?.props?.colorToken ?? "");
  const color =
    colorToken === "primary" ? "text-[var(--ds-primary)]" :
    colorToken === "danger" ? "text-[var(--ds-danger)]" :
    colorToken === "muted" ? "text-[var(--ds-muted)]" :
    colorToken === "fg" ? "text-[var(--ds-fg)]" :
    "";

  const size =
    v === "h1" ? "text-2xl font-semibold" :
    v === "h2" ? "text-xl font-semibold" :
    v === "h3" ? "text-lg font-semibold" :
    v === "caption" ? "text-xs text-[var(--ds-muted)]" :
    "text-sm";

  return [size, color].filter(Boolean).join(" ");
});

const baseInputClass = computed(() => {
  return "px-3 py-2 rounded-lg border border-[var(--ds-border)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]";
});
</script>