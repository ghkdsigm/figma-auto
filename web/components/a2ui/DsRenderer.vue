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

    <textarea
      v-else-if="isBaseTextarea"
      :class="baseTextareaClass"
      :placeholder="String(node.props?.placeholder ?? '')"
      :rows="Number(node.props?.rows ?? 3)"
    ></textarea>
<select
  v-else-if="isBaseSelect"
  :class="baseSelectClass"
  :value="String(node.props?.modelValue ?? '')"
>
  <option v-if="String(node.props?.placeholder ?? '')" value="" disabled>
    {{ String(node.props?.placeholder ?? "") }}
  </option>
  <option v-for="(opt, idx) in selectOptions" :key="idx" :value="String(opt.value)">
    {{ String(opt.label) }}
  </option>
</select>

<label v-else-if="isBaseCheckbox" class="inline-flex items-center gap-2">
  <input type="checkbox" :class="baseCheckClass" :checked="!!node.props?.checked" />
  <span class="text-sm text-[var(--ds-fg)]">{{ String(node.props?.label ?? "") }}</span>
</label>

<label v-else-if="isBaseRadio" class="inline-flex items-center gap-2">
  <input type="radio" :class="baseCheckClass" :checked="!!node.props?.checked" />
  <span class="text-sm text-[var(--ds-fg)]">{{ String(node.props?.label ?? "") }}</span>
</label>

<label v-else-if="isBaseSwitch" class="inline-flex items-center gap-2">
  <button type="button" :class="switchTrackClass">
    <span :class="switchThumbClass"></span>
  </button>
  <span class="text-sm text-[var(--ds-fg)]">{{ String(node.props?.label ?? "") }}</span>
</label>

<div v-else-if="isDropdownMenu" class="relative inline-block">
  <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-[var(--ds-border)] px-3 py-2 text-sm">
    {{ String(node.props?.label ?? "Menu") }} <span class="text-xs">▾</span>
  </button>
  <div class="absolute z-50 mt-2 min-w-[10rem] rounded-lg border border-[var(--ds-border)] bg-white shadow-sm p-1">
    <DsRenderer v-for="c in children" :key="c.id" :node="c" />
  </div>
</div>

<button v-else-if="isHamburgerButton" type="button" class="inline-flex items-center justify-center rounded-lg border border-[var(--ds-border)] p-2" aria-label="Menu">
  <span class="block h-0.5 w-5 bg-[var(--ds-fg)]"></span>
  <span class="block h-0.5 w-5 bg-[var(--ds-fg)] mt-1.5"></span>
  <span class="block h-0.5 w-5 bg-[var(--ds-fg)] mt-1.5"></span>
</button>

<ul v-else-if="isMenuList" class="min-w-[10rem] rounded-lg border border-[var(--ds-border)] bg-white p-1">
  <DsRenderer v-for="c in children" :key="c.id" :node="c" />
</ul>

<div v-else-if="isThumbnailCard" class="rounded-xl border border-[var(--ds-border)] bg-white shadow-sm overflow-hidden">
  <div class="aspect-[16/9] bg-slate-100"></div>
  <div class="p-4">
    <div v-if="String(node.props?.title ?? '')" class="text-sm font-semibold text-[var(--ds-fg)]">
      {{ String(node.props?.title ?? "") }}
    </div>
    <div class="mt-1 text-sm text-[var(--ds-muted)]">
      <DsRenderer v-for="c in children" :key="c.id" :node="c" />
    </div>
  </div>
</div>

<div v-else-if="isCarousel" class="w-full overflow-x-auto">
  <div class="flex gap-3 w-max">
    <DsRenderer v-for="c in children" :key="c.id" :node="c" />
  </div>
</div>

<input v-else-if="isCalendarInput" type="date" :class="baseInputClass" :value="String(node.props?.modelValue ?? '')" />

<input v-else-if="isRangeSlider" type="range" class="w-full" :min="Number(node.props?.min ?? 0)" :max="Number(node.props?.max ?? 100)" :value="Number(node.props?.modelValue ?? 50)" />

