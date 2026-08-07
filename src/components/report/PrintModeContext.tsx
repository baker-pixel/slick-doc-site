import { createContext, useContext } from "react";

// When true, sections render already-revealed instead of animating in on
// scroll (framer-motion's whileInView never fires during a one-shot
// server-side PDF render -- there's no real viewport scrolling through it).
const PrintModeContext = createContext(false);

export function usePrintMode(): boolean {
  return useContext(PrintModeContext);
}

export const PrintModeProvider = PrintModeContext.Provider;
