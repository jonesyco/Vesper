// Stand-in for the WebExtension APIs so newtab.html can run on a plain
// http:// page in Playwright. Injected with page.addInitScript before any
// page script runs. Everything lives in memory and resets on reload.
(() => {
  const createEvent = () => {
    const listeners = new Set();
    return {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
      hasListener: (listener) => listeners.has(listener),
      emit: (...args) => listeners.forEach((listener) => listener(...args))
    };
  };
  const clone = (value) => (value === undefined ? undefined : structuredClone(value));

  let nextId = 100;
  const tree = {
    id: "0", title: "", children: [
      { id: "1", parentId: "0", title: "Bookmarks bar", children: [
        { id: "10", parentId: "1", title: "GitHub", url: "https://github.com/" },
        { id: "11", parentId: "1", title: "MDN Web Docs", url: "https://developer.mozilla.org/" },
        { id: "12", parentId: "1", title: "Work", children: [
          { id: "13", parentId: "12", title: "Jira", url: "https://jira.example.com/" }
        ] }
      ] },
      { id: "2", parentId: "0", title: "Other bookmarks", children: [
        { id: "20", parentId: "2", title: "Hacker News", url: "https://news.ycombinator.com/" }
      ] }
    ]
  };

  const find = (id, node = tree) => {
    if (node.id === id) {
      return node;
    }
    for (const child of node.children || []) {
      const found = find(id, child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const detach = (node) => {
    const parent = find(node.parentId);
    parent.children = parent.children.filter((child) => child.id !== node.id);
  };

  const bookmarkEvents = {
    onCreated: createEvent(),
    onRemoved: createEvent(),
    onChanged: createEvent(),
    onMoved: createEvent()
  };

  const bookmarks = {
    ...bookmarkEvents,
    getTree: async () => [clone(tree)],
    create: async ({ parentId, title, url }) => {
      const node = { id: String(nextId++), parentId, title: title || "", ...(url ? { url } : { children: [] }) };
      find(parentId).children.push(node);
      bookmarkEvents.onCreated.emit(node.id, clone(node));
      return clone(node);
    },
    update: async (id, changes) => {
      const node = find(id);
      Object.assign(node, changes);
      bookmarkEvents.onChanged.emit(id, changes);
      return clone(node);
    },
    move: async (id, { parentId }) => {
      const node = find(id);
      detach(node);
      node.parentId = parentId;
      find(parentId).children.push(node);
      bookmarkEvents.onMoved.emit(id, { parentId });
      return clone(node);
    },
    remove: async (id) => {
      detach(find(id));
      bookmarkEvents.onRemoved.emit(id, {});
    },
    removeTree: async (id) => {
      detach(find(id));
      bookmarkEvents.onRemoved.emit(id, {});
    }
  };

  const data = {};
  const onChanged = createEvent();
  const keyList = (keys) => {
    if (keys == null) {
      return Object.keys(data);
    }
    if (typeof keys === "string") {
      return [keys];
    }
    return Array.isArray(keys) ? keys : Object.keys(keys);
  };

  const local = {
    get: async (keys) => Object.fromEntries(keyList(keys).filter((key) => key in data).map((key) => [key, clone(data[key])])),
    set: async (items) => {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: clone(data[key]), newValue: clone(value) };
        data[key] = clone(value);
      }
      onChanged.emit(changes, "local");
    },
    remove: async (keys) => {
      const changes = {};
      for (const key of [].concat(keys)) {
        if (key in data) {
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
      }
      onChanged.emit(changes, "local");
    }
  };

  window.__stub = {
    data,
    searches: [],
    topSites: [
      { url: "https://github.com/", title: "GitHub" },
      { url: "https://www.youtube.com/", title: "YouTube" },
      { url: "chrome://newtab/", title: "New Tab" },
      { url: "https://news.ycombinator.com/", title: "Hacker News" },
      { url: "https://github.com/", title: "GitHub (duplicate)" },
      { url: "https://mail.google.com/mail/u/0/", title: "Inbox" },
      { url: "https://developer.mozilla.org/", title: "MDN" },
      { url: "https://www.wikipedia.org/", title: "Wikipedia" },
      { url: "https://calendar.google.com/", title: "Calendar" },
      { url: "https://www.reddit.com/", title: "" },
      { url: "https://example.com/", title: "Example" }
    ]
  };

  globalThis.chrome = {
    bookmarks,
    storage: { local, onChanged },
    topSites: { get: async () => clone(window.__stub.topSites) },
    search: {
      query: async (options) => {
        window.__stub.searches.push(options);
      }
    },
    runtime: {
      id: "stub",
      getURL: (path) => `chrome-extension://stub/${path.replace(/^\//, "")}`,
      getManifest: () => ({ version: "test" })
    }
  };
})();
