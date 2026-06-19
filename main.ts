import { App, Plugin, PluginSettingTab, Setting, TFile, MarkdownView, Notice, debounce, ItemView, WorkspaceLeaf, FuzzySuggestModal, Menu, Modal } from 'obsidian';

// ============================================================================
// 辅助函数：安全的 Monkey Patch (劫持) 机制，完美避开 TS 类型警告
// ============================================================================
type AnyFunction = (...args: any[]) => any;
function around<T extends Record<string, any>>(
    obj: T,
    factories: { [K in keyof T]?: (next: AnyFunction) => AnyFunction }
): () => void {
    const removers = Object.keys(factories).map(key => {
        const k = key as keyof T;
        const original = obj[k] as AnyFunction;
        const factory = factories[k];
        if (!factory) return () => { };

        const wrapped = factory(original) as AnyFunction & { container?: AnyFunction };
        wrapped.container = original;

        obj[k] = wrapped as T[keyof T];
        return () => {
            if (obj[k] === wrapped) obj[k] = original as T[keyof T];
        };
    });
    return () => removers.forEach(r => r());
}

// -----------------------------------------------------
// 1. 设置接口与默认值
// -----------------------------------------------------
interface NovelProfileSettings {
	targetFolders: string;
	imagePropertyName: string;
	imageWidth: number;
	hidePropertyNames: boolean;
	hideAddButton: boolean;
	hideProperties: string;
	defaultLocked: boolean;
	popoverOnlyCard: boolean;
	minimalPopover: boolean;
	popoverScale: number;

	enableTimelineContextMenu: boolean;
	timelineTemplateFile: string;
	timelineTextScale: number;
	timelineVersions: Record<string, number>;
}

const DEFAULT_SETTINGS: NovelProfileSettings = {
	targetFolders: '角色,设定',
	imagePropertyName: '图片',
	imageWidth: 150,
	hidePropertyNames: false,
	hideAddButton: true,
	hideProperties: 'tags,aliases',
	defaultLocked: true,
	popoverOnlyCard: true,
	minimalPopover: false,
	popoverScale: 1,

	enableTimelineContextMenu: false,
	timelineTemplateFile: '',
	timelineTextScale: 1.0,
	timelineVersions: {}
}

const TIMELINE_VIEW_TYPE = "novel-timeline-view";

interface ExtractedData {
	time: string;
	characterName: string;
	causeText: string;
	resultText: string;
	directImageLink: string;
}

interface TimelineVersion {
	title: string;
	line: number;
	contentLines: string[];
	extracted?: ExtractedData;
}

interface TimelineSection {
	h2Title: string;
	h2Line: number;
	versions: TimelineVersion[];
}

// -----------------------------------------------------
// 2. 主插件类
// -----------------------------------------------------
export default class NovelProfilePlugin extends Plugin {
	settings: NovelProfileSettings;
	dynamicStyleElement: HTMLStyleElement;
	isEditLocked: boolean;
	isPluginActive: boolean = true;

	hoverTimeout: number | null = null;
	activeCustomPopover: HTMLElement | null = null;

	debouncedProcessLeaves = debounce(this.processAllLeaves.bind(this), 250, true);

