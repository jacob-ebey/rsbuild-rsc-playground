import * as path from "node:path";
import type { Compilation } from "@rspack/core";
import { SortableSet } from "./webpack-sortable-set";

export async function addResourceToCompilation(
  compilation: Compilation,
  resource: string,
  layer?: string
) {
  const {
    EntryPlugin,
    WebpackError,
    util: { createHash },
  } = compilation.compiler.rspack;

  const [entry, ...otherEntries] = compilation.entries.entries();

  if (!entry) {
    compilation.errors.push(
      new WebpackError(
        `No entry found in the compilation, cannot add resource to compilation ${compilation.name}`
      )
    );
  }

  if (otherEntries.length > 0) {
    compilation.warnings.push(
      new WebpackError(
        `Multiple entries found in the compilation, resource will be added only to the first entry ${compilation.name}`
      )
    );
  }

  const [entryName] = entry;

  const dependency = EntryPlugin.createDependency(resource);

  const runtime = getEntryRuntime(compilation, entryName);

  return new Promise<void>((resolve, reject) => {
    compilation.addInclude(
      compilation.compiler.context,
      dependency,
      {
        layer,
        asyncChunks: true,
        runtime: typeof runtime === "string" ? runtime : Array.from(runtime)[0],
      },
      (error, mod) => {
        if (error) {
          compilation.errors.push(error);
          return reject(error);
        }

        if (!mod) {
          const notAddedError = new WebpackError(
            `Failed to add resource ${resource} to compilation ${compilation.name}`
          );

          compilation.errors.push(notAddedError);
          return reject(notAddedError);
        }

        try {
          compilation.moduleGraph
            .getExportsInfo(mod)
            .setUsedInUnknownWay(runtime);

          resolve();
        } catch (e) {
          return reject(e);
        }
      }
    );
  });
}

function getEntryRuntime(
  compilation: Compilation,
  name: string
): string | SortableSet<string> {
  let dependOn;
  let runtime;
  const entry = compilation.entries.get(name);
  if (!entry) return name;
  ({ dependOn, runtime } = entry.options);

  if (dependOn) {
    /** @type {RuntimeSpec} */
    let result;
    const queue = new Set<string>(dependOn);
    for (const name of queue) {
      const dep = compilation.entries.get(name);
      if (!dep) continue;
      const { dependOn, runtime } = dep.options;
      if (dependOn) {
        for (const name of dependOn) {
          queue.add(name);
        }
      } else {
        result = mergeRuntimeOwned(result, runtime || name);
      }
    }
    return result || name;
  }
  return runtime || name;
}

function mergeRuntimeOwned(a: any, b: any) {
  if (b === undefined) {
    return a;
  } else if (a === b) {
    return a;
  } else if (a === undefined) {
    if (typeof b === "string") {
      return b;
    }
    return new SortableSet(b);
  } else if (typeof a === "string") {
    if (typeof b === "string") {
      const set = new SortableSet();
      set.add(a);
      set.add(b);
      return set;
    }
    const set = new SortableSet(b);
    set.add(a);
    return set;
  }
  if (typeof b === "string") {
    a.add(b);
    return a;
  }
  for (const item of b) a.add(item);
  return a;
}
