"use client";

import { useState } from "react";

import "./counter.css";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button className="counter" onClick={() => setCount((c) => c + 1)}>
      Count: {count}
    </button>
  );
}
