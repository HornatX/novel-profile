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
	
	// 优化：统一使用 debounce（防抖）处理视图刷新，避免性能浪费和重绘闪烁
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

		// 优化：去掉 setTimeout，全部交由防抖函数处理
		this.registerEvent(this.app.workspace.on('layout-change', () => this.debouncedProcessLeaves()));
		this.registerEvent(this.app.workspace.on('file-open', () => this.debouncedProcessLeaves()));
		this.registerEvent(this.app.metadataCache.on('changed', () => this.debouncedProcessLeaves()));
		
		this.app.workspace.onLayoutReady(() => {
			this.processAllLeaves();
		});
	}

	updateLockState() {
		if (this.isEditLocked) {
			document.body.classList.add('np-edit-locked');
			// 失去焦点防误触
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
		
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		leaves.forEach(leaf => {
			const view = leaf.view as MarkdownView;
			if (view && view.containerEl) {
				view.containerEl.classList.remove('is-novel-profile');
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
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		
		// 优化正则：不仅支持中英逗号，还支持多余空格和连续逗号
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
				this.injectImage(view, file);
			} else {
				container.classList.remove('is-novel-profile');
				this.removeInjectedImage(view);
			}
		});
	}

	injectImage(view: MarkdownView, file: TFile) {
		const metadataContainer = view.contentEl.querySelector('.metadata-container');
		if (!metadataContainer) return;

		// 自动展开属性面板
		if (metadataContainer.classList.contains('is-collapsed')) {
			const heading = metadataContainer.querySelector('.metadata-properties-heading') as HTMLElement;
			heading?.click(); 
		}

		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		if (!frontmatter || !frontmatter[this.settings.imagePropertyName]) {
			this.removeInjectedImage(view);
			return;
		}

		const imagePropValue = frontmatter[this.settings.imagePropertyName];
		let imagePath = '';

		if (typeof imagePropValue === 'string') {
			// 优化解析逻辑：容错度更高
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
			let imgContainer = metadataContainer.querySelector('.np-image-container') as HTMLDivElement;
			let imgEl: HTMLImageElement;
			
			if (!imgContainer) {
				imgContainer = document.createElement('div');
				imgContainer.className = 'np-image-container';
				imgEl = document.createElement('img');
				imgContainer.appendChild(imgEl);
				metadataContainer.prepend(imgContainer);
			} else {
				imgEl = imgContainer.querySelector('img') as HTMLImageElement;
			}

			// 优化性能：通过自定义 dataset 判断，防止 Obsidian 本地资源路径刷新导致的无效重复渲染
			if (imgEl.dataset.originalSrc !== imagePath) {
				imgEl.src = imagePath;
				imgEl.dataset.originalSrc = imagePath; // 缓存记录
			}
		} else {
			this.removeInjectedImage(view);
		}
	}

	removeInjectedImage(view: MarkdownView) {
		const imgContainer = view.contentEl.querySelector('.metadata-container .np-image-container');
		imgContainer?.remove();
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

		// 核心优化：彻底替代 CSS 中的 :has()
		// 动态获取需要隐藏的属性，自动将 "作为头像的属性名" 也加入隐藏列表
		const propsToHide = this.settings.hideProperties.split(/[,，]+/).map(p => p.trim()).filter(p => p.length > 0);
		
		// 将设定中的“图片”属性直接添加进去隐藏，这就代替了之前那个卡顿的 :has() 选择器
		if (!propsToHide.includes(this.settings.imagePropertyName)) {
			propsToHide.push(this.settings.imagePropertyName);
		}

		// 利用 Obsidian 属性面板自带的 data-property-key，性能是 :has() 的成百上千倍
		propsToHide.forEach(prop => {
			// CSS 转义处理避免特殊字符报错
			const safeProp = CSS.escape(prop);
			css += `
				body .is-novel-profile .metadata-property[data-property-key="${safeProp}"] {
					display: none !important;
				}
			`;
		});

		// 锁定模式的 CSS (保持不变)
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
	// ... 这部分（SettingTab）保持原样即可，你的实现没问题 ...
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