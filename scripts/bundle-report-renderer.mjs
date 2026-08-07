// Pre-bundles api/_reportRendererEntry.tsx into a single flat ESM file with
// everything under src/ inlined (path alias resolved, no relative imports
// left) -- see the comment in that entry file for why this is necessary.
// Runs as part of "vercel-build" before Vercel's own function build sees api/.
import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

await esbuild.build({
  entryPoints: [path.join(root, "api/_reportRendererEntry.tsx")],
  outfile: path.join(root, "api/_reportRenderer.generated.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  jsx: "automatic",
  external: ["react", "react-dom", "react-dom/server", "lucide-react", "framer-motion"],
  alias: { "@": path.join(root, "src") },
  logLevel: "info",
});

console.log("Bundled report renderer -> api/_reportRenderer.generated.mjs");
