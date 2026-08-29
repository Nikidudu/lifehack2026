import { useRef, useState } from "react";

export default function UploadZone({ busy, step, onFile }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  if (busy) {
    return (
      <div className="upload-zone busy">
        <div className="spinner" />
        <p className="step-text">{step}</p>
      </div>
    );
  }

  const pick = (files) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`upload-zone ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        pick(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".db,.sqlite,.sqlite3"
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      <div className="upload-icon">🗃️</div>
      <h2>Drop your product catalog</h2>
      <p>
        Drag a SQLite <code>.db</code> file here, or click to browse. We detect
        your product table automatically.
      </p>
    </div>
  );
}
