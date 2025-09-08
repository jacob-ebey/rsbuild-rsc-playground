import * as fs from "node:fs";
import * as path from "node:path";

import type { RsbuildPlugin } from "@rsbuild/core";
import type { Compiler, Stats } from "@rspack/core";
import { parseSync } from "oxc-parser";

import { transformDirectiveProxyExport } from "./transforms/proxy-export.ts";
import { addResourceToCompilation } from "./utils/webpack.ts";

const PLUGIN_NAME = "PluginReactServer";

type EnvironmentsConfig = {
  client: string;
  ssr: string;
  server: string;
};

export function pluginReactServer({
  environments,
  layer = "react-server",
}: {
  environments: EnvironmentsConfig;
  layer?: string;
}) {
  return {
    name: PLUGIN_NAME,
    setup(api) {
      const needsRebuild = new Map<string, number>();

      const resolvers = new Map<
        string,
        {
          stats: PromiseWithResolvers<Stats>;
        }
      >();

      const clientReferencesMap = new Map();
      const waitForStartResolvers = {
        [environments.client]: Promise.withResolvers<void>(),
        [environments.ssr]: Promise.withResolvers<void>(),
        [environments.server]: Promise.withResolvers<void>(),
      };

      api.onBeforeEnvironmentCompile(({ environment }) => {
        resolvers.set(environment.name, {
          stats: Promise.withResolvers(),
        });
      });

      api.onAfterEnvironmentCompile(async ({ environment, stats }) => {
        if (!stats.compilation.needAdditionalPass) {
          const promise = resolvers.get(environment.name);
          if (!promise) throw new Error("Promise not found");
          promise.stats.resolve(stats);
        }
      });

      api.processAssets(
        { stage: "optimize", environments: [environments.server] },
        async ({ compilation }) => {
          const { compiler, name } = compilation;
          if (!name) throw new Error("Compilation name is undefined");

          const {
            sources: { RawSource },
          } = compiler.rspack;

          const { [name]: _, ...waitForStart } = waitForStartResolvers;
          await Promise.all(Object.values(waitForStart).map((r) => r.promise));

          const { [name]: __, ...waitForMake } = makePromises;
          await Promise.all(Object.values(waitForMake));

          if (!needsRebuild.get(compilation.name)) {
            const statsObj = await resolvers.get(environments.client).stats
              .promise;
            const stats = statsObj.toJson();

            const collectChunks = (
              chunks: (string | number)[],
              result: Set<string> = new Set(),
              seen: Set<string> = new Set(),
              recurse = true
            ) => {
              if (!chunks) return result;
              for (const chunkId of chunks) {
                if (seen.has(String(chunkId))) continue;
                seen.add(String(chunkId));

                const chunk = stats.chunks?.find((c) => c.id == chunkId);
                if (chunk && chunk.files) {
                  for (const file of chunk.files) {
                    if (file.endsWith(".js") || file.endsWith(".mjs")) {
                      result.add(`${stats.publicPath || "/"}${file}`);
                    }
                  }
                }
                if (recurse && chunk && chunk.siblings) {
                  collectChunks(chunk.siblings, result, seen, false);
                }
              }
              return result;
            };

            const reactServerManifest: Record<
              string,
              {
                id: string | number;
                chunks: string[];
                name: string;
                async: boolean;
              }
            > = {};

            for (const [resource, clientReference] of clientReferencesMap) {
              const mod = stats.modules?.find(
                (mod) => mod.nameForCondition === resource
              );
              if (!mod) {
                throw new Error(
                  `Could not find client module for resource ${resource}`
                );
              }
              const chunks = Array.from(collectChunks(mod.chunks));

              for (const exportName of clientReference.exportNames) {
                reactServerManifest[`${clientReference.id}#${exportName}`] = {
                  id: mod.id,
                  name: exportName,
                  async: true,
                  chunks,
                };
              }
            }

            for (const chunk of compilation.chunks) {
              for (const file of chunk.files) {
                compilation.updateAsset(file, (asset) => {
                  const source = asset.source();
                  if (
                    typeof source !== "string" ||
                    !source.match(/\b___REACT_SERVER_MANIFEST___\b/g)
                  ) {
                    return asset;
                  }

                  return new RawSource(
                    source.replace(
                      /\b___REACT_SERVER_MANIFEST___\b/g,
                      JSON.stringify(reactServerManifest)
                    )
                  );
                });
              }
            }
          }
        }
      );

      api.processAssets(
        { stage: "optimize", environments: [environments.ssr] },
        async ({ compilation }) => {
          const { compiler, name } = compilation;
          if (!name) throw new Error("Compilation name is undefined");

          const {
            sources: { RawSource },
          } = compiler.rspack;

          const { [name]: _, ...waitForStart } = waitForStartResolvers;
          await Promise.all(Object.values(waitForStart).map((r) => r.promise));

          const { [name]: __, ...waitForMake } = makePromises;
          await Promise.all(Object.values(waitForMake));

          if (!needsRebuild.get(compilation.name)) {
            const clientStatsObj = await resolvers.get(environments.client)
              .stats.promise;
            const clientStats = clientStatsObj.toJson();

            const ssrStatsObj = compilation.getStats();
            const ssrStats = ssrStatsObj.toJson();

            const collectChunks = (
              chunks: (string | number)[],
              result: Set<string> = new Set(),
              seen: Set<string> = new Set(),
              recurse = true
            ) => {
              if (!chunks) return result;
              for (const chunkId of chunks) {
                if (seen.has(String(chunkId))) continue;
                seen.add(String(chunkId));

                const chunk = ssrStats.chunks?.find((c) => c.id == chunkId);
                if (chunk && chunk.files) {
                  for (const file of chunk.files) {
                    if (file.endsWith(".js") || file.endsWith(".mjs")) {
                      result.add(`./${file}`);
                    }
                  }
                }
                if (recurse && chunk && chunk.siblings) {
                  collectChunks(chunk.siblings, result, seen, false);
                }
              }
              return result;
            };

            const entrypoints = Object.values(clientStats.entrypoints ?? {});
            if (entrypoints.length === 0 || entrypoints.length > 1) {
              throw new Error(
                `Expected exactly one client entrypoint, got ${entrypoints.length}`
              );
            }
            const reactBootstrapScripts = entrypoints[0].assets
              .map((asset) => `${clientStats.publicPath || "/"}${asset.name}`)
              .filter(
                (asset) => asset.endsWith(".js") || asset.endsWith(".mjs")
              );

            const reactSsrManifest = {
              moduleMap: {},
              serverModuleMap: {},
              moduleLoading: {},
            };

            for (const [resource, clientReference] of clientReferencesMap) {
              const clientMod = clientStats.modules?.find(
                (mod) => mod.nameForCondition === resource
              );
              if (!clientMod) {
                throw new Error(
                  `Could not find client module for resource ${resource}`
                );
              }

              const mod = ssrStats.modules?.find(
                (mod) => mod.id && mod.nameForCondition === resource
              );
              if (!mod) {
                throw new Error(
                  `Could not find ssr module for resource ${resource}`
                );
              }

              const chunks = Array.from(collectChunks(mod.chunks));

              reactSsrManifest.moduleMap[clientMod.id] ??= {};
              for (const name of clientReference.exportNames) {
                reactSsrManifest.moduleMap[clientMod.id][name] = {
                  id: mod.id,
                  chunks,
                  name,
                  async: true,
                };
              }
            }

            for (const chunk of compilation.chunks) {
              for (const file of chunk.files) {
                compilation.updateAsset(file, (asset) => {
                  const source = asset.source();
                  if (typeof source !== "string") {
                    return asset;
                  }

                  return new RawSource(
                    source
                      .replace(
                        /\b___REACT_SSR_MANIFEST___\b/g,
                        JSON.stringify(reactSsrManifest)
                      )
                      .replace(
                        /\b___REACT_BOOTSTRAP_SCRIPTS___\b/g,
                        JSON.stringify(reactBootstrapScripts)
                      )
                  );
                });
              }
            }
          }
        }
      );

      api.transform(
        { environments: [environments.server], issuerLayer: layer },
        ({ code, resourcePath }) => {
          const { program } = parseSync(resourcePath, code);

          const result = transformDirectiveProxyExport(program as any, {
            directive: "use client",
            code,
            runtime: (name, meta) => {
              let proxyValue =
                `() => { throw new Error("Unexpectedly client reference export '" + ` +
                JSON.stringify(name) +
                ` + "' is called on server") }`;
              if (meta?.value) {
                proxyValue = `(${meta.value})`;
              }

              const root = path.resolve(
                api.getRsbuildConfig().root || process.cwd()
              );
              const id = path
                .relative(root, resourcePath)
                .replaceAll("\\", "/");

              return (
                `___ReactServer___.registerClientReference(` +
                `  ${proxyValue},` +
                `  ${JSON.stringify(id)},` +
                `  ${JSON.stringify(name)})`
              );
            },
          });

          if (!result) return code;

          const { output, exportNames } = result;

          const root = path.resolve(
            api.getRsbuildConfig().root || process.cwd()
          );
          const id = path.relative(root, resourcePath).replaceAll("\\", "/");

          clientReferencesMap.set(resourcePath, {
            id,
            exportNames,
          });

          output.prepend(
            `import ___ReactServer___ from "react-server-dom-webpack/server";\n`
          );

          return {
            code: output.toString(),
            map: output.generateMap(),
          };
        }
      );

      api.modifyEnvironmentConfig(
        (config, { mergeEnvironmentConfig, name }) => {
          if (environments.server === name) {
            return mergeEnvironmentConfig(config, {
              tools: {
                rspack: {
                  experiments: {
                    layers: true,
                  },
                  module: {
                    rules: [
                      {
                        with: { env: "react-server" },
                        layer,
                        resolve: {
                          conditionNames: ["react-server", "webpack", "..."],
                        },
                      },
                      {
                        issuerLayer: layer,
                        resolve: {
                          conditionNames: ["react-server", "webpack", "..."],
                        },
                      },
                    ],
                  },
                },
              },
            });
          }
        }
      );

      const makePromises: Record<string, Promise<void>> = Object.fromEntries(
        Object.entries(waitForStartResolvers).map(([key, value]) => [
          key,
          value.promise,
        ])
      );
      api.modifyRspackConfig((config, { appendPlugins }) => {
        config.optimization = {
          ...config.optimization,
          runtimeChunk: "single",
        };
        appendPlugins({
          apply(compiler: Compiler) {
            const { Compilation } = compiler.rspack;

            compiler.hooks.shouldEmit.tap(PLUGIN_NAME, (compilation) => {
              const { name } = compilation;
              if (!name) throw new Error("Compilation name is undefined");
              return !(needsRebuild.get(name) > 0);
            });

            compiler.hooks.finishMake.tapPromise(
              PLUGIN_NAME,
              async (compilation) => {
                const { name } = compilation;
                if (!name) throw new Error("Compilation name is undefined");

                const promiseWithResolvers = Promise.withResolvers<void>();
                let promise = (makePromises[name] = makePromises[name].then(
                  () =>
                    promiseWithResolvers.promise.then(() =>
                      makePromises[name] !== promise
                        ? makePromises[name]
                        : undefined
                    )
                ));

                const startClientReferenceCount = clientReferencesMap.size;

                //////////////////////////////////////////////////////
                if (
                  environments.client === compilation.name ||
                  environments.ssr === compilation.name
                ) {
                  await Promise.all(
                    clientReferencesMap
                      .keys()
                      .map((resource) =>
                        addResourceToCompilation(
                          compilation,
                          resource,
                          "client"
                        )
                      )
                  );
                }
                //////////////////////////////////////////////////////

                waitForStartResolvers[name]?.resolve();
                promiseWithResolvers.resolve();
                const { [name]: _, ...rest } = makePromises;
                await Promise.all(Object.values(rest));

                if (startClientReferenceCount !== clientReferencesMap.size) {
                  needsRebuild.set(
                    environments.client,
                    (needsRebuild.get(environments.client) ?? 0) + 1
                  );
                  if (environments.ssr !== environments.server) {
                    needsRebuild.set(
                      environments.ssr,
                      (needsRebuild.get(environments.ssr) ?? 0) + 1
                    );
                  }
                }
              }
            );

            compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
              const { name } = compilation;
              if (!name) throw new Error("Compilation name is undefined");

              compilation.hooks.needAdditionalPass.tap(PLUGIN_NAME, () => {
                const needsAdditionalPass = needsRebuild.get(compilation.name);
                needsRebuild.set(
                  compilation.name,
                  needsAdditionalPass > 0 ? needsAdditionalPass - 1 : 0
                );
                return Boolean(needsAdditionalPass);
              });
            });
          },
        });
      });
    },
  } satisfies RsbuildPlugin;
}
