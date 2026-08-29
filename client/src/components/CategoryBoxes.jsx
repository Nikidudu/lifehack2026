import { useDroppable } from "@dnd-kit/core";

function Box({ value, kind, index, onClick }) {
  const { isOver, setNodeRef } = useDroppable({ id: value });
  return (
    <button
      ref={setNodeRef}
      className={`cat-box ${isOver ? "over" : ""} ${
        kind === "binary" ? `binary-${value}` : ""
      }`}
      onClick={onClick}
    >
      <span className="box-key">{index + 1}</span>
      <span className="box-value">{value}</span>
      <span className="box-hint">drop here</span>
    </button>
  );
}

export default function CategoryBoxes({ values, kind, onAssign }) {
  return (
    <div className={`cat-boxes ${kind}`}>
      {values.map((v, i) => (
        <Box key={v} value={v} kind={kind} index={i} onClick={() => onAssign(v)} />
      ))}
    </div>
  );
}
