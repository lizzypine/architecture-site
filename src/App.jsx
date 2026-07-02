import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";

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

const imageFocusEnabled = false;
const galleryBatchWidth = 2520;

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
const initialGalleryBatches = 4;

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRandomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function rectsOverlap(first, second, padding = 0) {
  return (
    first.left < second.left + second.width + padding &&
    first.left + first.width + padding > second.left &&
    first.top < second.top + second.height + padding &&
    first.top + first.height + padding > second.top
  );
}

function getRandomLayout(itemIndex, batchIndex, occupiedRects = []) {
  const viewportHeight =
    typeof window === "undefined" ? 800 : window.innerHeight;
  const viewportPadding = Math.round(
    Math.min(Math.max(viewportHeight * 0.08, 20), 72),
  );
  const headerClearance = 124;
  const topPadding = Math.max(viewportPadding, headerClearance);
  const bottomPadding = viewportPadding;
  const availableHeight = Math.max(
    80,
    viewportHeight - topPadding - bottomPadding,
  );
  const minHeight = Math.min(88, availableHeight);
  const maxHeight = Math.min(260, availableHeight);
  const baseHeight = Math.round(getRandomBetween(minHeight, maxHeight));
  const shouldBeSmall = Math.random() < 0.2;
  const height = shouldBeSmall ? Math.round(baseHeight * 0.6) : baseHeight;
  const aspectRatios = [0.62, 0.72, 0.82, 0.95, 1.08, 1.25, 1.48, 1.72];
  const aspectRatio =
    aspectRatios[Math.floor(Math.random() * aspectRatios.length)];
  const width = Math.round(height * aspectRatio);
  const maxTop = viewportHeight - bottomPadding - height;
  const laneIndex = itemIndex % 3;
  const laneRanges = [
    [0, 0.24],
    [0.36, 0.58],
    [0.72, 1],
  ];
  const [laneStart, laneEnd] = laneRanges[laneIndex % laneRanges.length];
  const laneTopStart = topPadding + (maxTop - topPadding) * laneStart;
  const laneTopEnd = topPadding + (maxTop - topPadding) * laneEnd;
  const clusterIndex = Math.floor(itemIndex / 3);
  const clusterBaseX = batchIndex * galleryBatchWidth + clusterIndex * 420;
  const laneXOffsets = [-80, 90, 260];
  let left = clusterBaseX + laneXOffsets[laneIndex] + 140;
  let top = getRandomBetween(laneTopStart, laneTopEnd);

  for (let attempt = 0; attempt < 72; attempt += 1) {
    const candidateLeft =
      clusterBaseX +
      laneXOffsets[laneIndex] +
      getRandomBetween(-90, 130) +
      140;
    const candidateTop = getRandomBetween(laneTopStart, laneTopEnd);
    const candidateRect = {
      left: candidateLeft,
      top: candidateTop,
      width,
      height,
    };

    if (
      !occupiedRects.some((existingRect) =>
        rectsOverlap(candidateRect, existingRect, 56),
      )
    ) {
      left = candidateLeft;
      top = candidateTop;
      break;
    }
  }

  let resolvedRect = {
    left,
    top,
    width,
    height,
  };

  while (
    occupiedRects.some((existingRect) =>
      rectsOverlap(resolvedRect, existingRect, 56),
    )
  ) {
    left += 56;
    resolvedRect = {
      ...resolvedRect,
      left,
    };
  }

  const shouldRelationshipMove = false;

  return {
    width: `${width}px`,
    height: `${height}px`,
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    relationshipMotion: shouldRelationshipMove
      ? {
          targetX: getRandomBetween(8, 18) * (Math.random() < 0.5 ? -1 : 1),
          targetY: getRandomBetween(-4, 4),
          zIndex: Math.round(getRandomBetween(18, 28)),
        }
      : null,
    zIndex: Math.round(getRandomBetween(1, 12)),
  };
}

function getRandomOpacity() {
  const opacities = [0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1];
  return opacities[Math.floor(Math.random() * opacities.length)];
}

function getRandomImageMotion() {
  return {
    duration: Number(getRandomBetween(0.72, 1.08).toFixed(2)),
    delay: Number(getRandomBetween(0, 0.08).toFixed(2)),
  };
}

