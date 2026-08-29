import { useDraggable } from "@dnd-kit/core";

export default function ProductCard({ product }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: product.id });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`product-card ${isDragging ? "dragging" : ""}`}
      {...listeners}
      {...attributes}
    >
      <div className="product-name">{product.name}</div>
      {product.description && (
        <p className="product-desc">{product.description}</p>
      )}
      {product.price != null && (
        <div className="product-price">
          ${Number(product.price).toFixed(2)}
        </div>
      )}
      <div className="drag-hint">⠿ drag</div>
    </div>
  );
}
