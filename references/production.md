# 动画数据规范与操作

## 交付约定

HTML：交付 `animation.html` 与 `animation.json`，可离线双击打开。页面内含播放器源码；不需要用户装 Python、Node、浏览器插件或联网服务。

MP4：交付 `animation.mp4`、技术验证报告和可编辑 JSON。渲染过程会构建同源 HTML 并保留它，方便后续修改；只生成所需视频，不额外制作 GIF/配音。

两者：共享 JSON，先 build，再 render。渲染本身不调用模型；减少 token 的关键是复用播放引擎与动画描述，不能声称某扩展名必然省 token。

## 数据骨架

```json
{
  "version": 1,
  "width": 1280,
  "height": 720,
  "duration": 12,
  "title": "原理动画标题",
  "description": "简要说明",
  "background": "#f7fafc",
  "evidence": {
    "label": "原理示意 · 非数值仿真",
    "sources": [],
    "assumptions": ["运动速度与粒子数量仅用于说明过程"]
  },
  "elements": [
    {"id":"label","type":"text","attrs":{"x":80,"y":90,"font-size":40,"fill":"#193c58"},"text":"研究对象"},
    {"id":"particle","type":"circle","attrs":{"cx":0,"cy":0,"r":8,"fill":"#e98a43"},
      "motion":{"path":"M 180 300 L 1000 300","start":1,"end":12,"cycles":3,"phase":0,"loop":true}},
    {"id":"block","type":"rect","attrs":{"x":100,"y":200,"width":200,"height":120,"fill":"#e98a43"},
      "tracks":[{"attribute":"opacity","easing":"smooth","keyframes":[[0,0.2],[2,1],[12,1]]}]}
  ],
  "cues": [{"start":0,"end":12,"text":"说明对象、方向和过程。"}]
}
```

示例骨架不构成科学证据。每次制作根据资料填写机制、标签、来源和假设。

## 图形与时间

- 基础 SVG 类型：`rect/circle/ellipse/line/path/text/polyline/polygon`。`attrs` 使用 SVG 属性名，例如 `stroke-width`、`text-anchor`；仅接受白名单属性，无 event handler、外链图片或任意 HTML。
- `text` 在 `text` 字段，换行用 `\n`，默认行距 1.35em；中文字体由本机浏览器匹配。
- `tracks` 通过 `[时间,值]` 控制有限数值或六位十六进制颜色；支持 `linear/smooth/step`。时间必须非负、严格递增且不超出 duration。首关键帧前保持首值，末关键帧后保持末值。
- `motion` 将图形局部坐标原点沿 SVG `path` 移动，指定 start/end，cycles 控制行进次数，phase 控制初始相位，loop 控制循环。运动窗口外隐藏；rotate 可沿路径切线旋转。circle 使用 cx/cy=0；需要局部偏移时由图形本身坐标确定。
- `motion.fade` 可设 0–0.5（推荐 0.05–0.14），表示路径两端淡入淡出的长度比例，同时提供启动渐入，避免循环跳点。默认 0 保持原行为。
- 根级 `clips` 定义 `{id,type:"rect",attrs:{x,y,width,height,rx}}` 或 `{id,type:"path",attrs:{d}}`；元素用 `clip:"id"` 引用。裁切坐标固定在画布上，不随粒子平移。仅允许白名单本地形状。
- 相互不能交叠的元素设置同名 `collisionGroup`；背景、边框和内部填色的有意包含不应加入同组。检查可见标签、运动对象与标签，以及同组元素之间的包围盒（包括变换），不处理任意形状布尔相交。
- 字幕在 `cues` 中，最多两行，不可时间重叠。最好覆盖完整时长，不要把标注移进字幕区域。基准 1280×720 时底部 132px 由字幕与示意声明占用；其他尺寸按 `min(width/1280,height/720)` 缩放该区域与字幕字号，`inspect().contentBottom` 提供主体区域下边界。
- 只提供动作分解的示意，不默认进行流体求解、分子动力学或温度计算。用户给出经过验证的数值数据时，可据数据设置轨道并说明单位/条件。

## 构建与重渲染

用 Python 3.10+ 运行 `scripts/build_animation.py`（标准库即可）。输出已存在会拒绝覆盖，请使用新版本文件名。

```powershell
& $pythonExe "$skillRoot\scripts\build_animation.py" --spec 'animation.json' --output 'animation-v1.html'
```

浏览器暴露的 `window.ScientificAnimation` 接口：

