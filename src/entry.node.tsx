import "client-only";
import ReactDOM from "react-dom/server.edge";
import { unstable_routeRSCServerRequest as routeRSCServerRequest, unstable_RSCStaticRouter as RSCStaticRouter } from "react-router";
import { bootstrapScripts, createFromReadableStream } from "react-server-dom-rsbuild/ssr";

import reactServer from "./react-server" with { env: "react-server" };

export default {
  async fetch(request: Request): Promise<Response> {
    return await routeRSCServerRequest({
    // The incoming request.
    request,
    // How to call the React Server.
    fetchServer: reactServer.fetch,
    // Provide the React Server touchpoints.
    createFromReadableStream,
    // Render the router to HTML.
    async renderHTML(getPayload) {
      const payload = await getPayload();
      const formState =
        payload.type === "render" ? await payload.formState : undefined;

      return await ReactDOM.renderToReadableStream(
        <RSCStaticRouter getPayload={getPayload} />,
        {
          bootstrapScripts,
          // @ts-expect-error - no types for this yet
          formState,
        },
      );
    },
  });
  },
};
