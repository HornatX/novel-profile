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
  popoverOnlyCard: true
};
var NovelProfilePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.isPluginActive = true;
    this.hoverTimeout = null;
    this.activeCustomPopover = null;
    // 防抖处理仅用于窗口变化和属性数据修改时，节省性能
    this.debouncedProcessLeaves = (0, import_obsidian.debounce)(this.processAllLeaves.bind(this), 250, true);
  }
  async onload() {
    await this.loadSettings();
    this.isEditLocked = this.settings.defaultLocked;
    this.updateLockState();
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
    this.dynamicStyleElement = document.createElement("style");
    this.dynamicStyleElement.id = "novel-profile-dynamic-styles";
    document.head.appendChild(this.dynamicStyleElement);
    this.updateDynamicStyles();
    this.addSettingTab(new NovelProfileSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on("file-open", () => {
      this.processAllLeaves();
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.debouncedProcessLeaves()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.debouncedProcessLeaves()));
    this.registerDomEvent(document, "mouseover", (e) => this.handleMouseOver(e));
    this.registerDomEvent(document, "mouseout", (e) => this.handleMouseOut(e));
    this.app.workspace.onLayoutReady(() => {
      this.processAllLeaves();
    });
  }
  checkIsTargetFile(file) {
    if (!this.isPluginActive) return false;
    const folders = this.settings.targetFolders.split(/[,，]+/).map((f) => f.trim()).filter((f) => f.length > 0);
    return folders.length === 0 || folders.some((folder) => {
      return file.path.startsWith(folder + "/") || file.parent?.path === folder || file.parent?.name === folder;
    });
  }
  // ----------------------------------------------------
  // 悬浮窗 (页面预览) 核心逻辑
  // ----------------------------------------------------
  handleMouseOver(e) {
    if (!this.settings.popoverOnlyCard || !this.isPluginActive) return;
    const target = e.target;
    const linkEl = target.closest(".internal-link, .cm-hmd-internal-link");
    if (!linkEl) return;
    let path = linkEl.getAttribute("data-href") || linkEl.textContent;
    if (!path) return;
    const cleanPath = path.split("|")[0].split("#")[0].split("^")[0].replace(/\[\[|\]\]/g, "").trim();
    const file = this.app.metadataCache.getFirstLinkpathDest(cleanPath, "");
    if (!file) {
      const fallbackFile = this.app.vault.getMarkdownFiles().find((f) => f.basename === cleanPath);
      if (!fallbackFile) return;
      if (this.checkIsTargetFile(fallbackFile)) {
        this.triggerCustomPopover(fallbackFile, linkEl);
      }
      return;
    }
    if (this.checkIsTargetFile(file)) {
      this.triggerCustomPopover(file, linkEl);
    }
  }
  triggerCustomPopover(file, linkEl) {
    document.body.classList.add("np-showing-custom-popover");
    if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
    this.hoverTimeout = setTimeout(() => {
      this.buildAndShowCustomPopover(file, linkEl);
    }, 300);
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
    const imgPath = this.resolveImagePath(frontmatter[this.settings.imagePropertyName], file);
    if (imgPath) {
      const imgDiv = popover.createDiv("np-custom-popover-img");
      imgDiv.style.backgroundImage = `url("${imgPath}")`;
      imgDiv.style.width = `${this.settings.imageWidth}px`;
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
    if (top + popover.offsetHeight > window.innerHeight) {
      top = rect.top - popover.offsetHeight - 10;
    }
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
  // ----------------------------------------------------
  // 主视图更新逻辑
  // ----------------------------------------------------
  updateLockState() {
    if (this.isEditLocked) {
      document.body.classList.add("np-edit-locked");
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } else {
      document.body.classList.remove("np-edit-locked");
    }
  }
  onunload() {
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
    document.querySelectorAll(".np-image-container").forEach((el) => el.remove());
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
      const isTarget = this.checkIsTargetFile(file);
      if (isTarget) {
        container.classList.add("is-novel-profile");
        this.updateImageState(view, file);
        setTimeout(() => this.autoExpandProperties(view), 150);
      } else {
        container.classList.remove("is-novel-profile");
        container.removeAttribute("data-has-image");
        container.style.removeProperty("--np-image-url");
      }
    });
  }
  // 新版逻辑：只解析路径注入 CSS，绝不碰触和修改属性面板的 DOM 结构！
  updateImageState(view, file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter || !frontmatter[this.settings.imagePropertyName]) {
      view.containerEl.removeAttribute("data-has-image");
      view.containerEl.style.removeProperty("--np-image-url");
      return;
    }
    const imagePropValue = frontmatter[this.settings.imagePropertyName];
    let imagePath = "";
    if (typeof imagePropValue === "string") {
      const linkMatch = imagePropValue.match(/\[\[(.*?)\]\]/);
      if (linkMatch) {
        const linkText = linkMatch[1].split("|")[0].trim();
        const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
        if (linkedFile) {
          imagePath = this.app.vault.getResourcePath(linkedFile);
        }
      } else {
        imagePath = imagePropValue.startsWith("http") ? imagePropValue : "";
      }
    }
    if (imagePath) {
      view.containerEl.setAttribute("data-has-image", "true");
      view.containerEl.style.setProperty("--np-image-url", `url("${imagePath}")`);
    } else {
      view.containerEl.removeAttribute("data-has-image");
      view.containerEl.style.removeProperty("--np-image-url");
    }
  }
  autoExpandProperties(view) {
    const metadataContainer = view.contentEl.querySelector(".metadata-container");
    if (metadataContainer && metadataContainer.classList.contains("is-collapsed")) {
      const heading = metadataContainer.querySelector(".metadata-properties-heading");
      heading?.click();
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
    if (this.settings.hideAddButton) {
      css += `body .is-novel-profile .metadata-add-button { display: none !important; }`;
    }
    const propsToHide = this.settings.hideProperties.split(/[,，]+/).map((p) => p.trim()).filter((p) => p.length > 0);
    if (!propsToHide.includes(this.settings.imagePropertyName)) {
      propsToHide.push(this.settings.imagePropertyName);
    }
    propsToHide.forEach((prop) => {
      const safeProp = CSS.escape(prop);
      css += `
				body .is-novel-profile .metadata-property[data-property-key="${safeProp}"] {
					display: none !important;
				}
			`;
    });
    css += `
			body.np-edit-locked .is-novel-profile .metadata-properties { pointer-events: none !important; }
			body.np-edit-locked .is-novel-profile a.internal-link,
			body.np-edit-locked .is-novel-profile a.external-link,
			body.np-edit-locked .is-novel-profile .metadata-link-inner {
				pointer-events: auto !important;
				cursor: pointer !important;
			}
			body.np-edit-locked .is-novel-profile .multi-select-pill-remove-button,
			body.np-edit-locked .is-novel-profile .metadata-add-button,
			body.np-edit-locked .is-novel-profile .metadata-property-value svg { display: none !important; }
			body.np-edit-locked .is-novel-profile .metadata-property-value input,
			body.np-edit-locked .is-novel-profile .metadata-property-value div[contenteditable="true"],
			body.np-edit-locked .is-novel-profile .metadata-property-value .metadata-input-text {
				box-shadow: none !important;
				border: none !important;
				background-color: transparent !important;
				cursor: default !important;
			}
		`;
    this.dynamicStyleElement.textContent = css;
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
    new import_obsidian.Setting(containerEl).setName("\u9690\u85CF\u6DFB\u52A0\u5C5E\u6027\u6309\u94AE").setDesc("\u662F\u5426\u9690\u85CF\u5E95\u90E8\u84DD\u8272\u7684\u201C\u6DFB\u52A0\u7B14\u8BB0\u5C5E\u6027\u201D\u6309\u94AE\uFF0C\u8BA9\u754C\u9762\u66F4\u6E05\u723D\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.hideAddButton).onChange(async (value) => {
      this.plugin.settings.hideAddButton = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u9690\u85CF\u7279\u5B9A\u7684\u5C5E\u6027").setDesc("\u60F3\u9690\u85CF\u7684\u5C5E\u6027\u540D\u79F0\uFF08\u4E0D\u4F1A\u5220\u9664\u6570\u636E\uFF0C\u53EA\u662F\u770B\u4E0D\u89C1\uFF09\uFF0C\u652F\u6301\u4E2D\u82F1\u6587\u9017\u53F7\u3002\u4F8B\u5982: tags\uFF0Caliases").addText((text) => text.setPlaceholder("tags, aliases").setValue(this.plugin.settings.hideProperties).onChange(async (value) => {
      this.plugin.settings.hideProperties = value;
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
  }
};