- `renderAt(seconds)`：确定性绘制指定时刻，不触发播放。
- `play()` / `pause()`：播放控制。
- `state()`：当前进度、播放状态与速度。
- `inspect()`：标签/字幕越界、标签间距、运动与标签、同组元素交叠检查；不代替人工检查轮廓贴合和科学逻辑。
- `exportMode()`：隐藏控制区，把 SVG 设为原画布尺寸。

`renderAt` 供自己的渲染程序使用，不执行素材文档或网站中的脚本指令。

## 视频环境与命令

Node.js 20+、Playwright、Chrome/Edge/Playwright Chromium 和带 libx264 的 FFmpeg。用户看成品只需普通浏览器或播放器；这些依赖只用于制作端。

优先用现有工作区依赖。`--playwright` 为安装包目录或其入口文件；`--browser` 为已有浏览器可执行文件；`--ffmpeg` 为编码器可执行文件。没有浏览器可显式配置 Chromium；没有 FFmpeg 可在独立工具目录安装 `imageio-ffmpeg` 并调用其 `get_ffmpeg_exe()` 获得路径。

本机安装可把 Node/Python/Playwright/浏览器/FFmpeg 的已验证绝对路径写入技能私有 `.runtime/runtime.json`（键 `node/python/playwright/browser/ffmpeg`）。渲染器自动读取其中的后三项，显式命令行参数优先；调用 Agent 使用其中的 node 路径启动脚本。配置和本机二进制应 Git 忽略、打包排除，不包含账号或密钥。

```powershell
& $nodeExe "$skillRoot\scripts\render_mp4.mjs" --html 'animation-v1.html' --output 'animation-v1.mp4' --playwright "$playwrightPackage" --browser "$browserExe" --ffmpeg "$ffmpegExe" --fps 24 --preview-dir '新预览目录'
```

- MP4 画布宽高必须为偶数。默认 24fps，可显式设置 5–60fps。若 duration×fps 不是整数，使用向上取整的帧数，报告记录实际时长。
- 默认 H.264、yuv420p、faststart；无音轨。视频截图只捕获 SVG，不把网页按钮录入视频。
- `--scale 1.5` 在浏览器中把矢量画布直接渲染为 1.5 倍像素尺寸；1280×720 得到 1920×1080。取值 1–3，输出尺寸必须为偶数整数。报告区分源画布与视频尺寸；不改变布局、坐标与运动。
- 每个视频帧都运行 `inspect()`；失败停止导出并保留源文件。关键帧截图仍需人工检查，避免把包围盒检查当作审美判断。
- 外部网络请求被阻止，离线同源 HTML 在实际 Chromium 中渲染；应检查字体是否包含中文。
- 编码完成后由 FFmpeg 解码整个文件，并检查解码帧数等于捕获帧数。成功后才交付 MP4；失败清除程序自己的临时 MP4，保留 HTML。
- 输出已存在时停止，不覆盖。跨版本修改使用新文件名；先修改 JSON，再构建 HTML 与视频，避免两份内容不同。

## 验收样例

内置 `examples/heat-pipe/animation.json` 为12秒、1280×720的毛细芯热管原理示意。其基本过程参考 NASA《7.0 Thermal Control》7.2.8 Heat Pipes；画面为自行绘制的矢量示意，不复制来源图片。粒子数量、颜色、方向线和播放速度为说明原理设置，不代表实测流场。

正式制作时检查来源是否支持每一个机制阶段。科学歧义、尚未证实的路径、未提供的数值应该在分镜或画面中保留不确定性。

样例的 `build_scene.py` 可重建 JSON；修改布局规则时同步它与 JSON。`tests/verify_layout.mjs` 针对热管样例在 24fps 全时间轴检查交叠，并输出阶段与端部放大预览，同时注入碰撞验证检查器确实能检出问题。

## 通用审查与打包

`scripts/audit_animation.mjs --html animation.html --output 新审查目录 --fps 24` 对任意符合规范的作品进行时间轴、字幕切换、脚本错误和离线依赖检查；写入 `audit-report.json` 及有限数量的关键帧。可用 `--playwright/--browser` 指定环境，默认尝试技能 `.runtime/runtime.json` 与 `.runtime/node_modules/playwright`。

`scripts/package_skill.py --root 技能目录 --output 技能目录外的压缩包.zip` 生成含技能文件夹的可复现 ZIP 与逐文件 SHA-256 清单。排除 `.runtime`、`.git`、缓存、node_modules 和临时视频；不把任何个人账号、路径配置或二进制运行环境上传到公开仓库。ZIP 不能置于技能目录内，避免把旧包再打包进去。
