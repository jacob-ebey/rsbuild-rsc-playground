import "server-only";
import { renderToReadableStream } from "react-server-dom-webpack/server.edge";

import { Counter } from "./counter";
import { Counter2 } from "./counter2";

declare const ___REACT_SERVER_MANIFEST___: unknown;

export default {
  async fetch(request: Request): Promise<Response> {
    const rscStream = renderToReadableStream(
      <html>
        <head>
          <title>Hello, World!</title>
        </head>
        <body>
          <h1>Hello, World!</h1>
          <Counter />
          <Counter2 />
        </body>
      </html>,
      ___REACT_SERVER_MANIFEST___
    );

    return new Response(rscStream, {
      headers: { "Content-Type": "text/x-component" },
    });
  },
};