function createGalleryBatch(batchIndex, occupiedRects = []) {
  return shuffleArray(allImages).map((src, itemIndex) => {
    const layout = getRandomLayout(itemIndex, batchIndex, occupiedRects);

    occupiedRects.push({
      left: Number.parseFloat(layout.left),
      top: Number.parseFloat(layout.top),
      width: Number.parseFloat(layout.width),
      height: Number.parseFloat(layout.height),
    });

    return {
      id: `${batchIndex}-${itemIndex}`,
      batchIndex,
      src,
      alt: `Gallery image ${itemIndex + 1}`,
      layout,
      opacity: getRandomOpacity(),
      tag: imageTags[src] || null,
      motion: getRandomImageMotion(),
    };
  });
}

function buildGalleryItems(batchCount = initialGalleryBatches) {
  const occupiedRects = [];

  return Array.from({ length: batchCount }, (_, batchIndex) =>
    createGalleryBatch(batchIndex, occupiedRects),
  ).flat();
}

function getOccupiedRects(items) {
  return items.map((item) => ({
    left: Number.parseFloat(item.layout.left),
    top: Number.parseFloat(item.layout.top),
    width: Number.parseFloat(item.layout.width),
    height: Number.parseFloat(item.layout.height),
  }));
}

function getGalleryTrackWidth(items) {
  const contentWidth = items.reduce((maxRight, item) => {
    const left = Number.parseFloat(item.layout.left);
    const width = Number.parseFloat(item.layout.width);

    return Math.max(maxRight, left + width);
  }, 0);

  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;

  return Math.ceil(contentWidth + viewportWidth);
}

