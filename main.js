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
  defaultLocked: true
};
var NovelProfilePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.isPluginActive = true;
    // 【优化】防抖处理：防止快速切换页面时过度消耗性能
    this.debouncedProcessLeaves = (0, import_obsidian.debounce)(this.processAllLeaves.bind(this), 200, true);
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
    this.registerEvent(this.app.workspace.on("layout-change", () => this.debouncedProcessLeaves()));
    this.registerEvent(this.app.workspace.on("file-open", () => {
      setTimeout(() => this.processAllLeaves(), 150);
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      setTimeout(() => this.processAllLeaves(), 100);
    }));
    this.app.workspace.onLayoutReady(() => {
      this.processAllLeaves();
    });
  }
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
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    leaves.forEach((leaf) => {
      const view = leaf.view;
      if (view && view.containerEl) {
        view.containerEl.classList.remove("is-novel-profile");
        this.removeInjectedImage(view);
      }
    });
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
      const folders = this.settings.targetFolders.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
      const isTarget = this.isPluginActive && (folders.length === 0 || folders.some((folder) => {
        return file.path.startsWith(folder + "/") || file.parent?.path === folder || file.parent?.name === folder;
      }));
      if (isTarget) {
        container.classList.add("is-novel-profile");
        this.injectImage(view, file);
      } else {
        container.classList.remove("is-novel-profile");
        this.removeInjectedImage(view);
      }
    });
  }
  injectImage(view, file) {
    const metadataContainer = view.contentEl.querySelector(".metadata-container");
    if (!metadataContainer) return;
    if (metadataContainer.classList.contains("is-collapsed")) {
      const heading = metadataContainer.querySelector(".metadata-properties-heading");
      if (heading) {
        heading.click();
      }
    }
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter) {
      this.removeInjectedImage(view);
      return;
    }
    const imagePropValue = frontmatter[this.settings.imagePropertyName];
    let imagePath = "";
    if (typeof imagePropValue === "string") {
      const linkMatch = imagePropValue.match(/\[\[(.*?)\]\]/);
      if (linkMatch) {
        const linkText = linkMatch[1].split("|")[0];
        const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
        if (linkedFile) {
          imagePath = this.app.vault.getResourcePath(linkedFile);
        }
      } else {
        imagePath = imagePropValue.startsWith("http") ? imagePropValue : "";
      }
    }
    if (imagePath) {
      let imgContainer = metadataContainer.querySelector(".np-image-container");
      if (!imgContainer) {
        imgContainer = document.createElement("div");
        imgContainer.className = "np-image-container";
        const imgEl2 = document.createElement("img");
        imgContainer.appendChild(imgEl2);
        metadataContainer.prepend(imgContainer);
      }
      const imgEl = imgContainer.querySelector("img");
      if (imgEl.src !== imagePath) {
        imgEl.src = imagePath;
      }
    } else {
      this.removeInjectedImage(view);
    }
  }
  removeInjectedImage(view) {
    const metadataContainer = view.contentEl.querySelector(".metadata-container");
    if (metadataContainer) {
      const imgContainer = metadataContainer.querySelector(".np-image-container");
      if (imgContainer) imgContainer.remove();
    }
  }
  updateDynamicStyles() {
    let css = `
			:root {
				--np-image-width: ${this.settings.imageWidth}px;
			}
		`;
    if (this.settings.hidePropertyNames) {
      css += `
				body .is-novel-profile .metadata-property-key { display: none !important; }
				body .is-novel-profile .metadata-property-value { width: 100% !important; font-size: 1.1em !important; }
				body .is-novel-profile .metadata-property { border-bottom: none !important; padding-left: 0 !important; }
			`;
    }
    if (this.settings.hideAddButton) {
      css += `
				body .is-novel-profile .metadata-add-button { display: none !important; }
			`;
    }
    const propsToHide = this.settings.hideProperties.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
    propsToHide.forEach((prop) => {
      css += `
				body .is-novel-profile .metadata-property[data-property-key="${prop}"] {
					display: none !important;
				}
			`;
    });
    css += `
			body.np-edit-locked .is-novel-profile .metadata-properties {
				pointer-events: none !important;
			}
			body.np-edit-locked .is-novel-profile .metadata-link,
			body.np-edit-locked .is-novel-profile .metadata-link * {
				pointer-events: auto !important;
			}
			body.np-edit-locked .is-novel-profile .multi-select-pill-remove-button {
				display: none !important;
			}
			body.np-edit-locked .is-novel-profile .metadata-add-button {
				display: none !important;
			}
			body.np-edit-locked .is-novel-profile .metadata-property-value input,
			body.np-edit-locked .is-novel-profile .metadata-property-value div[contenteditable="true"],
			body.np-edit-locked .is-novel-profile .metadata-property-value .metadata-input-text {
				box-shadow: none !important;
				border: none !important;
				background-color: transparent !important;
				cursor: default !important;
			}
			body.np-edit-locked .is-novel-profile .metadata-property-value svg {
				display: none !important;
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
    containerEl.createEl("h2", { text: "\u5C0F\u8BF4\u89D2\u8272\u5361\u7247\u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u751F\u6548\u6587\u4EF6\u5939").setDesc("\u53EA\u6709\u8FD9\u4E9B\u6587\u4EF6\u5939\u5185\u7684\u7B14\u8BB0\u4F1A\u53D8\u6210\u5361\u7247\u6837\u5F0F\u3002\u591A\u4E2A\u6587\u4EF6\u5939\u7528\u9017\u53F7\u5206\u9694\uFF0C\u7559\u7A7A\u5219\u5168\u5C40\u751F\u6548\u3002\u4F8B\u5982: \u89D2\u8272, \u8BBE\u5B9A").addText((text) => text.setPlaceholder("\u89D2\u8272, \u8BBE\u5B9A").setValue(this.plugin.settings.targetFolders).onChange(async (value) => {
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
    new import_obsidian.Setting(containerEl).setName("\u9690\u85CF\u7279\u5B9A\u7684\u5C5E\u6027").setDesc("\u8F93\u5165\u4F60\u60F3\u9690\u85CF\u7684\u5C5E\u6027\u540D\u79F0\uFF08\u4E0D\u4F1A\u5220\u9664\u6570\u636E\uFF0C\u53EA\u662F\u770B\u4E0D\u89C1\uFF09\uFF0C\u7528\u9017\u53F7\u5206\u9694\u3002\u4F8B\u5982: tags, aliases").addText((text) => text.setPlaceholder("tags, aliases").setValue(this.plugin.settings.hideProperties).onChange(async (value) => {
      this.plugin.settings.hideProperties = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u9501\u5B9A\u5C5E\u6027 (\u9632\u8BEF\u89E6)").setDesc("\u5F00\u542F\u540E\uFF0C\u6253\u5F00\u5361\u7247\u65F6\u9ED8\u8BA4\u7981\u6B62\u4FEE\u6539\u5C5E\u6027\u5185\u5BB9\u3002\u4F60\u53EF\u4EE5\u901A\u8FC7\u5FEB\u6377\u952E\u6765\u4E34\u65F6\u89E3\u9501\u5B83\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.defaultLocked).onChange(async (value) => {
      this.plugin.settings.defaultLocked = value;
      this.plugin.isEditLocked = value;
      this.plugin.updateLockState();
      await this.plugin.saveSettings();
    }));
  }
};
