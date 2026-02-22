# Sidebar Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the floating glass-card sidebar with a full-height structural panel where projects are first-class clickable rows, styled like a premium Mac app (Tower/Transmit).

**Architecture:** The sidebar becomes a window-level structural `<aside>` spanning full height, separated from content by a 1px border. Projects are listed as clickable rows (replacing the dropdown), with navigation items below a divider. The `AppShell` layout changes from a simple `<main>` wrapper to a `flex[sidebar | content]` split. On mobile (<1024px), the sidebar hides and an inline project selector returns.

**Tech Stack:** Vue 3 Composition API, Tailwind CSS 4, existing Spool design tokens

**Design doc:** `docs/plans/2026-02-22-sidebar-rework-design.md`

---

### Task 1: Create SidebarPanel.vue

**Files:**
- Create: `src/components/layout/SidebarPanel.vue`

**Step 1: Create the component file**

```vue
<script setup lang="ts">
import type { ProjectProfile } from "../../types";
import { useEnvSets } from "../../composables/useEnvSets";
import { computed } from "vue";

type AppPage = "dashboard" | "projects" | "help";

const props = defineProps<{
  projects: ProjectProfile[];
  activeProjectId: string;
  page: AppPage;
}>();

const emit = defineEmits<{
  selectProject: [id: string];
  navigate: [page: AppPage];
}>();

const { envSets } = useEnvSets();

const setCountsByProject = computed(() => {
  const counts: Record<string, number> = {};
  for (const s of envSets.value) {
    counts[s.projectId] = (counts[s.projectId] ?? 0) + 1;
  }
  return counts;
});

function onProjectClick(project: ProjectProfile) {
  if (project.id === props.activeProjectId) {
    emit("navigate", "projects");
  } else {
    emit("selectProject", project.id);
  }
}
</script>

<template>
  <aside
    class="w-[220px] shrink-0 bg-surface-0 border-r border-border-default flex flex-col max-[1024px]:hidden"
  >
    <!-- Titlebar drag region -->
    <div class="h-7 w-full shrink-0" style="-webkit-app-region: drag;" />

    <!-- Projects group -->
    <div class="px-3 pb-2">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Projects
        </span>
        <button
          class="text-text-muted hover:text-text-primary transition-colors p-0.5 -mr-0.5 rounded"
          title="Manage projects"
          @click="emit('navigate', 'projects')"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <nav class="space-y-0.5" aria-label="Project list">
        <button
          v-for="project in projects"
          :key="project.id"
          class="w-full rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[13px] transition-colors flex items-center gap-2 group"
          :class="project.id === activeProjectId
            ? 'bg-accent-muted text-accent font-medium'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'"
          @click="onProjectClick(project)"
        >
          <svg class="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3.5 6.5H9L10.8 8.5H20.5V18.5H3.5V6.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
          </svg>
          <span class="truncate flex-1">{{ project.name }}</span>
          <span class="text-[11px] tabular-nums" :class="project.id === activeProjectId ? 'text-accent/60' : 'text-text-muted'">
            {{ (setCountsByProject[project.id] ?? 0) > 0 ? setCountsByProject[project.id] : '\u00B7' }}
          </span>
        </button>

        <p v-if="projects.length === 0" class="px-2 py-1.5 text-[13px] text-text-muted italic">
          No projects yet
        </p>
      </nav>
    </div>

    <!-- Divider -->
    <div class="mx-3 border-t border-border-subtle" />

    <!-- Navigation group -->
    <div class="px-3 pt-2">
      <nav class="space-y-0.5" aria-label="Primary navigation">
        <button
          class="w-full rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[13px] transition-colors flex items-center gap-2"
          :class="page === 'dashboard'
            ? 'bg-accent-muted text-accent font-medium'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'"
          :aria-current="page === 'dashboard' ? 'page' : undefined"
          @click="emit('navigate', 'dashboard')"
        >
          <svg class="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12L12 4L20 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M6.5 10.5V19H17.5V10.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Dashboard
        </button>
        <button
          class="w-full rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[13px] transition-colors flex items-center gap-2"
          :class="page === 'help'
            ? 'bg-accent-muted text-accent font-medium'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'"
          :aria-current="page === 'help' ? 'page' : undefined"
          @click="emit('navigate', 'help')"
        >
          <svg class="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8" />
            <path d="M9.7 9.5C9.9 8.5 10.8 7.8 11.9 7.8C13.2 7.8 14.2 8.7 14.2 9.9C14.2 10.8 13.7 11.3 12.9 11.8C12.1 12.2 11.7 12.7 11.7 13.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="11.8" cy="16.4" r="1" fill="currentColor" />
          </svg>
          Help
        </button>
      </nav>
    </div>
  </aside>
</template>
```

**Behaviour notes:**
- Clicking the **active** project navigates to the Projects page (to manage it)
- Clicking an **inactive** project emits `selectProject` (parent handles switching + Dashboard navigation)
- The `+` button emits `navigate('projects')` to open the Projects page
- Set counts come from `useEnvSets()` which shares module-level singleton state
- The component hides entirely below 1024px via `max-[1024px]:hidden`