<button v-else-if="isToggleButton" type="button" :class="toggleButtonClass">
  {{ String(node.props?.label ?? "") }}
</button>

<div v-else-if="isPopup" class="relative w-full rounded-2xl bg-white border border-[var(--ds-border)] shadow-sm">
  <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--ds-border)]">
    <div class="text-sm font-semibold text-[var(--ds-fg)]">{{ String(node.props?.title ?? "Popup") }}</div>
    <span class="text-sm text-[var(--ds-muted)]">닫기</span>
  </div>
  <div class="p-5">
    <DsRenderer v-for="c in children" :key="c.id" :node="c" />
  </div>
</div>

<div v-else-if="isLoading" class="inline-flex items-center gap-2">
  <span :class="loadingSpinnerClass"></span>
  <span v-if="String(node.props?.label ?? '')" class="text-sm text-[var(--ds-muted)]">{{ String(node.props?.label ?? "") }}</span>
</div>

<span v-else-if="isFlag" :class="flagClass"><slot>{{ String(node.props?.text ?? "") }}</slot></span>

<div v-else-if="isTabs" class="w-full">
  <div class="flex items-center gap-2 border-b border-[var(--ds-border)]">
    <button
      v-for="(t, idx) in tabsItems"
      :key="idx"
      type="button"
      :class="tabsBtnClass(String(t.value))"
    >
      {{ String(t.label) }}
    </button>
  </div>
  <div class="pt-4">
    <DsRenderer v-for="c in children" :key="c.id" :node="c" />
  </div>
</div>

<div v-else-if="isAlertDialog" class="relative w-full rounded-2xl bg-white border border-[var(--ds-border)] shadow-sm">
  <div class="px-5 py-4 border-b border-[var(--ds-border)]">
    <div class="text-sm font-semibold text-[var(--ds-fg)]">{{ String(node.props?.title ?? "알림") }}</div>
  </div>
  <div class="p-5">
    <div class="text-sm text-[var(--ds-muted)] whitespace-pre-wrap">{{ String(node.props?.message ?? "") }}</div>
  </div>
  <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--ds-border)]">
    <button type="button" class="px-3 py-2 text-sm rounded-lg border border-[var(--ds-border)]">취소</button>
    <button type="button" class="px-3 py-2 text-sm rounded-lg bg-[var(--ds-primary)] text-white">확인</button>
  </div>
</div>

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
const isBaseTextarea = computed(() => node.value?.kind === "component" && node.value?.name === "BaseTextarea");
const isUnsafeBox = computed(() => node.value?.kind === "component" && node.value?.name === "UnsafeBox");
const isBaseSelect = computed(() => node.value?.kind === "component" && node.value?.name === "BaseSelect");
const isBaseCheckbox = computed(() => node.value?.kind === "component" && node.value?.name === "BaseCheckbox");
const isBaseRadio = computed(() => node.value?.kind === "component" && node.value?.name === "BaseRadio");
const isBaseSwitch = computed(() => node.value?.kind === "component" && node.value?.name === "BaseSwitch");
const isDropdownMenu = computed(() => node.value?.kind === "component" && node.value?.name === "DropdownMenu");
const isHamburgerButton = computed(() => node.value?.kind === "component" && node.value?.name === "HamburgerButton");
const isMenuList = computed(() => node.value?.kind === "component" && node.value?.name === "MenuList");
const isThumbnailCard = computed(() => node.value?.kind === "component" && node.value?.name === "ThumbnailCard");
const isCarousel = computed(() => node.value?.kind === "component" && node.value?.name === "Carousel");
const isCalendarInput = computed(() => node.value?.kind === "component" && node.value?.name === "CalendarInput");
const isRangeSlider = computed(() => node.value?.kind === "component" && node.value?.name === "RangeSlider");
const isToggleButton = computed(() => node.value?.kind === "component" && node.value?.name === "ToggleButton");
const isPopup = computed(() => node.value?.kind === "component" && node.value?.name === "Popup");
const isLoading = computed(() => node.value?.kind === "component" && node.value?.name === "Loading");
const isFlag = computed(() => node.value?.kind === "component" && node.value?.name === "Flag");
const isTabs = computed(() => node.value?.kind === "component" && node.value?.name === "Tabs");
const isAlertDialog = computed(() => node.value?.kind === "component" && node.value?.name === "AlertDialog");


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

