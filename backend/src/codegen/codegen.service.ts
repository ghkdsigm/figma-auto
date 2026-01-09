/* backend/src/codegen/codegen.service.ts */
import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import archiver = require("archiver");
import { v4 as uuid } from "uuid";
import type { DSRoot, DSNode } from "../ds-mapping/spec";
import axios from "axios";
import { McpClient } from "../mcp/mcp.client";

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escText(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toKebab(s: string) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function renderProps(props: Record<string, any> | undefined) {
  if (!props) return "";
  const out: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    const attr = toKebab(k);
    if (v === undefined || v === null) continue;
    if (typeof v === "string") out.push(`${attr}="${escapeAttr(v)}"`);
    else if (typeof v === "number" || typeof v === "boolean") out.push(`:${attr}="${String(v)}"`);
    else out.push(`:${attr}='${escapeAttr(JSON.stringify(v))}'`);
  }
  return out.length ? " " + out.join(" ") : "";
}

function renderClasses(classes?: string[]) {
  const list = (classes || []).filter(Boolean);
  if (!list.length) return "";
  return ` class="${escapeAttr(list.join(" "))}"`;
}

function renderNode(n: DSNode): string {
  const tag = n.kind === "component" ? n.name : n.name;
  const props = renderProps(n.props);
  const cls = renderClasses(n.classes);

  if (
    n.kind === "element" &&
    n.props &&
    typeof (n.props as any).text === "string" &&
    (!n.children || !n.children.length)
  ) {
    const text = String((n.props as any).text);
    const restProps = { ...(n.props || {}) } as any;
    delete restProps.text;
    const p = renderProps(restProps);
    return `<${tag}${cls}${p}>${escText(text)}</${tag}>`;
  }

  if (tag === "img") {
    return `<img${cls}${props} />`;
  }

  if (tag === "BaseButton") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<BaseButton${cls}${p}>${escText(label)}</BaseButton>`;
  }

  if (tag === "Typography") {
    const text = String(n.props?.text ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).text;
    const p = renderProps(restProps);
    return `<Typography${cls}${p}>${escText(text)}</Typography>`;
  }

  if (tag === "BaseInput") {
    return `<BaseInput${cls}${props} />`;
  }

  if (tag === "BaseSelect") {
    return `<BaseSelect${cls}${props}>${(n.children || []).map(renderNode).join("\n")}</BaseSelect>`;
  }

  if (tag === "BaseCheckbox") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<BaseCheckbox${cls}${p}>${escText(label)}</BaseCheckbox>`;
  }

  if (tag === "BaseRadio") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<BaseRadio${cls}${p}>${escText(label)}</BaseRadio>`;
  }

  if (tag === "BaseSwitch") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<BaseSwitch${cls}${p}>${escText(label)}</BaseSwitch>`;
  }

  if (tag === "DropdownMenu") {
    const children = (n.children || []).map(renderNode).join("\n");
    return `<DropdownMenu${cls}${props}>${children ? "\n" + children + "\n" : ""}</DropdownMenu>`;
  }

  if (tag === "HamburgerButton") {
    return `<HamburgerButton${cls}${props} />`;
  }

  if (tag === "MenuList") {
    const children = (n.children || []).map(renderNode).join("\n");
    return `<MenuList${cls}${props}>${children ? "\n" + children + "\n" : ""}</MenuList>`;
  }

  if (tag === "ThumbnailCard") {
    const title = String(n.props?.title ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).title;
    const p = renderProps(restProps);
    const children = (n.children || []).map(renderNode).join("\n");
    return `<ThumbnailCard${cls}${p} title="${escapeAttr(title)}">${children ? "\n" + children + "\n" : ""}</ThumbnailCard>`;
  }

  if (tag === "Carousel") {
    const children = (n.children || []).map(renderNode).join("\n");
    return `<Carousel${cls}${props}>${children ? "\n" + children + "\n" : ""}</Carousel>`;
  }

  if (tag === "CalendarInput") {
    return `<CalendarInput${cls}${props} />`;
  }

  if (tag === "RangeSlider") {
    return `<RangeSlider${cls}${props} />`;
  }

  if (tag === "ToggleButton") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<ToggleButton${cls}${p}>${escText(label)}</ToggleButton>`;
  }

  if (tag === "Popup") {
    const title = String(n.props?.title ?? "Popup");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).title;
    const p = renderProps(restProps);
    const children = (n.children || []).map(renderNode).join("\n");
    return `<Popup${cls}${p} title="${escapeAttr(title)}">${children ? "\n" + children + "\n" : ""}</Popup>`;
  }

  if (tag === "Loading") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<Loading${cls}${p}>${label ? escText(label) : ""}</Loading>`;
  }

  if (tag === "Flag") {
    const text = String(n.props?.text ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).text;
    const p = renderProps(restProps);
    return `<Flag${cls}${p}>${escText(text)}</Flag>`;
  }

  if (tag === "Tabs") {
    const children = (n.children || []).map(renderNode).join("\n");
    return `<Tabs${cls}${props}>${children ? "\n" + children + "\n" : ""}</Tabs>`;
  }

  if (tag === "AlertDialog") {
    const title = String(n.props?.title ?? "알림");
    const message = String(n.props?.message ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).title;
    delete (restProps as any).message;
    const p = renderProps(restProps);
    return `<AlertDialog${cls}${p} title="${escapeAttr(title)}" message="${escapeAttr(message)}" />`;
  }

  if (tag === "UnsafeBox") {
    const children = (n.children || []).map(renderNode).join("\n");
    return `<UnsafeBox${cls}${props}>${children ? "\n" + children + "\n" : ""}</UnsafeBox>`;
  }

  const children = (n.children || []).map(renderNode).join("\n");
  return `<${tag}${cls}${props}>${children ? "\n" + children + "\n" : ""}</${tag}>`;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(p: string, content: string) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, "utf-8");
}

