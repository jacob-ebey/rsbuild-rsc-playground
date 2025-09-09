export { default, ErrorBoundary } from "./root.client";

import { Layout as ClientLayout } from "./root.client";
import { Counter } from "../../counter";

export function Layout({ children }: { children: React.ReactNode }) {
  // This is necessary for the bundler to inject the needed CSS assets.
  return <ClientLayout>{children}</ClientLayout>;
}

export function loader() {
  return {
    counter: <Counter />,
    message: "Hello from the server!",
  };
}
