# 第三方前端资源（人脸识别）

全部本地化放在仓库里，运行时不访问任何境外 CDN。

| 路径 | 来源 | 版本 | 许可证 |
| --- | --- | --- | --- |
| `human/human.esm.js` | npm `@vladmandic/human` 的 `dist/human.esm.js`（https://github.com/vladmandic/human） | 3.3.6 | MIT（`human/LICENSE-human.txt`） |
| `human/models/blazeface.*`、`facemesh.*`、`faceres.*`、`antispoof.*`、`liveness.*` | 同一 npm 包的 `models/` 目录（human-models） | 3.3.6 | MIT（同上） |
| `tfjs-wasm/tfjs-backend-wasm.wasm`、`tfjs-backend-wasm-simd.wasm` | npm `@tensorflow/tfjs-backend-wasm` 的 `dist/`（https://github.com/tensorflow/tfjs） | 4.22.0 | Apache-2.0（`tfjs-wasm/LICENSE-tfjs.txt`） |

除 `human.esm.js` 首行加了一行来源注释外，文件均未修改。升级时请同时替换库与模型，并保持 `face/face-core.js` 里的 `modelBasePath` / `wasmPath` 指向本地。
