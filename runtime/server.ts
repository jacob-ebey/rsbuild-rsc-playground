import { ReactFormState } from "react-dom/client";
import {
  createClientModuleProxy,
  createTemporaryReferenceSet,
  decodeAction as _decodeAction,
  decodeFormState as _decodeFormState,
  decodeReply as _decodeReply,
  decodeReplyFromAsyncIterable as _decodeReplyFromAsyncIterable,
  registerClientReference,
  registerServerReference,
  renderToReadableStream as _renderToReadableStream,
  // @ts-expect-error - no types
} from "react-server-dom-webpack/server.edge";

export {
  createClientModuleProxy,
  createTemporaryReferenceSet,
  registerClientReference,
  registerServerReference,
};

declare const ___REACT_CLIENT_MANIFEST___: unknown;
declare const ___REACT_SERVER_MANIFEST___: Record<
  string,
  {
    id: string | number;
    name: string;
    chunks: (string | number)[];
    async: boolean;
  }
>;

export const clientManifest = ___REACT_CLIENT_MANIFEST___;
export const serverManifest = ___REACT_SERVER_MANIFEST___;

export function decodeAction<T extends (...args: any[]) => any>(
  body: FormData
): T | null {
  return _decodeAction<T>(body, serverManifest);
}

export function decodeFormState(
  actionResult: any,
  body: FormData
): Promise<ReactFormState> {
  return _decodeFormState(actionResult, body, serverManifest);
}

export function decodeReply<T = unknown>(
  body: FormData | string,
  option?: {}
): Promise<T> {
  return _decodeReply<T>(body, serverManifest, option);
}

export function decodeReplyFromAsyncIterable<T = unknown>(
  body: AsyncIterable<string>,
  option?: {}
): Promise<T> {
  return _decodeReplyFromAsyncIterable<T>(body, serverManifest, option);
}

export function renderToReadableStream(
  rscPayload: unknown,
  options?: Parameters<typeof _renderToReadableStream>[1]
): ReadableStream {
  return _renderToReadableStream(rscPayload, clientManifest, options);
}
