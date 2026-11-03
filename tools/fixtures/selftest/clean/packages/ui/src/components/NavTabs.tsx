const TABS = ['今日', '词本', '我的'];

export function NavTabs() {
  return (
    <nav className="border-hair flex gap-2">
      {TABS.map((t) => (
        <a key={t} href="#">
          {t}
        </a>
      ))}
    </nav>
  );
}
