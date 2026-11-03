// A-30-4 / --web 的红向 fixture：首页组件里出现裸 fetch( —— 必须被 web-home-transport 扫红。
export async function loadCard(id: string) {
  const r = await fetch(`/api/wordbook/${id}`);
  return r.json();
}
