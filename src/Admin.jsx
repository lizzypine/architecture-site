import { Studio } from "sanity";
import config from "../sanity.config";
import { dataset, isSanityConfigured, projectId } from "./sanity/env";

function AdminSetupNotice() {
  return (
    <main className="admin-setup">
      <section className="admin-setup__panel">
        <img className="admin-setup__logo" src="/urbanum-logo.jpg" alt="urbanum" />
        <h1>Sanity Studio is ready to connect.</h1>
        <p>
          Add your Sanity project values, then visit this page again to open the
          archive admin.
        </p>
        <dl>
          <div>
            <dt>VITE_SANITY_PROJECT_ID</dt>
            <dd>{projectId || "missing"}</dd>
          </div>
          <div>
            <dt>VITE_SANITY_DATASET</dt>
            <dd>{dataset}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

function Admin() {
  if (!isSanityConfigured) {
    return <AdminSetupNotice />;
  }

  return (
    <div className="admin-studio">
      <Studio config={config} />
    </div>
  );
}

export default Admin;
