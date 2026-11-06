import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Injects a browser-native importmap that maps @mysten/sui to esm.sh.
 * dapp-kit and other @mysten/* helpers are bundled; only the heavy
 * @mysten/sui SDK is loaded from the CDN at runtime.
 */
function importMapPlugin(): Plugin {
  const map = JSON.stringify(
    {
      imports: {
        // Pin to the version installed locally so runtime matches TypeScript types.
        // subpath imports like @mysten/sui/keypairs/ed25519 → trailing slash
        "@mysten/sui": "https://esm.sh/@mysten/sui@2.18.0",
        "@mysten/sui/": "https://esm.sh/@mysten/sui@2.18.0/",
      },
    },
    null,
    2
  );
  return {
    name: "antroph-import-map",
    transformIndexHtml(html) {
      // Inject importmap BEFORE any other scripts so the browser honours it
      return html.replace(
        "<head>",
        `<head>\n    <script type="importmap">${map}</script>`
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), importMapPlugin()],
  envDir: "..",
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    rollupOptions: {
      // Keep the heavy @mysten/sui SDK external and resolve it via the importmap.
      // Bundle dapp-kit and other @mysten/* helpers so they don't need CDN entries.
      external: (id: string) =>
        id === "@mysten/sui" || id.startsWith("@mysten/sui/"),
    },
  },
});
