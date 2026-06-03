Novel Profile (小说角色卡片)

💡 温馨提示 / Notice:
本插件专注于将 Obsidian 的原生属性区改造为高颜值的“小说角色/设定卡片”。零数据侵入，安全纯净，专为沉浸式写作与世界观构建打造。 QQ交流群:1094620986


🇨🇳 简体中文

1.2.0 大更新添加了时间线系统


## 二级标题
### 三级标题可以做版本管理
- **时间**：无序列表
- **人物**：人物双连接.第一个会出现
- **起因**：起因会在
- **经过**：
    
    1. 经过不会出现
        
- **结果**：结果会在

### 三级标题可以做版本管理
- **时间**：无序列表
- **人物**：人物双连接.第一个会出现
- **起因**：起因会在
- **经过**：
    
    1. 经过不会出现
        
- **结果**：结果会在

示例:


## 二级标题

- **时间**：10 年前
- **人物**：[[hornat]]
- **起因**：制作 obsidian 插件
- **经过**：
    
    1. 这样在那样
        
- **结果**：上架了


Novel Profile（小说角色卡片） 是一款为小说创作者、TRPG 玩家和世界观构建者量身定制的 Obsidian
插件。它能将原生枯燥的属性面板（Properties）转化为精美的“左图右文”角色卡片。在保持极简视觉美感的同时，提供强力的防误触锁定机制，帮助您在浏览设定时获得沉浸式的百科体验。

🌟 核心功能

1. 自适应等高卡片排版（智能魔法布局）

  - 左图右文等高拉伸：无论右侧属性有多少条内容，左侧的头像图片外壳会自动等高拉伸对齐，彻底告别排版错乱。
  - 图片智能居中（不压扁/不拉伸）：底层采用智能裁剪技术（Object-fit:
    cover），无论原本的图片是什么比例，都会像壁纸一样完美填充满图片框，绝对不会变形。
  - 广泛的图片源支持：支持直接读取属性中的双链接图片（如 [[张三头像.jpg|100]]），也支持外部的 http:// 网络图片链接。

2. 防误触沉浸锁定（Read-only 模式）

  - 默认锁定防篡改：开启卡片时，属性面板默认进入“只读模式”，彻底阻断鼠标误点击弹出的输入框，让页面看起来就像网页百科一样干净。
  - 精准放行双链接：虽然禁用了修改，但完全保留了双向链接（[[ ]]）和外部链接的点击跳转功能。您可以顺畅地在不同角色和剧本之间穿梭。
  - 快捷键秒切状态：通过 Obsidian 命令面板或快捷键，可以一键在“锁定（浏览）”与“解锁（编辑）”之间无缝切换。

3. 高度自定义与纯净视觉体验

  - 细节隐藏魔法：支持在设置中一键隐藏属性前面的“键名（Key）”，只显示具体的值；同时支持隐藏底部碍眼的“添加笔记属性”蓝色按钮。
  - 黑名单屏蔽：可以指定隐藏不需要在卡片上展示的属性（如 tags, aliases），不破坏源数据，只是在卡片上隐身。

4. 精准的生效范围（不干扰主库）

  - 指定文件夹渲染：您可以设置该插件仅在特定的文件夹（如 角色, 设定，兼容中英文逗号）内生效。主库中其他普通的日记、工作笔记仍保持 Obsidian
    原生属性样式，井水不犯河水。

5. 纯净设计与零后台残留（非破坏性）

  - 一键恢复原生：提供“一键开启/关闭卡片视图”的全局开关。关闭后，瞬间恢复 Obsidian 原生排版。
  - 安全无痛卸载：底层纯靠 CSS 注入与动态 DOM 操作，绝不修改您的 markdown
    原文数据。插件关闭或卸载时，会自动打扫战场，不留任何代码和样式垃圾。

⚙️ 数据存储机制

所有的自定义配置（如指定的文件夹、隐藏的属性名等）均保存在 Obsidian 插件默认的本地 data.json
配置文件中。无网络连接，完全离线运行，没有任何隐私泄露风险。

📥 安装方法

方法一：社区插件安装（推荐）

本插件通过官方审核上架后，您可以通过以下方式安装：

1.  打开 Obsidian 设置 > 社区插件 > 浏览。
2.  搜索 Novel Profile。
3.  点击 安装，随后选择 启用。

方法二：手动安装

1.  前往本仓库的 Releases 页面，下载最新的 main.js, manifest.json 和 styles.css 文件。
2.  打开您的 Obsidian 库所在的本地文件夹。
3.  进入 .obsidian/plugins/ 目录，创建一个名为 novel-profile 的新文件夹。
4.  将下载的三个文件放入该文件夹。
5.  在 Obsidian 设置 > 社区插件 中刷新并启用该插件。

