(() => {
  const CTN_INSTANCE_KEY = "__CTN_NAV_INSTANCE_ACTIVE__";
  if (window[CTN_INSTANCE_KEY]) return;
  window[CTN_INSTANCE_KEY] = true;

  const PANEL_ID = "ctn-panel";
  const LIST_ID = "ctn-list";
  const ITEM_CLASS = "ctn-item";
  const HIGHLIGHT_CLASS = "ctn-message-highlight";
  const MESSAGE_ATTR = "data-ctn-message-id";
  const MODE_USER = "user";
  const MODE_BOTH = "both";
  const BODY_SHIFT_CLASS = "ctn-body-shift";
  const BODY_COLLAPSED_CLASS = "ctn-body-collapsed";
  const LAUNCHER_ID = "ctn-launcher";
  const COLLAPSED_LIST_CLASS = "ctn-collapsed-list";
  const PREVIEW_CLASS = "ctn-preview";
  const FOOTER_LINK = "https://abhishek-ghogare.vercel.app/";
  const REFRESH_THROTTLE_MS = 120;
  const DEBUG_STORAGE_KEY = "ctn-debug-enabled";
  const MESSAGE_NODE_SELECTORS = [
    'article[data-testid="conversation-turn"]',
    "[data-message-author-role]",
    "main article"
  ];

  let messageCounter = 0;
  let rafHandle = null;
  let timerHandle = null;
  let mutationObserver = null;
  let observedRoot = null;
  let initialized = false;
  let currentMode = MODE_BOTH;
  let lastNodes = [];
  let lastRenderKey = "";
  let forceNextRender = false;
  let activeMessageSelector = null;
  const dirtyMessageIds = new Set();
  const listItemById = new Map();
  const dotById = new Map();
  const perf = {
    refreshCount: 0,
    fullRenderCount: 0,
    patchOnlyCount: 0
  };
  let debugEnabled = false;

  const refs = {
    panel: null,
    list: null,
    collapsedList: null,
    preview: null,
    title: null,
    launcher: null
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isPanelHidden = () => Boolean(refs.panel?.classList.contains("ctn-hidden"));

  const scrollToMessage = (id) => {
    if (!id) return;
    const target = document.querySelector(`[${MESSAGE_ATTR}="${id}"]`);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add(HIGHLIGHT_CLASS);
    window.setTimeout(() => target.classList.remove(HIGHLIGHT_CLASS), 900);
  };

  const loadDebugFlag = () => {
    try {
      return window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const saveDebugFlag = (enabled) => {
    try {
      window.localStorage.setItem(DEBUG_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // Ignore localStorage failures.
    }
  };

  const getPerfSnapshot = () => ({
    refresh: perf.refreshCount,
    fullRender: perf.fullRenderCount,
    patchOnly: perf.patchOnlyCount
  });

  const setDebugEnabled = (enabled) => {
    debugEnabled = enabled;
    saveDebugFlag(enabled);
    if (refs.title) {
      refs.title.textContent = `Thread Navigator${enabled ? " (Debug)" : ""}`;
    }
  };

  const installDebugApi = () => {
    window.__CTN_DEBUG__ = {
      enable: () => setDebugEnabled(true),
      disable: () => setDebugEnabled(false),
      toggle: () => setDebugEnabled(!debugEnabled),
      stats: () => getPerfSnapshot(),
      reset: () => {
        perf.refreshCount = 0;
        perf.fullRenderCount = 0;
        perf.patchOnlyCount = 0;
      }
    };
  };

  const createPanel = () => {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.className = "ctn-panel";

    const header = document.createElement("div");
    header.className = "ctn-header";

    const title = document.createElement("div");
    title.className = "ctn-title";
    title.textContent = "Thread Navigator";

    const headerRow = document.createElement("div");
    headerRow.className = "ctn-header-row";

    const actions = document.createElement("div");
    actions.className = "ctn-actions";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.type = "button";
    minimizeBtn.className = "ctn-action-btn";
    minimizeBtn.textContent = "Min";

    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "ctn-action-btn";
    hideBtn.textContent = "Hide";

    actions.appendChild(minimizeBtn);
    actions.appendChild(hideBtn);

    const toggle = document.createElement("div");
    toggle.className = "ctn-toggle";

    const userBtn = document.createElement("button");
    userBtn.type = "button";
    userBtn.dataset.mode = MODE_USER;
    userBtn.textContent = "User";

    const bothBtn = document.createElement("button");
    bothBtn.type = "button";
    bothBtn.dataset.mode = MODE_BOTH;
    bothBtn.textContent = "User + GPT";

    toggle.appendChild(userBtn);
    toggle.appendChild(bothBtn);

    headerRow.appendChild(title);
    headerRow.appendChild(actions);

    header.appendChild(headerRow);
    header.appendChild(toggle);

    const list = document.createElement("div");
    list.id = LIST_ID;
    list.className = "ctn-list";

    const collapsedList = document.createElement("div");
    collapsedList.className = COLLAPSED_LIST_CLASS;

    const preview = document.createElement("div");
    preview.className = PREVIEW_CLASS;

    const footer = document.createElement("div");
    footer.className = "ctn-footer";
    footer.innerHTML = 'Made by Abhishek with <span class="ctn-heart" aria-hidden="true"></span>';
    footer.addEventListener("click", () => {
      window.open(FOOTER_LINK, "_blank", "noopener");
    });
    title.title = "Double-click to toggle debug metrics";
    title.addEventListener("dblclick", () => {
      setDebugEnabled(!debugEnabled);
    });

    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(collapsedList);
    panel.appendChild(footer);
    document.body.appendChild(panel);
    document.body.appendChild(preview);

    refs.panel = panel;
    refs.list = list;
    refs.collapsedList = collapsedList;
    refs.preview = preview;
    refs.title = title;

    document.body.classList.add(BODY_SHIFT_CLASS);

    const launcher = document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.className = "ctn-launcher";
    launcher.type = "button";
    launcher.textContent = "Nav";
    document.body.appendChild(launcher);
    refs.launcher = launcher;

    const setMode = (mode) => {
      currentMode = mode;
      userBtn.classList.toggle("ctn-active", mode === MODE_USER);
      bothBtn.classList.toggle("ctn-active", mode === MODE_BOTH);
      lastRenderKey = "";

      if (lastNodes.length > 0) {
        renderList(lastNodes);
      } else {
        scheduleRefresh(true);
      }
    };

    userBtn.addEventListener("click", () => setMode(MODE_USER));
    bothBtn.addEventListener("click", () => setMode(MODE_BOTH));

    setMode(MODE_BOTH);

    // Default to collapsed on load
    panel.classList.add("ctn-collapsed");
    document.body.classList.add(BODY_COLLAPSED_CLASS);
    document.body.classList.remove(BODY_SHIFT_CLASS);
    minimizeBtn.textContent = "Max";
    if (lastNodes.length > 0) {
      renderCollapsed(filterVisibleNodes(lastNodes));
    }

    const setHidden = (hidden) => {
      panel.classList.toggle("ctn-hidden", hidden);
      launcher.style.display = hidden ? "block" : "none";
      document.body.classList.toggle(BODY_SHIFT_CLASS, !hidden);
      if (hidden) {
        document.body.classList.remove(BODY_COLLAPSED_CLASS);
        panel.classList.remove("ctn-collapsed");
        minimizeBtn.textContent = "Min";
      } else {
        // Catch up after hidden mode without paying continuous render cost while hidden.
        scheduleRefresh(true);
      }
    };

    minimizeBtn.addEventListener("click", () => {
      const isCollapsed = panel.classList.toggle("ctn-collapsed");
      document.body.classList.toggle(BODY_COLLAPSED_CLASS, isCollapsed);
      document.body.classList.toggle(BODY_SHIFT_CLASS, !isCollapsed);
      minimizeBtn.textContent = isCollapsed ? "Max" : "Min";
      if (lastNodes.length > 0) {
        renderCollapsed(filterVisibleNodes(lastNodes));
      }
    });

    hideBtn.addEventListener("click", () => setHidden(true));
    launcher.addEventListener("click", () => setHidden(false));

    list.addEventListener("click", (event) => {
      const item = event.target.closest(`.${ITEM_CLASS}`);
      if (!item) return;
      scrollToMessage(item.dataset.targetId);
    });

    let lastHoverId = null;
    collapsedList.addEventListener("mousemove", (event) => {
      const dot = event.target.closest(".ctn-dot");
      if (!dot || lastHoverId === dot.dataset.targetId) return;

      lastHoverId = dot.dataset.targetId;
      const rect = dot.getBoundingClientRect();
      preview.textContent = dot.dataset.preview || "(empty)";
      preview.style.top = `${Math.max(12, rect.top - 6)}px`;
      preview.classList.add("ctn-visible");
      preview.style.display = "block";
    });

    collapsedList.addEventListener("mouseleave", () => {
      lastHoverId = null;
      preview.classList.remove("ctn-visible");
      preview.style.display = "none";
    });

    collapsedList.addEventListener("click", (event) => {
      const dot = event.target.closest(".ctn-dot");
      if (!dot) return;
      scrollToMessage(dot.dataset.targetId);
    });
  };

  const getMessageNodes = () => {
    if (activeMessageSelector) {
      const activeNodes = Array.from(document.querySelectorAll(activeMessageSelector));
      if (activeNodes.length > 0) return activeNodes;
      activeMessageSelector = null;
    }

    for (const selector of MESSAGE_NODE_SELECTORS) {
      const nodes = Array.from(document.querySelectorAll(selector));
      if (nodes.length > 0) {
        activeMessageSelector = selector;
        return nodes;
      }
    }

    return [];
  };

  const getRole = (node) => {
    const roleEl = node.matches("[data-message-author-role]")
      ? node
      : node.querySelector("[data-message-author-role]");
    return roleEl?.getAttribute("data-message-author-role") || "unknown";
  };

  const getMessageText = (node) => {
    const text = node.textContent || "";
    return text.replace(/\s+/g, " ").trim();
  };

  const ensureMessageIds = (nodes) => {
    nodes.forEach((node) => {
      if (!node.getAttribute(MESSAGE_ATTR)) {
        node.setAttribute(MESSAGE_ATTR, `ctn-${messageCounter++}`);
      }
    });
  };

  const buildListItem = (node, displayIndex) => {
    const id = node.getAttribute(MESSAGE_ATTR);
    const role = getRole(node);
    const text = getMessageText(node);
    const title = text.length > 140 ? `${text.slice(0, 140)}...` : text || "(empty)";

    const button = document.createElement("button");
    button.className = ITEM_CLASS;
    if (role === "user") {
      button.classList.add("ctn-item-user");
    } else if (role === "assistant") {
      button.classList.add("ctn-item-assistant");
    }
    button.type = "button";
    button.dataset.targetId = id;

    const roleEl = document.createElement("div");
    roleEl.className = "ctn-role";
    roleEl.textContent = role;

    const textEl = document.createElement("div");
    textEl.className = "ctn-text";
    textEl.textContent = title;

    const pill = document.createElement("span");
    pill.className = "ctn-pill";
    pill.textContent = String(displayIndex);
    roleEl.appendChild(pill);

    button.appendChild(roleEl);
    button.appendChild(textEl);

    return button;
  };

  const setListItemText = (item, text) => {
    const textEl = item.querySelector(".ctn-text");
    if (textEl) textEl.textContent = text;
  };

  const getTextBundle = (node) => {
    const text = getMessageText(node);
    const title = text.length > 140 ? `${text.slice(0, 140)}...` : text || "(empty)";
    return {
      title,
      preview: title
    };
  };

  const filterVisibleNodes = (nodes) =>
    nodes.filter((node) => {
      const role = getRole(node);
      if (currentMode === MODE_BOTH) return role === "user" || role === "assistant";
      return role === "user";
    });

  const getRenderKey = (filteredNodes) =>
    `${currentMode}:${filteredNodes
      .map((node) => `${node.getAttribute(MESSAGE_ATTR)}:${getRole(node)}`)
      .join("|")}`;

  const renderList = (nodes) => {
    const list = refs.list;
    if (!list) return;

    const filtered = filterVisibleNodes(nodes);
    const renderKey = getRenderKey(filtered);
    if (!forceNextRender && renderKey === lastRenderKey) return;

    if (forceNextRender && renderKey === lastRenderKey) {
      perf.patchOnlyCount += 1;
      patchRenderedContent(filtered);
      forceNextRender = false;
      dirtyMessageIds.clear();
      return;
    }

    perf.fullRenderCount += 1;
    lastRenderKey = renderKey;
    forceNextRender = false;
    dirtyMessageIds.clear();
    listItemById.clear();

    const fragment = document.createDocumentFragment();
    filtered.forEach((node, index) => {
      const item = buildListItem(node, index + 1);
      const id = node.getAttribute(MESSAGE_ATTR);
      if (id) listItemById.set(id, item);
      fragment.appendChild(item);
    });

    list.replaceChildren(fragment);
    renderCollapsed(filtered);
  };

  const patchRenderedContent = (filteredNodes) => {
    filteredNodes.forEach((node) => {
      const id = node.getAttribute(MESSAGE_ATTR);
      if (!id) return;
      if (dirtyMessageIds.size > 0 && !dirtyMessageIds.has(id)) return;

      const bundle = getTextBundle(node);
      const item = listItemById.get(id);
      if (item) setListItemText(item, bundle.title);

      const dot = dotById.get(id);
      if (dot) dot.dataset.preview = bundle.preview;
    });
  };

  const renderCollapsed = (filteredNodes) => {
    const collapsedList = refs.collapsedList;
    const preview = refs.preview;
    if (!collapsedList || !preview) return;

    preview.classList.remove("ctn-visible");
    preview.style.display = "none";
    dotById.clear();

    const fragment = document.createDocumentFragment();

    filteredNodes.forEach((node) => {
      const id = node.getAttribute(MESSAGE_ATTR);
      const { preview: previewText } = getTextBundle(node);

      const dot = document.createElement("div");
      dot.className = "ctn-dot";
      dot.dataset.targetId = id;
      dot.dataset.preview = previewText;

      const role = getRole(node);
      if (role === "user") dot.classList.add("ctn-dot-user");
      if (role === "assistant") dot.classList.add("ctn-dot-assistant");

      if (id) dotById.set(id, dot);
      fragment.appendChild(dot);
    });

    collapsedList.replaceChildren(fragment);
  };

  const refresh = () => {
    perf.refreshCount += 1;
    const nodes = getMessageNodes();
    if (nodes.length === 0) return;

    ensureMessageIds(nodes);
    lastNodes = nodes;
    if (isPanelHidden()) {
      lastRenderKey = "";
      forceNextRender = false;
      dirtyMessageIds.clear();
      return;
    }
    renderList(nodes);
  };

  const scheduleRefresh = (immediate = false) => {
    if (immediate) {
      if (timerHandle) {
        clearTimeout(timerHandle);
        timerHandle = null;
      }
      if (rafHandle) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        refresh();
      });
      return;
    }

    if (timerHandle || rafHandle) return;

    timerHandle = window.setTimeout(() => {
      timerHandle = null;
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        refresh();
      });
    }, REFRESH_THROTTLE_MS);
  };

  const isExtensionNode = (node) => {
    if (!(node instanceof Element)) return false;
    if (
      node.id === PANEL_ID ||
      node.id === LAUNCHER_ID ||
      node.id === LIST_ID ||
      node.classList.contains(PREVIEW_CLASS) ||
      node.classList.contains(COLLAPSED_LIST_CLASS)
    ) {
      return true;
    }
    return Boolean(node.closest(`#${PANEL_ID}`) || node.closest(`.${PREVIEW_CLASS}`));
  };

  const isRelevantMutation = (mutation) => {
    if (isExtensionNode(mutation.target)) return false;

    if (mutation.type === "characterData") {
      const parent = mutation.target.parentElement;
      if (!parent || isExtensionNode(parent)) return false;
      return Boolean(parent.closest("article,[data-message-author-role],main"));
    }

    if (mutation.type === "attributes") {
      const target = mutation.target;
      if (!(target instanceof Element) || isExtensionNode(target)) return false;
      return Boolean(target.closest("article,[data-message-author-role],main"));
    }

    if (mutation.type === "childList") {
      if (isExtensionNode(mutation.target)) return false;
      for (const added of mutation.addedNodes) {
        if (added instanceof Element && !isExtensionNode(added)) return true;
      }
      for (const removed of mutation.removedNodes) {
        if (removed instanceof Element && !isExtensionNode(removed)) return true;
      }
      return false;
    }

    return false;
  };

  const markDirtyMessageIdFromNode = (node) => {
    if (!node) return;
    const element = node instanceof Element ? node : node.parentElement;
    if (!element) return;
    const messageNode = element.closest(`[${MESSAGE_ATTR}]`);
    if (!messageNode) return;
    const id = messageNode.getAttribute(MESSAGE_ATTR);
    if (id) dirtyMessageIds.add(id);
  };

  const installObserver = () => {
    if (mutationObserver) return;

    mutationObserver = new MutationObserver((mutations) => {
      let hasRelevantMutation = false;
      let hasCharacterDataMutation = false;
      mutations.forEach((mutation) => {
        if (!hasRelevantMutation && isRelevantMutation(mutation)) {
          hasRelevantMutation = true;
        }
        if (mutation.type === "characterData") {
          hasCharacterDataMutation = true;
          markDirtyMessageIdFromNode(mutation.target);
          return;
        }
        if (mutation.type === "childList") {
          markDirtyMessageIdFromNode(mutation.target);
        }
      });
      if (!hasRelevantMutation) return;
      if (hasCharacterDataMutation) forceNextRender = true;
      scheduleRefresh();
    });

    observedRoot = document.querySelector("main") || document.body;
    mutationObserver.observe(observedRoot, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-message-author-role", "data-testid"]
    });
  };

  const cleanup = () => {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }

    if (timerHandle) {
      clearTimeout(timerHandle);
      timerHandle = null;
    }

    if (rafHandle) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }

    dirtyMessageIds.clear();
    listItemById.clear();
    dotById.clear();
    observedRoot = null;
    delete window.__CTN_DEBUG__;
    delete window[CTN_INSTANCE_KEY];
  };

  const init = async () => {
    if (initialized) return;
    initialized = true;
    debugEnabled = loadDebugFlag();
    installDebugApi();

    createPanel();
    setDebugEnabled(debugEnabled);
    await sleep(400);
    refresh();
    installObserver();
    window.addEventListener("pagehide", cleanup, { once: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
