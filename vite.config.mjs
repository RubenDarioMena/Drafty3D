import { defineConfig } from "vite";

export default defineConfig({
  root: "cad",
  base: "/cad/",
  cacheDir: "../node_modules/.vite-cad",
  assetsInclude: ["**/*.wasm"],
  build: {
    outDir: "../dist/cad",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["opencascade.js"], include: ["three", "three/addons/controls/OrbitControls.js", "three/addons/controls/TransformControls.js", "three/addons/lines/Line2.js", "three/addons/lines/LineGeometry.js", "three/addons/lines/LineMaterial.js"] },
});
