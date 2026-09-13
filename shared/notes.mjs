// 首页、归档和订阅共用的公开观点与链接规则。短记通过归档锚点保留固定入口。
export function publicNotes(notes) {
  return (Array.isArray(notes?.items) ? notes.items : []).filter((item) => item && typeof item === "object");
}

export function noteAnchor(note) {
  return `note-${String(note.id)}`;
}

export function noteHref(note) {
  return note?.slug
    ? `/notes/${encodeURIComponent(note.slug)}/`
    : `/notes/#${encodeURIComponent(noteAnchor(note))}`;
}