type ComponentSources = {
  BaseButton: string;
  Typography: string;
  BaseInput: string;
  UnsafeBox: string;
  BaseSelect: string;
  BaseCheckbox: string;
  BaseRadio: string;
  BaseSwitch: string;
  DropdownMenu: string;
  HamburgerButton: string;
  MenuList: string;
  ThumbnailCard: string;
  Carousel: string;
  CalendarInput: string;
  RangeSlider: string;
  ToggleButton: string;
  Popup: string;
  Loading: string;
  Flag: string;
  Tabs: string;
  AlertDialog: string;
};

function getComponentSources(): ComponentSources {
  const BaseButton = `<template>
  <button :class="cls" type="button">
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  intent?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
}>();

const cls = computed(() => {
  const intent = props.intent || "primary";
  const size = props.size || "md";

  const sizeCls =
    size === "sm" ? "px-3 py-1.5 text-sm" :
    size === "lg" ? "px-5 py-3 text-base" :
    "px-4 py-2 text-sm";

  const intentCls =
    intent === "secondary" ? "bg-white text-[var(--ds-fg)] border border-[var(--ds-border)]" :
    intent === "danger" ? "bg-[var(--ds-danger)] text-white" :
    "bg-[var(--ds-primary)] text-white";

  return [
    "inline-flex items-center justify-center rounded-lg font-medium",
    sizeCls,
    intentCls,
    "shadow-sm",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-offset-2"
  ].join(" ");
});
</script>
`;

  const Typography = `<template>
  <component :is="tag" :class="cls">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  variant?: "h1" | "h2" | "h3" | "body" | "caption";
  colorToken?: "fg" | "muted" | "primary" | "danger" | "border" | "surface";
}>();

const tag = computed(() => {
  const v = props.variant || "body";
  if (v === "h1") return "h1";
  if (v === "h2") return "h2";
  if (v === "h3") return "h3";
  return "span";
});

const cls = computed(() => {
  const v = props.variant || "body";
  const color =
    props.colorToken === "primary" ? "text-[var(--ds-primary)]" :
    props.colorToken === "danger" ? "text-[var(--ds-danger)]" :
    props.colorToken === "muted" ? "text-[var(--ds-muted)]" :
    props.colorToken === "fg" ? "text-[var(--ds-fg)]" :
    "";

  const size =
    v === "h1" ? "text-2xl font-semibold" :
    v === "h2" ? "text-xl font-semibold" :
    v === "h3" ? "text-lg font-semibold" :
    v === "caption" ? "text-xs text-[var(--ds-muted)]" :
    "text-sm";

  return [size, color].filter(Boolean).join(" ");
});
</script>
`;

  const BaseInput = `<template>
  <input :class="cls" :placeholder="placeholder" />
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ placeholder?: string }>();

const cls = computed(() =>
  "px-3 py-2 rounded-lg border border-[var(--ds-border)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
);
const placeholder = computed(() => props.placeholder || "");
</script>
`;

  const UnsafeBox = `<template>
  <div class="border border-dashed border-slate-300 p-2 rounded">
    <slot />
  </div>
</template>
`;

  const BaseSelect = `<template>
  <div class="w-full">
    <select
      :class="cls"
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <slot />
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue?: string;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:modelValue", v: string): void }>();

const cls = computed(() => {
  const size = props.size ?? "md";
  const sizeCls =
    size === "sm" ? "px-3 py-1.5 text-sm" :
    size === "lg" ? "px-4 py-3 text-base" :
    "px-3 py-2 text-sm";
  return [
    "w-full rounded-lg border border-[var(--ds-border)] bg-white text-[var(--ds-fg)]",
    sizeCls,
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  ].join(" ");
});
</script>
`;

  const BaseCheckbox = `<template>
  <label class="inline-flex items-center gap-2">
    <input
      type="checkbox"
      :checked="checked"
      @change="$emit('update:checked', ($event.target as HTMLInputElement).checked)"
      :class="boxCls"
    />
    <span class="text-sm text-[var(--ds-fg)]"><slot>{{ label }}</slot></span>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  checked?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:checked", v: boolean): void }>();

const boxCls = computed(() => {
  const size = props.size ?? "md";
  const sz = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return [
    sz,
    "rounded border border-[var(--ds-border)] text-[var(--ds-primary)]",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  ].join(" ");
});
</script>
`;

  const BaseRadio = `<template>
  <label class="inline-flex items-center gap-2">
    <input
      type="radio"
      :name="name"
      :checked="checked"
      @change="$emit('update:checked', ($event.target as HTMLInputElement).checked)"
      :class="dotCls"
    />
    <span class="text-sm text-[var(--ds-fg)]"><slot>{{ label }}</slot></span>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  checked?: boolean;
  label?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:checked", v: boolean): void }>();

const dotCls = computed(() => {
  const size = props.size ?? "md";
  const sz = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return [
    sz,
    "border border-[var(--ds-border)] text-[var(--ds-primary)]",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  ].join(" ");
});
</script>
`;

  const BaseSwitch = `<template>
  <label class="inline-flex items-center gap-2">
    <button type="button" :class="trackCls" @click="$emit('update:checked', !checked)">
      <span :class="thumbCls"></span>
    </button>
    <span class="text-sm text-[var(--ds-fg)]"><slot>{{ label }}</slot></span>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  checked?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:checked", v: boolean): void }>();

const trackCls = computed(() => {
  const size = props.size ?? "md";
  const wh = size === "sm" ? "w-8 h-4" : size === "lg" ? "w-12 h-6" : "w-10 h-5";
  const bg = props.checked ? "bg-[var(--ds-primary)]" : "bg-slate-300";
  return ["relative inline-flex items-center rounded-full transition", wh, bg].join(" ");
});

const thumbCls = computed(() => {
  const size = props.size ?? "md";
  const t = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const x = props.checked
    ? (size === "sm" ? "translate-x-4" : size === "lg" ? "translate-x-6" : "translate-x-5")
    : "translate-x-1";
  return ["inline-block rounded-full bg-white transition transform", t, x].join(" ");
});
</script>
`;

  const DropdownMenu = `<template>
  <div class="relative inline-block">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-[var(--ds-border)] px-3 py-2 text-sm"
      @click="open = !open"
    >
      <slot name="trigger">Menu</slot>
      <span class="text-xs">▾</span>
    </button>
    <div
      v-if="open"
      class="absolute z-50 mt-2 min-w-[10rem] rounded-lg border border-[var(--ds-border)] bg-white shadow-sm p-1"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
const open = ref(false);
</script>
`;

  const HamburgerButton = `<template>
  <button
    type="button"
    class="inline-flex items-center justify-center rounded-lg border border-[var(--ds-border)] p-2"
    aria-label="Menu"
  >
    <span class="block h-0.5 w-5 bg-[var(--ds-fg)]"></span>
    <span class="block h-0.5 w-5 bg-[var(--ds-fg)] mt-1.5"></span>
    <span class="block h-0.5 w-5 bg-[var(--ds-fg)] mt-1.5"></span>
  </button>
</template>
`;

  const MenuList = `<template>
  <ul class="min-w-[10rem] rounded-lg border border-[var(--ds-border)] bg-white p-1">
    <slot />
  </ul>
</template>
`;

  const ThumbnailCard = `<template>
  <div class="rounded-xl border border-[var(--ds-border)] bg-white shadow-sm overflow-hidden">
    <div class="aspect-[16/9] bg-slate-100">
      <slot name="thumbnail" />
    </div>
    <div class="p-4">
      <div v-if="title" class="text-sm font-semibold text-[var(--ds-fg)]">{{ title }}</div>
      <div class="mt-1 text-sm text-[var(--ds-muted)]"><slot /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ title?: string }>();
</script>
`;

  const Carousel = `<template>
  <div class="w-full overflow-x-auto">
    <div class="flex gap-3 w-max">
      <slot />
    </div>
  </div>
</template>
`;

  const CalendarInput = `<template>
  <input
    type="date"
    :value="modelValue"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    class="px-3 py-2 rounded-lg border border-[var(--ds-border)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  />
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue?: string }>();
defineEmits<{ (e: "update:modelValue", v: string): void }>();
</script>
`;

  const RangeSlider = `<template>
  <div class="w-full">
    <input
      type="range"
      :min="min"
      :max="max"
      :value="modelValue"
      @input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
      class="w-full"
    />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue?: number; min?: number; max?: number }>();
defineEmits<{ (e: "update:modelValue", v: number): void }>();
</script>
`;

  const ToggleButton = `<template>
  <button type="button" :class="cls" @click="$emit('update:checked', !checked)">
    <slot>{{ label }}</slot>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  checked?: boolean;
  label?: string;
  intent?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:checked", v: boolean): void }>();

const cls = computed(() => {
  const intent = props.intent || "primary";
  const size = props.size || "md";
  const checked = props.checked || false;

  const sizeCls =
    size === "sm" ? "px-3 py-1.5 text-sm" :
    size === "lg" ? "px-5 py-3 text-base" :
    "px-4 py-2 text-sm";

  const intentCls =
    intent === "secondary" ? "bg-white text-[var(--ds-fg)] border border-[var(--ds-border)]" :
    intent === "danger" ? "bg-[var(--ds-danger)] text-white" :
    "bg-[var(--ds-primary)] text-white";

  return [
    "inline-flex items-center justify-center rounded-lg font-medium transition",
    sizeCls,
    intentCls,
    checked ? "opacity-100" : "opacity-70",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-offset-2"
  ].join(" ");
});
</script>
`;

  const Popup = `<template>
  <div class="relative w-full rounded-2xl bg-white border border-[var(--ds-border)] shadow-sm">
    <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--ds-border)]">
      <div class="text-sm font-semibold text-[var(--ds-fg)]">{{ title }}</div>
      <button type="button" class="text-sm text-[var(--ds-muted)]" @click="$emit('close')">닫기</button>
    </div>
    <div class="p-5">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ title?: string }>();
defineEmits<{ (e: "close"): void }>();
</script>
`;

  const Loading = `<template>
  <div class="inline-flex items-center gap-2">
    <span :class="spinnerCls"></span>
    <span v-if="label" class="text-sm text-[var(--ds-muted)]">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  label?: string;
  size?: "sm" | "md" | "lg";
}>();

const spinnerCls = computed(() => {
  const size = props.size || "md";
  const wh = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return [wh, "rounded-full border-2 border-slate-200 border-t-[var(--ds-primary)] animate-spin"].join(" ");
});
</script>
`;

  const Flag = `<template>
  <span :class="cls">
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  text?: string;
  intent?: "primary" | "secondary" | "danger" | "muted";
}>();

const cls = computed(() => {
  const intent = props.intent || "secondary";
  const skin =
    intent === "primary" ? "bg-[var(--ds-primary)] text-white" :
    intent === "danger" ? "bg-[var(--ds-danger)] text-white" :
    intent === "muted" ? "bg-slate-100 text-[var(--ds-muted)]" :
    "bg-white text-[var(--ds-fg)] border border-[var(--ds-border)]";
  return ["inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", skin].join(" ");
});
</script>
`;

  const Tabs = `<template>
  <div class="w-full">
    <div class="flex items-center gap-2 border-b border-[var(--ds-border)]">
      <button
        v-for="(t, idx) in tabs"
        :key="idx"
        type="button"
        :class="tabsBtnClass(String(t.value))"
        @click="$emit('update:modelValue', t.value)"
      >
        {{ String(t.label) }}
      </button>
    </div>
    <div class="pt-4">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: string;
  tabs?: Array<{ label: string; value: string }>;
}>();

defineEmits<{ (e: "update:modelValue", v: string): void }>();

function tabsBtnClass(v: string) {
  const active = String(props.modelValue ?? "") === v;
  return [
    "text-sm px-3 py-2 -mb-px border-b-2 transition",
    active ? "border-[var(--ds-primary)] text-[var(--ds-fg)] font-medium" : "border-transparent text-[var(--ds-muted)]"
  ].join(" ");
}
</script>
`;

  const AlertDialog = `<template>
  <div class="relative w-full rounded-2xl bg-white border border-[var(--ds-border)] shadow-sm">
    <div class="px-5 py-4 border-b border-[var(--ds-border)]">
      <div class="text-sm font-semibold text-[var(--ds-fg)]">{{ title }}</div>
    </div>
    <div class="p-5">
      <div class="text-sm text-[var(--ds-muted)] whitespace-pre-wrap">{{ message }}</div>
    </div>
    <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--ds-border)]">
      <button type="button" class="px-3 py-2 text-sm rounded-lg border border-[var(--ds-border)]" @click="$emit('cancel')">취소</button>
      <button type="button" class="px-3 py-2 text-sm rounded-lg bg-[var(--ds-primary)] text-white" @click="$emit('confirm')">확인</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  title?: string;
  message?: string;
}>();

defineEmits<{ (e: "cancel"): void; (e: "confirm"): void }>();
</script>
`;

  return {
    BaseButton,
    Typography,
    BaseInput,
    UnsafeBox,
    BaseSelect,
    BaseCheckbox,
    BaseRadio,
    BaseSwitch,
    DropdownMenu,
    HamburgerButton,
    MenuList,
    ThumbnailCard,
    Carousel,
    CalendarInput,
    RangeSlider,
    ToggleButton,
    Popup,
    Loading,
    Flag,
    Tabs,
    AlertDialog
  };
}

