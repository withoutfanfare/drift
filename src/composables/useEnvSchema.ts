import { ref, computed } from "vue";
import type {
  SchemaVariable,
  SchemaValidationIssue,
} from "../types";
import {
  readEnvSchema,
  validateEnvAgainstSchema,
  generateEnvSchema,
  writeEnvSchema,
} from "./useTauriCommands";
import { useProjects } from "./useProjects";

const schema = ref<Record<string, SchemaVariable>>({});
const schemaLoaded = ref(false);
const schemaIssues = ref<SchemaValidationIssue[]>([]);

export function useEnvSchema() {
  const { activeProject } = useProjects();

  const hasSchema = computed(() => Object.keys(schema.value).length > 0);

  const schemaErrorCount = computed(
    () => schemaIssues.value.filter((i) => i.severity === "error").length,
  );

  const schemaWarningCount = computed(
    () => schemaIssues.value.filter((i) => i.severity === "warning").length,
  );

  async function loadSchema() {
    const project = activeProject.value;
    if (!project) {
      schema.value = {};
      schemaLoaded.value = false;
      return;
    }

    try {
      const result = await readEnvSchema(project.rootPath);
      schema.value = result.variables;
      schemaLoaded.value = true;
    } catch {
      schema.value = {};
      schemaLoaded.value = false;
    }
  }

  async function validateValues(values: Record<string, string>) {
    if (!hasSchema.value) {
      schemaIssues.value = [];
      return [];
    }

    try {
      const issues = await validateEnvAgainstSchema(values, schema.value);
      schemaIssues.value = issues;
      return issues;
    } catch {
      schemaIssues.value = [];
      return [];
    }
  }

  async function generateSchema(values: Record<string, string>) {
    const project = activeProject.value;
    if (!project) return null;

    try {
      const content = await generateEnvSchema(values);
      await writeEnvSchema(project.rootPath, content);
      await loadSchema();
      return content;
    } catch {
      return null;
    }
  }

  function getSchemaForKey(key: string): SchemaVariable | undefined {
    return schema.value[key];
  }

  function getIssuesForKey(key: string): SchemaValidationIssue[] {
    return schemaIssues.value.filter((i) => i.key === key);
  }

  return {
    schema,
    schemaLoaded,
    schemaIssues,
    hasSchema,
    schemaErrorCount,
    schemaWarningCount,
    loadSchema,
    validateValues,
    generateSchema,
    getSchemaForKey,
    getIssuesForKey,
  };
}
