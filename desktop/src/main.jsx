import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { createWorkspaceRepository } from "./shared/storage/index.js";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Jakal Workspace root element was not found.");
}

const workspaceRepository = createWorkspaceRepository();

createRoot(rootElement).render(
  <React.StrictMode>
    <App repository={workspaceRepository} />
  </React.StrictMode>,
);
