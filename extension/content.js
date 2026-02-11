(() => {
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

  let messageCounter = 0;
  let rafHandle = null;
  let timerHandle = null;
  let mutationObserver = null;
  let initialized = false;
  let currentMode = MODE_BOTH;
  let lastNodes = [];
  let lastRenderKey = "";
  let forceNextRender = false;

  const refs = {
    panel: null,
    list: null,
    collapsedList: null,
    preview: null,
    launcher: null
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const scrollToMessage = (id) => {
    if (!id) return;
    const target = document.querySelector(`[${MESSAGE_ATTR}="${id}"]`);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add(HIGHLIGHT_CLASS);
    window.setTimeout(() => target.classList.remove(HIGHLIGHT_CLASS), 900);
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
    const turnNodes = Array.from(
      document.querySelectorAll('article[data-testid="conversation-turn"]')
    );
    if (turnNodes.length > 0) return turnNodes;

    const roleNodes = Array.from(
      document.querySelectorAll("[data-message-author-role]")
    );
    if (roleNodes.length > 0) return roleNodes;

    const articleNodes = Array.from(document.querySelectorAll("main article"));
    if (articleNodes.length > 0) return articleNodes;

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
    lastRenderKey = renderKey;
    forceNextRender = false;

    const fragment = document.createDocumentFragment();
    filtered.forEach((node, index) => {
      fragment.appendChild(buildListItem(node, index + 1));
    });

    list.replaceChildren(fragment);
    renderCollapsed(filtered);
  };

  const renderCollapsed = (filteredNodes) => {
    const collapsedList = refs.collapsedList;
    const preview = refs.preview;
    if (!collapsedList || !preview) return;

    preview.classList.remove("ctn-visible");
    preview.style.display = "none";

    const fragment = document.createDocumentFragment();

    filteredNodes.forEach((node) => {
      const id = node.getAttribute(MESSAGE_ATTR);
      const text = getMessageText(node);
      const previewText = !text ? "(empty)" : text.length > 140 ? `${text.slice(0, 140)}...` : text;

      const dot = document.createElement("div");
      dot.className = "ctn-dot";
      dot.dataset.targetId = id;
      dot.dataset.preview = previewText;

      const role = getRole(node);
      if (role === "user") dot.classList.add("ctn-dot-user");
      if (role === "assistant") dot.classList.add("ctn-dot-assistant");

      fragment.appendChild(dot);
    });

    collapsedList.replaceChildren(fragment);
  };

  const refresh = () => {
    const nodes = getMessageNodes();
    if (nodes.length === 0) return;

    ensureMessageIds(nodes);
    lastNodes = nodes;
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

  const installObserver = () => {
    if (mutationObserver) return;

    mutationObserver = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some(isRelevantMutation);
      if (!hasRelevantMutation) return;
      if (mutations.some((mutation) => mutation.type === "characterData")) {
        forceNextRender = true;
      }
      if (hasRelevantMutation) {
        scheduleRefresh();
      }
    });

    mutationObserver.observe(document.body, {
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
  };

  const init = async () => {
    if (initialized) return;
    initialized = true;

    createPanel();
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
