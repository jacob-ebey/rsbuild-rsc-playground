import * as path from "node:path";

import type { RsbuildPlugin } from "@rsbuild/core";
import type { Compiler, Stats } from "@rspack/core";
import { parseSync } from "oxc-parser";

import {
  hasDirective,
  transformDirectiveProxyExport,
  transformServerActionServer,
  transformWrapExport,
} from "@vitejs/plugin-rsc/transforms";

import { addResourceToCompilation } from "./utils/webpack.ts";

const PLUGIN_NAME = "PluginReactServer";

type EnvironmentsConfig = Record<
  "client" | "ssr" | "server",
  string | { name: string; layer?: string }
>;

type ClientReference = {
  id: string;
  exportNames: string[];
};

type ServerReference = {
  id: string;
  exportNames: string[];
};

export function pluginReactServer({
  enableEncryption,
  environments: _environments,
}: {
  environments: EnvironmentsConfig;
  enableEncryption?: boolean;
}) {
  if (enableEncryption) {
    throw new Error("enableEncryption is not supported yet");
  }

  const environments = Object.fromEntries(
    Object.entries(_environments).map(([key, value]) => {
      const defaultLayer = key === "server" ? "react-server" : "react-client";
      return typeof value === "object"
        ? [key, { ...value, layer: value.layer || defaultLayer }]
        : [key, { name: value, layer: defaultLayer }];
    })
  ) as Record<"client" | "ssr" | "server", { name: string; layer?: string }>;

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

      const clientReferencesMap = new Map<string, ClientReference>();
      const serverReferencesMap = new Map<string, ServerReference>();
      const waitForStartResolvers = {
        [environments.client.name]: Promise.withResolvers<void>(),
        [environments.ssr.name]: Promise.withResolvers<void>(),
        [environments.server.name]: Promise.withResolvers<void>(),
      };

      api.onBeforeEnvironmentCompile(({ environment }) => {
        resolvers.set(environment.name, {
          stats: Promise.withResolvers(),
        });
      });

      api.onAfterEnvironmentCompile(async ({ environment, stats }) => {
        if (!stats) throw new Error("Stats is undefined");

        if (!stats.compilation.needAdditionalPass) {
          const promise = resolvers.get(environment.name);
          if (!promise) throw new Error("Promise not found");
          promise.stats.resolve(stats);
        }
      });

      api.processAssets(
        { stage: "optimize", environments: [environments.server.name] },
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

          if (!needsRebuild.get(name)) {
            const clientStatsObj = await resolvers.get(
              environments.client.name
            )!.stats.promise;
            const clientStats = clientStatsObj.toJson({
              assets: true,
              chunks: true,
              modules: true,
            });

            const collectClientChunks = (
              chunks: (string | number)[] | undefined,
              result: Set<string> = new Set(),
              seen: Set<string> = new Set(),
              recurse = true
            ) => {
              if (!chunks) return result;
              for (const chunkId of chunks) {
                if (seen.has(String(chunkId))) continue;
                seen.add(String(chunkId));

                const chunk = clientStats.chunks?.find((c) => c.id == chunkId);
                if (chunk && chunk.files) {
                  for (const file of chunk.files) {
                    if (file.endsWith(".js") || file.endsWith(".mjs")) {
                      result.add(`${clientStats.publicPath || "/"}${file}`);
                    }
                  }
                }
                if (recurse && chunk && chunk.siblings) {
                  collectClientChunks(chunk.siblings, result, seen, false);
                }
              }
              return result;
            };

            const reactClientManifest: Record<
              string,
              {
                id: string | number;
                chunks: string[];
                name: string;
                async: boolean;
              }
            > = {};

            for (const [resource, clientReference] of clientReferencesMap) {
              const mod = clientStats.modules?.find(
                (mod) =>
                  (typeof mod.id === "number" || typeof mod.id === "string") &&
                  mod.layer === environments.client.layer &&
                  mod.nameForCondition === resource
              );
              if (!mod) {
                throw new Error(
                  `Could not find client module for resource ${resource}`
                );
              }

              const chunks = Array.from(collectClientChunks(mod.chunks));

              for (const exportName of clientReference.exportNames) {
                reactClientManifest[`${clientReference.id}#${exportName}`] = {
                  id: mod.id!,
                  name: exportName,
                  async: true,
                  chunks,
                };
              }
            }

            const serverStatsObj = compilation.getStats();
            const serverStats = serverStatsObj.toJson();

            const collectServerChunks = (
              chunks: (string | number)[] | undefined,
              result: Set<string> = new Set(),
              seen: Set<string> = new Set(),
              recurse = true
            ) => {
              if (!chunks) return result;
              for (const chunkId of chunks) {
                if (seen.has(String(chunkId))) continue;
                seen.add(String(chunkId));

                const chunk = serverStats.chunks?.find((c) => c.id == chunkId);
                if (chunk && chunk.files) {
                  for (const file of chunk.files) {
                    if (file.endsWith(".js") || file.endsWith(".mjs")) {
                      result.add(`${serverStats.publicPath || "/"}${file}`);
                    }
                  }
                }
                if (recurse && chunk && chunk.siblings) {
                  collectServerChunks(chunk.siblings, result, seen, false);
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

            for (const [resource, serverReference] of serverReferencesMap) {
              const mod = serverStats.modules?.find(
                (mod) =>
                  (typeof mod.id === "number" || typeof mod.id === "string") &&
                  mod.layer === environments.server.layer &&
                  mod.nameForCondition === resource
              );
              if (!mod) {
                throw new Error(
                  `Could not find server module for resource ${resource}`
                );
              }

              // const chunks = Array.from(collectServerChunks(mod.chunks));

              for (const exportName of serverReference.exportNames) {
                reactServerManifest[`${serverReference.id}#${exportName}`] = {
                  id: mod.id!,
                  name: exportName,
                  async: true,
                  chunks: [],
                };
              }
            }

            const allCssFiles: string[] = [];
            for (const asset of clientStats.assets ?? []) {
              if (asset.name.endsWith(".css")) {
                allCssFiles.push(
                  `${clientStats.publicPath || "/"}${asset.name}`
                );
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
                        /\b___REACT_CLIENT_MANIFEST___\b/g,
                        JSON.stringify(reactClientManifest)
                      )
                      .replace(
                        /\b___REACT_SERVER_MANIFEST___\b/g,
                        JSON.stringify(reactServerManifest)
                      )
                      .replace(
                        /\b___REACT_CSS_MANIFEST___\b/g,
                        `(new Proxy({}, {
                          get() {
                            return ${JSON.stringify(allCssFiles)};
                          }
                        }))`
                      )
                  );
                });
              }
            }
          }
        }
      );

      api.processAssets(
        { stage: "optimize", environments: [environments.ssr.name] },
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

          if (!needsRebuild.get(name)) {
            const clientStatsObj = await resolvers.get(
              environments.client.name
            )!.stats.promise;
            const clientStats = clientStatsObj.toJson({
              chunks: true,
              modules: true,
            });

            const ssrStatsObj = compilation.getStats();
            const ssrStats = ssrStatsObj.toJson({
              chunks: true,
              modules: true,
            });

            const collectSsrChunks = (
              chunks: (string | number)[] | undefined,
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
                  collectSsrChunks(chunk.siblings, result, seen, false);
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
              ?.map((asset) => `${clientStats.publicPath || "/"}${asset.name}`)
              .filter(
                (asset) => asset.endsWith(".js") || asset.endsWith(".mjs")
              );

            const reactSsrManifest = {
              moduleMap: {} as Record<
                ClientReference["id"],
                Record<
                  string,
                  {
                    id: string | number;
                    chunks: string[];
                    name: string;
                    async: boolean;
                  }
                >
              >,
              // serverModuleMap: {},
              moduleLoading: {},
            };

            for (const [resource, clientReference] of clientReferencesMap) {
              const clientMod = clientStats.modules?.find(
                (mod) =>
                  (typeof mod.id === "number" || typeof mod.id === "string") &&
                  mod.layer === environments.client.layer &&
                  mod.nameForCondition === resource
              );
              if (!clientMod) {
                throw new Error(
                  `Could not find client module for resource ${resource}`
                );
              }

              const mod = ssrStats.modules?.find(
                (mod) =>
                  (typeof mod.id === "number" || typeof mod.id === "string") &&
                  mod.layer === environments.ssr.layer &&
                  mod.nameForCondition === resource
              );
              if (!mod) {
                throw new Error(
                  `Could not find ssr module for resource ${resource}`
                );
              }

              // const chunks = Array.from(collectSsrChunks(mod.chunks));

              reactSsrManifest.moduleMap[clientMod.id!] ??= {};
              for (const name of clientReference.exportNames) {
                reactSsrManifest.moduleMap[clientMod.id!][name] = {
                  id: mod.id!,
                  chunks: [],
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
        {
          environments: [environments.server.name],
          layer: environments.server.layer,
        },
        ({ code, resourcePath, environment }) => {
          const { program } = parseSync(resourcePath, code);

          if (
            hasDirective(program.body as any, "use client") ||
            environment.name !== environments.server.name
          ) {
            return code;
          }

          const root = path.resolve(
            api.getRsbuildConfig().root || process.cwd()
          );
          const id = path.relative(root, resourcePath).replaceAll("\\", "/");

          const serverCssTransformResult = transformWrapExport(
            code,
            program as any,
            {
              filter: (name, meta) => {
                return !!meta.isFunction && name[0] === name[0].toUpperCase();
              },
              ignoreExportAllDeclaration: true,
              runtime: (value) =>
                `___ReactServer___.wrapCss(${JSON.stringify(id)}, ${value})`,
            }
          );

          if (!serverCssTransformResult.output.hasChanged()) {
            return code;
          }

          if (!code.includes("___ReactServer___")) {
            serverCssTransformResult.output.prepend(
              `import * as ___ReactServer___ from "react-server-dom-rsbuild/server" with { env: "react-server" };\n`
            );
          }

          return {
            code: serverCssTransformResult.output.toString(),
            map: serverCssTransformResult.output.generateMap(),
          };
        }
      );

      api.transform(
        {
          environments: [environments.server.name],
          issuerLayer: environments.server.layer,
          layer: environments.server.layer,
        },
        ({ code, resourcePath }) => {
          const { program } = parseSync(resourcePath, code);

          const root = path.resolve(
            api.getRsbuildConfig().root || process.cwd()
          );
          const id = path.relative(root, resourcePath).replaceAll("\\", "/");

          const useClientTransformResult = transformDirectiveProxyExport(
            program as any,
            {
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

                return (
                  `___ReactServer___.registerClientReference(` +
                  `  ${proxyValue},` +
                  `  ${JSON.stringify(id)},` +
                  `  ${JSON.stringify(name)})`
                );
              },
            }
          );

          const useServerTransformResult = transformServerActionServer(
            code,
            program as any,
            {
              runtime: (value, name) => {
                const root = path.resolve(
                  api.getRsbuildConfig().root || process.cwd()
                );
                const id = path
                  .relative(root, resourcePath)
                  .replaceAll("\\", "/");

                return `___ReactServer___.registerServerReference(${value}, ${JSON.stringify(
                  id
                )}, ${JSON.stringify(name)})`;
              },
              rejectNonAsyncFunction: true,
              encode: enableEncryption
                ? (value) =>
                    `__vite_rsc_encryption_runtime.encryptActionBoundArgs(${value})`
                : undefined,
              decode: enableEncryption
                ? (value) =>
                    `await __vite_rsc_encryption_runtime.decryptActionBoundArgs(${value})`
                : undefined,
            }
          );

          const serverExportNames =
            "names" in useServerTransformResult
              ? useServerTransformResult.names
              : useServerTransformResult.exportNames;

          if (useClientTransformResult && serverExportNames.length) {
            throw new Error(
              `Cannot use both "use client" and "use server" in the same file: ${resourcePath}`
            );
          }

          if (useClientTransformResult) {
            clientReferencesMap.set(resourcePath, {
              id,
              exportNames: useClientTransformResult.exportNames,
            });

            useClientTransformResult.output.prepend(
              `import * as ___ReactServer___ from "react-server-dom-rsbuild/server";\n`
            );

            return {
              code: useClientTransformResult.output.toString(),
              map: useClientTransformResult.output.generateMap(),
            };
          } else if (serverExportNames.length) {
            serverReferencesMap.set(resourcePath, {
              id,
              exportNames: serverExportNames,
            });

            useServerTransformResult.output.prepend(
              `import * as ___ReactServer___ from "react-server-dom-rsbuild/server";\n`
            );

            return {
              code: useServerTransformResult.output.toString(),
              map: useServerTransformResult.output.generateMap(),
            };
          }

          return code;
        }
      );

      const transformUseServerClientEnvironment = ({
        code,
        environment,
        resourcePath,
      }: {
        code: string;
        environment: { name: string };
        resourcePath: string;
      }): string | { code: string; map: any } => {
        const { program } = parseSync(resourcePath, code);

        const root = path.resolve(api.getRsbuildConfig().root || process.cwd());
        const id = path.relative(root, resourcePath).replaceAll("\\", "/");

        const useServerTransformResult = transformDirectiveProxyExport(
          program as any,
          {
            code,
            runtime: (name) =>
              `__ReactClient__.createServerReference(` +
              `${JSON.stringify(id + "#" + name)},` +
              (environments.ssr.name === environment.name
                ? "undefined, "
                : `__ReactClient__.callServer, `) +
              `undefined, ` +
              `undefined, ` +
              // (this.environment.mode === 'dev'
              //   ? `$$ReactClient.findSourceMapURL,`
              //   : 'undefined,') +
              `${JSON.stringify(name)})`,
            directive: "use server",
            rejectNonAsyncFunction: true,
          }
        );

        if (useServerTransformResult) {
          serverReferencesMap.set(resourcePath, {
            id,
            exportNames: useServerTransformResult.exportNames,
          });

          useServerTransformResult.output.prepend(
            `import * as __ReactClient__ from "react-server-dom-rsbuild/${
              environments.ssr.name === environment.name ? "ssr" : "browser"
            }";\n`
          );

          return {
            code: useServerTransformResult.output.toString(),
            map: useServerTransformResult.output.generateMap(),
          };
        }

        return code;
      };
      api.transform(
        {
          environments: [environments.client.name],
          issuerLayer: environments.client.layer,
          layer: environments.client.layer,
        },
        transformUseServerClientEnvironment
      );
      api.transform(
        {
          environments: [environments.ssr.name],
          issuerLayer: environments.ssr.layer,
          layer: environments.ssr.layer,
        },
        transformUseServerClientEnvironment
      );

      api.modifyEnvironmentConfig(
        (config, { mergeEnvironmentConfig, name }) => {
          if (environments.server.name === name) {
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
                        layer: environments.server.layer,
                        resolve: {
                          conditionNames: ["react-server", "webpack", "..."],
                        },
                      },
                      {
                        issuerLayer: environments.server.layer,
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

          return mergeEnvironmentConfig(config, {
            tools: {
              rspack: {
                experiments: {
                  layers: true,
                },
              },
            },
          });
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
            compiler.hooks.shouldEmit.tap(PLUGIN_NAME, (compilation) => {
              const { name } = compilation;
              if (!name) throw new Error("Compilation name is undefined");
              return !((needsRebuild.get(name) ?? 0) > 0);
            });

            compiler.hooks.finishMake.tapPromise(
              PLUGIN_NAME,
              async (compilation) => {
                const { name } = compilation;
                if (!name) throw new Error("Compilation name is undefined");

                const promiseWithResolvers = Promise.withResolvers<void>();
                let promise = (makePromises[name] = makePromises[name].then(
                  (): Promise<void> =>
                    promiseWithResolvers.promise.then(() =>
                      makePromises[name] !== promise
                        ? makePromises[name]
                        : undefined
                    )
                ));

                const startClientReferenceCount = clientReferencesMap.size;

                //////////////////////////////////////////////////////
                if (
                  environments.client.name === compilation.name ||
                  environments.ssr.name === compilation.name
                ) {
                  await Promise.all(
                    clientReferencesMap
                      .keys()
                      .map((resource) =>
                        addResourceToCompilation(
                          compilation,
                          resource,
                          environments.ssr.name === compilation.name
                            ? environments.ssr.layer
                            : environments.client.layer
                        )
                      )
                  );
                }

                if (environments.server.name === compilation.name) {
                  await Promise.all(
                    serverReferencesMap
                      .keys()
                      .map((resource) =>
                        addResourceToCompilation(
                          compilation,
                          resource,
                          environments.server.layer
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
                    environments.client.name,
                    (needsRebuild.get(environments.client.name) ?? 0) + 1
                  );
                  if (environments.ssr !== environments.server) {
                    needsRebuild.set(
                      environments.ssr.name,
                      (needsRebuild.get(environments.ssr.name) ?? 0) + 1
                    );
                  }
                }
              }
            );

            compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
              const { name } = compilation;
              if (!name) throw new Error("Compilation name is undefined");

              compilation.hooks.needAdditionalPass.tap(PLUGIN_NAME, () => {
                const needsAdditionalPass = needsRebuild.get(name) ?? 0;
                needsRebuild.set(
                  name,
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
