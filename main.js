var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NovelProfilePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  targetFolders: "\u89D2\u8272,\u8BBE\u5B9A",
  imagePropertyName: "\u56FE\u7247",
  imageWidth: 150,
  hidePropertyNames: false,
  hideAddButton: true,
  hideProperties: "tags,aliases",
  defaultLocked: true,
  popoverOnlyCard: true,
  minimalPopover: false,
  popoverScale: 1,
  enableTimelineContextMenu: false,
  timelineTemplateFile: "",
  timelineTextScale: 1,
  timelineVersions: {}
  // 默认空记录
};
var TIMELINE_VIEW_TYPE = "novel-timeline-view";
var NovelProfilePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.isPluginActive = true;
    this.hoverTimeout = null;
    this.activeCustomPopover = null;
    this.debouncedProcessLeaves = (0, import_obsidian.debounce)(this.processAllLeaves.bind(this), 250, true);
  }
  async onload() {
    await this.loadSettings();
    this.isEditLocked = this.settings.defaultLocked;
    this.updateLockState();
    this.registerView(TIMELINE_VIEW_TYPE, (leaf) => new NovelTimelineView(leaf, this));
    this.addRibbonIcon("clock", "\u6253\u5F00\u5C0F\u8BF4\u4E8B\u4EF6\u65F6\u95F4\u7EBF", () => {
      this.activateTimelineView();
    });
    this.addCommand({
      id: "open-novel-timeline",
      name: "\u6253\u5F00\u4FA7\u8FB9\u680F: \u5C0F\u8BF4\u4E8B\u4EF6\u65F6\u95F4\u7EBF",
      callback: () => this.activateTimelineView()
    });
    this.addCommand({
      id: "toggle-novel-profile-edit",
      name: "\u5207\u6362\u5C5E\u6027\u4FEE\u6539 (\u9501\u5B9A/\u89E3\u9501\u5F53\u524D\u5361\u7247)",
      callback: () => {
        this.isEditLocked = !this.isEditLocked;
        this.updateLockState();
        new import_obsidian.Notice(this.isEditLocked ? "\u{1F512} \u89D2\u8272\u5361\u7247\u5DF2\u9501\u5B9A (\u9632\u8BEF\u89E6)" : "\u{1F513} \u89D2\u8272\u5361\u7247\u5DF2\u89E3\u9501 (\u53EF\u4FEE\u6539)");
      }
    });
    this.addCommand({
      id: "toggle-novel-profile-active",
      name: "\u4E00\u952E\u5F00\u542F/\u5173\u95ED\u5361\u7247\u89C6\u56FE (\u6062\u590D\u539F\u751F\u6392\u7248)",
      callback: () => {
        this.isPluginActive = !this.isPluginActive;
        this.processAllLeaves();
        new import_obsidian.Notice(this.isPluginActive ? "\u2728 \u5C0F\u8BF4\u89D2\u8272\u5361\u7247\u89C6\u56FE\uFF1A\u5DF2\u5F00\u542F" : "\u{1F648} \u5361\u7247\u89C6\u56FE\u5DF2\u4E34\u65F6\u5173\u95ED (\u6062\u590D\u539F\u751F)");
      }
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if (this.settings.enableTimelineContextMenu) {
          menu.addItem((item) => {
            item.setTitle("\u6DFB\u52A0\u65F6\u95F4\u7EBF\u6A21\u677F").setIcon("clock").onClick(async () => {
              if (!this.settings.timelineTemplateFile) {
                new import_obsidian.Notice("\u274C \u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u6307\u5B9A\u65F6\u95F4\u7EBF\u6A21\u677F\u6587\u4EF6");
                return;
              }
              const file = this.app.metadataCache.getFirstLinkpathDest(this.settings.timelineTemplateFile, "");
              if (file instanceof import_obsidian.TFile) {
                const content = await this.app.vault.read(file);
                editor.replaceSelection(content);
                new import_obsidian.Notice("\u2728 \u65F6\u95F4\u7EBF\u6A21\u677F\u5DF2\u63D2\u5165");
              } else {
                new import_obsidian.Notice("\u274C \u672A\u627E\u5230\u6307\u5B9A\u7684\u65F6\u95F4\u7EBF\u6A21\u677F\u6587\u4EF6\uFF0C\u8BF7\u68C0\u67E5\u8BBE\u7F6E");
              }
            });
          });
        }
      })
    );
    this.dynamicStyleElement = document.createElement("style");
    this.dynamicStyleElement.id = "novel-profile-dynamic-styles";
    document.head.appendChild(this.dynamicStyleElement);
    this.updateDynamicStyles();
    this.addSettingTab(new NovelProfileSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on("file-open", () => this.processAllLeaves()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.debouncedProcessLeaves()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.debouncedProcessLeaves()));
    this.registerDomEvent(document, "mouseover", (e) => this.handleMouseOver(e));
    this.registerDomEvent(document, "mouseout", (e) => this.handleMouseOut(e));
    this.app.workspace.onLayoutReady(() => {
      this.processAllLeaves();
    });
  }
  async activateTimelineView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: TIMELINE_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    if (leaf) workspace.revealLeaf(leaf);
  }
  checkIsTargetFile(file) {
    if (!this.isPluginActive) return false;
    const folders = this.settings.targetFolders.split(/[,，]+/).map((f) => f.trim()).filter((f) => f.length > 0);
    return folders.length === 0 || folders.some((folder) => {
      return file.path.startsWith(folder + "/") || file.parent?.path === folder || file.parent?.name === folder;
    });
  }
  handleMouseOver(e) {
    if (!this.settings.popoverOnlyCard || !this.isPluginActive) return;
    const target = e.target;
    const linkEl = target.closest(".internal-link, .cm-hmd-internal-link");
    if (!linkEl) return;
    let path = linkEl.getAttribute("data-href") || linkEl.textContent;
    if (!path) return;
    const cleanPath = path.split("|")[0].split("#")[0].split("^")[0].replace(/\[\[|\]\]/g, "").trim();
    const file = this.app.metadataCache.getFirstLinkpathDest(cleanPath, "");
    if (file && this.checkIsTargetFile(file)) {
      this.triggerCustomPopover(file, linkEl);
    }
  }
  triggerCustomPopover(file, linkEl) {
    document.body.classList.add("np-showing-custom-popover");
    if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
    this.hoverTimeout = window.setTimeout(() => {
      this.buildAndShowCustomPopover(file, linkEl);
    }, 30);
  }
  handleMouseOut(e) {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.removeCustomPopover();
  }
  buildAndShowCustomPopover(file, linkEl) {
    this.removeCustomPopover();
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter) return;
    const popover = document.createElement("div");
    popover.className = "np-custom-popover";
    if (this.settings.minimalPopover) popover.classList.add("is-minimal");
    const imgPath = this.resolveImagePath(frontmatter[this.settings.imagePropertyName], file);
    if (imgPath) {
      popover.classList.add("has-image");
      const imgDiv = popover.createDiv("np-custom-popover-img");
      imgDiv.style.backgroundImage = `url("${imgPath}")`;
      if (!this.settings.minimalPopover) imgDiv.style.width = `${this.settings.imageWidth}px`;
    }
    const contentDiv = popover.createDiv("np-custom-popover-content");
    const hideProps = this.settings.hideProperties.split(/[,，]+/).map((p) => p.trim());
    hideProps.push(this.settings.imagePropertyName);
    for (const key in frontmatter) {
      if (hideProps.includes(key)) continue;
      let val = frontmatter[key];
      if (val === null || val === void 0 || val === "") continue;
      if (Array.isArray(val)) {
        val = val.map((v) => String(v).replace(/\[\[|\]\]/g, "")).join(", ");
      } else {
        val = String(val).replace(/\[\[|\]\]/g, "");
      }
      const propRow = contentDiv.createDiv("np-custom-prop");
      if (!this.settings.hidePropertyNames) {
        const keySpan = propRow.createSpan("np-custom-key");
        keySpan.textContent = key;
      }
      const valSpan = propRow.createSpan("np-custom-val");
      valSpan.textContent = val;
    }
    document.body.appendChild(popover);
    const rect = linkEl.getBoundingClientRect();
    let top = rect.bottom + 10;
    let left = rect.left;
    const scale = this.settings.popoverScale || 1;
    const popoverHeight = popover.offsetHeight * scale;
    const popoverWidth = popover.offsetWidth * scale;
    if (top + popoverHeight > window.innerHeight) top = rect.top - popoverHeight - 10;
    if (left + popoverWidth > window.innerWidth) left = window.innerWidth - popoverWidth - 20;
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    this.activeCustomPopover = popover;
  }
  removeCustomPopover() {
    if (this.activeCustomPopover) {
      this.activeCustomPopover.remove();
      this.activeCustomPopover = null;
    }
    document.body.classList.remove("np-showing-custom-popover");
  }
  resolveImagePath(imagePropValue, file) {
    if (!imagePropValue) return "";
    if (typeof imagePropValue !== "string") return "";
    const linkMatch = imagePropValue.match(/\[\[(.*?)\]\]/);
    if (linkMatch) {
      const linkText = linkMatch[1].split("|")[0].trim();
      const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
      if (linkedFile) return this.app.vault.getResourcePath(linkedFile);
    } else {
      return imagePropValue.startsWith("http") ? imagePropValue : "";
    }
    return "";
  }
  updateLockState() {
    if (this.isEditLocked) {
      document.body.classList.add("np-edit-locked");
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } else {
      document.body.classList.remove("np-edit-locked");
    }
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(TIMELINE_VIEW_TYPE);
    if (this.hoverTimeout) window.clearTimeout(this.hoverTimeout);
    this.dynamicStyleElement.remove();
    document.body.classList.remove("np-edit-locked");
    this.removeCustomPopover();
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    leaves.forEach((leaf) => {
      const view = leaf.view;
      if (view && view.containerEl) {
        view.containerEl.classList.remove("is-novel-profile");
        view.containerEl.removeAttribute("data-has-image");
        view.containerEl.style.removeProperty("--np-image-url");
      }
    });
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.timelineVersions) this.settings.timelineVersions = {};
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.updateDynamicStyles();
    this.processAllLeaves();
  }
  processAllLeaves() {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    leaves.forEach((leaf) => {
      const view = leaf.view;
      if (!view || !view.file) return;
      const file = view.file;
      const container = view.containerEl;
      const isTargetFolder = this.checkIsTargetFile(file);
      const cache = this.app.metadataCache.getFileCache(file);
      const hasFrontmatter = cache?.frontmatter && Object.keys(cache.frontmatter).length > 0;
      if (isTargetFolder && hasFrontmatter) {
        container.classList.add("is-novel-profile");
        this.updateImageState(view, file);
        const metadataContainer = container.querySelector(".metadata-container");
        if (metadataContainer && metadataContainer.classList.contains("is-collapsed")) {
          const heading = metadataContainer.querySelector(".metadata-properties-heading");
          if (heading instanceof HTMLElement) {
            heading.click();
          }
        }
      } else {
        container.classList.remove("is-novel-profile");
        container.removeAttribute("data-has-image");
        container.style.removeProperty("--np-image-url");
      }
    });
  }
  updateImageState(view, file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter || !frontmatter[this.settings.imagePropertyName]) {
      view.containerEl.removeAttribute("data-has-image");
      view.containerEl.style.removeProperty("--np-image-url");
      return;
    }
    const imagePath = this.resolveImagePath(frontmatter[this.settings.imagePropertyName], file);
    if (imagePath) {
      view.containerEl.setAttribute("data-has-image", "true");
      view.containerEl.style.setProperty("--np-image-url", `url("${imagePath}")`);
    } else {
      view.containerEl.removeAttribute("data-has-image");
      view.containerEl.style.removeProperty("--np-image-url");
    }
  }
  updateDynamicStyles() {
    let css = `:root { --np-image-width: ${this.settings.imageWidth}px; }`;
    if (this.settings.hidePropertyNames) {
      css += `
				body .is-novel-profile .metadata-property-key,
				.np-custom-key { display: none !important; }
				body .is-novel-profile .metadata-property-value { width: 100% !important; font-size: 1.1em !important; }
				body .is-novel-profile .metadata-property { border-bottom: none !important; padding-left: 0 !important; }
			`;
    }
    if (this.settings.hideAddButton) css += `body .is-novel-profile .metadata-add-button { display: none !important; }`;
    const propsToHide = this.settings.hideProperties.split(/[,，]+/).map((p) => p.trim()).filter((p) => p.length > 0);
    if (!propsToHide.includes(this.settings.imagePropertyName)) propsToHide.push(this.settings.imagePropertyName);
    propsToHide.forEach((prop) => {
      const safeProp = CSS.escape(prop);
      css += `body .is-novel-profile .metadata-property[data-property-key="${safeProp}"] { display: none !important; }`;
    });
    const scale = this.settings.popoverScale || 1;
    css += `
			.np-custom-popover {
				transform-origin: top left !important;
				animation: np-popover-scale-fade 0.2s forwards !important;
			}
			@keyframes np-popover-scale-fade {
				from { opacity: 0; transform: scale(${scale}) translateY(5px); }
				to { opacity: 1; transform: scale(${scale}) translateY(0); }
			}
		`;
    const timelineScale = this.settings.timelineTextScale || 1;
    css += `
			.np-timeline-container {
				font-size: ${timelineScale}em !important;
			}
		`;
    this.dynamicStyleElement.textContent = css;
  }
};
var NovelTimelineView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.timelineNodes = [];
    this.lastScrolledNode = null;
    this.isClickNavigating = false;
    this.updateVersion = 0;
    this.isInitialLoading = false;
    this.activeFile = null;
    this.plugin = plugin;
    this.debouncedScrollSync = (0, import_obsidian.debounce)((view) => {
      if (this.isClickNavigating || this.isInitialLoading) return;
      const line = this.getVisibleLine(view);
      this.syncHighlightToLine(line, false, false);
    }, 50, true);
    this.debouncedUpdateView = (0, import_obsidian.debounce)((maintainScroll = false) => {
      this.updateView(maintainScroll);
    }, 150, true);
  }
  getViewType() {
    return TIMELINE_VIEW_TYPE;
  }
  getDisplayText() {
    return "\u4E8B\u4EF6\u7EBF";
  }
  getIcon() {
    return "clock";
  }
  getVisibleLine(view) {
    try {
      const cm = view.editor.cm;
      if (cm && cm.scrollDOM) {
        const block = cm.lineBlockAtHeight(cm.scrollDOM.scrollTop + 100);
        if (block) return view.editor.offsetToPos(block.from).line;
      }
    } catch (e) {
    }
    return view?.editor?.getCursor()?.line || 0;
  }
  onload() {
    super.onload();
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (file && file.extension === "md") {
        if (this.activeFile !== file) {
          this.activeFile = file;
          this.isInitialLoading = true;
          this.debouncedUpdateView(false);
          setTimeout(() => {
            this.isInitialLoading = false;
          }, 300);
        }
      } else if (!file) {
        this.activeFile = null;
        this.debouncedUpdateView(false);
      }
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (this.activeFile && file === this.activeFile) {
        this.debouncedUpdateView(true);
      }
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf && leaf.view instanceof import_obsidian.MarkdownView) {
        const file = leaf.view.file;
        if (file && file !== this.activeFile) {
          this.activeFile = file;
          this.isInitialLoading = true;
          this.debouncedUpdateView(false);
          setTimeout(() => {
            this.isInitialLoading = false;
          }, 300);
        } else if (file === this.activeFile) {
          this.debouncedScrollSync(leaf.view);
        }
      }
    }));
    this.registerEvent(this.app.workspace.on("editor-change", (editor, view) => {
      if (this.isClickNavigating || this.isInitialLoading) return;
      if (this.activeFile && view.file === this.activeFile) {
        this.syncHighlightToLine(this.getVisibleLine(view), false, false);
      }
    }));
    const workspaceEl = this.app.workspace.containerEl;
    this.registerDomEvent(workspaceEl, "scroll", (e) => {
      if (this.isClickNavigating || this.isInitialLoading) return;
      const target = e.target;
      if (target?.classList?.contains("cm-scroller")) {
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view && view.file === this.activeFile) {
            const cm = view.editor.cm;
            if (cm && cm.scrollDOM === target) {
              this.debouncedScrollSync(view);
              return;
            }
          }
        }
      }
    }, { capture: true });
  }
  async onOpen() {
    this.app.workspace.onLayoutReady(() => {
      let file = this.app.workspace.getActiveFile();
      if (!file) {
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        if (leaves.length > 0) file = leaves[0].view.file;
      }
      this.activeFile = file;
      this.updateView(false);
    });
  }
  async onClose() {
    this.contentEl.empty();
    this.timelineNodes = [];
    this.activeFile = null;
  }
  extractTimelineData(contentLines) {
    let time = "", characterName = "", causeText = "", resultText = "";
    let directImageLink = "";
    const sectionText = contentLines.join("\n");
    const timeMatch = sectionText.match(/-\s+(?:\*\*)*时间(?:\*\*)*\s*[：:]\s*(.*)/);
    if (timeMatch) time = timeMatch[1].trim();
    const charMatch = sectionText.match(/-\s+(?:\*\*)*人物(?:\*\*)*\s*[：:]\s*(.*)/);
    if (charMatch) {
      const rawCharText = charMatch[1];
      const linkMatches = [];
      const linkRegex = /!*\[\[(.*?)\]\]/g;
      let match;
      while ((match = linkRegex.exec(rawCharText)) !== null) {
        linkMatches.push(match);
      }
      for (const m of linkMatches) {
        const linkText = m[1].split("|")[0].trim();
        if (linkText.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
          if (!directImageLink) directImageLink = linkText;
        } else {
          if (!characterName) characterName = linkText;
        }
      }
      if (!directImageLink) {
        const rawImgMatch = rawCharText.match(/([^\s,，、\|]+\.(?:jpg|jpeg|png|gif|webp|bmp))/i);
        if (rawImgMatch) directImageLink = rawImgMatch[1];
      }
      if (!characterName) {
        let cleanedText = rawCharText;
        if (directImageLink) {
          const safeImgLink = directImageLink.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
          cleanedText = cleanedText.replace(new RegExp(`!*\\[\\[${safeImgLink}.*?\\]\\]`, "g"), "");
          cleanedText = cleanedText.replace(new RegExp(safeImgLink, "g"), "");
        }
        cleanedText = cleanedText.replace(/\[\[|\]\]/g, "").trim();
        const parts = cleanedText.split(/[,，、]/).map((p) => p.trim()).filter((p) => p.length > 0);
        if (parts.length > 0) {
          characterName = parts[0];
        } else if (directImageLink) {
          const baseName = directImageLink.split(/[\/\\]/).pop() || "";
          characterName = baseName.replace(/\.(jpg|jpeg|png|gif|webp|bmp)$/i, "");
        }
      }
    }
    const causeMatch = sectionText.match(/-\s+(?:\*\*)*起因(?:\*\*)*\s*[：:]\s*(.*)/);
    if (causeMatch) causeText = causeMatch[1].trim().replace(/\[\[|\]\]/g, "");
    const resultMatch = sectionText.match(/-\s+(?:\*\*)*结果(?:\*\*)*\s*[：:]\s*(.*)/);
    if (resultMatch) resultText = resultMatch[1].trim().replace(/\[\[|\]\]/g, "");
    return { time, characterName, causeText, resultText, directImageLink };
  }
  createTimelineItemDOM(container, data, titleToDisplay, activeFile) {
    const itemEl = container.createDiv({ cls: "np-timeline-item" });
    const leftEl = itemEl.createDiv({ cls: "np-timeline-left" });
    const cardEl = leftEl.createDiv({ cls: "np-timeline-card" });
    if (data.characterName || data.directImageLink) {
      if (data.characterName) {
        cardEl.createDiv({ cls: "np-timeline-name", text: data.characterName });
      }
      if (data.directImageLink) {
        const imgFile = this.app.metadataCache.getFirstLinkpathDest(data.directImageLink, activeFile.path);
        if (imgFile) {
          const imgPath = this.app.vault.getResourcePath(imgFile);
          if (imgPath) cardEl.style.backgroundImage = `url("${imgPath}")`;
        } else if (data.directImageLink.startsWith("http")) {
          cardEl.style.backgroundImage = `url("${data.directImageLink}")`;
        }
      } else if (data.characterName) {
        const charFile = this.app.metadataCache.getFirstLinkpathDest(data.characterName, activeFile.path);
        if (charFile) {
          const cache = this.app.metadataCache.getFileCache(charFile);
          const fm = cache?.frontmatter;
          if (fm && fm[this.plugin.settings.imagePropertyName]) {
            const imgPath = this.plugin.resolveImagePath(fm[this.plugin.settings.imagePropertyName], charFile);
            if (imgPath) cardEl.style.backgroundImage = `url("${imgPath}")`;
          }
        }
      }
    } else {
      cardEl.style.display = "none";
    }
    if (data.time) leftEl.createDiv({ cls: "np-timeline-time", text: data.time });
    const dividerEl = itemEl.createDiv({ cls: "np-timeline-divider" });
    dividerEl.createDiv({ cls: "np-timeline-line" });
    const dotEl = dividerEl.createDiv({ cls: "np-timeline-dot" });
    const rightEl = itemEl.createDiv({ cls: "np-timeline-right" });
    rightEl.createDiv({ cls: "np-timeline-title", text: titleToDisplay });
    if (data.causeText || data.resultText) {
      const descEl = rightEl.createDiv({ cls: "np-timeline-desc" });
      if (data.causeText) {
        const causeDiv = descEl.createDiv({ cls: "np-timeline-cause" });
        causeDiv.innerHTML = `<strong>\u8D77\u56E0\uFF1A</strong>${data.causeText}`;
      }
      if (data.resultText) {
        const resultDiv = descEl.createDiv({ cls: "np-timeline-result" });
        resultDiv.innerHTML = `<strong>\u7ED3\u679C\uFF1A</strong>${data.resultText}`;
      }
    }
    return { itemEl, dotEl };
  }
  async updateView(maintainScroll = false) {
    const container = this.contentEl;
    if (!this.activeFile) {
      container.empty();
      container.createDiv({ cls: "np-timeline-empty", text: "\u8BF7\u6253\u5F00\u4E00\u4E2A\u5305\u542B\u4E8B\u4EF6\u8BB0\u5F55\u7684\u7B14\u8BB0\u3002" });
      return;
    }
    const currentVersionNumber = ++this.updateVersion;
    const content = await this.app.vault.cachedRead(this.activeFile);
    if (currentVersionNumber !== this.updateVersion) return;
    let savedScrollTop = 0;
    if (maintainScroll) {
      const oldTimeline = container.querySelector(".np-timeline-container");
      if (oldTimeline) savedScrollTop = oldTimeline.scrollTop;
    }
    container.empty();
    this.timelineNodes = [];
    const lines = content.split("\n");
    let sectionsData = [];
    let currentSection = null;
    let currentVersion = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const h2Match = line.match(/^##\s+(.*)/);
      const h3Match = line.match(/^###\s+(.*)/);
      if (h2Match) {
        if (currentSection) {
          if (currentVersion) currentSection.versions.push(currentVersion);
          sectionsData.push(currentSection);
        }
        currentSection = {
          h2Title: h2Match[1].trim().replace(/\[\[|\]\]/g, ""),
          h2Line: i,
          versions: []
        };
        currentVersion = null;
      } else if (h3Match && currentSection) {
        if (currentVersion) currentSection.versions.push(currentVersion);
        currentVersion = {
          title: h3Match[1].trim().replace(/\[\[|\]\]/g, ""),
          line: i,
          contentLines: []
        };
      } else if (currentSection) {
        if (!currentVersion) {
          currentVersion = {
            title: currentSection.h2Title,
            line: currentSection.h2Line,
            contentLines: []
          };
        }
        currentVersion.contentLines.push(line);
      }
    }
    if (currentSection) {
      if (currentVersion) currentSection.versions.push(currentVersion);
      sectionsData.push(currentSection);
    }
    for (const section of sectionsData) {
      const validVersions = [];
      for (const v of section.versions) {
        v.extracted = this.extractTimelineData(v.contentLines);
        if (v.extracted.time || v.extracted.characterName || v.extracted.causeText || v.extracted.resultText) {
          validVersions.push(v);
        }
      }
      section.versions = validVersions;
    }
    sectionsData = sectionsData.filter((s) => s.versions.length > 0);
    if (sectionsData.length === 0) {
      container.createDiv({ cls: "np-timeline-empty", text: "\u5F53\u524D\u7B14\u8BB0\u6CA1\u6709\u68C0\u6D4B\u5230\u6709\u6548\u7684\u65F6\u95F4\u7EBF\u4E8B\u4EF6\u3002" });
      return;
    }
    const timelineContainer = container.createDiv({ cls: "np-timeline-container" });
    const isInitialLoad = !maintainScroll;
    if (isInitialLoad) {
      timelineContainer.style.opacity = "0";
    }
    for (const section of sectionsData) {
      const versionCount = section.versions.length;
      const sectionKey = `${this.activeFile.path}::${section.h2Title}`;
      let selectedIdx = this.plugin.settings.timelineVersions[sectionKey] || 0;
      if (selectedIdx >= versionCount) selectedIdx = 0;
      const activeVersion = section.versions[selectedIdx];
      const { itemEl, dotEl } = this.createTimelineItemDOM(timelineContainer, activeVersion.extracted, section.h2Title, this.activeFile);
      if (versionCount > 1) {
        dotEl.setAttribute("data-version-count", String(versionCount));
        itemEl.oncontextmenu = (e) => {
          e.preventDefault();
          const menu = new import_obsidian.Menu();
          menu.addItem((item) => {
            item.setTitle(`\u5207\u6362\u5206\u652F\u7248\u672C (${versionCount}\u4E2A\u7248\u672C)`).setIcon("git-branch").onClick(() => {
              new VersionSelectModal(this.app, this, section, selectedIdx, async (newIdx) => {
                this.plugin.settings.timelineVersions[sectionKey] = newIdx;
                await this.plugin.saveSettings();
                let view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
                if (!view || view.file !== this.activeFile) {
                  const leaves = this.app.workspace.getLeavesOfType("markdown");
                  view = leaves.find((l) => l.view.file === this.activeFile)?.view;
                }
                if (view && view.editor) {
                  this.isClickNavigating = true;
                  this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
                  const targetLine = section.versions[newIdx].line;
                  const editor = view.editor;
                  const cm = editor.cm;
                  if (cm) {
                    const offset = editor.posToOffset({ line: targetLine, ch: 0 });
                    cm.dispatch({ selection: { anchor: offset, head: offset } });
                    const blockInfo = cm.lineBlockAt(offset);
                    if (blockInfo) {
                      cm.scrollDOM.scrollTo({ top: Math.max(0, blockInfo.top - 60), behavior: "smooth" });
                    }
                  } else {
                    editor.setCursor({ line: targetLine, ch: 0 });
                  }
                  setTimeout(() => {
                    this.syncHighlightToLine(targetLine, true, false);
                    this.isClickNavigating = false;
                  }, 800);
                }
                this.updateView(true);
              }).open();
            });
          });
          menu.showAtMouseEvent(e);
        };
      }
      this.timelineNodes.push({ el: itemEl, line: activeVersion.line });
      itemEl.onclick = () => {
        let view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!view || view.file !== this.activeFile) {
          const leaves = this.app.workspace.getLeavesOfType("markdown");
          view = leaves.find((l) => l.view.file === this.activeFile)?.view;
        }
        if (view && view.editor) {
          this.isClickNavigating = true;
          this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
          const cm = view.editor.cm;
          if (cm) {
            const offset = view.editor.posToOffset({ line: activeVersion.line, ch: 0 });
            cm.dispatch({ selection: { anchor: offset, head: offset } });
            const lineInfo = cm.lineBlockAt(offset);
            if (lineInfo) {
              cm.scrollDOM.scrollTo({ top: Math.max(0, lineInfo.top - 60), behavior: "smooth" });
            }
          } else {
            view.editor.setCursor({ line: activeVersion.line, ch: 0 });
          }
          this.syncHighlightToLine(activeVersion.line, true, false);
          setTimeout(() => {
            this.isClickNavigating = false;
          }, 800);
        }
      };
    }
    if (isInitialLoad) {
      setTimeout(() => {
        if (currentVersionNumber === this.updateVersion) {
          const leaves = this.app.workspace.getLeavesOfType("markdown");
          const view = leaves.find((l) => l.view.file === this.activeFile)?.view;
          if (view) this.syncHighlightToLine(this.getVisibleLine(view), false, true);
          timelineContainer.style.transition = "opacity 0.15s ease-out";
          timelineContainer.style.opacity = "1";
        }
      }, 50);
    } else {
      timelineContainer.scrollTop = savedScrollTop;
      const leaves = this.app.workspace.getLeavesOfType("markdown");
      const view = leaves.find((l) => l.view.file === this.activeFile)?.view;
      if (view) this.syncHighlightToLine(this.getVisibleLine(view), maintainScroll, false);
    }
  }
  syncHighlightToLine(targetLine, preventScroll = false, isInitialLoad = false) {
    if (!this.timelineNodes || this.timelineNodes.length === 0) return;
    let activeNode = null;
    for (const node of this.timelineNodes) {
      if (targetLine >= node.line) {
        activeNode = node;
      } else {
        break;
      }
    }
    this.timelineNodes.forEach((node) => {
      if (activeNode && node === activeNode) {
        node.el.classList.add("is-active");
      } else {
        node.el.classList.remove("is-active");
      }
    });
    if (!preventScroll && activeNode && this.lastScrolledNode !== activeNode.el) {
      const scrollMode = isInitialLoad ? "auto" : "smooth";
      activeNode.el.scrollIntoView({ behavior: scrollMode, block: "center" });
    }
    if (activeNode) {
      this.lastScrolledNode = activeNode.el;
    }
  }
};
var VersionSelectModal = class extends import_obsidian.Modal {
  constructor(app, timelineView, section, selectedIndex, onSelect) {
    super(app);
    this.timelineView = timelineView;
    this.section = section;
    this.selectedIndex = selectedIndex;
    this.onSelect = onSelect;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u5207\u6362\u7248\u672C\u5206\u652F", cls: "np-modal-title" });
    contentEl.createEl("p", { text: `\u5F53\u524D\u4E8B\u4EF6\uFF1A${this.section.h2Title}`, cls: "np-modal-subtitle" });
    const container = contentEl.createDiv({ cls: "np-timeline-container np-version-modal-container" });
    this.section.versions.forEach((version, index) => {
      const { itemEl } = this.timelineView.createTimelineItemDOM(container, version.extracted, version.title, this.timelineView.activeFile);
      if (index === this.selectedIndex) {
        itemEl.classList.add("is-active");
      }
      itemEl.onclick = () => {
        this.onSelect(index);
        this.close();
      };
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var NovelProfileSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u5C0F\u8BF4\u89D2\u8272\u5361\u7247\u8BBE\u7F6E (Novel Profile)" });
    new import_obsidian.Setting(containerEl).setName("\u751F\u6548\u6587\u4EF6\u5939").setDesc("\u53EA\u6709\u8FD9\u4E9B\u6587\u4EF6\u5939\u5185\u7684\u7B14\u8BB0\u4F1A\u53D8\u6210\u5361\u7247\u6837\u5F0F\u3002\u652F\u6301\u4E2D\u82F1\u6587\u9017\u53F7\u5206\u9694\u3002\u4F8B\u5982: \u89D2\u8272\uFF0C\u8BBE\u5B9A").addText((text) => text.setPlaceholder("\u89D2\u8272, \u8BBE\u5B9A").setValue(this.plugin.settings.targetFolders).onChange(async (value) => {
      this.plugin.settings.targetFolders = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u56FE\u7247\u5C5E\u6027\u540D\u79F0").setDesc("\u7528\u6765\u8BFB\u53D6\u56FE\u7247\u7684\u5C5E\u6027\u952E\u540D\uFF0C\u652F\u6301\u89E3\u6790 [[\u56FE\u7247\u540D.jpg]] \u4EE5\u53CA\u5916\u90E8\u7F51\u7EDC\u56FE\u7247\u94FE\u63A5\u3002").addText((text) => text.setPlaceholder("\u56FE\u7247").setValue(this.plugin.settings.imagePropertyName).onChange(async (value) => {
      this.plugin.settings.imagePropertyName = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u56FE\u7247\u5BBD\u5EA6").setDesc("\u5DE6\u4FA7\u56FE\u7247\u7684\u5BBD\u5EA6 (px)\uFF0C\u9AD8\u5EA6\u4F1A\u81EA\u52A8\u9002\u5E94\u3002").addSlider((slider) => slider.setLimits(100, 400, 10).setValue(this.plugin.settings.imageWidth).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.imageWidth = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u9690\u85CF\u5C5E\u6027\u540D\u79F0").setDesc("\u662F\u5426\u9690\u85CF\u5C5E\u6027\u524D\u9762\u7684\u540D\u79F0(Key)\uFF0C\u53EA\u663E\u793A\u503C(Value)\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.hidePropertyNames).onChange(async (value) => {
      this.plugin.settings.hidePropertyNames = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u9690\u85CF\u6307\u5B9A\u7684\u5C5E\u6027").setDesc("\u4E0D\u60F3\u663E\u793A\u5728\u5361\u7247\u91CC\u7684\u5C5E\u6027\uFF0C\u652F\u6301\u4E2D\u82F1\u6587\u9017\u53F7\u5206\u9694\u3002\u4F8B\u5982\uFF1Atags, aliases, \u72B6\u6001").addText((text) => text.setPlaceholder("tags, aliases").setValue(this.plugin.settings.hideProperties).onChange(async (value) => {
      this.plugin.settings.hideProperties = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u9690\u85CF\u6DFB\u52A0\u5C5E\u6027\u6309\u94AE").setDesc("\u662F\u5426\u9690\u85CF\u5E95\u90E8\u84DD\u8272\u7684\u201C\u6DFB\u52A0\u7B14\u8BB0\u5C5E\u6027\u201D\u6309\u94AE\uFF0C\u8BA9\u754C\u9762\u66F4\u6E05\u723D\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.hideAddButton).onChange(async (value) => {
      this.plugin.settings.hideAddButton = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u9501\u5B9A\u5C5E\u6027 (\u9632\u8BEF\u89E6)").setDesc("\u5F00\u542F\u540E\uFF0C\u6253\u5F00\u5361\u7247\u65F6\u9ED8\u8BA4\u7981\u6B62\u4FEE\u6539\u5C5E\u6027\u5185\u5BB9\uFF08\u4F46\u53CC\u94FE\u63A5\u4F9D\u7136\u53EF\u70B9\u51FB\u8DF3\u8F6C\uFF09\u3002\u901A\u8FC7\u547D\u4EE4/\u5FEB\u6377\u952E\u6765\u4E34\u65F6\u89E3\u9501\u5B83\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.defaultLocked).onChange(async (value) => {
      this.plugin.settings.defaultLocked = value;
      this.plugin.isEditLocked = value;
      this.plugin.updateLockState();
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u60AC\u6D6E\u7A97\u4EC5\u663E\u793A\u5361\u7247 (\u5199\u5C0F\u8BF4\u7EAF\u51C0\u6A21\u5F0F)").setDesc("\u5F00\u542F\u540E\uFF0C\u9F20\u6807\u60AC\u505C\u5728\u89D2\u8272\u53CC\u94FE\u4E0A\u65F6\uFF0C\u53EA\u5F39\u51FA\u4E00\u4E2A\u5E72\u51C0\u7684\u89D2\u8272\u540D\u7247\uFF0C\u81EA\u52A8\u9690\u85CF\u6B63\u6587\u5185\u5BB9\u548C\u6807\u9898\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.popoverOnlyCard).onChange(async (value) => {
      this.plugin.settings.popoverOnlyCard = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u6781\u7B80\u7248\u9875\u9762\u9884\u89C8 (\u7AD6\u6392\u5361\u724C\u6A21\u5F0F)").setDesc("\u5F00\u542F\u540E\uFF0C\u60AC\u6D6E\u9884\u89C8\u5C06\u53D8\u6210\u4E00\u5F20\u5361\u724C\uFF1A\u56FE\u7247\u94FA\u6EE1\u4F5C\u4E3A\u80CC\u666F\uFF0C\u6587\u5B57\u60AC\u6D6E\u8986\u76D6\u5728\u5E95\u90E8\u3002\u5173\u95ED\u5219\u4E3A\u9ED8\u8BA4\u7684\u5DE6\u53F3\u6A2A\u6392\u5361\u7247\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.minimalPopover).onChange(async (value) => {
      this.plugin.settings.minimalPopover = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u60AC\u6D6E\u5361\u7247\u6574\u4F53\u7F29\u653E\u6BD4\u4F8B").setDesc("\u6309\u6BD4\u4F8B\u6574\u4F53\u7F29\u653E\u60AC\u6D6E\u5361\u7247\uFF08\u5305\u62EC\u6A2A\u6392\u548C\u6781\u7B80\u6A21\u5F0F\uFF09\u3002\u8303\u56F4 0.5 \u5230 2.0\uFF0C\u9ED8\u8BA4 1.0\u3002").addSlider((slider) => slider.setLimits(0.5, 2, 0.1).setValue(this.plugin.settings.popoverScale).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.popoverScale = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h2", { text: "\u65F6\u95F4\u7EBF\u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u5F00\u542F\u53F3\u952E\u6DFB\u52A0\u65F6\u95F4\u7EBF\u6A21\u677F").setDesc("\u5F00\u542F\u540E\uFF0C\u5728\u6B63\u6587\u533A\u70B9\u51FB\u53F3\u952E\uFF0C\u83DC\u5355\u4F1A\u589E\u52A0\u201C\u6DFB\u52A0\u65F6\u95F4\u7EBF\u6A21\u677F\u201D\u9009\u9879\uFF0C\u53EF\u5FEB\u901F\u5C06\u6307\u5B9A\u7684\u6A21\u677F\u5185\u5BB9\u63D2\u5165\u5230\u5F53\u524D\u5149\u6807\u5904\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.enableTimelineContextMenu).onChange(async (value) => {
      this.plugin.settings.enableTimelineContextMenu = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u65F6\u95F4\u7EBF\u6A21\u677F\u6587\u4EF6").setDesc("\u70B9\u51FB\u53F3\u4FA7\u6309\u94AE\uFF0C\u4ECE\u4ED3\u5E93\u4E2D\u641C\u7D22\u5E76\u6307\u5B9A\u4E00\u4E2A Markdown \u6587\u4EF6\u4F5C\u4E3A\u65F6\u95F4\u7EBF\u7684\u5FEB\u901F\u63D2\u5165\u6A21\u677F\u3002").addText((text) => {
      text.setPlaceholder("\u672A\u9009\u62E9\u6587\u4EF6...").setValue(this.plugin.settings.timelineTemplateFile).onChange(async (value) => {
        this.plugin.settings.timelineTemplateFile = value;
        await this.plugin.saveSettings();
      });
      text.inputEl.style.width = "200px";
    }).addButton((button) => button.setButtonText("\u641C\u7D22\u5E76\u9009\u62E9\u6587\u4EF6").onClick(() => {
      new FileSuggestModal(this.app, async (file) => {
        this.plugin.settings.timelineTemplateFile = file.path;
        await this.plugin.saveSettings();
        this.display();
      }).open();
    }));
    new import_obsidian.Setting(containerEl).setName("\u6574\u4F53\u7F29\u653E\u6587\u5B57\u5927\u5C0F").setDesc("\u8C03\u6574\u53F3\u4FA7\u65F6\u95F4\u7EBF\u9762\u677F\u4E2D\u7684\u6587\u5B57\u6574\u4F53\u5927\u5C0F\u3002\u8303\u56F4 0.5 \u5230 2.0\uFF0C\u9ED8\u8BA4 1.0\u3002").addSlider((slider) => slider.setLimits(0.5, 2, 0.1).setValue(this.plugin.settings.timelineTextScale).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.timelineTextScale = value;
      await this.plugin.saveSettings();
    }));
  }
};
var FileSuggestModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, onChooseItemCb) {
    super(app);
    this.onChooseItemCb = onChooseItemCb;
    this.setPlaceholder("\u8BF7\u8F93\u5165\u8981\u641C\u7D22\u7684\u6587\u4EF6\u540D...");
  }
  getItems() {
    return this.app.vault.getMarkdownFiles();
  }
  getItemText(item) {
    return item.path;
  }
  onChooseItem(item, evt) {
    this.onChooseItemCb(item);
  }
};
