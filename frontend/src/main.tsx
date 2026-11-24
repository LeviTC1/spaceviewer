// Entry for bootstrapping React and global styles.
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/theme.css";
import "./styles/globals.css";
import "./styles/linear-overrides.css";
import "./shell/shell.css";
import "./shell/surfaces.css";
import { applyReduceMotion } from "./shell/preferences";

applyReduceMotion();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
