import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { get, post } from "../api.js";
import ProductCard from "./ProductCard.jsx";
import CategoryBoxes from "./CategoryBoxes.jsx";

// One (product type, attribute) pass: shows uncategorized products one by one;
// the user drags each into a value box (or clicks it / presses 1-3), or skips.
export default function Workspace({ session, type, attribute, onAssigned, onDone }) {
  const [queue, setQueue] = useState(null); // null = loading
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  useEffect(() => {
    let alive = true;
    get("products", {
      sessionId: session.sessionId,
      type,
      attribute: attribute.name,
    })
      .then(({ products }) => {
        if (alive) {
          setQueue(products);
          setIdx(0);
        }
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [session.sessionId, type, attribute.name]);

  const product = queue ? queue[idx] : null;
  const finished = queue !== null && idx >= queue.length;

  useEffect(() => {
    if (finished) onDone();
  }, [finished, onDone]);

  const assign = useCallback(
    async (value) => {
      if (!product || busy) return;
      setBusy(true);
      setError(null);
      try {
        const { totalAssignments } = await post("assign", {
          sessionId: session.sessionId,
          productId: product.id,
          attribute: attribute.name,
          value,
        });
        onAssigned(type, attribute.name, totalAssignments);
        setIdx((i) => i + 1);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [product, busy, session.sessionId, attribute.name, type, onAssigned]
  );

  const skip = useCallback(() => {
    if (product && !busy) setIdx((i) => i + 1);
  }, [product, busy]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "s" || e.key === " ") {
        e.preventDefault();
        skip();
      }
      const n = Number(e.key);
      if (n >= 1 && n <= attribute.values.length) assign(attribute.values[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assign, skip, attribute.values]);

  if (error) {
    return (
      <div className="workspace">
        <div className="banner error">{error}</div>
      </div>
    );
  }
  if (queue === null) {
    return (
      <div className="workspace centered">
        <div className="spinner" />
      </div>
    );
  }
  if (finished) return null; // parent advances immediately

  const remaining = queue.length - idx;

  return (
    <div className="workspace">
      <header className="ws-header">
        <div>
          <div className="ws-breadcrumb">{type}</div>
          <h2 className="ws-title">
            {attribute.name}
            <span className="ws-kind">
              {attribute.kind === "binary" ? "yes or no?" : "pick one of three"}
            </span>
          </h2>
        </div>
        <div className="ws-remaining">
          <strong>{remaining}</strong> left
        </div>
      </header>

      <p className="ws-hint">
        Drag the card into a box — or click a box, or press{" "}
        {attribute.values.map((_, i) => i + 1).join(" / ")}. Not sure? Skip it.
      </p>

      <DndContext
        sensors={sensors}
        onDragEnd={({ over }) => over && assign(String(over.id))}
      >
        <div className="stage">
          <ProductCard key={product.id} product={product} />
          <CategoryBoxes
            values={attribute.values}
            kind={attribute.kind}
            onAssign={assign}
          />
        </div>
      </DndContext>

      <div className="ws-actions">
        <button className="btn ghost" onClick={skip} disabled={busy}>
          Skip this product →
        </button>
      </div>
    </div>
  );
}
