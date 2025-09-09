import "server-only";
import {
  decodeAction,
  decodeReply,
  renderToReadableStream,
  serverManifest,
} from "react-server-dom-rsbuild/server";

import { sayHello } from "./actions";
import { Counter } from "./counter";
import { Counter2 } from "./counter2";

export type ReactServerPayload = {
  action?: Promise<any>;
  root: React.ReactNode;
};

export default {
  async fetch(request: Request): Promise<Response> {
    let action: Promise<any> | undefined;
    if (request.method === "POST") {
      const actionId = request.headers.get("x-rsc-action");
      try {
        if (actionId) {
          const metadata = serverManifest[actionId];
          await Promise.all(
            // @ts-expect-error - no types
            metadata.chunks.map((chunk) => __webpack_require__.e(chunk))
          );
          const actionFunctionPromise: Promise<Function> = Promise.resolve(
            // @ts-expect-error - no types
            __webpack_require__(metadata.id)
          ).then((mod) => mod[metadata.name]);

          const reply = await (isFormDataRequest(request)
            ? request.formData()
            : request.text());
          const decodeReplyPromise = decodeReply<unknown[]>(
            reply,
            serverManifest
          );

          const [actionFunction, args] = await Promise.all([
            actionFunctionPromise,
            decodeReplyPromise,
          ]);
          const boundAction = actionFunction.bind(null, ...args);
          action = Promise.resolve(boundAction());
          await action;
        } else {
          const formData = await request.formData();
          const boundAction = await decodeAction(formData);
          if (boundAction) {
            action = Promise.resolve(boundAction());
            await action;
          }
        }
      } catch (error) {
        console.error("Error executing action:", error);
      }
    }

    const payload: ReactServerPayload = {
      action,
      root: (
        <html>
          <head>
            <title>Hello, World!</title>
          </head>
          <body>
            <h1>Hello, World!</h1>
            <Counter />
            <Counter2 />
            <form action={sayHello}>
              <button type="submit">Say Hello</button>
            </form>
          </body>
        </html>
      ),
    };

    const rscStream = renderToReadableStream(payload, {
      signal: request.signal,
    });

    return new Response(rscStream, {
      headers: { "Content-Type": "text/x-component", Vary: "Accept" },
    });
  },
};

function isFormDataRequest(request: Request): boolean {
  const contentType = request.headers.get("Content-Type") || "";
  return !!contentType.match(
    /\b(multipart\/form-data|application\/x-www-form-urlencoded)\b/
  );
}
