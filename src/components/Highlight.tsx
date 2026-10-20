type Props = {
  text: string;
  terms: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlight({ text, terms }: Props) {
  const keys = [...new Set(terms.filter((term) => term.length >= 2 || /\d/.test(term)))].sort(
    (a, b) => b.length - a.length,
  );
  if (keys.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${keys.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) =>
        keys.some((key) => key.toLowerCase() === part.toLowerCase()) ? (
          <mark key={`${part}-${index}`}>{part}</mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}
