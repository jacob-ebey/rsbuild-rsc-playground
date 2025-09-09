import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import {
  createFromFetch,
  createFromReadableStream,
  encodeReply,
  setServerCallback,
} from "react-server-dom-rsbuild/browser";
import { rscStream } from "rsc-html-stream/client";

import type { ReactServerPayload } from "./react-server";

async function callServer(id: string, args: any[]) {
  const body = await encodeReply(args);
  const responsePromise = fetch(window.location.href, {
    body,
    headers: {
      Accept: "text/x-component",
      "x-rsc-action": id,
    },
    method: "POST",
  });
  return createFromFetch(responsePromise);
}

setServerCallback(callServer);
createFromReadableStream<ReactServerPayload>(rscStream).then((payload) =>
  startTransition(() => {
    hydrateRoot(document, payload.root);
  })
);