function nuxtFiles(appHtml: string, dsRoot: DSRoot) {
  const diagnosticsJson = JSON.stringify(dsRoot.diagnostics || [], null, 2);
  const isRaw = dsRoot?.meta?.policy === "RAW";
  const c = getComponentSources();

  const appVue = isRaw
    ? `<template>
  <GeneratedScreen />
</template>
`
    : `<template>
  <div class="min-h-screen bg-white text-slate-900">
    <main class="max-w-4xl mx-auto p-6">
      <GeneratedScreen />
      <details class="mt-10">
        <summary class="cursor-pointer text-sm text-slate-600">Mapping diagnostics</summary>
        <pre class="mt-3 text-xs whitespace-pre-wrap text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4">{{ diagnostics }}</pre>
      </details>
    </main>
  </div>
</template>

<script setup lang="ts">
import diagnostics from "~/generated/diagnostics.json";
</script>
`;

  const generatedScreenVue = `<template>
  ${appHtml}
</template>
`;

  return {
    "package.json": JSON.stringify(
      {
        name: "a2ui-generated-app",
        private: true,
        type: "module",
        scripts: {
          dev: "nuxt dev",
          build: "nuxt build",
          generate: "nuxt generate",
          preview: "nuxt preview"
        },
        dependencies: {
          nuxt: "^3.11.1"
        },
        devDependencies: {
          tailwindcss: "^3.4.0",
          postcss: "^8.4.0",
          autoprefixer: "^10.4.0"
        }
      },
      null,
      2
    ),
    "nuxt.config.ts": `export default defineNuxtConfig({
  css: ["~/assets/tailwind.css"],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {}
    }
  }
});
`,
    "tailwind.config.js": `export default {
  content: ["./app.vue", "./components/**/*.{vue,js,ts}", "./pages/**/*.vue"],
  theme: { extend: {} },
  plugins: []
};
`,
    "postcss.config.js": `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
`,
    "assets/tailwind.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

:root{
  --ds-primary: #2563eb;
  --ds-danger: #dc2626;
  --ds-fg: #0f172a;
  --ds-muted: #475569;
  --ds-surface: #ffffff;
  --ds-border: #e2e8f0;
}
`,
    "app.vue": appVue,
    "components/GeneratedScreen.vue": generatedScreenVue,

    "components/BaseButton.vue": c.BaseButton,
    "components/Typography.vue": c.Typography,
    "components/BaseInput.vue": c.BaseInput,
    "components/UnsafeBox.vue": c.UnsafeBox,
    "components/BaseSelect.vue": c.BaseSelect,
    "components/BaseCheckbox.vue": c.BaseCheckbox,
    "components/BaseRadio.vue": c.BaseRadio,
    "components/BaseSwitch.vue": c.BaseSwitch,
    "components/DropdownMenu.vue": c.DropdownMenu,
    "components/HamburgerButton.vue": c.HamburgerButton,
    "components/MenuList.vue": c.MenuList,
    "components/ThumbnailCard.vue": c.ThumbnailCard,
    "components/Carousel.vue": c.Carousel,
    "components/CalendarInput.vue": c.CalendarInput,
    "components/RangeSlider.vue": c.RangeSlider,
    "components/ToggleButton.vue": c.ToggleButton,
    "components/Popup.vue": c.Popup,
    "components/Loading.vue": c.Loading,
    "components/Flag.vue": c.Flag,
    "components/Tabs.vue": c.Tabs,
    "components/AlertDialog.vue": c.AlertDialog,

    "generated/diagnostics.json": diagnosticsJson
  };
}

function viteFiles(appHtml: string, dsRoot: DSRoot) {
  const diagnosticsJson = JSON.stringify(dsRoot.diagnostics || [], null, 2);
  const isRaw = dsRoot?.meta?.policy === "RAW";
  const c = getComponentSources();

  const appVue = isRaw
    ? `<template>
  ${appHtml}
</template>
`
    : `<template>
  <div class="min-h-screen bg-white text-slate-900">
    <main class="max-w-4xl mx-auto p-6">
      ${appHtml}
      <details class="mt-10">
        <summary class="cursor-pointer text-sm text-slate-600">Mapping diagnostics</summary>
        <pre class="mt-3 text-xs whitespace-pre-wrap text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4">{{ diagnostics }}</pre>
      </details>
    </main>
  </div>
</template>

<script setup lang="ts">
import diagnostics from "./generated/diagnostics.json";
</script>
`;

  return {
    "package.json": JSON.stringify(
      {
        name: "a2ui-vue-app",
        private: true,
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview"
        },
        dependencies: {
          vue: "^3.4.0"
        },
        devDependencies: {
          "@vitejs/plugin-vue": "^5.2.0",
          vite: "^5.4.0",
          typescript: "^5.6.2",
          tailwindcss: "^3.4.0",
          postcss: "^8.4.0",
          autoprefixer: "^10.4.0"
        }
      },
      null,
      2
    ),
    "vite.config.ts": `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()]
});
`,
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>a2ui</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    "tailwind.config.js": `export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts}"],
  theme: { extend: {} },
  plugins: []
};
`,
    "postcss.config.js": `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
