/**
 * A-101 (a) 夹具（红向）：首页传输面**真的**发了裸请求、真的读了本地存储。
 *
 * ⇒ `web-home-transport` 必须红。这一颗是"剥注释之后这条判据还看得见真越界"的反证：
 * 绿向文件（comment-noise/apps/web/src/components/home/transport-note.tsx）里同样的词只出现在注释里。
 */

export async function loadHomeCard(id: string): Promise<string> {
  const cached = localStorage.getItem('home-card');
  const res = await fetch(`/api/lookup?id=${id}`);
  return `${res.status}|${cached ?? ''}`;
}
