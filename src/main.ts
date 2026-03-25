import { createApp } from "vue";
import { useTheme } from "@stuntrocket/ui";
import App from "./App.vue";
import "./styles/main.css";

// Initialise theme on app load (applies .dark class based on persisted preference)
useTheme({ storageKey: "drift-theme-mode" });

createApp(App).mount("#app");
