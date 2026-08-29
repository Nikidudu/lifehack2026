import { randomUUID } from "node:crypto";

// In-memory session store — fine for the prototype; lost on server restart.
const sessions = new Map();

export function createSession(data) {
  const id = randomUUID();
  const session = { id, createdAt: Date.now(), ...data };
  sessions.set(id, session);
  return session;
}

export function getSession(id) {
  const s = sessions.get(id);
  if (!s) {
    throw Object.assign(
      new Error("Session not found — re-upload your database (the server may have restarted)."),
      { status: 404 }
    );
  }
  return s;
}
