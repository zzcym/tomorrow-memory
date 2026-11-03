export async function useWord(id: string) {
  const r = await fetch(`/api/wordbook/${id}`);
  return r.json();
}

