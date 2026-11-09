"use client";

import { Maximize2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

export default function ImageFrame({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;
  return (
    <span className="image-frame">
      {/* Markdown images are remote URLs, not local assets. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" />
      <button
        type="button"
        className="image-frame-expand"
        aria-label="View full size"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Maximize2 />
      </button>
      {open
        ? createPortal(
            <div
              className="image-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={alt || "Image"}
              onClick={() => setOpen(false)}
            >
              <button type="button" className="image-lightbox-close" aria-label="Close" onClick={() => setOpen(false)}>
                <X />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={alt} />
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
