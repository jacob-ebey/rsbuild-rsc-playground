import {
  createFromFetch as _createFromFetch,
  createFromReadableStream as _createFromReadableStream,
  createServerReference,
  createTemporaryReferenceSet,
  encodeReply,
  registerServerReference,
  // @ts-expect-error - no types
} from "react-server-dom-webpack/client.edge";

export {
  createServerReference,
  createTemporaryReferenceSet,
  encodeReply,
  registerServerReference,
};

declare const ___REACT_BOOTSTRAP_SCRIPTS___: string[];
declare const ___REACT_SSR_MANIFEST___: unknown;

export const bootstrapScripts = ___REACT_BOOTSTRAP_SCRIPTS___;
export const serverConsumerManifest = ___REACT_SSR_MANIFEST___;

export function createFromFetch<T>(
  response: Promise<Response>,
  options?: {
    encodeFormAction?: unknown;
    environmentName?: string;
    findSourceMapURL?: unknown;
    replayConsoleLogs?: boolean;
    serverConsumerManifest?: unknown;
    temporaryReferences?: unknown;
  }
): Promise<T> {
  return _createFromFetch<T>(response, {
    serverConsumerManifest,
    ...options,
  });
}

export function createFromReadableStream<T>(
  stream: ReadableStream<Uint8Array>,
  options?: {
    encodeFormAction?: unknown;
    environmentName?: string;
    findSourceMapURL?: unknown;
    replayConsoleLogs?: boolean;
    serverConsumerManifest?: unknown;
    temporaryReferences?: unknown;
  }
): Promise<T> {
  return _createFromReadableStream<T>(stream, {
    serverConsumerManifest,
    ...options,
  });
}
