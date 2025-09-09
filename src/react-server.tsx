import "server-only";
import { unstable_matchRSCServerRequest as matchRSCServerRequest } from "react-router";
import {
  decodeAction,
  decodeReply,
  renderToReadableStream,
  createTemporaryReferenceSet,
  decodeFormState,
  loadServerAction,
} from "react-server-dom-rsbuild/server";

import { routes } from "./routes";

export type ReactServerPayload = {
  action?: Promise<any>;
  root: React.ReactNode;
};

export default {
  async fetch(request: Request): Promise<Response> {
    return matchRSCServerRequest({
      // Provide the React Server touchpoints.
      createTemporaryReferenceSet,
      decodeAction,
      decodeFormState,
      decodeReply,
      loadServerAction,
      // The incoming request.
      request,
      // The app routes.
      routes,
      // Encode the match with the React Server implementation.
      generateResponse(match, options) {
        const decoder = new TextDecoder();
        return new Response(renderToReadableStream(match.payload, options), {
          status: match.statusCode,
          headers: match.headers,
        });
      },
    });
  },
};
