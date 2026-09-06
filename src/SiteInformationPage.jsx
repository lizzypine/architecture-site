import { useState } from "react";
import Header from "./Header";
import { navigate } from "./navigation";

// Utility Information Phase: the canonical, crawlable /site-information
// page. Its two jobs are (1) real, sparse Accessibility and Copyright
// copy, and (2) a legitimate, real <a href> path in to
// /practice/questions -- that page has never had a direct link from
// anywhere in the primary site (see PracticeQuestionsPage.jsx's own
// header comment), so this is its first one. Reuses the exact shared
// shell/typography classes AboutPage.jsx and PracticeQuestionsPage.jsx
// already use (.about-page/.about-content/.about-layout/
// .about-layout__copy/.about-layout__heading/.about-layout__paragraph)
// rather than inventing a new utility-page template, per instruction to
// follow the site's own established visual/behavioral logic. Identical
// Header/drawer wiring to those same pages, reused verbatim.
//
// This page is intentionally NOT in desktop primary navigation, the
// mobile menu, or the Practice page's own content -- its only inbound
// path is the one new site-wide bottom-right utility link (see
// Router.jsx's own comment on where that link is mounted, and why).
export default function SiteInformationPage() {
  const [isIndexDrawerOpen, setIsIndexDrawerOpen] = useState(false);
  const [indexDrawerHeight, setIndexDrawerHeight] = useState(0);

  return (
    <div className="about-page">
      <Header
        onFilterOpenChange={setIsIndexDrawerOpen}
        onDrawerHeightChange={setIndexDrawerHeight}
      />

      <div
        className={`about-content about-content--redesign${
          isIndexDrawerOpen ? " scroll-container--drawer-open" : ""
        }`}
        style={{
          marginTop: indexDrawerHeight
            ? `${Math.round(indexDrawerHeight) + 8}px`
            : undefined,
        }}
      >
        <div className="about-layout">
          <main className="about-layout__copy">
            <h1 className="about-layout__heading">Site Information</h1>

            <h2 className="about-layout__heading">Accessibility</h2>
            <p className="about-layout__paragraph">
              Urbānum is committed to providing a website that is
              accessible to the widest possible audience. If you
              experience difficulty accessing any part of this site,
              please contact the office so the issue can be reviewed.
            </p>

            <h2 className="about-layout__heading">Copyright</h2>
            <p className="about-layout__paragraph">
              Unless otherwise indicated, the text, images, drawings, and
              other material presented on this website are the property
              of Urbānum or their respective copyright holders. Materials
              may not be reproduced, distributed, or used without
              permission from the applicable rights holder.
            </p>

            <h2 className="about-layout__heading">About the Practice</h2>
            <p className="about-layout__paragraph">
              For additional information about Urbānum&rsquo;s services,
              areas of practice, and approach to architecture, visit{" "}
              <a
                href="/practice/questions"
                onClick={(event) => {
                  if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  navigate("/practice/questions");
                }}
              >
                About the Practice
              </a>
              .
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
