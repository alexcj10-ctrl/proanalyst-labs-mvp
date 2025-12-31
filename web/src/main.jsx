import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("No se encontró el elemento #root en index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
