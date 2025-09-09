import * as fs from "node:fs";
import * as path from "node:path";

import { createRequestListener } from "@remix-run/node-fetch-server";
import { RsbuildPlugin } from "@rsbuild/core";

/**
 * Dev server plugin that enables a cloudflare workers style fetch handler
 * for the specified environment.
 *
 * Also serves static files out of the specified public directory if provided
 * because it overrides the default static file handling.
 */
export function pluginFetchServer({
  entry = "index",
  env,
  publicDir,
}: {
  entry?: string;
  env: string;
  publicDir?: string;
}): RsbuildPlugin {
  return {
    name: "node-server",
    setup(api) {
      api.modifyRsbuildConfig((config) => {
        config.dev = {
          ...config.dev,
          setupMiddlewares: async (middlewares, context) => {
            const { environments } = context;

            middlewares.unshift(async (req, res, next) => {
              if (req.url?.startsWith("/static/")) {
                return next();
              }
              if ((req.url?.length ?? 0) > 2 && publicDir) {
                try {
                  const sandboxDir = path.resolve(publicDir);
                  const filePath = path.resolve(publicDir, req.url!.slice(1));
                  if (
                    filePath.startsWith(sandboxDir) &&
                    fs.existsSync(filePath)
                  ) {
                    const express = await import("express");
                    express.static(sandboxDir)(req, res as any, next);
                    return;
                  }
                } catch {}
              }

              try {
                type FetchFunction = (request: Request) => Promise<Response>;
                const bundle = await environments[env].loadBundle<
                  | { default: { fetch: FetchFunction } }
                  | { fetch: FetchFunction }
                  | { handler: FetchFunction }
                >(entry);

                let handler: FetchFunction;
                if (
                  "default" in bundle &&
                  typeof bundle.default?.fetch === "function"
                ) {
                  handler = bundle.default.fetch;
                } else if (
                  "fetch" in bundle &&
                  typeof bundle.fetch === "function"
                ) {
                  handler = bundle.fetch;
                } else if (
                  "handler" in bundle &&
                  typeof bundle.handler === "function"
                ) {
                  handler = bundle.handler;
                } else {
                  throw new Error("No fetch handler found in bundle");
                }

                createRequestListener(handler)(req, res);
              } catch (error) {
                next(error);
              }
            });
          },
        };
      });
    },
  };
}
