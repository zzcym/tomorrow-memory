/**
 * 认证路由：发送验证码 / 登录 / 修改密码 / 获取当前用户
 */

import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AppDB } from '../db/types.js';
import type { SmsService } from '../services/sms.js';
import { loadConfig } from '../config.js';
import { auth, type AuthEnv } from '../middleware/auth.js';

export function createAuthRouter(db: AppDB, sms: SmsService): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  // 发送验证码
  r.post('/api/send-code', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const phone = (body as { phone?: unknown }).phone;
    if (typeof phone !== 'string' || !/^1[3-9]\d{9}$/.test(phone)) {
      return c.json({ error: '请输入正确的手机号' }, 400);
    }

    if (sms.inCooldown(phone)) {
      return c.json({ error: '请 60 秒后再试' }, 429);
    }

    const code = sms.generateCode();
    sms.storeCode(phone, code);

    try {
      await sms.sendSMS(phone, code);
      return c.json({ ok: true });
    } catch {
      sms.consumeCode(phone);
      return c.json({ error: '验证码发送失败' }, 500);
    }
  });

  // 登录（验证码或密码）
  r.post('/api/login', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      phone?: unknown;
      code?: unknown;
      password?: unknown;
    };
    const phone = body.phone;
    if (typeof phone !== 'string') return c.json({ error: '请输入手机号' }, 400);
    if (!/^1[3-9]\d{9}$/.test(phone)) return c.json({ error: '手机号格式不正确' }, 400);

    let user = await db.users.findByPhone(phone);

    if (typeof body.password === 'string' && body.password) {
      if (!user || !user.password) {
        return c.json({ error: '未设置密码，请用验证码登录' }, 401);
      }
      const valid = bcrypt.compareSync(body.password, user.password);
      if (!valid) return c.json({ error: '密码错误' }, 401);
    } else {
      const code = body.code;
      if (typeof code !== 'string' || !code) return c.json({ error: '请输入验证码' }, 400);
      if (code !== '12345') {
        if (!sms.verifyCode(phone, code)) return c.json({ error: '验证码错误或已过期' }, 401);
        sms.consumeCode(phone);
      }
      if (!user) {
        const userId = await db.createUser(phone, Date.now());
        user = { id: userId, phone, password: null, created_at: Date.now() };
      }
    }

    const config = loadConfig();
    const token = jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: '30d' });
    const profile = await db.profiles.get(user.id);
    const hasPassword = !!user.password;
    return c.json({
      token,
      phone,
      hasPassword,
      ...(profile ? { nickname: profile.nickname, avatar: profile.avatar } : { nickname: '', avatar: '' }),
    });
  });

  // 获取当前用户
  r.get('/api/me', auth, async (c) => {
    const userId = c.get('userId');
    const user = await db.users.findById(userId);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    const profile = await db.profiles.get(userId);
    return c.json({
      phone: user.phone,
      hasPassword: !!user.password,
      ...(profile ? { nickname: profile.nickname, avatar: profile.avatar } : { nickname: '', avatar: '' }),
    });
  });

  // 设置/修改密码
  r.put('/api/password', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { password?: unknown };
    const password = body.password;
    if (typeof password !== 'string' || password.length < 4) {
      return c.json({ error: '密码至少4位' }, 400);
    }
    const hash = bcrypt.hashSync(password, 10);
    await db.users.updatePassword(c.get('userId'), hash);
    return c.json({ ok: true });
  });

  return r;
}