**Step 2: Verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds (component is created but not yet imported anywhere)

**Step 3: Commit**

```bash
git add src/components/layout/SidebarPanel.vue
git commit -m "feat: create SidebarPanel component for premium sidebar"
```

---

### Task 2: Update AppShell layout to flex split

**Files:**
- Modify: `src/components/layout/AppShell.vue`

**Step 1: Change AppShell to flex layout with sidebar slot**

Replace the current AppShell template with a flex layout that has a named slot for the sidebar and a default slot for main content. The titlebar drag region moves out of AppShell (each panel manages its own drag zone).

```vue
<script setup lang="ts">
import AmbientBackground from "./AmbientBackground.vue";
</script>

<template>
  <AmbientBackground />
  <div class="flex h-screen overflow-hidden">
    <slot name="sidebar" />
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Titlebar drag region for content area -->
      <div class="h-7 w-full shrink-0" style="-webkit-app-region: drag;" />
      <main class="flex-1 overflow-y-auto px-4 lg:px-6 pb-6 animate-content-fade-in">
        <slot />
      </main>
    </div>
  </div>
</template>
```

**Key changes:**
- `h-screen overflow-hidden` on outer flex container — sidebar and content share full viewport
- Named `sidebar` slot — App.vue passes SidebarPanel here
- Content area gets its own `h-7` drag region (sidebar has its own internally)
- `flex-1 min-w-0 overflow-hidden` on content wrapper — prevents content from pushing sidebar
- `overflow-y-auto` on `<main>` — content scrolls independently, sidebar stays fixed

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/layout/AppShell.vue
git commit -m "refactor: change AppShell to flex layout with sidebar slot"
```

---

### Task 3: Rewire App.vue to use SidebarPanel

**Files:**
- Modify: `src/App.vue`

**Step 1: Replace the grid sidebar with SidebarPanel**

This is the main integration task. Remove the old `GlassCard` sidebar, the inline `ProjectSelector`, and the grid layout. Wire up `SidebarPanel` in the sidebar slot and add a responsive fallback.

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useProjects } from "./composables/useProjects";
import { useEnvSets } from "./composables/useEnvSets";
import { analyzeRows } from "./composables/useAnalysis";
import AppShell from "./components/layout/AppShell.vue";
import SidebarPanel from "./components/layout/SidebarPanel.vue";
import KpiBar from "./components/kpi/KpiBar.vue";
import ProjectManagementCard from "./components/project/ProjectManagementCard.vue";
import ComparisonCard from "./components/comparison/ComparisonCard.vue";
import OnboardingGuide from "./components/help/OnboardingGuide.vue";
import ProjectSelector from "./components/project/ProjectSelector.vue";
import PageHeader from "./components/layout/PageHeader.vue";

const { projects, activeProjectId, activeProject, saveActiveProjectId } = useProjects();
const { currentSets } = useEnvSets();

const analysis = computed(() => analyzeRows(currentSets.value));
type AppPage = "dashboard" | "projects" | "help";
const PAGE_STORAGE_KEY = "edm.page.v1";

function loadPage(): AppPage {
  const stored = localStorage.getItem(PAGE_STORAGE_KEY);
  if (stored === "projects" || stored === "help") return stored;
  return "dashboard";
}

const page = ref<AppPage>(loadPage());

watch(page, (value) => {
  localStorage.setItem(PAGE_STORAGE_KEY, value);
});

function openPage(next: AppPage) {
  page.value = next;
}

function onSelectProject(id: string) {
  saveActiveProjectId(id);
  page.value = "dashboard";
}

function onProjectChange(id: string) {
  saveActiveProjectId(id);
}
</script>

<template>
  <AppShell>
    <template #sidebar>
      <SidebarPanel
        :projects="projects"
        :active-project-id="activeProjectId"
        :page="page"
        @select-project="onSelectProject"
        @navigate="openPage"
      />
    </template>

    <!-- Mobile project selector (hidden on desktop) -->
    <div class="hidden max-[1024px]:block mb-4">
      <ProjectSelector
        v-model="activeProjectId"
        :projects="projects"
        @update:model-value="onProjectChange"
      />
    </div>

    <!-- Mobile navigation (hidden on desktop) -->
    <div class="hidden max-[1024px]:flex gap-2 mb-4">
      <button
        v-for="navPage in (['dashboard', 'projects', 'help'] as AppPage[])"
        :key="navPage"
        class="rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] capitalize transition-colors"
        :class="page === navPage
          ? 'bg-accent-muted text-accent font-medium'
          : 'text-text-secondary hover:text-text-primary'"
        @click="openPage(navPage)"
      >
        {{ navPage === 'help' ? 'Help' : navPage === 'projects' ? 'Projects' : 'Dashboard' }}
      </button>
    </div>

    <template v-if="page === 'dashboard'">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Compare environment drift, identify unsafe values, and apply targeted fixes for the active project."
      />
      <KpiBar :sets="currentSets" :analysis="analysis" />
      <ComparisonCard
        :sets="currentSets"
        :analysis="analysis"
        :filtered-rows="analysis"
      />
    </template>

    <template v-else-if="page === 'projects'">
      <PageHeader
        eyebrow="Configuration"
        title="Projects"
        description="Manage project records and choose which env sets Drift loads for analysis and safe write-back."
      />
      <ProjectManagementCard :sets="currentSets" />
    </template>

    <template v-else>
      <PageHeader
        eyebrow="Guidance"
        title="Help and safety"
        description="Learn the recommended workflow and safeguards so you can change configuration with confidence."
      />
      <OnboardingGuide
        :sets="currentSets"
        :analysis="analysis"
        :active-project-name="activeProject?.name"
      />
    </template>
  </AppShell>
</template>
```

