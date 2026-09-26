# 天宇板照片 / GLB 配准

输入为现有 `front-square.jpg`、原始 `2026_9_18.glb` 和两张侧面照片。所有几何均来自原扫描，不重建或生成不存在的岩点。原 GLB 的 SHA-256 必须为 `65dad03079b678d60f5e4d7a5d4f923ca40b1634bb1a99e162e7d88f71808350`。

在独立 Python 3.12 环境安装 `requirements.txt`，依次运行：

```sh
python register.py --glb ORIGINAL.glb --photo front-square.jpg --output FIT_DIRECTORY
python validate.py --fit FIT_DIRECTORY
python dense_refine.py --fit FIT_DIRECTORY --photo front-square.jpg
python crosscheck.py --front front-square.jpg --registration FIT_DIRECTORY/dense.npz --photos RIGHT_PHOTO.jpg LEFT_PHOTO.jpg --output SIDE_CHECK_DIRECTORY
python package.py --glb ORIGINAL.glb --photo front-square.jpg --holds tianyu-reviewed-holds.json --fit FIT_DIRECTORY --crosscheck SIDE_CHECK_DIRECTORY --public ../../apps/web/public --diagnostics DIAGNOSTIC_DIRECTORY
python audit.py --public ../../apps/web/public
```

脚本中的 CLI 路径均由调用者提供。中间浮点查找图只用于离线计算，不打包进网页。侧面照片原件由资料提供方保留，报告记录文件名和哈希。

## 方法与误差口径

1. 读取真实三角面和纹理。glTF 纹理的 V 坐标直接对应图像行；过去的粗几何工具采用反转 V 的取色方式，本流程已用正常/反转两个对照验证纹理方向。
2. 正交渲染建立初始纹理匹配；SIFT 比率筛选和稳健单应筛选只用于找到可信对应。
3. 用匹配的 3D 表面点与照片像素拟合 3×4 投影相机，再重渲染、匹配并拟合平滑局部残差。3×4 投影已包含旧底图的透视矫正，不能直接当作实体相机的内参。
4. 按 160 像素空间格子分为五组，拟合时留出整组。稀疏模型发布评估使用 171 个留出点；940 个对应点另做五折分区交叉验证，局部指标不使用原位训练残差。
5. 局部密集图像配准处理扫描变形和纹理区域差异，并保留双向一致性、模板残差。密集配准看过整幅照片，其残差不能冒充独立测试误差；报告明确区分这一步和稀疏模型留出误差。
6. 照片中心经逆向图像映射和相机射线，实际求交原 GLB 的三角面；保存面编号、重心坐标、表面点和法向。源 GLB 不做形变、补全、切割。全板叠加图是局部校正后的投影视图。
7. 另以左右侧照片拟合投影并留出空间分区进行交叉检查。这检验现有网格与各照片之间的一致性，不替代实物标靶测量。

`registered` 表示图像到扫描表面的对应通过保守软件质量门槛：双向差 ≤ 2.5 px、局部修正幅度 ≤ 35 px、可用模板残差 ≤ 5 px，并且有邻近稀疏验证支持或通过局部模板相关性检查；也限制相对点位过粗的三角面。`uncertain` 保留可追溯表面对应，但没有通过全部检查。`missing` 不提供三维坐标。阈值是软件质量门槛，不是实物毫米精度证明。

## 运行时兼容

原有 264 点和 `gpt6-visual-r1` 复核版本不改变，新增独立的 `tianyu-registration-r1.json`。按稳定点位 ID 附加配准信息，不新增/删除/移动用户点位。浏览器旧存档中的人工属性、删除、新增、空板均保留。坐标与配准锚点不同就显示 `moved`，模型摘要不再把旧三维关联描述成有效。所有照片点仍维持已确认、可选线状态。

## 自动检查

`audit.py` 校验源文件哈希、264 点的身份和锚点、所有三角面关联的重心重建、缺失点无虚构几何，以及质量门槛。前端测试 `tianyu-registration.test.ts` 校验存档往返、人工修改/删除/新增和空板兼容。页面验收需检查叠加、原 GLB 热点、移动后失效提示、保存和刷新恢复。
