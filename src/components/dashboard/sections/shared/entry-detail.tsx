"use client";

/**
 * Full-screen entry detail + edit + delete, shared by the Taco and Cafe trackers.
 *
 * Tapping a log row opens this: a two-pane overlay (photo | details) showing place / location /
 * rating / price / the item ordered / notes, with EDIT (inline form → PATCH) and DELETE
 * (inline confirm → DELETE). Palette + the type field name ("taco_type" / "order_item") are
 * injected so one component serves both sections. Portaled to <body> and focus-trapped.
 */

import { CSSProperties, useState } from "react";
import { createPortal } from "react-dom";

import { t, tabularNum, buttonReset } from "@/components/dashboard/tokens";
import { useFocusTrap } from "@/components/dashboard/ui";

const PRICE_TIERS = ["$", "$$", "$$$"] as const;
type PriceTier = (typeof PRICE_TIERS)[number];
const PRICE_TIER_NAMES: Record<PriceTier, string> = { $: "Budget", $$: "Moderate", $$$: "Expensive" };
const RATING_MAX = 10;

const DISPLAY = t.font.display;
const BODY = t.font.body;
const MONO = t.font.mono;

/** Per-section colour set (taco = magenta, cafe = espresso). */
export interface DetailPalette {
  frameBg: string;
  frameBorder: string;
  accent: string;
  accent2: string;
  gold: string;
  heading: string;
  body: string;
  muted: string;
  dim: string;
  inputBg: string;
  ratingColor: (r: number | null) => string;
}

/** Normalized row the detail view renders (sections map their taco_type/order_item into `type`). */
export interface DetailRow {
  id: number;
  place: string;
  city: string;
  state: string;
  type: string;
  rating: number | null;
  price_tier: string | null;
  notes: string | null;
  has_photo: boolean;
  localPhotoUrl?: string;
}

interface Props {
  row: DetailRow;
  /** API collection base, e.g. "/api/tacos". PATCH/DELETE hit `${apiBase}/${id}`; photo at `${apiBase}/${id}/photo`. */
  apiBase: string;
  /** The server field name for the item: "taco_type" | "order_item". */
  typeKey: "taco_type" | "order_item";
  /** UI label for that field: "TYPE" | "ORDER". */
  typeLabel: string;
  emoji: string;
  palette: DetailPalette;
  /** Called when the overlay should close. `changed` = an edit/delete persisted (parent should refetch). */
  onClose: (changed: boolean) => void;
}

