import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

import { pluginReactServer } from "./plugin/react-server.ts";
import { pluginFetchServer } from "./plugin/fetch-server.ts";

export default defineConfig({
  environments: {
    web: {
      source: {
        entry: {
          index: {
            import: "./src/entry.web.tsx",
            layer: "react-client",
            html: false,
          },
        },
      },
      output: {
        target: "web",
        minify: false,
        distPath: {
          root: "dist/web",
        },
      },
    },
    node: {
      source: {
        entry: {
          index: { import: "./src/entry.node.tsx", layer: "react-client" },
        },
      },
      output: {
        target: "node",
        minify: false,
        module: true,
        distPath: {
          root: "dist/node",
        },
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
