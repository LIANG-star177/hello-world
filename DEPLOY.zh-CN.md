# 公网 HTTPS 使用

本系统必须通过公网 HTTPS 才能让学生使用手机流量签到和浏览器定位。只推送 GitHub 不会自动运行后端。

## 先免费用手机测试：Cloudflare Quick Tunnel

1. 下载最新源码 ZIP，完整解压。关闭之前的签到程序窗口。
2. 双击根目录 `start-public-windows.cmd`。
3. 脚本会使用 Windows Package Manager 安装 Node.js LTS（需要 24+）和官方 `Cloudflare.cloudflared`，安装依赖、构建程序，然后申请临时公网 HTTPS 地址。Windows 可能提示安装授权。
4. 等窗口显示 `PUBLIC HTTPS ADDRESS`，浏览器会自动打开该地址。教师密码显示在同一窗口，不再使用 `teacher-demo`。
5. 教师使用该 HTTPS 地址创建签到并投影二维码；学生使用手机流量或任意 Wi-Fi 扫码、允许定位并提交。二维码由服务端使用同一公网地址生成，不依赖电脑 IP。
6. 先替换 `0,0` 教室占位坐标。公网模式关闭模拟定位。登录仍为演示学生身份，不能当作正式身份核验。

不需要修改路由器或端口转发。电脑与两个进程必须一直运行，退出窗口会关闭应用和隧道；地址可能每次启动变化。此服务供试用，无固定地址或可用性保证，所在网络必须能连接 Cloudflare。`data/attendance.sqlite` 保存记录；`data/public-settings.json` 保存本地生成的密钥和教师密码，请保护整个 data 文件夹。不要把这些文件上传 GitHub。

来源：[Cloudflare 官方客户端及 TryCloudflare 说明](https://github.com/cloudflare/cloudflared#trycloudflare)、[官方 Quick Tunnel 文档](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。Windows 脚本尚未在真实 Windows 上执行；如果连接被网络策略阻止，它会报错，而不是声称已上线。

## 固定地址和长期运行：Render 托管

[打开 Render 部署配置](https://render.com/deploy?repo=https://github.com/LIANG-star177/hello-world)

项目根目录 `render.yaml` 已定义 Node 24、构建/启动命令、HTTPS Web 服务、单实例 SQLite 持久磁盘、自动生成的签名密钥、健康检查及每小时位置保留清理。

1. 在上面的链接登录/注册 Render，授权读取这个 GitHub 仓库。
2. 部署界面设置 `TEACHER_PASSWORD`（至少 12 字符），审核套餐及费用后确认。不要把密码发在聊天中。
3. 等部署通过，使用平台分配的 `https://...onrender.com` 地址。教师和学生都用该地址，不要求同一网络。公网地址从 Render 的 `RENDER_EXTERNAL_URL` 自动取得。
4. 如果以后绑定自定义域名，在平台环境变量设置 `PUBLIC_BASE_URL=https://你的域名`。无需改代码。
5. `/api/health` 验证数据库及认证配置；未正确配置时返回 503。生产模式禁用定位模拟，每小时按 `LOCATION_RETENTION_DAYS` 清除到期精确坐标。

此配置选择 **Starter 服务和 1 GB 持久磁盘，是付费配置**，以平台当前价格和部署界面为准。不要改成无持久磁盘的临时文件系统后继续依赖 SQLite，否则重启或重新部署可能丢失记录。账号、付款确认和平台部署授权必须由账号所有者提供；本仓库不能代为开户或自动支付。当前尚未在 Render 实际部署，部署文件需要平台校验。Node 服务的基础格式参考了 [Render 官方示例](https://github.com/render-examples/express-hello-world/blob/main/render.yaml)。

## 网络和数据注意事项

正式地址可跨网络访问，但任何托管商在学生所在地是否能稳定连通需要实测，不能保证所有运营商或校园策略。地图需要访问 OpenStreetMap 瓦片，GPS 及服务端距离校验不依赖底图下载。生产应用仍采用低安全级别演示账号；正式使用需导入真实名单、接入身份认证并配置真实教室坐标。备份和权限配置见 README。