`,
    "src/styles/tailwind.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

:root{
  --ds-primary: #2563eb;
  --ds-danger: #dc2626;
  --ds-fg: #0f172a;
  --ds-muted: #475569;
  --ds-surface: #ffffff;
  --ds-border: #e2e8f0;
}
`,
    "src/main.ts": `import { createApp } from "vue";
import App from "./App.vue";
import "./styles/tailwind.css";

import BaseButton from "./components/BaseButton.vue";
import Typography from "./components/Typography.vue";
import BaseInput from "./components/BaseInput.vue";
import UnsafeBox from "./components/UnsafeBox.vue";

import BaseSelect from "./components/BaseSelect.vue";
import BaseCheckbox from "./components/BaseCheckbox.vue";
import BaseRadio from "./components/BaseRadio.vue";
import BaseSwitch from "./components/BaseSwitch.vue";
import DropdownMenu from "./components/DropdownMenu.vue";
import HamburgerButton from "./components/HamburgerButton.vue";
import MenuList from "./components/MenuList.vue";
import ThumbnailCard from "./components/ThumbnailCard.vue";
import Carousel from "./components/Carousel.vue";
import CalendarInput from "./components/CalendarInput.vue";
import RangeSlider from "./components/RangeSlider.vue";
import ToggleButton from "./components/ToggleButton.vue";
import Popup from "./components/Popup.vue";
import Loading from "./components/Loading.vue";
import Flag from "./components/Flag.vue";
import Tabs from "./components/Tabs.vue";
import AlertDialog from "./components/AlertDialog.vue";

const app = createApp(App);

app.component("BaseButton", BaseButton);
app.component("Typography", Typography);
app.component("BaseInput", BaseInput);
app.component("UnsafeBox", UnsafeBox);

app.component("BaseSelect", BaseSelect);
app.component("BaseCheckbox", BaseCheckbox);
app.component("BaseRadio", BaseRadio);
app.component("BaseSwitch", BaseSwitch);
app.component("DropdownMenu", DropdownMenu);
app.component("HamburgerButton", HamburgerButton);
app.component("MenuList", MenuList);
app.component("ThumbnailCard", ThumbnailCard);
app.component("Carousel", Carousel);
app.component("CalendarInput", CalendarInput);
app.component("RangeSlider", RangeSlider);
app.component("ToggleButton", ToggleButton);
app.component("Popup", Popup);
app.component("Loading", Loading);
app.component("Flag", Flag);
app.component("Tabs", Tabs);
app.component("AlertDialog", AlertDialog);

app.mount("#app");
`,
    "src/App.vue": appVue,

    "src/components/BaseButton.vue": c.BaseButton,
    "src/components/Typography.vue": c.Typography,
    "src/components/BaseInput.vue": c.BaseInput,
    "src/components/UnsafeBox.vue": c.UnsafeBox,
    "src/components/BaseSelect.vue": c.BaseSelect,
    "src/components/BaseCheckbox.vue": c.BaseCheckbox,
    "src/components/BaseRadio.vue": c.BaseRadio,
    "src/components/BaseSwitch.vue": c.BaseSwitch,
    "src/components/DropdownMenu.vue": c.DropdownMenu,
    "src/components/HamburgerButton.vue": c.HamburgerButton,
    "src/components/MenuList.vue": c.MenuList,
    "src/components/ThumbnailCard.vue": c.ThumbnailCard,
    "src/components/Carousel.vue": c.Carousel,
    "src/components/CalendarInput.vue": c.CalendarInput,
    "src/components/RangeSlider.vue": c.RangeSlider,
    "src/components/ToggleButton.vue": c.ToggleButton,
    "src/components/Popup.vue": c.Popup,
    "src/components/Loading.vue": c.Loading,
    "src/components/Flag.vue": c.Flag,
    "src/components/Tabs.vue": c.Tabs,
    "src/components/AlertDialog.vue": c.AlertDialog,

    "public/assets/.gitkeep": "",
    "src/generated/diagnostics.json": diagnosticsJson
  };
}

