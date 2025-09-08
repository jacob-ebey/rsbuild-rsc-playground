import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

import { pluginReactServer } from "./plugin/react-server.ts";
import { pluginFetchServer } from "./plugin/fetch-server.ts";

export default defineConfig({
  environments: {
    web: {
      source: {
        entry: {
          index: { import: "./src/entry.web.tsx", html: false },
        },
      },
      output: {
        target: "web",
        distPath: {
          root: "dist/web",
        },
      },
    },
    node: {
      source: {
        entry: {
          index: { import: "./src/entry.node.tsx" },
        },
      },
      output: {
        target: "node",
        module: true,
        distPath: {
          root: "dist/node",
        },
        externals: ["react-markdown"],
      },
    },
  },
  plugins: [
    pluginReact(),
    pluginReactServer({
      environments: { client: "web", ssr: "node", server: "node" },
    }),
    pluginFetchServer({ env: "node", publicDir: "public" }),
  ],
});
