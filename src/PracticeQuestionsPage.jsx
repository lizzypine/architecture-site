import { Fragment, useState } from "react";
import Header from "./Header";

// SEO/AEO Phase 3 -- About the Practice (public page name; the route
// stays /practice/questions by deliberate decision -- see
// scripts/seo/routes.mjs's own comment on why the URL and the visible
// H1/<title> intentionally don't match). A restrained, editorial
// first-party Q&A page: a plain-language explanation of Urbānum's
// practice for human visitors, search engines, and answer/retrieval
// systems alike. Deliberately NOT a marketing FAQ, accordion, or
// keyword landing page -- no cards, no expand/collapse, no search-FAQ
// visual conventions. It reuses the Practice page's own shared shell/
// typography classes (.about-page/.about-content/.about-layout/
// .about-layout__copy/.about-layout__heading/.about-layout__paragraph --
// see styles.css's own comments on those rules, and AboutPage.jsx for the
// identical Header/drawer wiring this mirrors) so the page reads as part
// of the same editorial system as Practice, not a separate template.
// There is no direct link into this page from Practice or anywhere else
// in the primary site navigation -- that link was tried and then
// deliberately removed (see AboutPage.jsx's own git history); a quiet
// crawlable path in is planned for a later, separate secondary-utility
// layer (Accessibility/Copyright/Site Information), not built yet.
//
// CONTENT SOURCE: this is the final, client-approved 9-question edit,
// supplied verbatim (word-for-word, not further paraphrased or
// SEO-rewritten by this pass) after a direct source comparison against
// Josh's own "AEO answers" questionnaire. It replaces an earlier
// broader draft.
//
// EDITORIAL DECISIONS -- INTENTIONAL: the following material from
// Josh's questionnaire is deliberately NOT published on this page (it
// remains valuable for internal SEO/AEO and market-strategy purposes,
// tracked separately, not on this page):
//   - high-net-worth-individual targeting
//   - negative/poor-fit client descriptions and budget/timeline
//     screening language ("design as a commodity," etc.)
//   - future desired project categories, multi-family as a growth
//     target, and public/institutional work as a future ambition
//   - Owner's Representation as a desired secondary service
//   - "high-end" self-description where unnecessary
//   - "slower" design-process language
//   - unverified NCARB terminology
//   - professional credentials of any kind, until the exact
//     entity/license wording is verified -- this page currently asks
//     no credentials question at all
// Also never referenced: any named client, builder, or institution
// (Josh answered "N/A" for that question) and the internal
// search-phrase list from his "Goals" answers -- those informed this
// content's framing but are never injected as literal keyword text.
//
// This is a static page: content is hand-authored, not CMS-driven, so
// there is no getX()/loadX() content-layer import here the way
// AboutPage.jsx has for its own CMS fields.
const QUESTIONS = [
  {
    question: "What kind of architecture does Urbānum practice?",
    answer:
      "Urbānum practices contemporary, contextual architecture generated authentically from place and becoming part of it. Each project responds to the unique qualities of its site and circumstance rather than applying a typical solution, with an emphasis on material authenticity and expression.",
  },
  {
    question: "What types of projects does the practice take on?",
    answer:
      "Urbānum is a full-service architecture practice working across custom residential design, new construction, renovation and modernization, historic preservation and adaptive reuse, interior design, commercial tenant planning, cultural projects, construction administration, and urban planning.",
  },
  {
    question: "Where does Urbānum work?",
    answer:
      "Urbānum is based in Miami and works primarily across the Miami metro area, including Miami Beach, Central Miami, Northeast Miami, and South Miami, as well as South Florida more broadly. The practice also takes on select work in Central Florida, including Orlando, and along Florida's Gulf Coast, including Tampa Bay, Sarasota, and Naples.",
  },
  {
    question: "What kind of residential work does Urbānum focus on?",
    answer:
      "Residential work includes custom new construction as well as the renovation and modernization of existing homes. Existing conditions, historic context, material, and site are treated as active parts of the design process.",
  },
  {
    question:
      "Does Urbānum work on renovations and existing buildings, or only new construction?",
    answer:
      "Both. Urbānum works with new construction as well as the renovation and modernization of existing buildings. The practice approaches existing conditions, structural limitations, historic context, and complex site conditions as opportunities for design rather than obstacles.",
  },
  {
    question:
      "How does Urbānum approach historic preservation and adaptive reuse?",
    answer:
      "Urbānum works on historic preservation and adaptive reuse across residential and commercial projects. This work draws on experience with older Miami buildings, including existing conditions, code and preservation requirements, and adaptive strategies.",
  },
  {
    question: "What does contextual architecture mean at Urbānum?",
    answer:
      "For Urbānum, contextual architecture begins with listening to the particular conditions of a place rather than imposing a predetermined aesthetic. The approach emphasizes restraint, material authenticity, and sensitivity to site, allowing the architecture to emerge from the circumstances of each project.",
  },
  {
    question: "How do site and landscape shape Urbānum's designs?",
    answer:
      "Urbānum sees the building, site, and landscape as interconnected, with each informing the experience of the other. Natural light, material, space, and site are considered together to shape the character and experience of a building.",
  },
  {
    question: "How does Urbānum approach the design and construction process?",
    answer:
      "Urbānum approaches design as a process of translating a client's goals into something tangible within the particular circumstances of a project. Rather than beginning with a single predetermined answer, the practice explores multiple solutions and works with clients to understand the value of each in relation to their goals and constraints. Through construction administration, Urbānum remains involved during construction to connect the project's conceptual ambitions with the practical realities of structure, enclosure, detailing, and construction.",
  },
];

export default function PracticeQuestionsPage() {
  // Identical Header/drawer wiring to AboutPage.jsx (and every other
  // child page) -- see that file's own comment on this pattern. Reused
  // verbatim rather than reinvented so the header's Filter/Search/Menu
  // drawer pushes and dims this page's content exactly like it does
  // everywhere else.
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
            <h1 className="about-layout__heading">About the Practice</h1>

            {/* Fragment, not a wrapping <div>, per pair -- so each
                heading/paragraph stays a direct sibling of the one before
                it inside .about-layout__copy. That's what lets styles.css's
                existing ".about-layout__paragraph + .about-layout__heading"
                rule (see AboutPage.jsx's own Philosophy split for the same
                mechanism) supply "new question" spacing automatically,
                with no new CSS needed for it. */}
            {QUESTIONS.map(({ question, answer }) => (
              <Fragment key={question}>
                <h2 className="about-layout__heading">{question}</h2>
                <p className="about-layout__paragraph">{answer}</p>
              </Fragment>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}
