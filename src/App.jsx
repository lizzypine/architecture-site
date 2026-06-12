import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const allImages = [
  "/img/pexels-adrien-olichon-1257089-3137038.jpg",
  "/img/pexels-adrien-olichon-1257089-3137047.jpg",
  "/img/pexels-ai25studio-8837511.jpg",
  "/img/pexels-andrea-238542097-35392198.jpg",
  "/img/pexels-artbovich-11701113.jpg",
  "/img/pexels-artbovich-7166645.jpg",
  "/img/pexels-artbovich-7195739.jpg",
  "/img/pexels-artbovich-8089093.jpg",
  "/img/pexels-costa-17729218.jpg",
  "/img/pexels-ganiyevart-15153700.jpg",
  "/img/pexels-ivan-s-4458205.jpg",
  "/img/pexels-perqued-10919427.jpg",
  "/img/pexels-perqued-9757618.jpg",
  "/img/pexels-shvets-production-9052461.jpg",
  "/img/pexels-thomas-parker-1272388137-31500951.jpg",
];

const imageTags = {
  "/img/pexels-adrien-olichon-1257089-3137038.jpg": "light",
  "/img/pexels-adrien-olichon-1257089-3137047.jpg": "light",
  "/img/pexels-ai25studio-8837511.jpg": "light",
  "/img/pexels-artbovich-11701113.jpg": "structure",
  "/img/pexels-artbovich-7166645.jpg": "structure",
  "/img/pexels-artbovich-7195739.jpg": "structure",
  "/img/pexels-artbovich-8089093.jpg": "structure",
};

const clusterPlacements = [
  { axis: "x", direction: -1, distance: 1.08, scale: 0.38 },
  { axis: "x", direction: 1, distance: 1.08, scale: 0.38 },
  { axis: "y", direction: -1, distance: 0.96, scale: 0.34 },
  { axis: "y", direction: 1, distance: 0.96, scale: 0.34 },
  { axis: "x", direction: -1, distance: 1.42, scale: 0.3 },
  { axis: "x", direction: 1, distance: 1.42, scale: 0.3 },
];

const connectorTimings = [
  { duration: 1.28, delay: 0.1 },
  { duration: 1.62, delay: 0.28 },
  { duration: 1.08, delay: 0.18 },
  { duration: 1.83, delay: 0.38 },
  { duration: 1.44, delay: 0.24 },
  { duration: 1.71, delay: 0.46 },
];

const viewportMargin = 28;

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRandomSize() {
  const sizes = [
    { width: "30vw", maxWidth: "410px" },
    { width: "35vw", maxWidth: "480px" },
    { width: "40vw", maxWidth: "540px" },
    { width: "42vw", maxWidth: "570px" },
    { width: "44vw", maxWidth: "600px" },
    { width: "48vw", maxWidth: "660px" },
    { width: "50vw", maxWidth: "690px" },
    { width: "52vw", maxWidth: "720px" },
    { width: "56vw", maxWidth: "780px" },
    { width: "58vw", maxWidth: "810px" },
    { width: "60vw", maxWidth: "840px" },
    { width: "32vw", maxWidth: "440px" },
  ];
  return sizes[Math.floor(Math.random() * sizes.length)];
}

function getRandomVerticalPosition() {
  return Math.random() * 25;
}

function getRandomOpacity() {
  const opacities = [0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1];
  return opacities[Math.floor(Math.random() * opacities.length)];
}

