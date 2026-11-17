import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import r2Service from './service/r2-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';
const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>网站维护中 - 七玄仙尊</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#333;background:#fff;text-align:center;padding:24px;box-sizing:border-box}h1{font-size:22px;font-weight:600;margin:0 0 12px}p{font-size:14px;color:#888;margin:0}.foot{margin-top:32px;font-size:12px;color:#aaa}</style>
</head>
<body>
<h1>该网站正在维护中</h1>
<p>请稍后再试。</p>
<div class="foot">七玄仙尊 © 2026. All Rights Reserved.</div>
</body>
</html>`;

export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)
		if (!env.db || !env.kv) {
			if (url.pathname.startsWith('/api/')) {
				return new Response(JSON.stringify({ code: 503, message: '网站正在维护中' }), { status: 503, headers: { 'content-type': 'application/json;charset=utf-8' } });
			}
			return new Response(MAINTENANCE_HTML, { status: 503, headers: { 'content-type': 'text/html;charset=utf-8' } });
		}

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		if (url.pathname.startsWith('/oss/')) {
			const key = url.pathname.slice('/oss/'.length);
			const resp = await r2Service.toObjResp({ env }, key);
			return resp || new Response('Not Found', { status: 404 });
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 const resp = await r2Service.toObjResp({ env }, url.pathname.substring(1));
			 return resp || new Response('Not Found', { status: 404 });
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		if (c.cron === '*/30 * * * *') {
			await analysisService.refreshEchartsCache({ env })
			return;
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await emailService.autoClean({ env })
		await analysisService.refreshEchartsCache({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
};
