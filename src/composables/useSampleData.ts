import type { EnvRole } from "../types";
import { useEnvSets } from "./useEnvSets";

export function useSampleData() {
  const { envSets, addOrReplaceSet } = useEnvSets();

  function loadSampleData(projectId: string) {
    addOrReplaceSet({
      projectId,
      name: ".env.local",
      role: "local",
      source: "manual",
      rawText: [
        "APP_NAME=Laravel",
        "APP_ENV=local",
        "APP_KEY=base64:localkey",
        "APP_DEBUG=true",
        "APP_URL=http://localhost",
        "DB_PASSWORD=localpass",
        "QUEUE_CONNECTION=sync",
        "MAIL_MAILER=log",
        "LOG_LEVEL=debug",
      ].join("\n"),
    });

    addOrReplaceSet({
      projectId,
      name: ".env.staging",
      role: "staging",
      source: "manual",
      rawText: [
        "APP_NAME=Laravel",
        "APP_ENV=staging",
        "APP_KEY=base64:stagingkey",
        "APP_DEBUG=false",
        "APP_URL=https://staging.example.com",
        "DB_PASSWORD=stagingpass",
        "QUEUE_CONNECTION=database",
        "MAIL_MAILER=smtp",
        "LOG_LEVEL=info",
      ].join("\n"),
    });

    addOrReplaceSet({
      projectId,
      name: ".env.production",
      role: "live",
      source: "manual",
      rawText: [
        "APP_NAME=Laravel",
        "APP_ENV=production",
        "APP_KEY=",
        "APP_DEBUG=true",
        "APP_URL=http://example.com",
        "QUEUE_CONNECTION=sync",
        "MAIL_MAILER=log",
        "LOG_LEVEL=debug",
      ].join("\n"),
    });
  }

  function createBaselineSets(projectId: string): number {
    const templates: Array<{ name: string; role: EnvRole; content: string }> = [
      {
        name: ".env.local",
        role: "local",
        content: [
          "APP_NAME=Laravel",
          "APP_ENV=local",
          "APP_KEY=",
          "APP_DEBUG=true",
          "APP_URL=http://localhost",
          "DB_PASSWORD=",
          "QUEUE_CONNECTION=sync",
          "MAIL_MAILER=log",
          "LOG_LEVEL=debug",
        ].join("\n"),
      },
      {
        name: ".env.staging",
        role: "staging",
        content: [
          "APP_NAME=Laravel",
          "APP_ENV=staging",
          "APP_KEY=",
          "APP_DEBUG=false",
          "APP_URL=https://staging.example.com",
          "DB_PASSWORD=",
          "QUEUE_CONNECTION=database",
          "MAIL_MAILER=smtp",
          "LOG_LEVEL=info",
        ].join("\n"),
      },
      {
        name: ".env.production",
        role: "live",
        content: [
          "APP_NAME=Laravel",
          "APP_ENV=production",
          "APP_KEY=",
          "APP_DEBUG=false",
          "APP_URL=https://example.com",
          "DB_PASSWORD=",
          "QUEUE_CONNECTION=database",
          "MAIL_MAILER=smtp",
          "LOG_LEVEL=warning",
        ].join("\n"),
      },
    ];

    let created = 0;

    for (const template of templates) {
      const exists = envSets.value.some(
        (s) => s.projectId === projectId && s.role === template.role,
      );
      if (exists) continue;

      addOrReplaceSet({
        projectId,
        name: template.name,
        role: template.role,
        source: "manual",
        rawText: template.content,
      });
      created += 1;
    }

    return created;
  }

  return { loadSampleData, createBaselineSets };
}
