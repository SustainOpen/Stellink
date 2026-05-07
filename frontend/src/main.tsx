import { Buffer } from "buffer";
// Stellar SDK occasionally pokes at Buffer in browser builds.
window.Buffer = Buffer;

import "./index.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
