import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const Admin = lazy(() => import("./Admin"));
const isAdminRoute = window.location.pathname.startsWith("/admin");

document.documentElement.dataset.route = isAdminRoute ? "admin" : "site";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
