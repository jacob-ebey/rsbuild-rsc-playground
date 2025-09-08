"use client";

import { useState } from "react";
// import * as Markdown from "react-markdown";

export function Counter() {
  const [count, setCount] = useState(0);
  // console.log(Markdown);

  return <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>;
}
