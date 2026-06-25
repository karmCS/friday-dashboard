"use client";

import { useEffect, useRef, useState } from "react";

import { t } from "@/components/dashboard/tokens";

/**
 * Taco photo helpers, shared by the quick-log form and the log table.
 *
 * Upload happens in two hops (the API is split that way): `POST /api/tacos` creates the row,
 * then `POST /api/tacos/photo` (multipart) attaches the file. Photos are read back through
 * `GET /api/tacos/[id]/photo` — the API exposes only a `has_photo` boolean, never the server
 * file path, and the client builds the serving URL from the taco id.
 */

/** 8 MB — mirrors the server ceiling in api/tacos/photo/route.ts. */
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/** Accept filter for the file input + client guard (mirrors the server's ALLOWED_TYPES). */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);

/** Human-readable accepted-formats hint (announced to AT, shown under the picker). */
export const PHOTO_HINT = "JPEG, PNG, WebP, GIF or HEIC · up to 8 MB";

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
  if (row.has_photo) return `/api/tacos/${row.id}/photo`;
  return null;
}

const BODY = t.font.body;
const FRAME = "rgba(236,160,230,.4)";

/** A row's thumbnail in the log: a button that opens the lightbox, with a graceful
 *  fallback for images the browser can't decode (e.g. HEIC on desktop Chrome). */
export function TacoThumb({ row, onOpen }: { row: PhotoViewRow; onOpen: (row: PhotoViewRow) => void }) {
  const [failed, setFailed] = useState(false);
  const src = photoUrlFor(row);
  if (!src) return <span aria-hidden style={{ opacity: 0.28, fontSize: 14 }}>📷</span>;

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
          style={{ display: "flex", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 6, fontSize: 8, fontWeight: 800, letterSpacing: ".04em", color: "#cf9fe0", background: "#1c0f22", boxShadow: `inset 0 0 0 1px ${FRAME}` }}
        >
          IMG
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- user upload served from our own API */
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 6, display: "block", boxShadow: `inset 0 0 0 1px ${FRAME}` }}
        />
      )}
    </button>
  );
}

/** Full-image overlay. Esc or backdrop click closes; focus moves to Close and returns on exit. */
export function PhotoLightbox({ row, onClose }: { row: PhotoViewRow; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    prevFocus.current = (document.activeElement as HTMLElement | null) ?? null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [onClose]);

  const src = photoUrlFor(row);
  if (!src) return null;
  const where = [row.place, row.city, row.state].filter(Boolean).join(", ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo of ${row.place}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(5,5,10,.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "min(92vw,760px)" }}>
        {failed ? (
          <div
            style={{ padding: "48px 40px", textAlign: "center", background: "#160a1c", borderRadius: 12, boxShadow: `inset 0 0 0 1px ${FRAME}` }}
          >
            <div aria-hidden style={{ fontSize: 30 }}>🖼️</div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 14, color: "#ffd9f4", marginTop: 10 }}>Preview not supported here</div>
            <div style={{ fontFamily: BODY, fontSize: 12, color: "#cf9fe0", marginTop: 5 }}>
              This image (likely HEIC) can’t render in this browser. Open it on your device.
            </div>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- user upload served from our own API */
          <img
            src={src}
            alt={`Taco at ${where}`}
            onError={() => setFailed(true)}
            style={{ maxWidth: "100%", maxHeight: "76vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}
          />
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 13, color: "#e8d2e6" }}>{where}</span>
          <button
            ref={closeRef}
            type="button"
            className="fr-pressable"
            onClick={onClose}
            style={{
              border: "1px solid rgba(236,160,230,.4)",
              background: "#1c0f22",
              color: "#ffd9f4",
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
    </div>
  );
}
