import {
  createFromFetch as _createFromFetch,
  createFromReadableStream as _createFromReadableStream,
  createServerReference,
  createTemporaryReferenceSet,
  encodeReply,
  registerServerReference,
  // @ts-expect-error - no types
} from "react-server-dom-webpack/client.browser";

export {
  createServerReference,
  createTemporaryReferenceSet,
  encodeReply,
  registerServerReference,
};

let defaultCallServer: undefined | ((id: string, args: any[]) => Promise<any>);

export function setServerCallback(
  callServer: (id: string, args: any[]) => Promise<any>
) {
  defaultCallServer = callServer;
}

export function createFromFetch<T>(
  response: Promise<Response>,
  options?: {
    callServer?: (id: string, args: any[]) => Promise<any>;
    findSourceMapURL?: unknown;
    replayConsoleLogs?: boolean;
    temporaryReferences?: unknown;
  }
): Promise<T> {
  return _createFromFetch<T>(response, {
    ...options,
    callServer: options?.callServer ?? defaultCallServer,
  });
}

export function createFromReadableStream<T>(
  stream: ReadableStream<Uint8Array>,
  options?: {
    callServer?: (id: string, args: any[]) => Promise<any>;
    findSourceMapURL?: unknown;
    replayConsoleLogs?: boolean;
    temporaryReferences?: unknown;
  }
): Promise<T> {
  return _createFromReadableStream<T>(stream, {
    ...options,
    callServer: options?.callServer ?? defaultCallServer,
  });
}