@Injectable()
export class CodegenService {
  private outDir: string;

  constructor(private readonly mcp: McpClient) {
    this.outDir = path.join(process.cwd(), ".out");
    ensureDir(this.outDir);
  }

  private collectImageNodeIds(node: DSNode, out: Set<string>) {
    if (!node) return;
    if (node.kind === "element" && node.name === "img") {
      const id = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
      if (id) out.add(id);
    }
    for (const c of node.children || []) this.collectImageNodeIds(c, out);
  }

  async resolveFigmaAssetUrls(dsRoot: DSRoot): Promise<void> {
    const fileKey = dsRoot?.meta?.fileKey;
    if (!fileKey) return;

    const ids = new Set<string>();
    this.collectImageNodeIds(dsRoot.tree, ids);
    if (ids.size === 0) return;

    const idList = Array.from(ids);
    const chunks: string[][] = [];
    for (let i = 0; i < idList.length; i += 50) chunks.push(idList.slice(i, i + 50));

    const idToUrl = new Map<string, string>();
    for (const chunk of chunks) {
      try {
        const r: any = await this.mcp.invokeTool("figma.getImages", {
          fileKey,
          ids: chunk,
          format: "png",
          scale: 2
        });
        const images = r?.images || {};
        for (const [k, v] of Object.entries(images)) {
          if (typeof v === "string" && v) idToUrl.set(k, v);
        }
      } catch {
        // ignore chunk failures
      }
    }

    const rewrite = (node: DSNode) => {
      if (!node) return;
      if (node.kind === "element" && node.name === "img") {
        const nodeId = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
        const p = node.props || {};
        const src = String((p as any).src || "");
        const next = nodeId ? idToUrl.get(nodeId) : undefined;
        if (next && (src.startsWith("__FIGMA_NODE__") || src.startsWith("/assets/figma/") || !src)) {
          node.props = { ...p, src: next };
        }
      }
      for (const c of node.children || []) rewrite(c);
    };
    rewrite(dsRoot.tree);
  }

