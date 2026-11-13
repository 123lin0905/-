# 人脸登录测试

| 文件 | 内容 |
| --- | --- |
| `setup_test_db.py` | 执行 `database/001–004`，并把测试库表统一为 `utf8mb4_unicode_ci`（见脚本说明） |
| `api_test.py` | 后端接口与权限：人脸录入 / 识别 / 删除、养护、大屏、401 / 403 / 通过、访客只读、无库 503（约 130 项断言） |
| `e2e_face.py` | Playwright + Chromium 假摄像头端到端测试，截图输出到 `--out` |
| `make_videos.sh` | 用 `samples/` 样例图生成假摄像头视频（y4m） |
| `samples/` | human 仓库自带样例图，来源见 `samples/SOURCE.md` |

```bash
python3 tests/face-login/setup_test_db.py                     # 先访问一次 index.jsp 让 DBTools 建表
python3 tests/face-login/api_test.py --db-down-cmd "pkill -x mariadbd" --db-up-cmd "<起库命令>"
sh tests/face-login/make_videos.sh /tmp/face_media
python3 tests/face-login/e2e_face.py --media /tmp/face_media --out /tmp/face_shots
```

两个脚本都会清空 `face_profile`、`care_log`，只能对测试库执行。测试时 Tomcat 加 `-Dface.maxAttempts=500`
（识别限流默认同一 IP 5 分钟 30 次，连续跑测试会触发 429）。
