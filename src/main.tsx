import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The SDK's theme, components and markdown, then Command Center AI's, then the application's own.
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
import "@dev-mainsequence/command-center-ai/styles.css";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