function clamp(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

function getClusterCenter(placement, focusedRect, relatedRect) {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const visualFocusedWidth = focusedRect.width * 1.08;
  const visualFocusedHeight = focusedRect.height * 1.08;
  const relatedWidth = relatedRect.width * placement.scale;
  const relatedHeight = relatedRect.height * placement.scale;
  const minX = viewportMargin + relatedWidth / 2;
  const maxX = window.innerWidth - viewportMargin - relatedWidth / 2;
  const minY = viewportMargin + relatedHeight / 2;
  const maxY = window.innerHeight - viewportMargin - relatedHeight / 2;

  if (placement.axis === "x") {
    return {
      x: clamp(
        centerX + visualFocusedWidth * placement.distance * placement.direction,
        minX,
        maxX,
      ),
      y: clamp(centerY, minY, maxY),
    };
  }

  return {
    x: clamp(centerX, minX, maxX),
    y: clamp(
      centerY + visualFocusedHeight * placement.distance * placement.direction,
      minY,
      maxY,
    ),
  };
}

function getClusterConnector(item, index, focusedRect) {
  const placement = clusterPlacements[index % clusterPlacements.length];
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const relatedCenter = getClusterCenter(placement, focusedRect, item.rect);
  const focusedHalfWidth = (focusedRect.width * 1.08) / 2;
  const focusedHalfHeight = (focusedRect.height * 1.08) / 2;
  const relatedHalfWidth = (item.rect.width * placement.scale) / 2;
  const relatedHalfHeight = (item.rect.height * placement.scale) / 2;

  if (placement.axis === "x") {
    const startX = centerX + focusedHalfWidth * placement.direction;
    const endX = relatedCenter.x - relatedHalfWidth * placement.direction;

    return {
      id: item.id,
      x1: startX,
      y1: centerY,
      x2: endX,
      y2: centerY,
    };
  }

  return {
    id: item.id,
    x1: centerX,
    y1: centerY + focusedHalfHeight * placement.direction,
    x2: centerX,
    y2: relatedCenter.y - relatedHalfHeight * placement.direction,
  };
}

function App() {
  const scrollContainerRef = useRef(null);
  const trackRef = useRef(null);
  const overlayRef = useRef(null);
  const focusedCloneRef = useRef(null);
  const scrollTriggerRef = useRef(null);
  const focusTimelineRef = useRef(null);
  const focusedIdRef = useRef(null);
  const [galleryItems, setGalleryItems] = useState([]);
  const [focusedId, setFocusedId] = useState(null);
  const [focusedImage, setFocusedImage] = useState(null);

  useEffect(() => {
    const shuffled = shuffleArray(allImages);
    const items = shuffled.map((src, idx) => ({
      id: idx,
      src,
      alt: `Gallery image ${idx + 1}`,
      size: getRandomSize(),
      verticalOffset: getRandomVerticalPosition(),
      opacity: getRandomOpacity(),
      tag: imageTags[src] || null,
      parallaxMultiplier: 0.8 + Math.random() * 0.4,
    }));
    setGalleryItems(items);
  }, []);

  const getImageWrapper = useCallback((imageId) => {
    return trackRef.current?.querySelector(`[data-image-id="${imageId}"]`);
  }, []);

  const handleExitFocus = useCallback(() => {
    const activeId = focusedIdRef.current;
    if (activeId === null) return;

    const track = trackRef.current;
    const overlay = overlayRef.current;
    if (!track || !overlay) return;

    focusTimelineRef.current?.kill();
    focusedIdRef.current = null;
    setFocusedId(null);

    const clone = focusedCloneRef.current;
    const relatedClones = gsap.utils.toArray(".related-image-frame");
    const activeWrapper = getImageWrapper(activeId);
    const activeRect = activeWrapper?.getBoundingClientRect();

    const tl = gsap.timeline({
      defaults: { duration: 0.45, ease: "power3.out" },
      onComplete: () => {
        setFocusedImage(null);
        scrollTriggerRef.current?.enable(false);
      },
    });

    tl.to(
      overlay,
      {
        opacity: 0,
        duration: 0.3,
        pointerEvents: "none",
      },
      0,
    );

    tl.to(
      ".theme-connectors, .focus-theme-title",
      {
        opacity: 0,
        duration: 0.2,
      },
      0,
    );

    if (clone && activeRect) {
      tl.to(
        clone,
        {
          left: activeRect.left,
          top: activeRect.top,
          width: activeRect.width,
          height: activeRect.height,
          scale: 1,
          duration: 0.45,
        },
        0,
      );
    }

    relatedClones.forEach((relatedClone) => {
      const { left, top, width, height } = relatedClone.dataset;

      tl.to(
        relatedClone,
        {
          left: Number(left),
          top: Number(top),
          width: Number(width),
          height: Number(height),
          scale: 1,
          opacity: 0,
          duration: 0.4,
        },
        0,
      );
    });

    galleryItems.forEach((item) => {
      const wrapper = getImageWrapper(item.id);
      if (!wrapper) return;

      tl.to(
        wrapper,
        {
          x: Number(wrapper.dataset.parallaxX || 0),
          y: 0,
          scale: 1,
          opacity: item.opacity,
          filter: "none",
          pointerEvents: "auto",
          zIndex: 1,
        },
        item.id === activeId ? 0.18 : 0,
      );
    });

    focusTimelineRef.current = tl;
  }, [galleryItems, getImageWrapper]);

  const handleImageClick = useCallback(
    (imageId) => {
      if (focusedIdRef.current !== null) return;

      const wrapper = getImageWrapper(imageId);
      const overlay = overlayRef.current;
      if (!wrapper || !overlay) return;

      focusTimelineRef.current?.kill();
      focusedIdRef.current = imageId;
      setFocusedId(imageId);

      scrollTriggerRef.current?.disable(false);

      const rect = wrapper.getBoundingClientRect();
      const focusedItem = galleryItems.find((item) => item.id === imageId);
      const relatedImages = focusedItem.tag
        ? galleryItems
            .filter((item) => item.id !== imageId && item.tag === focusedItem.tag)
            .map((item) => {
              const relatedWrapper = getImageWrapper(item.id);
              const relatedRect = relatedWrapper?.getBoundingClientRect();

              return {
                id: item.id,
                src: item.src,
                alt: item.alt,
                tag: item.tag,
                rect: relatedRect
                  ? {
                      left: relatedRect.left,
                      top: relatedRect.top,
                      width: relatedRect.width,
                      height: relatedRect.height,
                    }
                  : null,
              };
            })
            .filter((item) => item.rect)
        : [];

      setFocusedImage({
        id: imageId,
        src: focusedItem.src,
        alt: focusedItem.alt,
        tag: focusedItem.tag,
        relatedImages,
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      });

      const tl = gsap.timeline({
        defaults: { duration: 0.55, ease: "power3.out" },
      });

      tl.to(
        overlay,
        {
          opacity: 0.36,
          duration: 0.35,
          pointerEvents: "auto",
        },
        0,
      );

      galleryItems.forEach((item) => {
        const imageWrapper = getImageWrapper(item.id);
        if (!imageWrapper) return;

        tl.to(
          imageWrapper,
          {
            x: Number(imageWrapper.dataset.parallaxX || 0),
            y: 0,
            scale: 0.94,
            opacity: 0,
            filter: "brightness(0.62) saturate(0.82)",
            pointerEvents: "none",
            zIndex: 1,
          },
          0,
        );
      });

      focusTimelineRef.current = tl;
    },
    [galleryItems, getImageWrapper],
  );

  const handleRelatedImageEnter = useCallback((event) => {
    const hovered = event.currentTarget;
    const hoveredScale = Number(hovered.dataset.clusterScale || 1);

    gsap.to(hovered, {
      scale: hoveredScale * 1.14,
      opacity: 1,
      zIndex: 1090,
      duration: 0.22,
      ease: "power2.out",
    });

    gsap.to(".related-image-frame", {
      opacity: (index, target) => (target === hovered ? 1 : 0.46),
      scale: (index, target) =>
        target === hovered
          ? hoveredScale * 1.14
          : Number(target.dataset.clusterScale || 1),
      zIndex: (index, target) => (target === hovered ? 1090 : 1050),
      duration: 0.22,
      ease: "power2.out",
    });
  }, []);

  const handleRelatedImageLeave = useCallback(() => {
    gsap.to(".related-image-frame", {
      opacity: 1,
      scale: (index, target) => Number(target.dataset.clusterScale || 1),
      zIndex: 1050,
      duration: 0.24,
      ease: "power2.out",
    });
  }, []);

  useEffect(() => {
    if (!focusedImage) return;

    const clone = focusedCloneRef.current;
    if (!clone) return;

    const { left, top, width, height } = focusedImage.rect;

    gsap.set(clone, {
      left,
      top,
      width,
      height,
      scale: 1,
      opacity: 1,
      filter: "none",
      transformOrigin: "center center",
    });

    gsap.to(clone, {
      left: window.innerWidth / 2 - width / 2,
      top: window.innerHeight / 2 - height / 2,
      scale: 1.08,
      duration: 0.55,
      ease: "power3.out",
    });

    gsap.fromTo(
      ".focus-theme-title",
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
    );

    gsap.utils.toArray(".related-image-frame").forEach((relatedClone, index) => {
      const placement = clusterPlacements[index % clusterPlacements.length];
      const relatedWidth = Number(relatedClone.dataset.width);
      const relatedHeight = Number(relatedClone.dataset.height);
      const clusterScale = placement.scale;
      const clusterCenter = getClusterCenter(placement, focusedImage.rect, {
        width: relatedWidth,
        height: relatedHeight,
      });

      gsap.set(relatedClone, {
        left: Number(relatedClone.dataset.left),
        top: Number(relatedClone.dataset.top),
        width: relatedWidth,
        height: relatedHeight,
        scale: 1,
        opacity: 0,
        transformOrigin: "center center",
      });

      gsap.to(relatedClone, {
        left: clusterCenter.x - relatedWidth / 2,
        top: clusterCenter.y - relatedHeight / 2,
        scale: clusterScale,
        opacity: 1,
        duration: 0.55,
        delay: 0.04 * index,
        ease: "power3.out",
      });
    });

    gsap.utils.toArray(".theme-connector-line").forEach((line, index) => {
      const length = line.getTotalLength();
      const timing = connectorTimings[index % connectorTimings.length];

      gsap.set(line, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });

      gsap.to(line, {
        strokeDashoffset: 0,
        duration: timing.duration,
        delay: timing.delay,
        ease: "power2.out",
      });
    });
  }, [focusedImage]);

  useEffect(() => {
    const scrollKeys = new Set([
      " ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ]);

    const preventFocusScroll = (event) => {
      if (focusedIdRef.current !== null) {
        event.preventDefault();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleExitFocus();
        return;
      }

      if (focusedIdRef.current !== null && scrollKeys.has(event.key)) {
        event.preventDefault();
      }
    };

    window.addEventListener("wheel", preventFocusScroll, { passive: false });
    window.addEventListener("touchmove", preventFocusScroll, { passive: false });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("wheel", preventFocusScroll);
      window.removeEventListener("touchmove", preventFocusScroll);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleExitFocus]);

  useEffect(() => {
    if (galleryItems.length === 0) return;

    const scrollContainer = scrollContainerRef.current;
    const track = trackRef.current;

    if (!scrollContainer || !track) return;

    track.offsetWidth;

    const trackWidth = track.offsetWidth;
    const viewportWidth = window.innerWidth;
    const distance = Math.max(0, trackWidth - viewportWidth + 1000);

    scrollContainer.style.height = `${distance + 100}px`;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scrollContainer,
        start: "top top",
        end: `+=${distance}`,
        scrub: 1,
        pin: true,
        pinSpacing: false,
        markers: false,
      },
    });

    scrollTriggerRef.current = tl.scrollTrigger;

    tl.to(
      track,
      {
        x: -distance,
        ease: "none",
        duration: 1,
      },
      0,
    );

    tl.eventCallback("onUpdate", function () {
      if (focusedIdRef.current !== null) return;

      const progress = this.progress();

      galleryItems.forEach((item) => {
        const wrapper = track.querySelector(`[data-image-id="${item.id}"]`);
        if (!wrapper) return;

        const parallaxX = -distance * progress * (item.parallaxMultiplier - 1);
        wrapper.dataset.parallaxX = String(parallaxX);

        gsap.set(wrapper, {
          x: parallaxX,
          transformOrigin: "center center",
        });
      });
    });

    return () => {
      focusTimelineRef.current?.kill();
      scrollTriggerRef.current = null;
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, [galleryItems]);

  if (galleryItems.length === 0) {
    return <div className="app-shell" />;
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">[ urbānum ]</div>
        <button className="menu-toggle" aria-label="Menu">
          <span />
          <span />
          <span />
        </button>
      </header>

      <div className="scroll-container" ref={scrollContainerRef}>
        <div className="sticky-wrapper">
          <div className="gallery-track" ref={trackRef}>
            {galleryItems.map((item) => (
              <button
                key={item.id}
                type="button"
                data-image-id={item.id}
                className="gallery-image-wrapper"
                onClick={() => handleImageClick(item.id)}
                aria-label={`Focus ${item.alt}`}
                aria-pressed={focusedId === item.id}
                style={{
                  width: item.size.width,
                  maxWidth: item.size.maxWidth,
                  top: `${item.verticalOffset}%`,
                  opacity: item.opacity,
                }}
              >
                <img
                  src={item.src}
                  alt={item.alt}
                  className="gallery-image"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        ref={overlayRef}
        type="button"
        className="gallery-overlay"
        onClick={handleExitFocus}
        aria-label="Close focused image"
      />

      {focusedImage?.tag && (
        <div className="focus-theme-title">{focusedImage.tag}</div>
      )}

      {focusedImage?.relatedImages.length > 0 && (
        <svg className="theme-connectors" aria-hidden="true">
          {focusedImage.relatedImages.map((item, index) => {
            const connector = getClusterConnector(item, index, focusedImage.rect);

            return (
              <g key={item.id}>
                <line
                  className="theme-connector-line"
                  x1={connector.x1}
                  y1={connector.y1}
                  x2={connector.x2}
                  y2={connector.y2}
                />
              </g>
            );
          })}
        </svg>
      )}

      {focusedImage && (
        <div ref={focusedCloneRef} className="focused-image-frame">
          <img src={focusedImage.src} alt={focusedImage.alt} />
        </div>
      )}

      {focusedImage?.relatedImages.map((item, index) => (
        <div
          key={item.id}
          className="focused-image-frame related-image-frame"
          data-left={item.rect.left}
          data-top={item.rect.top}
          data-width={item.rect.width}
          data-height={item.rect.height}
          data-cluster-scale={
            clusterPlacements[index % clusterPlacements.length].scale
          }
          onMouseEnter={handleRelatedImageEnter}
          onMouseLeave={handleRelatedImageLeave}
        >
          <img src={item.src} alt={item.alt} />
        </div>
      ))}
    </div>
  );
}

export default App;
