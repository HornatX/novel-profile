import { App, Plugin, PluginSettingTab, Setting, TFile, MarkdownView, Notice, debounce } from 'obsidian';

interface NovelProfileSettings {
	targetFolders: string;
	imagePropertyName: string;
	imageWidth: number;
	hidePropertyNames: boolean;
	hideAddButton: boolean;
	hideProperties: string;
	defaultLocked: boolean;
}

const DEFAULT_SETTINGS: NovelProfileSettings = {
	targetFolders: '角色,设定',
	imagePropertyName: '图片',
	imageWidth: 150,
	hidePropertyNames: false,
	hideAddButton: true,
	hideProperties: 'tags,aliases',
	defaultLocked: true
}

export default class NovelProfilePlugin extends Plugin {
	settings: NovelProfileSettings;
	dynamicStyleElement: HTMLStyleElement;
	isEditLocked: boolean;
	isPluginActive: boolean = true;
	
	// 防抖处理仅用于窗口变化和属性数据修改时，节省性能
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

		// 【修复跳闪的核心】：监听文件打开事件，并在第一时间(同步)执行预渲染标记，抢在 Obsidian 渲染面板之前！
		this.registerEvent(this.app.workspace.on('file-open', () => {
			this.processAllLeaves();
		}));
		
		this.registerEvent(this.app.workspace.on('layout-change', () => this.debouncedProcessLeaves()));
		this.registerEvent(this.app.metadataCache.on('changed', () => this.debouncedProcessLeaves()));
		
		this.app.workspace.onLayoutReady(() => {
			this.processAllLeaves();
		});
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
		
		// 卸载时清理遗留变量和废弃的旧版图片 DOM
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
		const folders = this.settings.targetFolders.split(/[,，]+/).map(f => f.trim()).filter(f => f.length > 0);

		leaves.forEach(leaf => {
			const view = leaf.view as MarkdownView;
			if (!view || !view.file) return;

			const file = view.file;
			const container = view.containerEl;
			
			const isTarget = this.isPluginActive && (folders.length === 0 || folders.some(folder => {
				return file.path.startsWith(folder + '/') || file.parent?.path === folder || file.parent?.name === folder;
			}));

			if (isTarget) {
				container.classList.add('is-novel-profile');
				// 第一时间算出图片路径并交给 CSS
				this.updateImageState(view, file);
				
				// 防止折叠（稍微延后执行，因为点击展开需要等真实DOM存在）
				setTimeout(() => this.autoExpandProperties(view), 150);
			} else {
				container.classList.remove('is-novel-profile');
				container.removeAttribute('data-has-image');
				container.style.removeProperty('--np-image-url');
			}
		});
	}

	// 新版逻辑：只解析路径注入 CSS，绝不碰触和修改属性面板的 DOM 结构！
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
			// 直接将状态和图片 URL 交给视图根节点，由 CSS 的 ::before 实现 0 毫秒渲染
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
				body .is-novel-profile .metadata-property-key { display: none !important; }
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
			.setName('隐藏特定的属性')
			.setDesc('想隐藏的属性名称（不会删除数据，只是看不见），支持中英文逗号。例如: tags，aliases')
			.addText(text => text
				.setPlaceholder('tags, aliases')
				.setValue(this.plugin.settings.hideProperties)
				.onChange(async (value) => {
					this.plugin.settings.hideProperties = value;
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
	}
}