import { createRequestListener } from "@remix-run/node-fetch-server";
import express from "express";

import build from "./dist/node/index.js";

const app = express();

app.use(express.static("dist/web/static"));
app.use(express.static("dist/web"));

app.use(createRequestListener(build.fetch));

app.listen(3000, () => {
  console.log("Server listening on http://localhost:3000");
});
