"use client";

import { useState } from "react";

import { sayHello } from "./actions";

export function Counter2() {
  const [count, setCount] = useState(0);

  return (
    <button
      onClick={() => {
        setCount((c) => c + 1);
        sayHello();
      }}
    >
      Second Count: {count}
    </button>
  );
}
