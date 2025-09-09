import "client-only";
import ReactDOM from "react-dom/server.edge";
// @ts-expect-error - no types
import { createFromReadableStream } from "react-server-dom-webpack/client.edge";
import { injectRSCPayload } from "rsc-html-stream/server";

import reactServer, { ReactServerPayload } from "./react-server" with { env: "react-server" };

declare const ___REACT_BOOTSTRAP_SCRIPTS___: string[];
declare const ___REACT_SSR_MANIFEST___: unknown;

export default {
  async fetch(request: Request): Promise<Response> {
    const rscResponse = await reactServer.fetch(request);

    if (request.headers.get("Accept")?.match(/\btext\/x-component\b/)) {
      return rscResponse;
    }
    
    const [rscStream, rscStreamClone] = rscResponse.body!.tee();
    const streamBuffer: Uint8Array[] = [];
    await rscStream.pipeTo(
      new WritableStream({
        write(chunk) {
          streamBuffer.push(chunk);
        },
      })
    );

    const payload: ReactServerPayload = await createFromReadableStream(
      new ReadableStream({
        start(controller) {
          for (const chunk of streamBuffer) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
      {
        replayConsoleLogs: false,
        serverConsumerManifest: ___REACT_SSR_MANIFEST___,
      }
    );

    const reactStream = await ReactDOM.renderToReadableStream(payload.root, {
      bootstrapScripts: ___REACT_BOOTSTRAP_SCRIPTS___,
      signal: request.signal,
    });
    return new Response(reactStream.pipeThrough(injectRSCPayload(rscStreamClone)), {
      headers: { "Content-Type": "text/html", Vary: "Accept" },
    });
  },
};
