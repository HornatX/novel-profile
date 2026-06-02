import { App, Plugin, PluginSettingTab, Setting, TFile, MarkdownView, Notice, debounce, ItemView, WorkspaceLeaf } from 'obsidian';

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
}

const DEFAULT_SETTINGS: NovelProfileSettings = {
	targetFolders: '角色,设定',
	imagePropertyName: '图片',
	imageWidth: 150,
	hidePropertyNames: false,
	hideAddButton: true,
	hideProperties: 'tags,aliases', // 默认隐藏 tags 和 aliases
	defaultLocked: true,
	popoverOnlyCard: true,
	minimalPopover: false,
	popoverScale: 1
}

const TIMELINE_VIEW_TYPE = "novel-timeline-view";

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

		this.registerView(TIMELINE_VIEW_TYPE, (leaf) => new NovelTimelineView(leaf, this));

		this.addRibbonIcon('clock', '打开小说事件时间线', () => {
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
		// 原代码在这里进行了性能极差的全库遍历，现已优化：只通过高效的缓存查找
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
		// 【优化4】关闭插件时，必须从侧边栏完全卸载掉我们自定义的视图，防止报错
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

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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


	// 🌟 核心：仅保留动态 CSS（依赖设置参数的 CSS）
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

		// 动态隐藏用户填写的指定属性
		const propsToHide = this.settings.hideProperties.split(/[,，]+/).map(p => p.trim()).filter(p => p.length > 0);
		if (!propsToHide.includes(this.settings.imagePropertyName)) propsToHide.push(this.settings.imagePropertyName);
		propsToHide.forEach(prop => {
			const safeProp = CSS.escape(prop);
			css += `body .is-novel-profile .metadata-property[data-property-key="${safeProp}"] { display: none !important; }`;
		});

		// 动态缩放动画
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
		this.dynamicStyleElement.textContent = css;
	}
}
// -----------------------------------------------------
// 3. 事件时间线视图 (Timeline View) - 彻底无感定位版
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
	activeFile: TFile | null = null; // 🌟 核心：记住当前绑定的文件

	constructor(leaf: WorkspaceLeaf, plugin: NovelProfilePlugin) {
		super(leaf);
		this.plugin = plugin;

		this.debouncedScrollSync = debounce((view: MarkdownView) => {
			if (this.isClickNavigating || this.isInitialLoading) return;
			const line = this.getVisibleLine(view);
			this.syncHighlightToLine(line, false, false);
		}, 50, true);

		// 🌟 核心：统一的防抖更新入口
		this.debouncedUpdateView = debounce((maintainScroll: boolean = false) => {
			this.updateView(maintainScroll);
		}, 150, true);
	}

	getViewType() { return TIMELINE_VIEW_TYPE; }
	getDisplayText() { return "事件线"; }
	getIcon() { return "clock"; }

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

		// 1. 只有打开了新的 Markdown 文件，才触发彻底重绘 (解决闪烁和空白问题)
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

		// 2. 只有当文本内容被修改时，才刷新视图 (并且保持滚动条位置)
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (this.activeFile && file === this.activeFile) {
				this.debouncedUpdateView(true);
			}
		}));

		// 3. 切换标签页 (Tabs) 或者焦点时的处理
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

		// 4. 编辑器内部操作：换行、光标移动，只同步侧边栏高亮，不重绘！
		this.registerEvent(this.app.workspace.on('editor-change', (editor, view) => {
			if (this.isClickNavigating || this.isInitialLoading) return;
			if (this.activeFile && view.file === this.activeFile) {
				this.syncHighlightToLine(this.getVisibleLine(view), false, false);
			}
		}));

		// 5. 🌟 核心修复：滚动同步 (彻底解决光标不在正文时不跟随的 bug)
		const workspaceEl = this.app.workspace.containerEl;
		this.registerDomEvent(workspaceEl, "scroll", (e) => {
			if (this.isClickNavigating || this.isInitialLoading) return;
			const target = e.target as HTMLElement;

			if (target?.classList?.contains("cm-scroller")) {
				// 🌟 不再依赖“焦点激活(getActiveView)”，而是去遍历所有 Markdown 页面
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				for (const leaf of leaves) {
					const view = leaf.view as MarkdownView;
					// 只要屏幕上正在滚动的那个区域，属于我们正在监视的笔记，就强制同步！
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
			// 初始化时抓取一次文件
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

	async updateView(maintainScroll: boolean = false) {
		const container = this.contentEl;

		if (!this.activeFile) {
			container.empty();
			container.createDiv({ cls: 'np-timeline-empty', text: '请打开一个包含事件记录的笔记。' });
			return;
		}

		const currentVersion = ++this.updateVersion;
		const content = await this.app.vault.cachedRead(this.activeFile);
		if (currentVersion !== this.updateVersion) return;

		let savedScrollTop = 0;
		if (maintainScroll) {
			const oldTimeline = container.querySelector('.np-timeline-container');
			if (oldTimeline) savedScrollTop = oldTimeline.scrollTop;
		}

		container.empty();
		this.timelineNodes = [];

		const lines = content.split('\n');
		const sectionsData = [];
		let currentSection = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const headingMatch = line.match(/^##\s+(.*)/);

			if (headingMatch) {
				if (currentSection) sectionsData.push(currentSection);
				currentSection = {
					title: headingMatch[1].trim().replace(/\[\[|\]\]/g, ''),
					line: i,
					contentLines: []
				};
			} else if (currentSection) {
				currentSection.contentLines.push(line);
			}
		}
		if (currentSection) sectionsData.push(currentSection);

		if (sectionsData.length === 0) {
			container.createDiv({ cls: 'np-timeline-empty', text: '当前笔记没有检测到 "## 标题" 格式的事件。' });
			return;
		}

		const timelineContainer = container.createDiv({ cls: 'np-timeline-container' });
		
		const isInitialLoad = !maintainScroll;
		if (isInitialLoad) {
			timelineContainer.style.opacity = '0'; // 隐身，等待跳跃
		}

		for (const section of sectionsData) {
			let time = "", characterName = "", causeText = "", resultText = "";
			let directImageLink = ""; 

			const sectionText = section.contentLines.join('\n');

			const timeMatch = sectionText.match(/-\s+(?:\*\*)*时间(?:\*\*)*\s*[：:]\s*(.*)/);
			if (timeMatch) time = timeMatch[1].trim();

			const charMatch = sectionText.match(/-\s+(?:\*\*)*人物(?:\*\*)*\s*[：:]\s*(.*)/);
			if (charMatch) {
				const rawCharText = charMatch[1];
				const linkMatches = [...rawCharText.matchAll(/!*\[\[(.*?)\]\]/g)];
				
				for (const match of linkMatches) {
					const linkText = match[1].split('|')[0].trim();
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

			if (!time && !characterName && !causeText && !resultText) continue;

			const itemEl = timelineContainer.createDiv({ cls: 'np-timeline-item' });
			this.timelineNodes.push({ el: itemEl, line: section.line });

			itemEl.onclick = () => {
				let view = this.app.workspace.getActiveViewOfType(MarkdownView);
				// 如果当前没有激活的视图，尝试抓取对应的 view
				if (!view || view.file !== this.activeFile) {
					const leaves = this.app.workspace.getLeavesOfType('markdown');
					view = leaves.find(l => (l.view as MarkdownView).file === this.activeFile)?.view as MarkdownView;
				}

				if (view && view.editor) {
					this.isClickNavigating = true;
					this.app.workspace.setActiveLeaf(view.leaf, { focus: true });

					const cm = (view.editor as any).cm;
					if (cm) {
						const offset = view.editor.posToOffset({ line: section.line, ch: 0 });
						cm.dispatch({ selection: { anchor: offset, head: offset } });
						const lineInfo = cm.lineBlockAt(offset);
						if (lineInfo) {
							cm.scrollDOM.scrollTo({ top: Math.max(0, lineInfo.top - 60), behavior: 'smooth' });
						}
					} else {
						view.editor.setCursor({ line: section.line, ch: 0 });
					}

					this.syncHighlightToLine(section.line, true, false);
					setTimeout(() => { this.isClickNavigating = false; }, 800);
				}
			};

			const leftEl = itemEl.createDiv({ cls: 'np-timeline-left' });
			const cardEl = leftEl.createDiv({ cls: 'np-timeline-card' });

			if (characterName || directImageLink) {
				if (characterName) {
					cardEl.createDiv({ cls: 'np-timeline-name', text: characterName });
				}
				if (directImageLink) {
					const imgFile = this.app.metadataCache.getFirstLinkpathDest(directImageLink, this.activeFile.path);
					if (imgFile) {
						const imgPath = this.app.vault.getResourcePath(imgFile);
						if (imgPath) cardEl.style.backgroundImage = `url("${imgPath}")`;
					} else if (directImageLink.startsWith('http')) {
						cardEl.style.backgroundImage = `url("${directImageLink}")`;
					}
				} else if (characterName) {
					const charFile = this.app.metadataCache.getFirstLinkpathDest(characterName, this.activeFile.path);
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

			if (time) leftEl.createDiv({ cls: 'np-timeline-time', text: time });

			const dividerEl = itemEl.createDiv({ cls: 'np-timeline-divider' });
			dividerEl.createDiv({ cls: 'np-timeline-line' });
			dividerEl.createDiv({ cls: 'np-timeline-dot' });

			const rightEl = itemEl.createDiv({ cls: 'np-timeline-right' });
			rightEl.createDiv({ cls: 'np-timeline-title', text: section.title });

			if (causeText || resultText) {
				const descEl = rightEl.createDiv({ cls: 'np-timeline-desc' });
				if (causeText) {
					const causeDiv = descEl.createDiv({ cls: 'np-timeline-cause' });
					causeDiv.innerHTML = `<strong>起因：</strong>${causeText}`;
				}
				if (resultText) {
					const resultDiv = descEl.createDiv({ cls: 'np-timeline-result' });
					resultDiv.innerHTML = `<strong>结果：</strong>${resultText}`;
				}
			}
		}

		if (timelineContainer.children.length === 0) {
			timelineContainer.createDiv({ cls: 'np-timeline-empty', text: '没有匹配到包含 时间、起因、结果 的事件记录。' });
			if (isInitialLoad) timelineContainer.style.opacity = '1';
		} else {
			// 定位并在需要时显示
			if (isInitialLoad) {
				setTimeout(() => {
					if (currentVersion === this.updateVersion) {
						const leaves = this.app.workspace.getLeavesOfType('markdown');
						const view = leaves.find(l => (l.view as MarkdownView).file === this.activeFile)?.view as MarkdownView;
						if (view) this.syncHighlightToLine(this.getVisibleLine(view), false, true);
						
						timelineContainer.style.transition = 'opacity 0.15s ease-out';
						timelineContainer.style.opacity = '1';
					}
				}, 50); // 极速展现
			} else {
				timelineContainer.scrollTop = savedScrollTop;
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				const view = leaves.find(l => (l.view as MarkdownView).file === this.activeFile)?.view as MarkdownView;
				if (view) this.syncHighlightToLine(this.getVisibleLine(view), maintainScroll, false);
			}
		}
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
// 4. 设置面板
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

		// 🌟 恢复：特定属性隐藏输入框
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
			.setDesc('开启后，悬浮预览将变成一张卡牌（类似图3）：图片铺满作为背景，文字悬浮覆盖在底部。关闭则为默认的左右横排卡片。')
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
	}
}