**Key changes from current App.vue:**
- Removed: `GlassCard` import and sidebar card wrapper
- Removed: Grid layout (`grid grid-cols-[280px_minmax(0,1fr)]`)
- Removed: Inline navigation buttons, "Workspace" header, "Navigate"/"Project context" labels
- Removed: Inline project name display and helper text
- Added: `SidebarPanel` in `#sidebar` slot
- Added: `onSelectProject` handler that switches project AND navigates to dashboard
- Added: Mobile fallback — `ProjectSelector` + nav buttons, hidden on desktop via `hidden max-[1024px]:block`
- Content pages wrapped in `<template>` blocks now render directly inside `<main>` (no wrapper `<section>`)
- The `space-y-5` wrapper around content pages is removed — `PageHeader` and cards handle their own spacing

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 3: Visual verification**

Run: `npm run tauri dev`
Expected:
- Sidebar appears on the left, full height, dark background with 1px border
- Projects listed as clickable rows with set count badges
- Clicking inactive project switches to it and shows Dashboard
- Clicking active project goes to Projects page
- `+` button goes to Projects page
- Dashboard and Help nav items work
- On narrow window, sidebar hides and mobile selector + nav buttons appear

**Step 4: Commit**

```bash
git add src/App.vue
git commit -m "feat: integrate SidebarPanel, replace floating card sidebar"
```

---

### Task 4: Add spacing to content pages

**Files:**
- Modify: `src/App.vue` (minor)

After Task 3, verify whether the content area pages need a `space-y-5` wrapper. The current layout has `<div class="space-y-5">` around content templates. Since we removed the grid, we may need to add this back around the content area or on individual page templates.

**Step 1: Check spacing and adjust if needed**

If the content pages are stacking without gaps, wrap the content area with spacing:

In the `<template>` section of App.vue, add `class="space-y-5"` on a wrapper `<div>` around the page content (after the mobile fallback elements), or apply it directly on individual `<template>` blocks by wrapping their contents in a `<div class="space-y-5">`.

**Step 2: Verify visually**

Run: `npm run tauri dev`
Expected: Content cards have proper vertical spacing between them

**Step 3: Commit (if changes needed)**

```bash
git add src/App.vue
git commit -m "fix: restore content spacing after sidebar layout change"
```

---

### Task 5: Clean up unused imports and dead code

**Files:**
- Modify: `src/App.vue` — remove `GlassCard` import if still present
- Check: `src/components/project/ProjectSelector.vue` — still needed for mobile fallback, keep it

**Step 1: Verify all imports in App.vue are used**

Ensure no unused imports remain after the refactor. The `GlassCard` import should be removed. `ProjectSelector` is still needed for the mobile fallback.

**Step 2: Run build**

Run: `npm run build`
Expected: Clean build, no warnings about unused imports

**Step 3: Commit**

```bash
git add src/App.vue
git commit -m "chore: remove unused imports after sidebar refactor"
```

---

### Task 6: Final verification and build

**Files:** None (verification only)

**Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Visual QA checklist**

Run: `npm run tauri dev` and verify:

- [ ] Sidebar spans full window height
- [ ] Sidebar background is darker than content area (surface-0 vs surface-base)
- [ ] 1px border separates sidebar from content
- [ ] Titlebar drag region works in both sidebar and content area
- [ ] Projects listed with folder icons and set count badges
- [ ] Active project has accent fill + accent text
- [ ] Inactive projects show secondary text, hover shows surface-2 fill
- [ ] Clicking inactive project switches + goes to Dashboard
- [ ] Clicking active project goes to Projects page
- [ ] `+` button goes to Projects page
- [ ] Dashboard nav item works with selected state
- [ ] Help nav item works with selected state
- [ ] Content area scrolls independently of sidebar
- [ ] Ambient background blobs still visible behind content
- [ ] Narrow window (<1024px) hides sidebar, shows mobile selector + nav

**Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete sidebar rework to premium Mac app style"
```
