import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import {
  createFromFetch,
  createFromReadableStream,
  encodeReply,
  // @ts-expect-error - no types
} from "react-server-dom-webpack/client.browser";
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
  return createFromFetch(responsePromise, { callServer });
}

createFromReadableStream(rscStream, {
  callServer,
}).then((payload: ReactServerPayload) =>
  startTransition(() => {
    hydrateRoot(document, payload.root);
  })
);