	async onload() {
		await this.loadSettings();
		this.isEditLocked = this.settings.defaultLocked;
		this.updateLockState();

		this.patchObsidianViews();

		this.registerView(TIMELINE_VIEW_TYPE, (leaf) => new NovelTimelineView(leaf, this));

		this.addRibbonIcon('list-tree', '打开小说事件时间线', () => {
			this.activateTimelineView();
		});

		this.addCommand({
			id: 'open-novel-timeline',
			name: '打开侧边栏: 小说事件时间线',
			callback: () => this.activateTimelineView()
		});

		this.addCommand({
			id: 'toggle-novel-profile-edit',
			name: '切换属性修改 (锁定/解锁当前卡片)',
			callback: () => {
				this.isEditLocked = !this.isEditLocked;
				this.updateLockState();
				new Notice(this.isEditLocked ? '🔒 角色卡片已锁定 (防误触)' : '🔓 角色卡片已解锁 (可修改)');
			}
		});

		this.addCommand({
			id: 'toggle-novel-profile-active',
			name: '一键开启/关闭卡片视图 (恢复原生排版)',
			callback: () => {
				this.isPluginActive = !this.isPluginActive;
				this.processAllLeaves();
				new Notice(this.isPluginActive ? '✨ 小说角色卡片视图：已开启' : '🙈 卡片视图已临时关闭 (恢复原生)');
			}
		});

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				if (this.settings.enableTimelineContextMenu) {
					menu.addItem((item) => {
						item
							.setTitle('添加时间线模板')
							.setIcon('list-tree')
							.onClick(async () => {
								if (!this.settings.timelineTemplateFile) {
									new Notice('❌ 请先在插件设置中指定时间线模板文件');
									return;
								}
								const file = this.app.metadataCache.getFirstLinkpathDest(this.settings.timelineTemplateFile, "");
								if (file instanceof TFile) {
									const content = await this.app.vault.read(file);
									editor.replaceSelection(content);
									new Notice('✨ 时间线模板已插入');
								} else {
									new Notice('❌ 未找到指定的时间线模板文件，请检查设置');
								}
							});
					});
				}
			})
		);

		this.dynamicStyleElement = document.createElement('style');
		this.dynamicStyleElement.id = 'novel-profile-dynamic-styles';
		document.head.appendChild(this.dynamicStyleElement);
		this.updateDynamicStyles();

		this.addSettingTab(new NovelProfileSettingTab(this.app, this));

		this.registerEvent(this.app.workspace.on('file-open', () => this.processAllLeaves()));
		this.registerEvent(this.app.workspace.on('layout-change', () => this.debouncedProcessLeaves()));
		this.registerEvent(this.app.metadataCache.on('changed', () => this.debouncedProcessLeaves()));
		this.registerDomEvent(document, 'mouseover', (e: MouseEvent) => this.handleMouseOver(e));
		this.registerDomEvent(document, 'mouseout', (e: MouseEvent) => this.handleMouseOut(e));

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

	checkIsTargetFile(file: TFile): boolean {
		if (!this.isPluginActive) return false;
		const folders = this.settings.targetFolders.split(/[,，]+/).map(f => f.trim()).filter(f => f.length > 0);
		return folders.length === 0 || folders.some(folder => {
			return file.path.startsWith(folder + '/') || file.parent?.path === folder || file.parent?.name === folder;
		});
	}

	handleMouseOver(e: MouseEvent) {
		if (!this.settings.popoverOnlyCard || !this.isPluginActive) return;
		const target = e.target as HTMLElement;
		const linkEl = target.closest('.internal-link, .cm-hmd-internal-link') as HTMLElement;
		if (!linkEl) return;
		let path = linkEl.getAttribute('data-href') || linkEl.textContent;
		if (!path) return;

		const cleanPath = path.split('|')[0].split('#')[0].split('^')[0].replace(/\[\[|\]\]/g, '').trim();
		const file = this.app.metadataCache.getFirstLinkpathDest(cleanPath, "");

		if (file && this.checkIsTargetFile(file)) {
			this.triggerCustomPopover(file, linkEl);
		}
	}

	triggerCustomPopover(file: TFile, linkEl: HTMLElement) {
		document.body.classList.add('np-showing-custom-popover');
		if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
		this.hoverTimeout = window.setTimeout(() => {
			this.buildAndShowCustomPopover(file, linkEl);
		}, 30);
	}

	handleMouseOut(e: MouseEvent) {
		if (this.hoverTimeout) {
			clearTimeout(this.hoverTimeout);
			this.hoverTimeout = null;
		}
		this.removeCustomPopover();
	}

	buildAndShowCustomPopover(file: TFile, linkEl: HTMLElement) {
		this.removeCustomPopover();
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) return;

		const popover = document.createElement('div');
		popover.className = 'np-custom-popover';
		if (this.settings.minimalPopover) popover.classList.add('is-minimal');

		const imgPath = this.resolveImagePath(frontmatter[this.settings.imagePropertyName], file);
		if (imgPath) {
			popover.classList.add('has-image');
			const imgDiv = popover.createDiv('np-custom-popover-img');
			imgDiv.style.backgroundImage = `url("${imgPath}")`;
			if (!this.settings.minimalPopover) imgDiv.style.width = `${this.settings.imageWidth}px`;
		}

		const contentDiv = popover.createDiv('np-custom-popover-content');
		const hideProps = this.settings.hideProperties.split(/[,，]+/).map(p => p.trim());
		hideProps.push(this.settings.imagePropertyName);

		for (const key in frontmatter) {
			if (hideProps.includes(key)) continue;
			let val = frontmatter[key];
			if (val === null || val === undefined || val === '') continue;

			if (Array.isArray(val)) {
				val = val.map(v => String(v).replace(/\[\[|\]\]/g, '')).join(', ');
			} else {
				val = String(val).replace(/\[\[|\]\]/g, '');
			}

			const propRow = contentDiv.createDiv('np-custom-prop');
			if (!this.settings.hidePropertyNames) {
				const keySpan = propRow.createSpan('np-custom-key');
				keySpan.textContent = key;
			}
			const valSpan = propRow.createSpan('np-custom-val');
			valSpan.textContent = val as string;
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
		document.body.classList.remove('np-showing-custom-popover');
	}

	resolveImagePath(imagePropValue: any, file: TFile): string {
		if (!imagePropValue) return '';
		if (typeof imagePropValue !== 'string') return '';
		const linkMatch = imagePropValue.match(/\[\[(.*?)\]\]/);
		if (linkMatch) {
			const linkText = linkMatch[1].split('|')[0].trim();
			const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
			if (linkedFile) return this.app.vault.getResourcePath(linkedFile);
		} else {
			return imagePropValue.startsWith('http') ? imagePropValue : '';
		}
		return '';
	}

	updateLockState() {
		if (this.isEditLocked) {
			document.body.classList.add('np-edit-locked');
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		} else {
			document.body.classList.remove('np-edit-locked');
		}
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(TIMELINE_VIEW_TYPE);

		if (this.hoverTimeout) window.clearTimeout(this.hoverTimeout);
		this.dynamicStyleElement.remove();
		document.body.classList.remove('np-edit-locked');
		this.removeCustomPopover();

		const leaves = this.app.workspace.getLeavesOfType('markdown');
		leaves.forEach(leaf => {
			const view = leaf.view as MarkdownView;
			if (view && view.containerEl) {
				view.containerEl.classList.remove('is-novel-profile');
				view.containerEl.removeAttribute('data-has-image');
				view.containerEl.style.removeProperty('--np-image-url');
			}
		});
	}

	patchObsidianViews() {
		const plugin = this;
		const applyProfileClassEarly = function(view: MarkdownView, file: TFile) {
			try {
				if (plugin.checkIsTargetFile(file)) {
					view.containerEl.classList.add('is-novel-profile');
					const cache = plugin.app.metadataCache.getFileCache(file);
					if (cache && cache.frontmatter) {
						plugin.updateImageState(view, file);
					}
				} else {
					view.containerEl.classList.remove('is-novel-profile');
					view.containerEl.removeAttribute('data-has-image');
					view.containerEl.style.removeProperty('--np-image-url');
				}
			} catch (e) {}
		};

		const unpatchLeaf = around(WorkspaceLeaf.prototype as any, {
			setViewState(next: AnyFunction) {
				return async function (this: WorkspaceLeaf, state: any, eState?: any) {
					if (state.type === 'markdown' && state.state && state.state.file) {
						const file = plugin.app.vault.getAbstractFileByPath(state.state.file);
						if (file instanceof TFile && this.view instanceof MarkdownView) {
							applyProfileClassEarly(this.view, file);
						}
					}
					return next.call(this, state, eState);
				};
			}
		});

		const unpatchMarkdown = around(MarkdownView.prototype as any, {
			onLoadFile(next: AnyFunction) {
				return async function (this: MarkdownView, file: TFile) {
					applyProfileClassEarly(this, file);
					const result = await next.call(this, file);
					plugin.processAllLeaves();
					return result;
				};
			}
		});

		this.register(unpatchLeaf);
		this.register(unpatchMarkdown);
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
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		leaves.forEach(leaf => {
			const view = leaf.view as MarkdownView;
			if (!view || !view.file) return;

			const file = view.file;
			const container = view.containerEl;

			const isTargetFolder = this.checkIsTargetFile(file);
			const cache = this.app.metadataCache.getFileCache(file);
			const hasFrontmatter = cache?.frontmatter && Object.keys(cache.frontmatter).length > 0;

			if (isTargetFolder && hasFrontmatter) {
				container.classList.add('is-novel-profile');
				this.updateImageState(view, file);

				// 🔥 彻底删除了这里原本“强制点开折叠面板”的流氓代码！
				// 用户折叠了就是折叠了，绝不再自作主张把它弹出来！

			} else {
				container.classList.remove('is-novel-profile');
				container.removeAttribute('data-has-image');
				container.style.removeProperty('--np-image-url');
			}
		});
	}

	updateImageState(view: MarkdownView, file: TFile) {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		if (!frontmatter || !frontmatter[this.settings.imagePropertyName]) {
			view.containerEl.removeAttribute('data-has-image');
			view.containerEl.style.removeProperty('--np-image-url');
			return;
		}
		const imagePath = this.resolveImagePath(frontmatter[this.settings.imagePropertyName], file);
		if (imagePath) {
			view.containerEl.setAttribute('data-has-image', 'true');
			view.containerEl.style.setProperty('--np-image-url', `url("${imagePath}")`);
		} else {
			view.containerEl.removeAttribute('data-has-image');
			view.containerEl.style.removeProperty('--np-image-url');
		}
	}

	updateDynamicStyles() {
		let css = `:root { --np-image-width: ${this.settings.imageWidth}px; }`;

		css += `
			/* 1. 禁用原生的属性折叠/展开动画，拒绝抽搐 */
			body .is-novel-profile .metadata-container *,
			body .is-novel-profile .metadata-property {
				transition: none !important;
				animation: none !important;
			}

			/* 2. 🌟 修复永久隐身Bug：正确控制初始透明度，0.4秒后平滑显现 */
			body .is-novel-profile .metadata-container:not(.is-collapsed) {
				/* 关键修复：去掉基础类的 opacity: 0，完全交由 animation 接管 */
				animation: np-stealth-mode 0.4s ease-out forwards !important;
			}
			@keyframes np-stealth-mode {
				0% { opacity: 0; }
				75% { opacity: 0; } /* 前 0.3 秒绝对隐身，此时 SimplyScroll 正在狂奔 */
				100% { opacity: 1; }
			}

			/* 3. 焊死高度：即便隐身也要在物理上占位，保证 SimplyScroll 滚轮计算绝对精准 */
			body .is-novel-profile[data-has-image="true"] .metadata-container:not(.is-collapsed)::before {
				min-height: calc(var(--np-image-width, 150px) * 1.35) !important;
			}

			/* 4. 🌟 恢复标题栏可见：把原生的小箭头还给你，方便你随时手动折叠它！ */
			body .is-novel-profile .metadata-properties-heading {
				display: flex !important;
			}
		`;

		if (this.settings.hidePropertyNames) {
			css += `
				body .is-novel-profile .metadata-property-key,
				.np-custom-key { display: none !important; }
				body .is-novel-profile .metadata-property-value { width: 100% !important; font-size: 1.1em !important; }
				body .is-novel-profile .metadata-property { border-bottom: none !important; padding-left: 0 !important; }
			`;
		}
		if (this.settings.hideAddButton) css += `body .is-novel-profile .metadata-add-button { display: none !important; }`;

		const propsToHide = this.settings.hideProperties.split(/[,，]+/).map(p => p.trim()).filter(p => p.length > 0);
		if (!propsToHide.includes(this.settings.imagePropertyName)) propsToHide.push(this.settings.imagePropertyName);
		propsToHide.forEach(prop => {
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
}

// -----------------------------------------------------
// 3. 事件时间线视图 (Timeline View)
// -----------------------------------------------------
class NovelTimelineView extends ItemView {
	plugin: NovelProfilePlugin;
	timelineNodes: { el: HTMLElement, line: number }[] = [];
	lastScrolledNode: HTMLElement | null = null;
	debouncedScrollSync: Function;
	isClickNavigating: boolean = false;
	debouncedUpdateView: Function;

	updateVersion: number = 0;
	isInitialLoading: boolean = false;
	activeFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: NovelProfilePlugin) {
		super(leaf);
		this.plugin = plugin;

		this.debouncedScrollSync = debounce((view: MarkdownView) => {
			if (this.isClickNavigating || this.isInitialLoading) return;
			const line = this.getVisibleLine(view);
			this.syncHighlightToLine(line, false, false);
		}, 50, true);

		this.debouncedUpdateView = debounce((maintainScroll: boolean = false) => {
			this.updateView(maintainScroll);
		}, 150, true);
	}

	getViewType() { return TIMELINE_VIEW_TYPE; }
	getDisplayText() { return "事件线"; }
	getIcon() { return "list-tree"; }

	getVisibleLine(view: MarkdownView): number {
		try {
			const cm = (view.editor as any).cm;
			if (cm && cm.scrollDOM) {
				const block = cm.lineBlockAtHeight(cm.scrollDOM.scrollTop + 100);
				if (block) return view.editor.offsetToPos(block.from).line;
			}
		} catch (e) { }
		return view?.editor?.getCursor()?.line || 0;
	}

	onload() {
		super.onload();

		this.registerEvent(this.app.workspace.on('file-open', (file) => {
			if (file && file.extension === 'md') {
				if (this.activeFile !== file) {
					this.activeFile = file;
					this.isInitialLoading = true;
					this.debouncedUpdateView(false);
					setTimeout(() => { this.isInitialLoading = false; }, 300);
				}
			} else if (!file) {
				this.activeFile = null;
				this.debouncedUpdateView(false);
			}
		}));

		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (this.activeFile && file === this.activeFile) {
				this.debouncedUpdateView(true);
			}
		}));

		this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
			if (leaf && leaf.view instanceof MarkdownView) {
				const file = leaf.view.file;
				if (file && file !== this.activeFile) {
					this.activeFile = file;
					this.isInitialLoading = true;
					this.debouncedUpdateView(false);
					setTimeout(() => { this.isInitialLoading = false; }, 300);
				} else if (file === this.activeFile) {
					this.debouncedScrollSync(leaf.view);
				}
			}
		}));

		this.registerEvent(this.app.workspace.on('editor-change', (editor, view) => {
			if (this.isClickNavigating || this.isInitialLoading) return;
			if (this.activeFile && view.file === this.activeFile) {
				this.syncHighlightToLine(this.getVisibleLine(view as MarkdownView), false, false);
			}
		}));

		const workspaceEl = this.app.workspace.containerEl;
		this.registerDomEvent(workspaceEl, "scroll", (e) => {
			if (this.isClickNavigating || this.isInitialLoading) return;
			const target = e.target as HTMLElement;

			if (target?.classList?.contains("cm-scroller")) {
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				for (const leaf of leaves) {
					const view = leaf.view as MarkdownView;
					if (view && view.file === this.activeFile) {
						const cm = (view.editor as any).cm;
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
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				if (leaves.length > 0) file = (leaves[0].view as MarkdownView).file;
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

	extractTimelineData(contentLines: string[]): ExtractedData {
		let time = "", characterName = "", causeText = "", resultText = "";
		let directImageLink = "";

		const sectionText = contentLines.join('\n');

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
				const linkText = m[1].split('|')[0].trim();
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
					const safeImgLink = directImageLink.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
					cleanedText = cleanedText.replace(new RegExp(`!*\\[\\[${safeImgLink}.*?\\]\\]`, 'g'), '');
					cleanedText = cleanedText.replace(new RegExp(safeImgLink, 'g'), '');
				}
				cleanedText = cleanedText.replace(/\[\[|\]\]/g, '').trim();
				const parts = cleanedText.split(/[,，、]/).map(p => p.trim()).filter(p => p.length > 0);
				if (parts.length > 0) {
					characterName = parts[0];
				} else if (directImageLink) {
					const baseName = directImageLink.split(/[\/\\]/).pop() || '';
					characterName = baseName.replace(/\.(jpg|jpeg|png|gif|webp|bmp)$/i, '');
				}
			}
		}

		const causeMatch = sectionText.match(/-\s+(?:\*\*)*起因(?:\*\*)*\s*[：:]\s*(.*)/);
		if (causeMatch) causeText = causeMatch[1].trim().replace(/\[\[|\]\]/g, '');

		const resultMatch = sectionText.match(/-\s+(?:\*\*)*结果(?:\*\*)*\s*[：:]\s*(.*)/);
		if (resultMatch) resultText = resultMatch[1].trim().replace(/\[\[|\]\]/g, '');

		return { time, characterName, causeText, resultText, directImageLink };
	}

	createTimelineItemDOM(container: HTMLElement, data: ExtractedData, titleToDisplay: string, activeFile: TFile): { itemEl: HTMLElement, dotEl: HTMLElement } {
		const itemEl = container.createDiv({ cls: 'np-timeline-item' });

		const leftEl = itemEl.createDiv({ cls: 'np-timeline-left' });
		const cardEl = leftEl.createDiv({ cls: 'np-timeline-card' });

		if (data.characterName || data.directImageLink) {
			if (data.characterName) {
				cardEl.createDiv({ cls: 'np-timeline-name', text: data.characterName });
			}
			if (data.directImageLink) {
				const imgFile = this.app.metadataCache.getFirstLinkpathDest(data.directImageLink, activeFile.path);
				if (imgFile) {
					const imgPath = this.app.vault.getResourcePath(imgFile);
					if (imgPath) cardEl.style.backgroundImage = `url("${imgPath}")`;
				} else if (data.directImageLink.startsWith('http')) {
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
			cardEl.style.display = 'none';
		}

		if (data.time) leftEl.createDiv({ cls: 'np-timeline-time', text: data.time });

		const dividerEl = itemEl.createDiv({ cls: 'np-timeline-divider' });
		dividerEl.createDiv({ cls: 'np-timeline-line' });
		const dotEl = dividerEl.createDiv({ cls: 'np-timeline-dot' });

		const rightEl = itemEl.createDiv({ cls: 'np-timeline-right' });
		rightEl.createDiv({ cls: 'np-timeline-title', text: titleToDisplay });

		if (data.causeText || data.resultText) {
			const descEl = rightEl.createDiv({ cls: 'np-timeline-desc' });
			if (data.causeText) {
				const causeDiv = descEl.createDiv({ cls: 'np-timeline-cause' });
				causeDiv.innerHTML = `<strong>起因：</strong>${data.causeText}`;
			}
			if (data.resultText) {
				const resultDiv = descEl.createDiv({ cls: 'np-timeline-result' });
				resultDiv.innerHTML = `<strong>结果：</strong>${data.resultText}`;
			}
		}

		return { itemEl, dotEl };
	}


	async updateView(maintainScroll: boolean = false) {
		const container = this.contentEl;

		if (!this.activeFile) {
			container.empty();
			container.createDiv({ cls: 'np-timeline-empty', text: '请打开一个包含事件记录的笔记。' });
			return;
		}

		const currentVersionNumber = ++this.updateVersion;
		const content = await this.app.vault.cachedRead(this.activeFile);
		if (currentVersionNumber !== this.updateVersion) return;

		let savedScrollTop = 0;
		if (maintainScroll) {
			const oldTimeline = container.querySelector('.np-timeline-container');
			if (oldTimeline) savedScrollTop = oldTimeline.scrollTop;
		}

		container.empty();
		this.timelineNodes = [];

		const lines = content.split('\n');

		let sectionsData: TimelineSection[] = [];
		let currentSection: TimelineSection | null = null;
		let currentVersion: TimelineVersion | null = null;

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
					h2Title: h2Match[1].trim().replace(/\[\[|\]\]/g, ''),
					h2Line: i,
					versions: []
				};
				currentVersion = null;
			} else if (h3Match && currentSection) {
				if (currentVersion) currentSection.versions.push(currentVersion);
				currentVersion = {
					title: h3Match[1].trim().replace(/\[\[|\]\]/g, ''),
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
		sectionsData = sectionsData.filter(s => s.versions.length > 0);

		if (sectionsData.length === 0) {
			container.createDiv({ cls: 'np-timeline-empty', text: '当前笔记没有检测到有效的时间线事件。' });
			return;
		}

		const timelineContainer = container.createDiv({ cls: 'np-timeline-container' });

		const isInitialLoad = !maintainScroll;
		if (isInitialLoad) {
			timelineContainer.style.opacity = '0';
		}

		for (const section of sectionsData) {
			const versionCount = section.versions.length;
			const sectionKey = `${this.activeFile.path}::${section.h2Title}`;

			let selectedIdx = this.plugin.settings.timelineVersions[sectionKey] || 0;
			if (selectedIdx >= versionCount) selectedIdx = 0;

			const activeVersion = section.versions[selectedIdx];

			const { itemEl, dotEl } = this.createTimelineItemDOM(timelineContainer, activeVersion.extracted!, section.h2Title, this.activeFile);

			if (versionCount > 1) {
				dotEl.setAttribute('data-version-count', String(versionCount));
			}

			itemEl.oncontextmenu = (e) => {
				e.preventDefault();
				const menu = new Menu();
				
				if (versionCount > 1) {
					menu.addItem((item) => {
						item
							.setTitle(`切换分支版本 (${versionCount}个版本)`)
							.setIcon("git-branch")
							.onClick(() => {
								new VersionSelectModal(this.app, this, section, selectedIdx, async (newIdx) => {
									this.plugin.settings.timelineVersions[sectionKey] = newIdx;
									await this.plugin.saveSettings();

									let view = this.app.workspace.getActiveViewOfType(MarkdownView);
									if (!view || view.file !== this.activeFile) {
										const leaves = this.app.workspace.getLeavesOfType('markdown');
										view = leaves.find(l => (l.view as MarkdownView).file === this.activeFile)?.view as MarkdownView;
									}

									if (view && view.editor) {
										this.isClickNavigating = true;
										this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
										const targetLine = section.versions[newIdx].line;
										const editor = view.editor;
										const cm = (editor as any).cm;

										if (cm) {
											const offset = editor.posToOffset({ line: targetLine, ch: 0 });
											cm.dispatch({ selection: { anchor: offset, head: offset } });
											const blockInfo = cm.lineBlockAt(offset);
											if (blockInfo) {
												cm.scrollDOM.scrollTo({ top: Math.max(0, blockInfo.top - 60), behavior: 'smooth' });
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
					
					menu.addSeparator();
				}

				menu.addItem((item) => {
					item
						.setTitle('上移该事件')
						.setIcon('arrow-up')
						.onClick(async () => {
							await this.moveTimelineSection(section.h2Line, 'up');
						});
				});

				menu.addItem((item) => {
					item
						.setTitle('下移该事件')
						.setIcon('arrow-down')
						.onClick(async () => {
							await this.moveTimelineSection(section.h2Line, 'down');
						});
				});

				menu.showAtMouseEvent(e);
			};

			this.timelineNodes.push({ el: itemEl, line: activeVersion.line });

			itemEl.onclick = () => {
				let view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view || view.file !== this.activeFile) {
					const leaves = this.app.workspace.getLeavesOfType('markdown');
					view = leaves.find(l => (l.view as MarkdownView).file === this.activeFile)?.view as MarkdownView;
				}

				if (view && view.editor) {
					this.isClickNavigating = true;
					this.app.workspace.setActiveLeaf(view.leaf, { focus: true });

					const cm = (view.editor as any).cm;
					if (cm) {
						const offset = view.editor.posToOffset({ line: activeVersion.line, ch: 0 });
						cm.dispatch({ selection: { anchor: offset, head: offset } });
						const lineInfo = cm.lineBlockAt(offset);
						if (lineInfo) {
							cm.scrollDOM.scrollTo({ top: Math.max(0, lineInfo.top - 60), behavior: 'smooth' });
						}
					} else {
						view.editor.setCursor({ line: activeVersion.line, ch: 0 });
					}

					this.syncHighlightToLine(activeVersion.line, true, false);
					setTimeout(() => { this.isClickNavigating = false; }, 800);
				}
			};
		}

		if (isInitialLoad) {
			setTimeout(() => {
				if (currentVersionNumber === this.updateVersion) {
					const leaves = this.app.workspace.getLeavesOfType('markdown');
					const view = leaves.find(l => (l.view as MarkdownView).file === this.activeFile)?.view as MarkdownView;
					if (view) this.syncHighlightToLine(this.getVisibleLine(view), false, true);

					timelineContainer.style.transition = 'opacity 0.15s ease-out';
					timelineContainer.style.opacity = '1';
				}
			}, 50);
		} else {
			timelineContainer.scrollTop = savedScrollTop;
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			const view = leaves.find(l => (l.view as MarkdownView).file === this.activeFile)?.view as MarkdownView;
			if (view) this.syncHighlightToLine(this.getVisibleLine(view), maintainScroll, false);
		}
	}

	async moveTimelineSection(targetH2Line: number, direction: 'up' | 'down') {
		if (!this.activeFile) return;

		const content = await this.app.vault.read(this.activeFile);
		const lines = content.split('\n');

		let prelude: string[] = [];
		let sections: { startLine: number, lines: string[] }[] = [];
		let currentSection: { startLine: number, lines: string[] } | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.match(/^##\s+(.*)/)) {
				currentSection = { startLine: i, lines: [line] };
				sections.push(currentSection);
			} else {
				if (currentSection) {
					currentSection.lines.push(line);
				} else {
					prelude.push(line);
				}
			}
		}

		const index = sections.findIndex(s => s.startLine === targetH2Line);
		if (index === -1) return;
		if (direction === 'up' && index === 0) {
			new Notice("已经是第一个事件，无法上移");
			return;
		}
		if (direction === 'down' && index === sections.length - 1) {
			new Notice("已经是最后一个事件，无法下移");
			return;
		}

		const targetIndex = direction === 'up' ? index - 1 : index + 1;
		const temp = sections[index];
		sections[index] = sections[targetIndex];
		sections[targetIndex] = temp;

		let newContentLines: string[] = [...prelude];
		
		while (newContentLines.length > 0 && newContentLines[newContentLines.length - 1].trim() === '') {
			newContentLines.pop();
		}

		for (let i = 0; i < sections.length; i++) {
			if (newContentLines.length > 0) {
				newContentLines.push('');
			}

			let secLines = sections[i].lines;
			while (secLines.length > 0 && secLines[secLines.length - 1].trim() === '') {
				secLines.pop();
			}
			newContentLines.push(...secLines);
		}

		newContentLines.push('');

		const newContent = newContentLines.join('\n');
		await this.app.vault.modify(this.activeFile, newContent);
		
		new Notice(`事件已成功${direction === 'up' ? '上移' : '下移'}！`);
	}

	syncHighlightToLine(targetLine: number, preventScroll: boolean = false, isInitialLoad: boolean = false) {
		if (!this.timelineNodes || this.timelineNodes.length === 0) return;

		let activeNode: { el: HTMLElement, line: number } | null = null;
		for (const node of this.timelineNodes) {
			if (targetLine >= node.line) {
				activeNode = node;
			} else {
				break;
			}
		}

		this.timelineNodes.forEach(node => {
			if (activeNode && node === activeNode) {
				node.el.classList.add('is-active');
			} else {
				node.el.classList.remove('is-active');
			}
		});

		if (!preventScroll && activeNode && this.lastScrolledNode !== activeNode.el) {
			const scrollMode = isInitialLoad ? 'auto' : 'smooth';
			activeNode.el.scrollIntoView({ behavior: scrollMode, block: 'center' });
		}

		if (activeNode) {
			this.lastScrolledNode = activeNode.el;
		}
	}
}

// -----------------------------------------------------
// 🌟 4. 新增：选择分支版本的弹窗界面
// -----------------------------------------------------
class VersionSelectModal extends Modal {
	timelineView: NovelTimelineView;
	section: TimelineSection;
	selectedIndex: number;
	onSelect: (index: number) => void;

	constructor(app: App, timelineView: NovelTimelineView, section: TimelineSection, selectedIndex: number, onSelect: (index: number) => void) {
		super(app);
		this.timelineView = timelineView;
		this.section = section;
		this.selectedIndex = selectedIndex;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '切换版本分支', cls: 'np-modal-title' });
		contentEl.createEl('p', { text: `当前事件：${this.section.h2Title}`, cls: 'np-modal-subtitle' });

		const container = contentEl.createDiv({ cls: 'np-timeline-container np-version-modal-container' });

		this.section.versions.forEach((version, index) => {
			const { itemEl } = this.timelineView.createTimelineItemDOM(container, version.extracted!, version.title, this.timelineView.activeFile!);

			if (index === this.selectedIndex) {
				itemEl.classList.add('is-active');
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
}

// -----------------------------------------------------
// 5. 设置面板
// -----------------------------------------------------
class NovelProfileSettingTab extends PluginSettingTab {
	plugin: NovelProfilePlugin;

	constructor(app: App, plugin: NovelProfilePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: '小说角色卡片设置 (Novel Profile)' });

		new Setting(containerEl)
			.setName('生效文件夹')
			.setDesc('只有这些文件夹内的笔记会变成卡片样式。支持中英文逗号分隔。例如: 角色，设定')
			.addText(text => text
				.setPlaceholder('角色, 设定')
				.setValue(this.plugin.settings.targetFolders)
				.onChange(async (value) => {
					this.plugin.settings.targetFolders = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('图片属性名称')
			.setDesc('用来读取图片的属性键名，支持解析 [[图片名.jpg]] 以及外部网络图片链接。')
			.addText(text => text
				.setPlaceholder('图片')
				.setValue(this.plugin.settings.imagePropertyName)
				.onChange(async (value) => {
					this.plugin.settings.imagePropertyName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('图片宽度')
			.setDesc('左侧图片的宽度 (px)，高度会自动适应。')
			.addSlider(slider => slider
				.setLimits(100, 400, 10)
				.setValue(this.plugin.settings.imageWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.imageWidth = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('隐藏属性名称')
			.setDesc('是否隐藏属性前面的名称(Key)，只显示值(Value)。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hidePropertyNames)
				.onChange(async (value) => {
					this.plugin.settings.hidePropertyNames = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('隐藏指定的属性')
			.setDesc('不想显示在卡片里的属性，支持中英文逗号分隔。例如：tags, aliases, 状态')
			.addText(text => text
				.setPlaceholder('tags, aliases')
				.setValue(this.plugin.settings.hideProperties)
				.onChange(async (value) => {
					this.plugin.settings.hideProperties = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('隐藏添加属性按钮')
			.setDesc('是否隐藏底部蓝色的“添加笔记属性”按钮，让界面更清爽。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideAddButton)
				.onChange(async (value) => {
					this.plugin.settings.hideAddButton = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('默认锁定属性 (防误触)')
			.setDesc('开启后，打开卡片时默认禁止修改属性内容（但双链接依然可点击跳转）。通过命令/快捷键来临时解锁它。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.defaultLocked)
				.onChange(async (value) => {
					this.plugin.settings.defaultLocked = value;
					this.plugin.isEditLocked = value;
					this.plugin.updateLockState();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('悬浮窗仅显示卡片 (写小说纯净模式)')
			.setDesc('开启后，鼠标悬停在角色双链上时，只弹出一个干净的角色名片，自动隐藏正文内容和标题。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.popoverOnlyCard)
				.onChange(async (value) => {
					this.plugin.settings.popoverOnlyCard = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('极简版页面预览 (竖排卡牌模式)')
			.setDesc('开启后，悬浮预览将变成一张卡牌：图片铺满作为背景，文字悬浮覆盖在底部。关闭则为默认的左右横排卡片。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.minimalPopover)
				.onChange(async (value) => {
					this.plugin.settings.minimalPopover = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('悬浮卡片整体缩放比例')
			.setDesc('按比例整体缩放悬浮卡片（包括横排和极简模式）。范围 0.5 到 2.0，默认 1.0。')
			.addSlider(slider => slider
				.setLimits(0.5, 2.0, 0.1)
				.setValue(this.plugin.settings.popoverScale)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.popoverScale = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h2', { text: '时间线设置' });

		new Setting(containerEl)
			.setName('开启右键添加时间线模板')
			.setDesc('开启后，在正文区点击右键，菜单会增加“添加时间线模板”选项，可快速将指定的模板内容插入到当前光标处。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTimelineContextMenu)
				.onChange(async (value) => {
					this.plugin.settings.enableTimelineContextMenu = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('时间线模板文件')
			.setDesc('点击右侧按钮，从仓库中搜索并指定一个 Markdown 文件作为时间线的快速插入模板。')
			.addText(text => {
				text.setPlaceholder('未选择文件...')
					.setValue(this.plugin.settings.timelineTemplateFile)
					.onChange(async (value) => {
						this.plugin.settings.timelineTemplateFile = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = '200px';
			})
			.addButton(button => button
				.setButtonText("搜索并选择文件")
				.onClick(() => {
					new FileSuggestModal(this.app, async (file: TFile) => {
						this.plugin.settings.timelineTemplateFile = file.path;
						await this.plugin.saveSettings();
						this.display();
					}).open();
				}));

		new Setting(containerEl)
			.setName('整体缩放文字大小')
			.setDesc('调整右侧时间线面板中的文字整体大小。范围 0.5 到 2.0，默认 1.0。')
			.addSlider(slider => slider
				.setLimits(0.5, 2.0, 0.1)
				.setValue(this.plugin.settings.timelineTextScale)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.timelineTextScale = value;
					await this.plugin.saveSettings();
				}));
	}
}

// -----------------------------------------------------
// 6. 辅助弹窗类：模糊匹配搜索仓库内的文件
// -----------------------------------------------------
class FileSuggestModal extends FuzzySuggestModal<TFile> {
	onChooseItemCb: (item: TFile) => void;

	constructor(app: App, onChooseItemCb: (item: TFile) => void) {
		super(app);
		this.onChooseItemCb = onChooseItemCb;
		this.setPlaceholder("请输入要搜索的文件名...");
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChooseItemCb(item);
	}
}