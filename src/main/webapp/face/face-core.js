/*
 * 人脸识别前端公共模块（ES module）：加载本地化的 @vladmandic/human、打开摄像头、逐帧检测并给出质量判断。
 *
 * 第三方库来源与许可：
 *   - @vladmandic/human 3.3.6（MIT，https://github.com/vladmandic/human），文件 face/vendor/human/human.esm.js 与
 *     face/vendor/human/models/{blazeface,facemesh,faceres,antispoof,liveness}.{json,bin}，取自 npm 包 @vladmandic/human@3.3.6，
 *     许可证见 face/vendor/human/LICENSE-human.txt；
 *   - @tensorflow/tfjs-backend-wasm 4.22.0（Apache-2.0，https://github.com/tensorflow/tfjs）的 wasm 文件 face/vendor/tfjs-wasm/*.wasm。
 *   全部放在本仓库静态资源里，不依赖任何境外 CDN（human 默认的 wasmPath 指向 jsdelivr，这里已改为本地路径）。
 *
 * 只在浏览器里算“人脸特征向量”（faceres，1024 维）和 antispoof / liveness 分数，然后交给服务端比对；
 * 已录入的特征向量从不下发到前端。antispoof / liveness 只是基础防护，不能保证挡住高清照片或屏幕翻拍。
 */
import { Human } from './vendor/human/human.esm.js';

const BASE = new URL('./', import.meta.url).href;
const Q = new URLSearchParams(location.search);

// 默认用 WASM 后端：不依赖显卡驱动，集显笔记本 / 无 GPU 的环境都稳定；可用 ?backend=webgl 切换
export const humanConfig = {
  backend: Q.get('backend') || 'wasm',
  modelBasePath: BASE + 'vendor/human/models/',
  wasmPath: BASE + 'vendor/tfjs-wasm/',
  debug: false,
  async: true,
  cacheSensitivity: 0,
  filter: { enabled: true, equalization: false, flip: false },
  face: {
    enabled: true,
    detector: { rotation: true, maxDetected: 2, minConfidence: 0.5, return: false },
    mesh: { enabled: true },
    iris: { enabled: false },
    attention: { enabled: false },
    description: { enabled: true },
    emotion: { enabled: false },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

let human = null, loading = null;

export function loadHuman(onStatus) {
  if (human) return Promise.resolve(human);
  if (loading) return loading;
  loading = (async () => {
    onStatus && onStatus('正在加载人脸识别模型（首次约 12MB，之后走浏览器缓存）…');
    const h = new Human(humanConfig);
    await h.load();
    onStatus && onStatus('正在初始化识别引擎…');
    await h.warmup();
    human = h;
    return h;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** 摄像头不可用的原因（null 表示可以尝试打开）。 */
export function cameraProblem() {
  if (!window.isSecureContext) return '浏览器只允许在 HTTPS 或 localhost 下使用摄像头。请让管理员为本系统配置 HTTPS（见 README“人脸登录部署”），或在本机用 http://localhost 访问。';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return '当前浏览器不支持摄像头访问，请使用新版 Chrome / Edge。';
  return null;
}

export async function startCamera(video) {
  const p = cameraProblem();
  if (p) throw new Error(p);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
  } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw new Error('摄像头权限被拒绝：请在浏览器地址栏左侧允许本站使用摄像头后重试。');
    if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) throw new Error('没有找到可用的摄像头。');
    if (e && e.name === 'NotReadableError') throw new Error('摄像头被其他程序占用，请关闭视频会议等软件后重试。');
    throw new Error('无法打开摄像头：' + (e && e.message ? e.message : e));
  }
  video.srcObject = stream;
  video.muted = true; video.playsInline = true;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  return stream;
}

export function stopCamera(video) {
  const s = video && video.srcObject;
  if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

const deg = (r) => (typeof r === 'number' ? r * 180 / Math.PI : 0);

/**
 * 检测一帧。返回 { status, message, face }：
 *   status = none（没有人脸）/ multi（多张人脸）/ small（太远）/ low（不清晰）/ ok
 *   face = { embedding:number[], real, live, score, box:[x,y,w,h], yaw, pitch }
 */
export async function analyze(video) {
  const h = await loadHuman();
  const res = await h.detect(video);
  const faces = (res.face || []).filter((f) => f.score >= 0.5);
  if (!faces.length) return { status: 'none', message: '没有检测到人脸，请正对摄像头' };
  if (faces.length > 1) return { status: 'multi', message: '画面里有多张人脸，请只保留一个人' };
  const f = faces[0];
  const minSide = Math.min(video.videoWidth || 640, video.videoHeight || 480);
  if (f.box[2] < minSide * 0.18) return { status: 'small', message: '离摄像头太远了，请靠近一些' };
  if (!f.embedding || !f.embedding.length || f.faceScore < 0.5) return { status: 'low', message: '画面不够清晰，请保持光线充足、不要晃动' };
  const a = (f.rotation && f.rotation.angle) || {};
  return {
    status: 'ok', message: '已检测到人脸',
    face: { embedding: Array.from(f.embedding), real: f.real == null ? 0 : f.real, live: f.live == null ? 0 : f.live, score: f.score, box: f.box, yaw: deg(a.yaw), pitch: deg(a.pitch) },
  };
}

/** 多帧特征平均（各帧先 L2 归一化）。识别时用 2–3 帧平均，降低单帧抖动。 */
export function averageEmbedding(list) {
  const dim = list[0].length, acc = new Array(dim).fill(0);
  for (const v of list) {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    for (let i = 0; i < dim; i++) acc[i] += v[i] / n;
  }
  const n = Math.sqrt(acc.reduce((s, x) => s + x * x, 0)) || 1;
  return acc.map((x) => +(x / n).toFixed(6));
}

export const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

/** 从视频里截取人脸的小缩略图（96×96 JPEG data URL，约 3–6KB），只用于录入列表展示。 */
export function thumbnail(video, box) {
  const c = document.createElement('canvas'); c.width = 96; c.height = 96;
  const [x, y, w, hgt] = box, pad = Math.max(w, hgt) * 0.25, side = Math.max(w, hgt) + pad * 2;
  const sx = Math.max(0, x + w / 2 - side / 2), sy = Math.max(0, y + hgt / 2 - side / 2);
  c.getContext('2d').drawImage(video, sx, sy, Math.min(side, video.videoWidth - sx), Math.min(side, video.videoHeight - sy), 0, 0, 96, 96);
  return c.toDataURL('image/jpeg', 0.7);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 带 Cookie 的 JSON 请求；非 2xx 抛出带 status / body 的错误。 */
export async function api(method, url, body) {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) { const e = new Error((j && j.message) || ('请求失败 ' + r.status)); e.status = r.status; e.body = j; throw e; }
  return j;
}
