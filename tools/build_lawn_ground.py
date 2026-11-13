#!/usr/bin/env python3
"""
中心草坪细节场景底图生成：从官方平面图 campus3d/img/plan_official.jpg 裁出中心草坪周边，
按颜色把每个像素归类为 草地 / 道路 / 白色铺地 / 灰色广场 / 水面，建筑、阴影、文字像素用最近的地面类别填掉
（建筑由场景按 campus_layout.json 挤出），再平滑去 JPEG 噪点、放大 2 倍并做抗锯齿，输出扁平纯色底图
campus3d/lawn/lawn-ground.png。场景同时按这张图的颜色判断“草坪 / 道路 / 铺地”，作为动植物放置规则。
用法：python3 tools/build_lawn_ground.py   （依赖 numpy、scipy、Pillow）
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src/main/webapp/campus3d/img/plan_official.jpg")
OUT = os.path.join(ROOT, "src/main/webapp/campus3d/lawn/lawn-ground.png")
# 裁剪范围（平面图像素）：与 lawn-scene.js 的 REGION 保持一致
X0, Y0, X1, Y1 = 480, 615, 1385, 1455
UP = 2

# 地面类别：平面图取色 → 输出色（扁平插画风）
GROUND = [
    ("grass", (154, 204, 143), (156, 204, 142)),
    ("road", (217, 205, 179), (221, 208, 180)),
    ("white", (250, 251, 248), (251, 250, 244)),
    ("plaza", (217, 215, 216), (220, 218, 219)),
    ("water", (40, 169, 224), (58, 166, 220)),
]
# 需要填掉的像素：建筑屋面（黄 / 肉色 / 粉）、深色侧面阴影、文字、红色标签
OTHER = [(255, 244, 128), (249, 222, 193), (238, 150, 150), (92, 74, 60), (60, 50, 45), (20, 20, 20), (200, 40, 40), (62, 149, 168)]

im = np.asarray(Image.open(SRC).convert("RGB"), dtype=np.float32)[Y0:Y1, X0:X1]
pal = np.array([g[1] for g in GROUND] + OTHER, dtype=np.float32)
d = ((im[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(-1)
cls = d.argmin(-1)
n = len(GROUND)
cls[cls >= n] = n
# 先连同“待填”类一起做多数平滑，去掉建筑内部的噪点，再把待填像素换成最近的地面类别
oh = np.stack([(cls == k).astype(np.float32) for k in range(n + 1)], -1)
oh[..., n] *= 1.3
cls = ndimage.gaussian_filter(oh, sigma=(1.6, 1.6, 0)).argmax(-1)
other = ndimage.binary_dilation(cls == n, iterations=2)
_, (iy, ix) = ndimage.distance_transform_edt(other, return_indices=True)
cls = cls[iy, ix]
# 平滑：每类 one-hot 高斯模糊后取最大（去掉 JPEG 噪点与小孔）
oh = np.stack([(cls == k).astype(np.float32) for k in range(n)], -1)
oh = ndimage.gaussian_filter(oh, sigma=(1.1, 1.1, 0))
cls = oh.argmax(-1)
# 放大 + 抗锯齿着色
oh = np.stack([(cls == k).astype(np.float32) for k in range(n)], -1)
oh = ndimage.zoom(oh, (UP, UP, 1), order=1)
oh = ndimage.gaussian_filter(oh, sigma=(0.7, 0.7, 0))
w = np.clip(oh, 0, 1) ** 3
w /= w.sum(-1, keepdims=True) + 1e-6
col = (w[..., None] * np.array([g[2] for g in GROUND], dtype=np.float32)[None, None]).sum(-2)
Image.fromarray(np.clip(col + 0.5, 0, 255).astype(np.uint8)).quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(OUT, optimize=True)
print("wrote", OUT, os.path.getsize(OUT), "bytes", col.shape)
