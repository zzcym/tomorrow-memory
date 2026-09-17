-- 生产用户 13870095295 密码改为 12345(hash 为服务器上 bcryptjs 现场生成)
UPDATE users SET password = '$2a$10$IlbPCjtMTyKrWdQRAHUfROwcl8Fb3lUl6a3CyAxfrAVfbl1mqhvOG'
WHERE phone = '13870095295';

INSERT INTO profiles (user_id, nickname, avatar, daily_goal, updated_at)
VALUES ((SELECT id FROM users WHERE phone = '13870095295'), '', NULL, 10, 1789584000000)
ON CONFLICT (user_id) DO NOTHING;

SELECT 'OK id=' || id || ' hasPwd=' || (password IS NOT NULL) FROM users WHERE phone = '13870095295';