  private async resolveFigmaAssets(dsRoot: DSRoot, projectDir: string) {
    const fileKey = dsRoot?.meta?.fileKey;
    if (!fileKey) return;

    const ids = new Set<string>();
    this.collectImageNodeIds(dsRoot.tree, ids);
    if (ids.size === 0) return;

    const assetRelDir = "public/assets/figma";
    const assetAbsDir = path.join(projectDir, assetRelDir);
    ensureDir(assetAbsDir);

    const idList = Array.from(ids);
    const chunks: string[][] = [];
    for (let i = 0; i < idList.length; i += 50) chunks.push(idList.slice(i, i + 50));

    const idToUrl = new Map<string, string>();
    for (const chunk of chunks) {
      const r: any = await this.mcp.invokeTool("figma.getImages", {
        fileKey,
        ids: chunk,
        format: "png",
        scale: 2
      });
      const images = r?.images || {};
      for (const [k, v] of Object.entries(images)) {
        if (typeof v === "string" && v) idToUrl.set(k, v);
      }
    }

    for (const [nodeId, url] of idToUrl.entries()) {
      try {
        const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 45000 });
        const safe = nodeId.replace(/[^a-zA-Z0-9._-]/g, "_");
        fs.writeFileSync(path.join(assetAbsDir, `${safe}.png`), Buffer.from(resp.data));
      } catch {
        // ignore single asset failures
      }
    }

    const rewrite = (node: DSNode) => {
      if (!node) return;
      if (node.kind === "element" && node.name === "img") {
        const nodeId = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
        const safe = nodeId.replace(/[^a-zA-Z0-9._-]/g, "_");
        const p = node.props || {};
        const src = String((p as any).src || "");
        if (!src || src.startsWith("__FIGMA_NODE__")) {
          node.props = { ...p, src: `/assets/figma/${safe}.png` };
        }
      }
      for (const c of node.children || []) rewrite(c);
    };
    rewrite(dsRoot.tree);
  }

  async generateZip(projectId: string, target: string, dsRoot: DSRoot): Promise<string> {
    const id = uuid().slice(0, 8);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `a2ui-${projectId}-${id}-`));

    await this.resolveFigmaAssets(dsRoot, dir);

    const screen = renderNode(dsRoot.tree);
    const t = String(target || "nuxt").toLowerCase();
    const files = t === "vue" ? viteFiles(screen, dsRoot) : nuxtFiles(screen, dsRoot);

    for (const [rel, content] of Object.entries(files)) {
      writeFile(path.join(dir, rel), content);
    }

    const zipPath = path.join(this.outDir, `${projectId}-${id}-${target}.zip`);
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", () => resolve(null));
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(dir, false);
      archive.finalize();
    });

    return zipPath;
  }

  renderVueSources(dsRoot: DSRoot, target: string) {
    const screen = renderNode(dsRoot.tree);
    const t = String(target || "nuxt").toLowerCase();
    if (t === "vue") {
      const files = viteFiles(screen, dsRoot);
      return files;
    }
    const files = nuxtFiles(screen, dsRoot);
    return files;
  }
}
