import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Remove Lovable watermark badge if injected into the DOM
const removeLovableBadge = () => {
  const el = document.getElementById("lovable-badge");
  if (el) el.remove();
};

const observer = new MutationObserver(removeLovableBadge);
observer.observe(document.body, { childList: true, subtree: true });
removeLovableBadge();

createRoot(document.getElementById("root")!).render(<App />);