export function EntryDetail({ row, apiBase, typeKey, typeLabel, emoji, palette: p, onClose }: Props): React.JSX.Element | null {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Edit-form state (seeded from the row).
  const [place, setPlace] = useState(row.place);
  const [city, setCity] = useState(row.city);
  const [stateVal, setStateVal] = useState(row.state);
  const [typeVal, setTypeVal] = useState(row.type);
  const [rating, setRating] = useState<number>(row.rating ?? 8);
  const [price, setPrice] = useState<PriceTier>(
    PRICE_TIERS.includes(row.price_tier as PriceTier) ? (row.price_tier as PriceTier) : "$",
  );
  const [notes, setNotes] = useState(row.notes ?? "");

  const dialogRef = useFocusTrap<HTMLFormElement>(() => onClose(false));

  const photoSrc = row.localPhotoUrl ?? (row.has_photo ? `${apiBase}/${row.id}/photo` : null);
  const where = [row.city, row.state].filter(Boolean).join(", ");
  const canSave = place.trim() !== "" && city.trim() !== "" && stateVal.trim() !== "" && typeVal.trim() !== "";

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        place: place.trim(),
        city: city.trim(),
        state: stateVal.trim(),
        [typeKey]: typeVal.trim(),
        rating,
        price_tier: price,
        notes: notes.trim() || null,
      };
      const res = await fetch(`${apiBase}/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      onClose(true);
    } catch {
      setErr("Couldn’t save — try again.");
      setBusy(false);
    }
  };

  const del = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${apiBase}/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onClose(true);
    } catch {
      setErr("Couldn’t delete — try again.");
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  // --- styles ----------------------------------------------------------------
  const inputStyle: CSSProperties = {
    width: "100%",
    background: p.inputBg,
    boxShadow: `inset 0 0 0 1px ${p.frameBorder}`,
    border: "none",
    borderRadius: 9,
    padding: "10px 13px",
    fontFamily: BODY,
    fontWeight: 700,
    fontSize: 14,
    color: p.heading,
    boxSizing: "border-box",
  };
  const fieldLabel: CSSProperties = {
    display: "block",
    fontFamily: BODY,
    fontWeight: 800,
    fontSize: 9,
    letterSpacing: ".12em",
    color: p.muted,
    marginBottom: 5,
  };
  const ghostBtn = (color: string, border: string): CSSProperties => ({
    ...buttonReset,
    height: 44,
    padding: "0 18px",
    borderRadius: 9,
    cursor: "pointer",
    background: p.inputBg,
    boxShadow: `inset 0 0 0 1px ${border}`,
    color,
    fontFamily: BODY,
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: ".07em",
  });
  const primaryBtn: CSSProperties = {
    border: "none",
    height: 44,
    padding: "0 22px",
    borderRadius: 9,
    cursor: "pointer",
    background: `linear-gradient(90deg,${p.accent},${p.accent2})`,
    color: "#fff",
    fontFamily: DISPLAY,
    fontSize: 16,
    letterSpacing: ".03em",
  };

  // --- panes -----------------------------------------------------------------
  const photoPane = (
    <div
      style={{
        flex: "1 1 320px",
        minWidth: 240,
        minHeight: 240,
        borderRadius: 12,
        overflow: "hidden",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `inset 0 0 0 1px ${p.frameBorder}`,
      }}
    >
      {photoSrc && !imgFailed ? (
        /* eslint-disable-next-line @next/next/no-img-element -- user upload served from our own API */
        <img
          src={photoSrc}
          alt={`${row.place}`}
          onError={() => setImgFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{ textAlign: "center", padding: 24 }}>
          <div aria-hidden style={{ fontSize: 40, opacity: 0.5 }}>{emoji}</div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 12, color: p.muted, marginTop: 8 }}>
            {row.has_photo ? "Preview unavailable here" : "No photo"}
          </div>
        </div>
      )}
    </div>
  );

  const viewPane = (
    <div style={{ flex: "1 1 300px", minWidth: 260, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 34, lineHeight: 1, color: p.heading }}>{row.place}</div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 13, letterSpacing: ".04em", color: p.muted, marginTop: 6 }}>
          {where}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 30, lineHeight: 1, color: p.ratingColor(row.rating), ...tabularNum }}>
          {row.rating ?? "—"}
          <span style={{ fontSize: 13, color: p.muted }}>/10</span>
        </span>
        {row.price_tier ? (
          <span style={{ alignSelf: "center", fontFamily: DISPLAY, fontSize: 20, color: p.gold }}>{row.price_tier}</span>
        ) : null}
      </div>

      <div>
        <div style={fieldLabel}>{typeLabel}</div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 15, color: p.body }}>{row.type}</div>
      </div>

      <div>
        <div style={fieldLabel}>NOTES</div>
        <div
          style={{
            fontFamily: BODY,
            fontWeight: 500,
            fontSize: 14,
            lineHeight: 1.55,
            color: row.notes ? p.body : p.dim,
            background: "rgba(0,0,0,.18)",
            borderRadius: 9,
            padding: "12px 14px",
            minHeight: 60,
            whiteSpace: "pre-wrap",
            ...({ textWrap: "pretty" } as CSSProperties),
          }}
        >
          {row.notes || "No notes for this visit."}
        </div>
      </div>
    </div>
  );

  const editPane = (
    <div style={{ flex: "1 1 300px", minWidth: 260, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label htmlFor="ed-place" style={fieldLabel}>PLACE</label>
        <input id="ed-place" style={inputStyle} value={place} onChange={(e) => setPlace(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 9 }}>
        <div style={{ flex: 1.3 }}>
          <label htmlFor="ed-city" style={fieldLabel}>CITY</label>
          <input id="ed-city" style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="ed-state" style={fieldLabel}>STATE</label>
          <input id="ed-state" style={inputStyle} value={stateVal} onChange={(e) => setStateVal(e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="ed-type" style={fieldLabel}>{typeLabel}</label>
        <input id="ed-type" style={inputStyle} value={typeVal} onChange={(e) => setTypeVal(e.target.value)} />
      </div>

      <div role="radiogroup" aria-label="Rating out of 10">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={fieldLabel}>RATING</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 18, color: p.ratingColor(rating), ...tabularNum }}>
            {rating}
            <span style={{ fontSize: 10, color: p.muted }}>/10</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {Array.from({ length: RATING_MAX }, (_, i) => {
            const value = i + 1;
            const lit = value <= rating;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`Rate ${value} out of 10`}
                className="fr-pressable"
                onClick={() => setRating(value)}
                style={{
                  flex: 1,
                  height: 24,
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: lit ? `linear-gradient(180deg,${p.accent},${p.accent2})` : p.inputBg,
                  boxShadow: lit ? "none" : `inset 0 0 0 1px ${p.frameBorder}`,
                }}
              />
            );
          })}
        </div>
      </div>

      <div role="radiogroup" aria-label="Price tier">
        <span style={fieldLabel}>PRICE TIER</span>
        <div style={{ display: "flex", gap: 8 }}>
          {PRICE_TIERS.map((tier) => {
            const active = price === tier;
            return (
              <button
                key={tier}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={PRICE_TIER_NAMES[tier]}
                className="fr-pressable"
                onClick={() => setPrice(tier)}
                style={{
                  flex: 1,
                  height: 44,
                  border: "none",
                  borderRadius: 9,
                  cursor: "pointer",
                  fontFamily: DISPLAY,
                  fontSize: 18,
                  background: active ? `linear-gradient(180deg,${p.gold},${p.accent2})` : p.inputBg,
                  color: active ? "#fff" : p.dim,
                  boxShadow: active ? "none" : `inset 0 0 0 1px ${p.frameBorder}`,
                }}
              >
                {tier}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="ed-notes" style={fieldLabel}>NOTES <span style={{ color: p.dim }}>· OPTIONAL</span></label>
        <textarea
          id="ed-notes"
          rows={3}
          style={{ ...inputStyle, fontWeight: 500, resize: "vertical" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </div>
  );

  // --- action bar ------------------------------------------------------------
  let actions: React.JSX.Element;
  if (editing) {
    actions = (
      <>
        <button type="button" className="fr-pressable" onClick={() => setEditing(false)} disabled={busy} style={ghostBtn(p.muted, p.frameBorder)}>
          CANCEL
        </button>
        <button type="submit" className="fr-pressable" disabled={!canSave || busy} style={{ ...primaryBtn, opacity: canSave && !busy ? 1 : 0.5, cursor: canSave && !busy ? "pointer" : "not-allowed" }}>
          {busy ? "SAVING…" : "SAVE"}
        </button>
      </>
    );
  } else if (confirmDelete) {
    actions = (
      <>
        <span style={{ flex: 1, alignSelf: "center", fontFamily: BODY, fontWeight: 700, fontSize: 13, color: p.body }}>
          Delete {row.place}? This can’t be undone.
        </span>
        <button type="button" className="fr-pressable" onClick={() => setConfirmDelete(false)} disabled={busy} style={ghostBtn(p.muted, p.frameBorder)}>
          CANCEL
        </button>
        <button
          type="button"
          className="fr-pressable"
          onClick={() => void del()}
          disabled={busy}
          style={{ ...ghostBtn(t.down, "rgba(255,140,120,.45)"), background: "rgba(60,24,24,.5)" }}
        >
          {busy ? "DELETING…" : "CONFIRM DELETE"}
        </button>
      </>
    );
  } else {
    actions = (
      <>
        <button type="button" className="fr-pressable" onClick={() => setConfirmDelete(true)} style={ghostBtn(t.down, "rgba(255,140,120,.4)")}>
          DELETE
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="fr-pressable" onClick={() => onClose(false)} style={ghostBtn(p.muted, p.frameBorder)}>
          CLOSE
        </button>
        <button type="button" className="fr-pressable" onClick={() => setEditing(true)} style={primaryBtn}>
          EDIT
        </button>
      </>
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${row.place} details`}
      onClick={() => onClose(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(5,4,8,.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (editing) void save();
        }}
        style={{
          width: "min(96vw,880px)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: p.frameBg,
          clipPath: t.clipCard,
          boxShadow: `inset 0 0 0 2px ${p.frameBorder}, 0 28px 80px rgba(0,0,0,.6)`,
          padding: "24px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {photoPane}
          {editing ? editPane : viewPane}
        </div>

        <div aria-live="polite" style={{ minHeight: 0 }}>
          {err ? <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 12, color: t.down }}>{err}</span> : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: `1px solid ${p.frameBorder}`, paddingTop: 16 }}>
          {actions}
        </div>
      </form>
    </div>,
    document.body,
  );
}
