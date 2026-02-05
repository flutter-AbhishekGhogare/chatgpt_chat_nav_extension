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

  let messageCounter = 0;
  let scheduled = null;
  let lastMessageCount = 0;
  let currentMode = MODE_BOTH;
  let lastNodes = [];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(collapsedList);
    document.body.appendChild(panel);
    document.body.appendChild(preview);

    document.body.classList.add(BODY_SHIFT_CLASS);

    const launcher = document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.className = "ctn-launcher";
    launcher.type = "button";
    launcher.textContent = "Nav";
    document.body.appendChild(launcher);

    const setMode = (mode) => {
      currentMode = mode;
      userBtn.classList.toggle("ctn-active", mode === MODE_USER);
      bothBtn.classList.toggle("ctn-active", mode === MODE_BOTH);
      if (lastNodes.length > 0) {
        renderList(lastNodes);
      } else {
        refresh();
      }
    };

    userBtn.addEventListener("click", () => setMode(MODE_USER));
    bothBtn.addEventListener("click", () => setMode(MODE_BOTH));

    setMode(MODE_BOTH);

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
        renderCollapsed(lastNodes);
      }
    });

    hideBtn.addEventListener("click", () => setHidden(true));
    launcher.addEventListener("click", () => setHidden(false));
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
    const text = node.innerText || node.textContent || "";
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

    button.addEventListener("click", () => {
      const target = document.querySelector(`[${MESSAGE_ATTR}="${id}"]`);
      if (!target) return;

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add(HIGHLIGHT_CLASS);
      setTimeout(() => target.classList.remove(HIGHLIGHT_CLASS), 900);
    });

    return button;
  };

  const renderList = (nodes) => {
    const list = document.getElementById(LIST_ID);
    if (!list) return;

    list.innerHTML = "";
    const filtered = nodes.filter((node) => {
      const role = getRole(node);
      if (currentMode === MODE_BOTH) return role === "user" || role === "assistant";
      return role === "user";
    });

    filtered.forEach((node, index) =>
      list.appendChild(buildListItem(node, index + 1))
    );
    renderCollapsed(filtered);
  };

  const renderCollapsed = (filteredNodes) => {
    const collapsedList = document.querySelector(`.${COLLAPSED_LIST_CLASS}`);
    const preview = document.querySelector(`.${PREVIEW_CLASS}`);
    if (!collapsedList || !preview) return;

    collapsedList.innerHTML = "";
    preview.classList.remove("ctn-visible");

    const getPreviewText = (node) => {
      const text = getMessageText(node);
      if (!text) return "(empty)";
      return text.length > 140 ? `${text.slice(0, 140)}…` : text;
    };

    filteredNodes.forEach((node) => {
      const id = node.getAttribute(MESSAGE_ATTR);
      const text = getPreviewText(node);
      const dot = document.createElement("div");
      dot.className = "ctn-dot";
      dot.dataset.targetId = id;
      dot.dataset.preview = text || "(empty)";

      dot.addEventListener("click", () => {
        const target = document.querySelector(`[${MESSAGE_ATTR}="${id}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add(HIGHLIGHT_CLASS);
        setTimeout(() => target.classList.remove(HIGHLIGHT_CLASS), 900);
      });

      collapsedList.appendChild(dot);
    });

    let lastHoverId = null;
    collapsedList.onmousemove = (event) => {
      const dot = event.target.closest(".ctn-dot");
      if (!dot) return;
      if (lastHoverId !== dot.dataset.targetId) {
        lastHoverId = dot.dataset.targetId;
        const rect = dot.getBoundingClientRect();
        preview.textContent = dot.dataset.preview;
        preview.style.top = `${Math.max(12, rect.top - 6)}px`;
        preview.classList.add("ctn-visible");
        preview.style.display = "block";
      }
    };

    collapsedList.onmouseleave = () => {
      lastHoverId = null;
      preview.classList.remove("ctn-visible");
      preview.style.display = "none";
    };
  };

  const refresh = async () => {
    const nodes = getMessageNodes();
    if (nodes.length === 0) return;

    ensureMessageIds(nodes);
    lastNodes = nodes;

    if (nodes.length !== lastMessageCount) {
      lastMessageCount = nodes.length;
      renderList(nodes);
    } else {
      renderCollapsed(
        nodes.filter((node) => {
          const role = getRole(node);
          if (currentMode === MODE_BOTH) return role === "user" || role === "assistant";
          return role === "user";
        })
      );
    }
  };

  const scheduleRefresh = () => {
    if (scheduled) return;
    scheduled = requestAnimationFrame(async () => {
      scheduled = null;
      await refresh();
    });
  };

  const installObserver = () => {
    const observer = new MutationObserver(() => scheduleRefresh());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };

  const init = async () => {
    createPanel();
    await sleep(400);
    await refresh();
    installObserver();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
