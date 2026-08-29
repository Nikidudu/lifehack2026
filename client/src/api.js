async function handle(res) {
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server error (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

export function uploadDb(file) {
  const form = new FormData();
  form.append("file", file);
  return fetch("/api/upload", { method: "POST", body: form }).then(handle);
}

export function post(path, body) {
  return fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle);
}

export function get(path, params) {
  const qs = new URLSearchParams(params).toString();
  return fetch(`/api/${path}?${qs}`).then(handle);
}
