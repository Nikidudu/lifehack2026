import { useCallback, useEffect, useState } from "react";
import { uploadDb, post, get } from "./api.js";
import UploadZone from "./components/UploadZone.jsx";
import TablePicker from "./components/TablePicker.jsx";
import CatalogSidebar from "./components/CatalogSidebar.jsx";
import Workspace from "./components/Workspace.jsx";

// phases: upload → (chooseTable) → processing → work
export default function App() {
  const [phase, setPhase] = useState("upload");
  const [error, setError] = useState(null);
  const [step, setStep] = useState("");
  const [session, setSession] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [types, setTypes] = useState([]);
  const [taxonomy, setTaxonomy] = useState({});
  const [progress, setProgress] = useState({}); // "type|attr" → assigned count
  const [totalAssignments, setTotalAssignments] = useState(0);
  const [current, setCurrent] = useState(null); // {type, attrIndex} | null = all done
  const [isMock, setIsMock] = useState(false);

  const runPipeline = useCallback(async (summary) => {
    setSession(summary);
    setPhase("processing");
    setError(null);
    try {
      setStep("Identifying product types…");
      const { types: t } = await post("classify", { sessionId: summary.sessionId });
      setTypes(t);

      setStep("Generating category suggestions with AI…");
      const { taxonomy: tax, mock } = await post("taxonomy", {
        sessionId: summary.sessionId,
      });
      setTaxonomy(tax);
      setIsMock(Boolean(mock));

      const first = t.find((ty) => tax[ty.name]?.length);
      setCurrent(first ? { type: first.name, attrIndex: 0 } : null);
      setPhase("work");
    } catch (err) {
      setError(err.message);
      setPhase("upload");
    }
  }, []);

  const handleFile = useCallback(
    async (file) => {
      setError(null);
      setStep("Reading your catalog…");
      setPhase("processing");
      try {
        const res = await uploadDb(file);
        if (res.needsTableChoice) {
          setSession({ sessionId: res.sessionId });
          setCandidates(res.candidates);
          setPhase("chooseTable");
          return;
        }
        await runPipeline(res);
      } catch (err) {
        setError(err.message);
        setPhase("upload");
      }
    },
    [runPipeline]
  );

  const handleChooseTable = useCallback(
    async (table) => {
      setStep("Reading your catalog…");
      setPhase("processing");
      try {
        const res = await post("choose-table", {
          sessionId: session.sessionId,
          table,
        });
        await runPipeline(res);
      } catch (err) {
        setError(err.message);
        setPhase("chooseTable");
      }
    },
    [session, runPipeline]
  );

  // Re-sync sidebar counts from the server whenever the working attribute
  // changes (covers navigation, auto-advance, and the completion screen).
  useEffect(() => {
    if (phase !== "work" || !session) return;
    get("state", { sessionId: session.sessionId })
      .then((st) => {
        setIsMock(Boolean(st.mock));
        setTotalAssignments(st.totalAssignments);
        setProgress(
          Object.fromEntries(
            st.progress.map((p) => [`${p.type}|${p.attribute}`, p.assigned])
          )
        );
      })
      .catch(() => {}); // sidebar counts are non-critical
  }, [phase, session, current]);

  const advance = useCallback(
    (cur) => {
      const attrs = taxonomy[cur.type] || [];
      if (cur.attrIndex + 1 < attrs.length) {
        return { type: cur.type, attrIndex: cur.attrIndex + 1 };
      }
      const ti = types.findIndex((t) => t.name === cur.type);
      for (let i = ti + 1; i < types.length; i++) {
        if (taxonomy[types[i].name]?.length) {
          return { type: types[i].name, attrIndex: 0 };
        }
      }
      return null;
    },
    [taxonomy, types]
  );

  const handleAssigned = useCallback((type, attribute, total) => {
    setTotalAssignments(total);
    setProgress((p) => {
      const key = `${type}|${attribute}`;
      return { ...p, [key]: (p[key] || 0) + 1 };
    });
  }, []);

  const handleAttributeDone = useCallback(() => {
    setCurrent((cur) => (cur ? advance(cur) : null));
  }, [advance]);

  if (phase === "upload" || phase === "processing" || phase === "chooseTable") {
    return (
      <div className="landing">
        <header className="landing-header">
          <div className="logo">
            Catalog<span>Enricher</span>
          </div>
          <p className="tagline">
            Make your products legible to AI assistants — human-verified
            attributes, zero hallucination.
          </p>
        </header>
        {error && <div className="banner error">{error}</div>}
        {phase === "chooseTable" ? (
          <TablePicker candidates={candidates} onChoose={handleChooseTable} />
        ) : (
          <UploadZone busy={phase === "processing"} step={step} onFile={handleFile} />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <CatalogSidebar
        session={session}
        isMock={isMock}
        types={types}
        taxonomy={taxonomy}
        progress={progress}
        current={current}
        totalAssignments={totalAssignments}
        onSelect={(type, attrIndex) => setCurrent({ type, attrIndex })}
      />
      <main className="workspace-pane">
        {current ? (
          <Workspace
            key={`${current.type}|${current.attrIndex}`}
            session={session}
            type={current.type}
            attribute={taxonomy[current.type][current.attrIndex]}
            onAssigned={handleAssigned}
            onDone={handleAttributeDone}
          />
        ) : (
          <div className="all-done">
            <div className="all-done-emoji">🎉</div>
            <h2>Catalog enriched!</h2>
            <p>
              {totalAssignments} human-verified attribute
              {totalAssignments === 1 ? "" : "s"} recorded. Download the
              enriched database from the sidebar, or click any category to keep
              refining.
            </p>
            <a
              className="btn primary"
              href={`/api/download?sessionId=${session.sessionId}`}
            >
              Download enriched .db
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
