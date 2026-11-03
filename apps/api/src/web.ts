import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** API'ning o'z yo'llari — SPA fallback ularni yutib yubormasligi kerak */
const RESERVED = /^\/(api|socket\.io|uploads)(\/|$)/;

/**
 * Bitta serverda deploy: /admin/ — admin panel, / — mobil ilovaning web versiyasi.
 * Ikkalasi ham SPA: noma'lum yo'l o'z index.html'iga qaytadi.
 */
export function serveWeb(app: NestExpressApplication, dir: string) {
  const admin = resolve(dir, 'admin');
  const mobile = resolve(dir, 'app');
  for (const d of [admin, mobile]) {
    if (!existsSync(resolve(d, 'index.html'))) throw new Error(`WEB_DIR: ${d}/index.html topilmadi`);
  }

  app.useStaticAssets(admin, { prefix: '/admin/', index: false, maxAge: '1h' });
  // Expo shrift yo'llarida "/.pnpm/" bor — dotfiles ruxsat etilmasa ikonkalar yuklanmaydi
  app.useStaticAssets(mobile, { index: false, maxAge: '1h', dotfiles: 'allow' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || RESERVED.test(req.path) || !req.accepts('html')) return next();
    const root = req.path === '/admin' || req.path.startsWith('/admin/') ? admin : mobile;
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(resolve(root, 'index.html'));
  });
}
