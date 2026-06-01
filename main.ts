import { App, Plugin, PluginSettingTab, Setting, TFile, MarkdownView, Notice, debounce } from 'obsidian';

interface NovelProfileSettings {
	targetFolders: string;
	imagePropertyName: string;
	imageWidth: number;
	hidePropertyNames: boolean;
	hideAddButton: boolean;
	hideProperties: string;
	defaultLocked: boolean;
	popoverOnlyCard: boolean; 
	minimalPopover: boolean; // 🌟 新增：极简版页面预览 (图3模式)
	popoverScale: number; // 🌟 新增：卡片整体缩放比例
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
	minimalPopover: false, // 默认关闭，保持原有左右排版
	popoverScale: 1 // 🌟 新增默认缩放比例为 1.0
}


export default class NovelProfilePlugin extends Plugin {
	settings: NovelProfileSettings;
	dynamicStyleElement: HTMLStyleElement;
	isEditLocked: boolean;
	isPluginActive: boolean = true;
	
	hoverTimeout: NodeJS.Timeout | null = null;
	activeCustomPopover: HTMLElement | null = null;

	debouncedProcessLeaves = debounce(this.processAllLeaves.bind(this), 250, true);

	async onload() {
		await this.loadSettings();

		this.isEditLocked = this.settings.defaultLocked;
		this.updateLockState();

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

		this.registerEvent(this.app.workspace.on('file-open', () => {
			this.processAllLeaves();
		}));
		
		this.registerEvent(this.app.workspace.on('layout-change', () => this.debouncedProcessLeaves()));
		this.registerEvent(this.app.metadataCache.on('changed', () => this.debouncedProcessLeaves()));
		
		this.registerDomEvent(document, 'mouseover', (e: MouseEvent) => this.handleMouseOver(e));
		this.registerDomEvent(document, 'mouseout', (e: MouseEvent) => this.handleMouseOut(e));

		this.app.workspace.onLayoutReady(() => {
			this.processAllLeaves();
		});
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
		
		if (!file) {
			const fallbackFile = this.app.vault.getMarkdownFiles().find(f => f.basename === cleanPath);
			if(!fallbackFile) return;
			if (this.checkIsTargetFile(fallbackFile)) {
				this.triggerCustomPopover(fallbackFile, linkEl);
			}
			return;
		}

		if (this.checkIsTargetFile(file)) {
			this.triggerCustomPopover(file, linkEl);
		}
	}

	triggerCustomPopover(file: TFile, linkEl: HTMLElement) {
		document.body.classList.add('np-showing-custom-popover');
		if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
		this.hoverTimeout = setTimeout(() => {
			this.buildAndShowCustomPopover(file, linkEl);
		}, 300); 
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

		// 🌟 注入极简模式 class
		if (this.settings.minimalPopover) {
			popover.classList.add('is-minimal');
		}

		const imgPath = this.resolveImagePath(frontmatter[this.settings.imagePropertyName], file);
		if (imgPath) {
			popover.classList.add('has-image'); // 标记存在图片
			const imgDiv = popover.createDiv('np-custom-popover-img');
			imgDiv.style.backgroundImage = `url("${imgPath}")`;
			if (!this.settings.minimalPopover) {
				imgDiv.style.width = `${this.settings.imageWidth}px`;
			}
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

		// 🌟 引入缩放系数计算真实的视觉宽高
		const scale = this.settings.popoverScale || 1;
		const popoverHeight = popover.offsetHeight * scale;
		const popoverWidth = popover.offsetWidth * scale;

		// 如果底部超出屏幕，翻转到鼠标上方
		if (top + popoverHeight > window.innerHeight) {
			top = rect.top - popoverHeight - 10;
		}
		
		// 如果右侧超出屏幕，往左平移避免被裁切
		if (left + popoverWidth > window.innerWidth) {
			left = window.innerWidth - popoverWidth - 20;
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
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur();
			}
		} else {
			document.body.classList.remove('np-edit-locked');
		}
	}

	onunload() {
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
		document.querySelectorAll('.np-image-container').forEach(el => el.remove());
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
        
        // 1. 检查是否在目标文件夹
        const isTargetFolder = this.checkIsTargetFile(file);
        
        // 2. 检查是否有属性内容 (关键逻辑 ✨)
        const cache = this.app.metadataCache.getFileCache(file);
        const hasFrontmatter = cache?.frontmatter && Object.keys(cache.frontmatter).length > 0;

        // 只有同时满足“在文件夹内”且“有属性内容”才显示卡片
        if (isTargetFolder && hasFrontmatter) {
            container.classList.add('is-novel-profile');
            this.updateImageState(view, file);
            setTimeout(() => this.autoExpandProperties(view), 150);
        } else {
            // 否则移除样式，恢复原生外观
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

		const imagePropValue = frontmatter[this.settings.imagePropertyName];
		let imagePath = '';

		if (typeof imagePropValue === 'string') {
			const linkMatch = imagePropValue.match(/\[\[(.*?)\]\]/);
			if (linkMatch) {
				const linkText = linkMatch[1].split('|')[0].trim(); 
				const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
				if (linkedFile) {
					imagePath = this.app.vault.getResourcePath(linkedFile);
				}
			} else {
				imagePath = imagePropValue.startsWith('http') ? imagePropValue : '';
			}
		}

		if (imagePath) {
			view.containerEl.setAttribute('data-has-image', 'true');
			view.containerEl.style.setProperty('--np-image-url', `url("${imagePath}")`);
		} else {
			view.containerEl.removeAttribute('data-has-image');
			view.containerEl.style.removeProperty('--np-image-url');
		}
	}

	autoExpandProperties(view: MarkdownView) {
		const metadataContainer = view.contentEl.querySelector('.metadata-container');
		if (metadataContainer && metadataContainer.classList.contains('is-collapsed')) {
			const heading = metadataContainer.querySelector('.metadata-properties-heading') as HTMLElement;
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

		const propsToHide = this.settings.hideProperties.split(/[,，]+/).map(p => p.trim()).filter(p => p.length > 0);
		if (!propsToHide.includes(this.settings.imagePropertyName)) {
			propsToHide.push(this.settings.imagePropertyName);
		}

		propsToHide.forEach(prop => {
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


		// 🌟 注入整体缩放的动态动画与基准点
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

		// 🌟 新增设置项：极简版页面预览
		new Setting(containerEl)
			.setName('极简版页面预览 (竖排卡牌模式)')
			.setDesc('开启后，悬浮预览将变成一张卡牌（类似图3）：图片铺满作为背景，文字悬浮覆盖在底部。关闭则为默认的左右横排卡片。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.minimalPopover)
				.onChange(async (value) => {
					this.plugin.settings.minimalPopover = value;
					await this.plugin.saveSettings();
				}));


				// 🌟 新增设置项：悬浮卡片整体缩放
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