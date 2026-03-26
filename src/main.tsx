import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Remove Lovable watermark badge if injected into the DOM
const removeLovableBadge = () => {
  const selectors = [
    '[data-lovable-badge]',
    '.lovable-badge',
    '#lovable-badge',
    'a[href*="lovable.dev"][target="_blank"]',
  ];
  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  });
};

const observer = new MutationObserver(removeLovableBadge);
observer.observe(document.body, { childList: true, subtree: true });
removeLovableBadge();

createRoot(document.getElementById("root")!).render(<App />);