const baseTextareaClass = computed(() => {
  return [baseInputClass.value, "min-h-[96px] resize-y"].join(" ");
});

const baseSelectClass = computed(() => {
  const size = String(node.value?.props?.size ?? "md");
  const sizeCls = size === "sm" ? "px-3 py-1.5 text-sm" : size === "lg" ? "px-4 py-3 text-base" : "px-3 py-2 text-sm";
  return [
    "w-full rounded-lg border border-[var(--ds-border)] bg-white text-[var(--ds-fg)]",
    sizeCls,
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  ].join(" ");
});

const baseCheckClass = computed(() => {
  const size = String(node.value?.props?.size ?? "md");
  const sz = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return [
    sz,
    "rounded border border-[var(--ds-border)] text-[var(--ds-primary)]",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  ].join(" ");
});

const switchTrackClass = computed(() => {
  const checked = !!node.value?.props?.checked;
  const size = String(node.value?.props?.size ?? "md");
  const wh = size === "sm" ? "w-8 h-4" : size === "lg" ? "w-12 h-6" : "w-10 h-5";
  const bg = checked ? "bg-[var(--ds-primary)]" : "bg-slate-300";
  return ["relative inline-flex items-center rounded-full transition", wh, bg].join(" ");
});

const switchThumbClass = computed(() => {
  const checked = !!node.value?.props?.checked;
  const size = String(node.value?.props?.size ?? "md");
  const t = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const x = checked ? (size === "sm" ? "translate-x-4" : size === "lg" ? "translate-x-6" : "translate-x-5") : "translate-x-1";
  return ["inline-block rounded-full bg-white transition transform", t, x].join(" ");
});


const toggleButtonClass = computed(() => {
  const checked = !!node.value?.props?.checked;
  const intent = String(node.value?.props?.intent ?? "primary");
  const size = String(node.value?.props?.size ?? "md");

  const sizeCls = size === "sm" ? "px-3 py-1.5 text-sm" : size === "lg" ? "px-5 py-3 text-base" : "px-4 py-2 text-sm";
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

const loadingSpinnerClass = computed(() => {
  const size = String(node.value?.props?.size ?? "md");
  const wh = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return [wh, "rounded-full border-2 border-slate-200 border-t-[var(--ds-primary)] animate-spin"].join(" ");
});

const flagClass = computed(() => {
  const intent = String(node.value?.props?.intent ?? "secondary");
  const skin =
    intent === "primary" ? "bg-[var(--ds-primary)] text-white" :
    intent === "danger" ? "bg-[var(--ds-danger)] text-white" :
    intent === "muted" ? "bg-slate-100 text-[var(--ds-muted)]" :
    "bg-white text-[var(--ds-fg)] border border-[var(--ds-border)]";
  return ["inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", skin].join(" ");
});

const tabsItems = computed(() => {
  const t = node.value?.props?.tabs;
  if (!Array.isArray(t)) return [];
  return t.map((x: any) => ({ label: x?.label ?? x?.value ?? "", value: x?.value ?? x?.label ?? "" }));
});

function tabsBtnClass(v: string) {
  const active = String(node.value?.props?.modelValue ?? "") === v;
  return [
    "text-sm px-3 py-2 -mb-px border-b-2 transition",
    active ? "border-[var(--ds-primary)] text-[var(--ds-fg)] font-medium" : "border-transparent text-[var(--ds-muted)]"
  ].join(" ");
}

const selectOptions = computed(() => {
  const opts = node.value?.props?.options;
  if (!Array.isArray(opts)) return [];
  return opts.map((o: any) => ({ label: o?.label ?? o?.value ?? "", value: o?.value ?? o?.label ?? "" }));
});
</script>