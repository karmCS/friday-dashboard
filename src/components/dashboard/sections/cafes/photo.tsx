"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "@/components/dashboard/ui";

/**
 * Cafe photo helpers, shared by the quick-log form and the log table. Mirror of the Taco
 * Tracker's photo helpers (../tacos/photo) with cafe routes + the espresso palette.
 *
 * Upload happens in two hops (the API is split that way): `POST /api/cafes` creates the row,
 * then `POST /api/cafes/photo` (multipart) attaches the file. Photos are read back through
 * `GET /api/cafes/[id]/photo` — the API exposes only a `has_photo` boolean, never the server
 * file path, and the client builds the serving URL from the cafe id.
 */

/** 8 MB — mirrors the server ceiling in api/cafes/photo/route.ts. */
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/** Accept filter for the file input + client guard (mirrors the server's ALLOWED_TYPES). */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);

/** Human-readable accepted-formats hint (announced to AT, shown under the picker). */
export const PHOTO_HINT = "JPEG, PNG, WebP, GIF or HEIC · up to 8 MB";

/** Espresso frame tint (matches CafesSection). */
const FRAME = "rgba(226,184,124,.42)";
const BODY = "'Barlow',sans-serif";

/** Client-side pre-flight; returns a user-facing message or null when the file is acceptable. */
export function validatePhoto(file: File): string | null {
  if (!ALLOWED.has(file.type)) return "Use a JPEG, PNG, WebP, GIF, or HEIC image.";
  if (file.size === 0) return "That image file is empty.";
  if (file.size > PHOTO_MAX_BYTES) return "Image is over 8 MB — pick a smaller one.";
  return null;
}

/** Minimal row shape the photo UI needs (the in-state rows carry more). */
export interface PhotoViewRow {
  id: number;
  place: string;
  city: string;
  state: string;
  has_photo: boolean;
  /** Object URL of a just-picked file — shows instantly before the served route is fetched. */
  localPhotoUrl?: string;
}

/** Best display URL for a row's photo: the local object URL (instant) or the served route, else null. */
export function photoUrlFor(row: PhotoViewRow): string | null {
  if (row.localPhotoUrl) return row.localPhotoUrl;
  if (row.has_photo) return `/api/cafes/${row.id}/photo`;
  return null;
}

/** A row's thumbnail in the log: a button that opens the lightbox, with a graceful
 *  fallback for images the browser can't decode (e.g. HEIC on desktop Chrome). */
export function CafeThumb({ row, onOpen }: { row: PhotoViewRow; onOpen: (row: PhotoViewRow) => void }) {
  const [failed, setFailed] = useState(false);
  const src = photoUrlFor(row);
  if (!src) return <span aria-hidden style={{ opacity: 0.28, fontSize: 14 }}>☕</span>;

  const where = [row.place, row.city].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      className="fr-pressable"
      onClick={() => onOpen(row)}
      aria-label={`View photo of ${where}`}
      style={{ padding: 0, border: "none", background: "none", cursor: "pointer", lineHeight: 0, borderRadius: 6 }}
    >
      {failed ? (
        <span
          aria-hidden
          style={{ display: "flex", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 6, fontSize: 8, fontWeight: 800, letterSpacing: ".04em", color: "#e3a866", background: "#1d130c", boxShadow: `inset 0 0 0 1px ${FRAME}` }}
        >
          IMG
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- user upload served from our own API */
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 6, display: "block", boxShadow: `inset 0 0 0 1px ${FRAME}`, outline: "1px solid rgba(0,0,0,.18)", outlineOffset: -1 }}
        />
      )}
    </button>
  );
}

/** Full-image overlay. Esc or backdrop click closes; focus moves to Close and returns on exit. */
export function PhotoLightbox({ row, onClose }: { row: PhotoViewRow; onClose: () => void }) {
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);
  const [failed, setFailed] = useState(false);

  const src = photoUrlFor(row);
  if (!src) return null;
  const where = [row.place, row.city, row.state].filter(Boolean).join(", ");

  // Portal to <body> so the fixed overlay covers the viewport, not just the transformed section.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo of ${row.place}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(8,5,3,.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "min(92vw,760px)" }}>
        {failed ? (
          <div
            style={{ padding: "48px 40px", textAlign: "center", background: "#150c07", borderRadius: 12, boxShadow: `inset 0 0 0 1px ${FRAME}` }}
          >
            <div aria-hidden style={{ fontSize: 30 }}>🖼️</div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 14, color: "#f6e6d2", marginTop: 10 }}>Preview not supported here</div>
            <div style={{ fontFamily: BODY, fontSize: 12, color: "#e3a866", marginTop: 5 }}>
              This image (likely HEIC) can’t render in this browser. Open it on your device.
            </div>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- user upload served from our own API */
          <img
            src={src}
            alt={`Cafe at ${where}`}
            onError={() => setFailed(true)}
            style={{ maxWidth: "100%", maxHeight: "76vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}
          />
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 13, color: "#e9d6bf" }}>{where}</span>
          <button
            type="button"
            className="fr-pressable"
            onClick={onClose}
            style={{
              border: "1px solid rgba(226,184,124,.42)",
              background: "#1d130c",
              color: "#f6e6d2",
              borderRadius: 9,
              padding: "9px 15px",
              fontFamily: BODY,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: ".08em",
              cursor: "pointer",
            }}
          >
            CLOSE <span aria-hidden>✕</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
