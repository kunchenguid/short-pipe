import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@design/tokens/colors_and_type.css";
import "./styles/app.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
