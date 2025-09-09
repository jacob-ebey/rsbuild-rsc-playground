import { createElement, Fragment } from "react";
import type { ReactFormState } from "react-dom/client";
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
declare const ___REACT_CSS_MANIFEST___: Record<string, string[]>;

export const clientManifest = ___REACT_CLIENT_MANIFEST___;
export const serverManifest = ___REACT_SERVER_MANIFEST___;
const cssManifest = ___REACT_CSS_MANIFEST___;

export function wrapCss(id: string, Component: React.FunctionComponent) {
  return (props: any) => {
    console.log("HERE!!!", id, cssManifest[id]);
    const links =
      cssManifest[id]?.map((href) =>
        createElement("link", {
          rel: "stylesheet",
          href,
          key: href,
        })
      ) ?? [];
    return createElement(
      Fragment,
      null,
      ...links,
      createElement(Component, props)
    );
  };
}

export async function loadServerAction<T extends Function>(
  actionId: string | number
): Promise<T> {
  const metadata = serverManifest[actionId];
  await Promise.all(
    // @ts-expect-error - no types
    metadata.chunks.map((chunk) => __webpack_require__.e(chunk))
  );
  return Promise.resolve(
    // @ts-expect-error - no types
    __webpack_require__(metadata.id)
  ).then((mod) => mod[metadata.name]);
}

export function decodeAction<T extends (...args: any[]) => any>(
  body: FormData
): Promise<T> {
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