🛠️ 使用指南

1.  基础配置：前往 Obsidian 设置 > Novel Profile，填写您存放角色的目标文件夹，以及用来读取图片的属性名称（默认是“图片”）。
2.  添加属性：在目标笔记中添加属性，其中图片属性填入类似 [[头像.jpg]]，此时页面顶部会自动变身为卡片。
3.  日常使用：
      - 当需要修改卡片文字时，按下 Ctrl/Cmd + P 呼出命令面板，输入 切换属性修改（建议绑定快捷键），即可解锁卡片进行编辑。
      - 点击卡片内的蓝色双链接，即可畅游您的写作宇宙。

🇬🇧 English

Novel Profile is a beautifully designed Obsidian plugin tailored for novelists,
TRPG players, and world-builders. It transforms the native, somewhat dry
Properties area into an elegant, "Left-Image, Right-Text" character profile
card. Maintaining a minimalist aesthetic, it provides a robust read-only lock to
give you an immersive, wiki-like browsing experience without accidental edits.

🌟 Key Features

1. Adaptive Equal-Height Card Layout

  - Dynamic Flex Stretching: No matter how many properties you have on the
    right, the image container on the left automatically stretches to match the
    height perfectly.
  - Smart Image Cropping: Powered by object-fit: cover, your character avatars
    will elegantly fill the frame without ever being stretched or squished,
    regardless of their original aspect ratio.
  - Universal Image Support: Reads internal wikilinks (e.g., [[avatar.jpg|100]])
    as well as external http:// web images seamlessly directly from your
    properties.

2. Anti-Mistouch Immersive Lock (Read-Only Mode)

  - Default Lock: When enabled, the profile card enters a read-only mode,
    blocking annoying edit popups when you accidentally click on a property.
  - Precise Link Passthrough: While editing is blocked, internal wikilinks ([[
    ]]) and external links remain fully clickable. You can effortlessly navigate
    through your universe.
  - Quick Toggle: Instantly switch between "Locked (Browse)" and "Unlocked
    (Edit)" states via the Obsidian Command Palette or a custom hotkey.

3. High Customizability & Clean UI

  - Visual Decluttering: Toggle options to hide Property Keys (showing only the
    values) and remove the distracting "Add Property" button at the bottom.
  - Property Blacklist: Hide specific utility properties (like tags or aliases)
    from the card view. Your data remains perfectly intact; it's simply hidden
    from the beautiful UI.

4. Targeted Folders (No Vault Interference)

  - Scoped Rendering: Configure the plugin to apply only to specific folders
    (e.g., Characters, Lore). Your regular daily notes and task lists in the
    rest of the vault will keep their native Obsidian property look.

5. Clean Engineering & Non-Destructive

  - Global Kill-Switch: A command allows you to instantly toggle the entire
    plugin's view on or off, reverting everything to Obsidian's native look
    instantly.
  - Safe & Reversible: The plugin operates entirely via dynamic CSS and DOM
    injection. It never modifies your actual markdown data. Unloading the plugin
    cleans up all visual traces automatically.

⚙️ Data Storage Mechanism

All configuration data (target folders, hidden properties, etc.) is safely
stored locally in the default data.json file. The plugin operates completely
offline and works perfectly with any syncing solution.

📥 Installation

Method 1: Community Plugins (Recommended)

Once approved in the official directory:

1.  Open Obsidian Settings > Community plugins > Browse.
2.  Search for Novel Profile.
3.  Click Install, then Enable.

Method 2: Manual Installation

1.  Go to the Releases page of this repository and download main.js,
    manifest.json, and styles.css.
2.  Open your local Obsidian vault directory.
3.  Navigate to .obsidian/plugins/ and create a new directory named
    novel-profile.
4.  Copy the downloaded files into that folder.
5.  Go to Obsidian Settings > Community plugins, reload, and enable the plugin.

🛠️ How to Use

1.  Configure: Go to Obsidian Settings > Novel Profile to set your Target
    Folders and define the Image Property Name (e.g., "Avatar" or "Image").
2.  Setup Note: Add properties to your target note. Set your image property
    value to a wikilink like [[hero.png]]. The properties area will instantly
    transform into a card.
3.  Daily Usage:
      - Use the Command Palette (Ctrl/Cmd + P) and search for Toggle Novel
        Profile Edit to unlock the card when you need to update stats.
      - Click through your character links to browse your lore like a personal
        wiki.