function getNextGalleryBatchIndex(items) {
  if (items.length === 0) return 0;

  return Math.max(...items.map((item) => item.batchIndex)) + 1;
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
  const galleryMovementRef = useRef({
    direction: 1,
    distance: 0,
    enabled: true,
    velocity: 0,
  });
  const isExtendingGalleryRef = useRef(false);
  const animatedImagesRef = useRef(new Set());
  const focusTimelineRef = useRef(null);
  const focusedIdRef = useRef(null);
  const [galleryItems, setGalleryItems] = useState([]);
  const [focusedId, setFocusedId] = useState(null);
  const [focusedImage, setFocusedImage] = useState(null);

  useEffect(() => {
    galleryMovementRef.current.distance = 0;
    animatedImagesRef.current.clear();
    setGalleryItems(buildGalleryItems());

    const handleResize = () => {
      galleryMovementRef.current.distance = 0;
      animatedImagesRef.current.clear();
      setGalleryItems(buildGalleryItems());
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
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
        galleryMovementRef.current.enabled = true;
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
          x: 0,
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

      galleryMovementRef.current.enabled = false;
      galleryMovementRef.current.velocity = 0;

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
            .slice(0, 6)
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
            x: 0,
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

    const setTrackX = gsap.quickSetter(track, "x", "px");
    const movement = galleryMovementRef.current;
    const animatedImages = animatedImagesRef.current;
    const preEntryDistance = 360;
    const friction = 0.92;
    let animationFrame = null;
    let touchPoint = null;

    scrollContainer.style.height = "100vh";

    galleryItems.forEach((item) => {
      const wrapper = track.querySelector(`[data-image-id="${item.id}"]`);
      if (!wrapper) return;
      if (animatedImages.has(item.id)) return;

      gsap.set(wrapper, {
        opacity: 0.18,
        y: 12,
        scale: 0.96,
        filter: "blur(8px) saturate(0.72) brightness(0.94)",
      });
      wrapper.dataset.initialReveal = wrapper.dataset.initialReveal || "true";
      wrapper.dataset.smoothX = "0";
      wrapper.dataset.smoothY = "12";
      wrapper.dataset.smoothScale = "0.96";
    });

    const updateEntranceAnimations = () => {
      galleryItems.forEach((item) => {
        const wrapper = track.querySelector(`[data-image-id="${item.id}"]`);
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const isVisible = rect.right > 0 && rect.left < window.innerWidth;
        const isNearViewport =
          rect.right > -preEntryDistance &&
          rect.left < window.innerWidth + preEntryDistance;
        const isAwayFromViewport =
          rect.right < -preEntryDistance ||
          rect.left > window.innerWidth + preEntryDistance;
        const wrapperCenter = rect.left + rect.width / 2;
        const viewportCenter = window.innerWidth / 2;
        const centerAmount =
          1 -
          clamp(Math.abs(wrapperCenter - viewportCenter) / viewportCenter, 0, 1);
        const centerScale = 1 - centerAmount * 0.05;
        const relationshipProgress = item.layout.relationshipMotion
          ? Number(wrapper.dataset.relationshipProgress || 0)
          : 0;
        const relationshipTarget =
          item.layout.relationshipMotion && movement.direction >= 0 ? 1 : 0;
        const nextRelationshipProgress =
          relationshipProgress +
          (relationshipTarget - relationshipProgress) * 0.08;
        const relationshipX =
          (item.layout.relationshipMotion?.targetX || 0) *
          nextRelationshipProgress;
        const relationshipY =
          (item.layout.relationshipMotion?.targetY || 0) *
          nextRelationshipProgress;

        if (item.layout.relationshipMotion) {
          wrapper.dataset.relationshipProgress = String(
            nextRelationshipProgress,
          );
        }

        if (isNearViewport && !animatedImages.has(item.id)) {
          animatedImages.add(item.id);

          const initialStagger =
            wrapper.dataset.initialReveal === "true" && isVisible
              ? clamp(rect.left / window.innerWidth, 0, 1) * 0.42
              : 0;

          gsap.fromTo(
            wrapper,
            {
              opacity: 0.18,
              y: 12,
              scale: 0.96,
              filter: "blur(8px) saturate(0.72) brightness(0.94)",
            },
            {
              opacity: item.opacity,
              y: 0,
              scale: 1,
              filter: "blur(0px) saturate(1) brightness(1)",
              duration: item.motion.duration,
              delay: initialStagger + item.motion.delay,
              ease: "power3.out",
              onComplete: () => {
                wrapper.dataset.initialReveal = "false";
                wrapper.dataset.hasEntered = "true";
                wrapper.dataset.smoothX = "0";
                wrapper.dataset.smoothY = "0";
                wrapper.dataset.smoothScale = "1";
              },
              overwrite: "auto",
            },
          );
        }

        if (
          isVisible &&
          animatedImages.has(item.id) &&
          wrapper.dataset.hasEntered === "true"
        ) {
          const activeZIndex =
            nextRelationshipProgress > 0.02
              ? item.layout.relationshipMotion?.zIndex || item.layout.zIndex
              : item.layout.zIndex;
          const isBehindOverlappingImage = galleryItems.some((otherItem) => {
            if (otherItem.id === item.id) return false;

            const otherWrapper = track.querySelector(
              `[data-image-id="${otherItem.id}"]`,
            );
            if (!otherWrapper || !animatedImages.has(otherItem.id)) {
              return false;
            }

            const otherRect = otherWrapper.getBoundingClientRect();
            const overlaps =
              rect.left < otherRect.right &&
              rect.right > otherRect.left &&
              rect.top < otherRect.bottom &&
              rect.bottom > otherRect.top;

            if (!overlaps) return false;

            const otherRelationshipProgress = Number(
              otherWrapper.dataset.relationshipProgress || 0,
            );
            const otherZIndex =
              otherRelationshipProgress > 0.02
                ? otherItem.layout.relationshipMotion?.zIndex ||
                  otherItem.layout.zIndex
                : otherItem.layout.zIndex;

            return otherZIndex > activeZIndex;
          });
          const targetX = relationshipX;
          const targetY = relationshipY;
          const targetScale = centerScale;
          const smoothX = Number(wrapper.dataset.smoothX || 0);
          const smoothY = Number(wrapper.dataset.smoothY || 0);
          const smoothScale = Number(wrapper.dataset.smoothScale || 1);
          const nextX = smoothX + (targetX - smoothX) * 0.14;
          const nextY = smoothY + (targetY - smoothY) * 0.14;
          const nextScale =
            smoothScale + (targetScale - smoothScale) * 0.14;

          wrapper.dataset.smoothX = String(nextX);
          wrapper.dataset.smoothY = String(nextY);
          wrapper.dataset.smoothScale = String(nextScale);

          gsap.set(wrapper, {
            opacity: isBehindOverlappingImage
              ? item.opacity * 0.8
              : item.opacity,
            x: nextX,
            y: nextY,
            scale: nextScale,
            zIndex: activeZIndex,
          });
        }

        if (isAwayFromViewport && animatedImages.has(item.id)) {
          animatedImages.delete(item.id);
          gsap.set(wrapper, {
            opacity: 0.18,
            x: 0,
            y: 12,
            scale: 0.96,
            zIndex: item.layout.zIndex,
            filter: "blur(8px) saturate(0.72) brightness(0.94)",
          });
          wrapper.dataset.relationshipProgress = "0";
          wrapper.dataset.hasEntered = "false";
          wrapper.dataset.smoothX = "0";
          wrapper.dataset.smoothY = "12";
          wrapper.dataset.smoothScale = "0.96";
        }
      });
    };

    const extendGalleryIfNeeded = () => {
      const remainingTrack = track.scrollWidth - movement.distance;
      const extensionThreshold = window.innerWidth * 3;

      if (
        remainingTrack > extensionThreshold ||
        isExtendingGalleryRef.current
      ) {
        return;
      }

      isExtendingGalleryRef.current = true;

      setGalleryItems((currentItems) => {
        const nextBatchIndex = getNextGalleryBatchIndex(currentItems);
        const occupiedRects = getOccupiedRects(currentItems);

        return [
          ...currentItems,
          ...createGalleryBatch(nextBatchIndex, occupiedRects),
        ];
      });

      requestAnimationFrame(() => {
        isExtendingGalleryRef.current = false;
      });
    };

    const updateGalleryMotion = () => {
      setTrackX(-movement.distance);
      extendGalleryIfNeeded();
      updateEntranceAnimations();
    };

    const animateGallery = () => {
      const canMove = movement.enabled && focusedIdRef.current === null;
      const currentVelocity = canMove ? movement.velocity : 0;

      if (currentVelocity !== 0) {
        movement.direction = currentVelocity > 0 ? 1 : -1;
      }

      movement.distance = Math.max(0, movement.distance + currentVelocity);

      if (movement.distance === 0 && movement.velocity < 0) {
        movement.velocity = 0;
      } else {
        movement.velocity *= friction;
      }

      updateGalleryMotion();
      animationFrame = requestAnimationFrame(animateGallery);
    };

    const addGalleryVelocity = (delta) => {
      if (!movement.enabled || focusedIdRef.current !== null) return;

      if (delta !== 0) {
        movement.direction = delta > 0 ? 1 : -1;
      }

      movement.velocity = clamp(movement.velocity + delta * 0.16, -42, 42);
    };

    const handleWheel = (event) => {
      event.preventDefault();
      addGalleryVelocity(event.deltaY + event.deltaX);
    };

    const handleTouchStart = (event) => {
      const touch = event.touches[0];
      touchPoint = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };

    const handleTouchMove = (event) => {
      const touch = event.touches[0];
      if (!touch || !touchPoint) return;

      event.preventDefault();

      const deltaX = touchPoint.x - touch.clientX;
      const deltaY = touchPoint.y - touch.clientY;
      touchPoint = { x: touch.clientX, y: touch.clientY };
      addGalleryVelocity(deltaX + deltaY);
    };

    updateGalleryMotion();
    animationFrame = requestAnimationFrame(animateGallery);

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      focusTimelineRef.current?.kill();
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [galleryItems]);

  if (galleryItems.length === 0) {
    return <div className="app-shell" />;
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">[ urbānum ]</div>
        <nav className="top-menu" aria-label="Gallery navigation">
          <div className="top-menu__group" aria-label="Browse tools">
            <button type="button" className="text-control text-control--active">
              Filter
            </button>
            <button type="button" className="text-control text-control--muted">
              Search
            </button>
          </div>
          <button type="button" className="text-control text-control--active">
            Menu
          </button>
        </nav>
      </header>

      <div className="scroll-container" ref={scrollContainerRef}>
        <div className="sticky-wrapper">
          <div
            className="gallery-track"
            ref={trackRef}
            style={{ width: `${getGalleryTrackWidth(galleryItems)}px` }}
          >
            {galleryItems.map((item) => (
              <button
                key={item.id}
                type="button"
                data-image-id={item.id}
                data-batch-index={item.batchIndex}
                className={`gallery-image-wrapper${
                  imageFocusEnabled ? "" : " gallery-image-wrapper--disabled"
                }`}
                onClick={
                  imageFocusEnabled ? () => handleImageClick(item.id) : undefined
                }
                aria-label={imageFocusEnabled ? `Focus ${item.alt}` : item.alt}
                aria-pressed={
                  imageFocusEnabled ? focusedId === item.id : undefined
                }
                tabIndex={imageFocusEnabled ? 0 : -1}
                style={{
                  width: item.layout.width,
                  height: item.layout.height,
                  left: item.layout.left,
                  top: item.layout.top,
                  opacity: item.opacity,
                  zIndex: item.layout.zIndex,
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

      <div className="zoom-controls" aria-label="Zoom controls">
        <button type="button" className="zoom-control" aria-label="Zoom out">
          -
        </button>
        <button type="button" className="zoom-control" aria-label="Zoom in">
          +
        </button>
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
          <img src={focusedImage.src} alt={focusedImage.alt} loading="lazy" />
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
          <img src={item.src} alt={item.alt} loading="lazy" />
        </div>
      ))}
    </div>
  );
}

export default App;
