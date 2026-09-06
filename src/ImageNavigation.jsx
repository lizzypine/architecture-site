// Image Navigation -- moving to a different Archive Item within the same
// Project. Deliberately separate from Project Navigation
// (ProjectNavigation.jsx): it never changes which Project is loaded and
// never leaves this page, it only changes which image is current.
//
// Moved out of ImageViewer.jsx (Josh review, final correction pass): this
// is now a page-level element, rendered by ProjectTemplate.jsx as a
// structural sibling of the image viewer and of Project Navigation, NOT
// nested inside .project-image-column at all -- see
// .project-image-nav-row in styles.css and ProjectTemplate.jsx's own
// comment. That's what makes this row's position independent of the
// image's own rendered size, of whether the metadata panel is open (which
// narrows .project-image-column but not this row, a sibling of it), and
// of anything else about the currently-showing photograph.
//
// Two different notions of "which image," used deliberately for two
// different things (Josh review, final correction pass):
//
//   `selectedImage` -- the image ProjectTemplate has actually
//   requested/selected (its currentImageId). Drives the Previous/Next
//   TARGETS and their disabled states, so clicking repeatedly advances
//   predictably through the real sequence even if an individual image
//   hasn't finished loading yet.
//
//   `displayedImage` -- the image ProjectTemplate has confirmed is
//   actually visible on screen (its onLoad already fired -- see
//   ImageViewer's onImageLoaded and ProjectTemplate's
//   handleImageLoaded). Drives the "N / M" counter TEXT only.
//
// This split fixes a real bug: clicking next/previous used to update the
// counter immediately, before the new photo had actually loaded over the
// network, so the UI could briefly read "2 / 7" while image 1 was still
// the only thing visible. The invariant this component now guarantees:
// the number shown always corresponds to the photograph currently
// visible, never to a still-loading target. No timeout is involved --
// this is driven entirely by the image's own load event.
export default function ImageNavigation({
  images,
  selectedImage,
  displayedImage,
  onSelectImage,
}) {
  if (images.length <= 1) return null;

  const selectedIndex = images.findIndex(
    (item) => item.archiveNumber === selectedImage.archiveNumber,
  );
  // Project Image Carousel -- Loop at Ends pass: previousImage/nextImage
  // used to be null past either end (guarded below by the buttons' own
  // `disabled` prop). Modulo-wrapped instead, matching the same
  // index-normalization ProjectTemplate.jsx's navigateByGestureRef now
  // uses for wheel/trackpad/swipe/cursor-click -- so these buttons loop
  // exactly the same way every other navigation input already does,
  // rather than duplicating a second, differently-shaped bounds check.
  // images.length is already guaranteed > 1 by the early return above,
  // so the modulo divisor is never 0.
  const previousImage =
    images[(selectedIndex - 1 + images.length) % images.length];
  const nextImage = images[(selectedIndex + 1) % images.length];

  const displayedIndex = images.findIndex(
    (item) => item.archiveNumber === displayedImage.archiveNumber,
  );

  const handleSelect = (target) => {
    if (!target) return;
    onSelectImage(target.archiveNumber);
  };

  return (
    <div className="project-image-nav" aria-label="Image navigation">
      {/* Project Image Carousel -- Loop at Ends pass: no longer disabled
          at either end -- previousImage/nextImage above always resolve
          to a real image now (modulo-wrapped), so the button is always
          clickable, consistent with every other navigation input now
          looping the same way. */}
      <button
        type="button"
        className="project-image-nav__control"
        onClick={() => handleSelect(previousImage)}
        aria-label="Previous image"
      >
        ‹
      </button>
      <span className="project-image-nav__count">
        {displayedIndex + 1} / {images.length}
      </span>
      <button
        type="button"
        className="project-image-nav__control"
        onClick={() => handleSelect(nextImage)}
        aria-label="Next image"
      >
        ›
      </button>
    </div>
  );
}
