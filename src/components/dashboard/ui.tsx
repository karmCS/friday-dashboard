"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** Visually-hidden but screen-reader-available (clip pattern). */
export const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span style={srOnly}>{children}</span>;
}

/** First focusable element in the document; jumps keyboard users past the rail to <main>. */
export function SkipLink() {
  return (
    <a href="#main" className="fr-skip-link">
      Skip to content
    </a>
  );
}

/**
 * Shimmering placeholder shaped like the content it stands in for — reserves final height so
 * there is no layout shift when real data arrives. Decorative (aria-hidden); pair with an
 * aria-live "Loading…" announcement at the section level. Shimmer is disabled under
 * prefers-reduced-motion via the .fr-skel rule in globals.css.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return <div className="fr-skel" aria-hidden style={{ width, height, borderRadius: radius, ...style }} />;
}

const FOCUSABLE_SELECTOR = "a[href], button, input, select, textarea, [tabindex]";

/**
 * Focus trap for modal dialogs. On mount: remembers the previously-focused element, moves
 * focus to the first focusable inside the container, traps Tab/Shift+Tab within it, and closes
 * on Escape. On unmount: restores focus to the opener. Runs ONCE (mount-only) and reads the
 * latest `onClose` through a ref, so a parent re-render passing a fresh closure does NOT re-run
 * the effect or steal focus mid-view. Attach the returned ref to the dialog's content element.
 */
export function useFocusTrap<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    const prevFocus = document.activeElement as HTMLElement | null;
    const focusables = (): HTMLElement[] =>
      node
        ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            (el) => el.tabIndex !== -1 && !el.hasAttribute("disabled") && el.offsetParent !== null,
          )
        : [];

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !node.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
    };
    // Mount-only: onClose is read via ref so parent re-renders don't re-run this or steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
