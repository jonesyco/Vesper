// True when the bookmark's title, URL or note contains `query`.
// `query` must already be lowercased.
export function bookmarkMatches(bookmark, query, notes) {
  return (
    bookmark.title.toLowerCase().includes(query) ||
    bookmark.url.toLowerCase().includes(query) ||
    (notes[bookmark.id] || "").toLowerCase().includes(query)
  );
}
